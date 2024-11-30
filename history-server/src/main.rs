mod config;
mod error;
mod handlers;
mod models;
mod services;

use actix_web::{web, App, HttpServer};
use log::info;
use crate::{
    config::AppConfig,
    services::{EsService, MongoService},
    handlers::history::{insert_history, query_history},
};
use actix_cors::Cors;
use actix_web::{http::header, middleware};
use actix_web::{get, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

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
async fn search_history(query: web::Query<SearchQuery>) -> impl Responder {
    // 使用查询参数，避免警告
    let _query_params = query.into_inner();
    
    // 你现有的搜索历史记录的实现
    let record = HistoryRecord {
        timestamp: "2023-12-01T12:00:00Z".to_string(),
        url: "https://www.example.com".to_string(),
        domain: "example.com".to_string(),
    };
    HttpResponse::Ok().json(vec![record])
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 初始化日志
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    
    // 加载配置
    let config = AppConfig::new().expect("Failed to load configuration");
    
    // 初始化服务
    let es_service = EsService::new(&config.elasticsearch)
        .await
        .expect("Failed to create ES service");
        
    let mongo_service = MongoService::new(&config.mongodb)
        .await
        .expect("Failed to create MongoDB service");
    
    info!("Starting server at {}:{}", config.server.host, config.server.port);
    
    // 生成API文档
    let openapi = ApiDoc::openapi();

    HttpServer::new(move || {
        // 配置 CORS
        let cors = Cors::default()
            .allow_any_origin() // 允许所有来源
            .allow_any_method() // 允许所有 HTTP 方法
            .allow_any_header() // 允许所有请求头
            .max_age(3600); // 设置预检请求的缓存时间（秒）

        App::new()
            .wrap(cors) // 添加 CORS 中间件
            .wrap(middleware::Logger::default()) // 添加日志中间件
            .app_data(web::Data::new(es_service.clone()))
            .app_data(web::Data::new(mongo_service.clone()))
            .service(
                web::scope("/api")
                    .route("/history", web::post().to(insert_history))
                    .route("/history", web::get().to(query_history))
            )
            // 添加 Swagger UI
            .service(
                SwaggerUi::new("/swagger-ui/{_:.*}")
                    .url("/api-docs/openapi.json", openapi.clone()),
            )
            .service(health)
            .service(search_history)
    })
    .bind((config.server.host, config.server.port))?
    .run()
    .await
}
