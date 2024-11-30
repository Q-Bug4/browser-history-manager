use actix_cors::Cors;
use actix_web::{get, web, App, HttpResponse, HttpServer, Responder};
use elasticsearch::Elasticsearch;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use std::sync::Arc;
use elasticsearch::http::transport::Transport;

mod config;
mod services;

use crate::config::{AppConfig, ElasticsearchConfig};
use crate::services::es;

// 获取 ES 客户端的函数
async fn create_es_client(config: &ElasticsearchConfig) -> Elasticsearch {
    let transport = Transport::single_node(&config.url)
        .expect("Failed to create transport");
    Elasticsearch::new(transport)
}

// 定义API文档
#[derive(OpenApi)]
#[openapi(
    paths(
        health,
        search_history,
    ),
    components(
        schemas(HistoryRecord, SearchQuery)
    ),
    tags(
        (name = "history", description = "Browser History API")
    )
)]
struct ApiDoc;

// 定义响应模型
#[derive(Serialize, Deserialize, ToSchema)]
struct HistoryRecord {
    timestamp: String,
    url: String,
    domain: String,
}

// 定义查询参数
#[derive(Deserialize, ToSchema, IntoParams)]
struct SearchQuery {
    #[schema(example = "example.com")]
    domain: Option<String>,
    #[schema(example = "search")]
    keyword: Option<String>,
    #[schema(example = "2023-12-01T00:00:00Z")]
    start_date: Option<String>,
    #[schema(example = "2023-12-31T23:59:59Z")]
    end_date: Option<String>,
    #[schema(default = 1)]
    page: Option<i32>,
    #[schema(default = 30)]
    page_size: Option<i32>,
}

/// Check service health
#[utoipa::path(
    get,
    path = "/api/health",
    tag = "history",
    responses(
        (status = 200, description = "Service is healthy", body = String)
    )
)]
#[get("/api/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json("OK")
}

/// Search browser history
#[utoipa::path(
    get,
    path = "/api/history",
    tag = "history",
    params(
        ("keyword" = Option<String>, Query, description = "Search keyword"),
        ("domain" = Option<String>, Query, description = "Domain filter"),
        ("start_date" = Option<String>, Query, description = "Start date (ISO 8601)"),
        ("end_date" = Option<String>, Query, description = "End date (ISO 8601)"),
        ("page" = Option<i32>, Query, description = "Page number"),
        ("page_size" = Option<i32>, Query, description = "Items per page")
    ),
    responses(
        (status = 200, description = "List of history records", body = Vec<HistoryRecord>),
        (status = 400, description = "Bad request"),
        (status = 500, description = "Internal server error")
    )
)]
#[get("/api/history")]
async fn search_history(
    query: web::Query<SearchQuery>,
    es_client: web::Data<Arc<Elasticsearch>>,
) -> impl Responder {
    match es::search_history(
        &es_client,
        query.keyword.clone(),
        query.domain.clone(),
        query.start_date.clone(),
        query.end_date.clone(),
        query.page,
        query.page_size,
    ).await {
        Ok(response) => {
            // 从 ES 响应中提取记录
            if let Some(hits) = response["hits"]["hits"].as_array() {
                let records: Vec<HistoryRecord> = hits
                    .iter()
                    .filter_map(|hit| {
                        let source = hit["_source"].as_object()?;
                        Some(HistoryRecord {
                            timestamp: source["timestamp"].as_str()?.to_string(),
                            url: source["url"].as_str()?.to_string(),
                            domain: source["domain"].as_str()?.to_string(),
                        })
                    })
                    .collect();
                HttpResponse::Ok().json(records)
            } else {
                HttpResponse::Ok().json(Vec::<HistoryRecord>::new())
            }
        }
        Err(e) => {
            eprintln!("Search error: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 加载配置
    let config = AppConfig::new().expect("Failed to load config");
    
    // 创建 ES 客户端
    let es_client = Arc::new(create_es_client(&config.elasticsearch).await);
    
    // 生成API文档
    let openapi = ApiDoc::openapi();

    println!("Starting server on {}:{}", config.server.host, config.server.port);
    println!("Elasticsearch URL: {}", config.elasticsearch.url);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(es_client.clone()))
            .service(
                SwaggerUi::new("/swagger-ui/{_:.*}")
                    .url("/api-docs/openapi.json", openapi.clone()),
            )
            .service(health)
            .service(search_history)
    })
    .bind((config.server.host.as_str(), config.server.port))?
    .run()
    .await
}
