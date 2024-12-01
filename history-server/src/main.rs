use actix_cors::Cors;
use actix_web::{get, web, App, HttpResponse, HttpServer, Responder, post};
use elasticsearch::Elasticsearch;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use std::sync::Arc;
use elasticsearch::http::transport::Transport;
use serde_json::json;

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
        report_history,
    ),
    components(
        schemas(HistoryRecord, HistoryRequest)
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
#[derive(Debug, Serialize, Deserialize, IntoParams)]
struct SearchQuery {
    #[param(example = "search")]
    keyword: Option<String>,
    #[param(example = "example.com")]
    domain: Option<String>,
    #[param(example = "2023-12-01T00:00:00Z")]
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    #[param(example = "2023-12-31T23:59:59Z")]
    #[serde(rename = "endDate")]
    end_date: Option<String>,
    #[serde(default = "default_page")]
    #[param(default = "1")]
    page: Option<i32>,
    #[serde(default = "default_page_size")]
    #[param(default = "30")]
    #[serde(rename = "pageSize")]
    page_size: Option<i32>,
}

fn default_page() -> Option<i32> {
    Some(1)
}

fn default_page_size() -> Option<i32> {
    Some(30)
}

// Add new request model
#[derive(Deserialize, ToSchema)]
struct HistoryRequest {
    #[schema(example = "https://example.com")]
    url: String,
    #[schema(example = "2024-03-19T10:30:00Z")]
    timestamp: String,
    #[schema(example = "example.com")]
    domain: String,
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
        ("startDate" = Option<String>, Query, description = "Start date (ISO 8601)"),
        ("endDate" = Option<String>, Query, description = "End date (ISO 8601)"),
        ("page" = Option<i32>, Query, description = "Page number"),
        ("pageSize" = Option<i32>, Query, description = "Items per page")
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
    // 验证 page_size 的范围
    let page_size = query.page_size.unwrap_or(30).min(1000);
    
    match es::search_history(
        &es_client,
        query.keyword.clone(),
        query.domain.clone(),
        query.start_date.clone(),
        query.end_date.clone(),
        query.page,
        Some(page_size), // 确保传入验证后的 page_size
    ).await {
        Ok(response) => {
            HttpResponse::Ok().json(response)
        }
        Err(e) => {
            eprintln!("Search error: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "error": "Failed to search history",
                "items": [],
                "total": 0,
                "page": query.page.unwrap_or(1),
                "pageSize": page_size
            }))
        }
    }
}

/// Report browser history
#[utoipa::path(
    post,
    path = "/api/history",
    tag = "history",
    request_body = HistoryRequest,
    responses(
        (status = 200, description = "History recorded successfully"),
        (status = 400, description = "Invalid request data"),
        (status = 500, description = "Internal server error")
    )
)]
#[post("/api/history")]
async fn report_history(
    request: web::Json<HistoryRequest>,
    es_client: web::Data<Arc<Elasticsearch>>,
) -> impl Responder {
    match es::insert_history(
        &es_client,
        &request.url,
        &request.timestamp,
        &request.domain,
    ).await {
        Ok(_) => {
            println!("History record added: {}", request.url);
            HttpResponse::Ok().json(json!({
                "status": "success",
                "message": "Record added successfully"
            }))
        }
        Err(e) => {
            eprintln!("Failed to insert history: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to store record"
            }))
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
            .service(report_history)
    })
    .bind((config.server.host.as_str(), config.server.port))?
    .run()
    .await
}
