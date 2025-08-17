use actix_cors::Cors;
use actix_web::{get, web, App, HttpResponse, HttpServer, Responder, post};
use elasticsearch::Elasticsearch;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use std::sync::Arc;
use std::time::Duration;
use elasticsearch::http::transport::Transport;
use serde_json::json;

mod config;
mod services;

use crate::config::{AppConfig, ElasticsearchConfig};
use crate::services::es;
use crate::services::cache::Cache;
use crate::services::redis_cache::RedisCache;

// 应用状态结构体 - 存储全局配置和缓存实例
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub cache: Option<Box<dyn Cache>>, // 如果Redis可用则有缓存，否则为None
}

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
async fn health(app_state: web::Data<Arc<AppState>>) -> impl Responder {
    let status = json!({
        "status": "OK",
        "cache_available": app_state.cache.is_some(),
        "cache_ttl": app_state.config.cache.ttl_seconds
    });
    HttpResponse::Ok().json(status)
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
    app_state: web::Data<Arc<AppState>>,
) -> impl Responder {
    use crate::services::cache::CacheKeyGenerator;
    
    // 验证 page_size 的范围
    let page_size = query.page_size.unwrap_or(30).min(1000);
    let page = query.page.unwrap_or(1);
    
    // 尝试从缓存获取数据（如果缓存可用）
    if let Some(cache_impl) = &app_state.cache {
        let cache_key = CacheKeyGenerator::history_search_key(
            &query.keyword,
            &query.domain,
            &query.start_date,
            &query.end_date,
            page,
            page_size,
        );
        
        // 尝试从缓存获取数据，任何错误都不影响正常查询
        match cache_impl.get(&cache_key).await {
            Ok(Some(cached_data)) => {
                println!("Cache hit for key: {}", cache_key);
                return HttpResponse::Ok().json(cached_data);
            }
            Ok(None) => {
                println!("Cache miss for key: {}", cache_key);
            }
            Err(e) => {
                eprintln!("Cache get error (will fallback to DB): {}", e);
            }
        }
    }
    
    // 从Elasticsearch查询数据
    match es::search_history(
        &es_client,
        query.keyword.clone(),
        query.domain.clone(),
        query.start_date.clone(),
        query.end_date.clone(),
        Some(page),
        Some(page_size),
    ).await {
        Ok(response) => {
            // 如果有缓存且查询成功有数据，异步写入缓存
            if let Some(cache_impl) = &app_state.cache {
                // 检查是否有数据（items数组不为空）
                if let Some(items) = response.get("items").and_then(|v| v.as_array()) {
                    if !items.is_empty() {
                        let cache_key = CacheKeyGenerator::history_search_key(
                            &query.keyword,
                            &query.domain,
                            &query.start_date,
                            &query.end_date,
                            page,
                            page_size,
                        );
                        
                        let ttl = Duration::from_secs(app_state.config.cache.ttl_seconds);
                        
                        // 异步写入缓存，不阻塞响应，缓存失败不影响结果返回
                        let cache_clone = cache_impl.clone();
                        let response_clone = response.clone();
                        let cache_key_clone = cache_key.clone();
                        
                        tokio::spawn(async move {
                            if let Err(e) = cache_clone.set(&cache_key_clone, &response_clone, ttl).await {
                                eprintln!("Failed to set cache for key {}: {}", cache_key_clone, e);
                            } else {
                                println!("Cached data for key: {}", cache_key_clone);
                            }
                        });
                    }
                }
            }
            
            HttpResponse::Ok().json(response)
        }
        Err(e) => {
            eprintln!("Search error: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "error": "Failed to search history",
                "items": [],
                "total": 0,
                "page": page,
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
    // 启用详细日志
    env_logger::init();
    
    // 加载配置
    let config = Arc::new(AppConfig::new().expect("Failed to load config"));
    
    // 创建 ES 客户端
    let es_client = Arc::new(create_es_client(&config.elasticsearch).await);
    
    // 尝试创建缓存客户端 - 默认启用，如果Redis不可用则自动跳过
    let cache_client: Option<Box<dyn Cache>> = match RedisCache::new(&config.cache.redis_url).await {
        Ok(redis_cache) => {
            println!("✓ Redis cache enabled: {}", config.cache.redis_url);
            Some(Box::new(redis_cache))
        }
        Err(e) => {
            eprintln!("✗ Redis cache unavailable ({}), will fallback to direct DB queries", e);
            None
        }
    };

    // 创建应用状态
    let app_state = Arc::new(AppState {
        config: config.clone(),
        cache: cache_client,
    });
    
    println!("✓ AppState created successfully");
    println!("✓ AppState has cache: {}", app_state.cache.is_some());
    
    // 生成API文档
    let openapi = ApiDoc::openapi();

    println!("Starting server on {}:{}", config.server.host, config.server.port);
    println!("Elasticsearch URL: {}", config.elasticsearch.url);
    if app_state.cache.is_some() {
        println!("Cache TTL: {} seconds", config.cache.ttl_seconds);
    }

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(es_client.clone()))
            .app_data(web::Data::new(app_state.clone()))
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
