use actix_cors::Cors;
use actix_web::{get, web, App, HttpResponse, HttpServer, Responder, post};
use elasticsearch::Elasticsearch;
use tracing::{info, error};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use std::sync::Arc;
use std::time::Duration;
use elasticsearch::http::transport::Transport;
use serde_json::json;

mod config;
mod services;
mod handlers;
mod tracing_config;

use crate::config::{AppConfig, ElasticsearchConfig};
use crate::services::es;
use crate::services::cache::Cache;
use crate::services::redis_cache::RedisCache;
use crate::services::database::DatabaseService;
use crate::services::url_normalizer::UrlNormalizer;
use crate::handlers::normalization;

// 应用状态结构体 - 存储全局配置和服务实例
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub cache: Option<Box<dyn Cache>>, // 如果Redis可用则有缓存，否则为None
    pub database: Arc<DatabaseService>,
    pub url_normalizer: Arc<UrlNormalizer>,
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
        query_history_by_urls,
        normalization::get_rules,
        normalization::create_rule,
        normalization::update_rule,
        normalization::delete_rule,
        normalization::test_rule,
        normalization::refresh_cache,
    ),
    components(
        schemas(HistoryRecord, HistoryRequest, UrlQueryRequest)
    ),
    tags(
        (name = "history", description = "Browser History API"),
        (name = "normalization", description = "URL Normalization Rules API")
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
    // 支持新旧两种字段名：url（旧）和 original_url（新）
    #[serde(alias = "original_url")]
    #[schema(example = "https://example.com")]
    url: String,
    #[schema(example = "2024-03-19T10:30:00Z")]
    timestamp: String,
    #[schema(example = "example.com")]
    domain: String,
}

// URL查询请求模型
#[derive(Debug, Deserialize, ToSchema)]
struct UrlQueryRequest {
    // 支持单个URL查询
    #[serde(alias = "original_url")]
    url: Option<String>,
    // 支持批量URL查询
    #[serde(alias = "original_urls")]
    urls: Option<Vec<String>>,
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
    tracing::info!("Health check: cache={}", app_state.cache.is_some());
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
    
    let page_size = query.page_size.unwrap_or(30).min(1000);
    let page = query.page.unwrap_or(1);
    tracing::info!(REQUEST = "search_history", keyword = ?query.keyword, domain = ?query.domain, page = page);
    
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
                tracing::info!("Cache hit for key: {}", cache_key);
                return HttpResponse::Ok().json(cached_data);
            }
            Ok(None) => {
                tracing::info!("Cache miss for key: {}", cache_key);
            }
            Err(e) => {
                tracing::error!("Cache get error (will fallback to DB): {}", e);
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
                                tracing::error!("Failed to set cache for key {}: {}", cache_key_clone, e);
                            } else {
                                tracing::info!("Cached data for key: {}", cache_key_clone);
                            }
                        });
                    }
                }
            }
            
            HttpResponse::Ok().json(response)
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to search history");
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
    app_state: web::Data<Arc<AppState>>,
) -> impl Responder {
    tracing::info!(REQUEST = "report_history", url = %request.url, domain = %request.domain);
    
    // 获取原始URL和归一化URL
    let original_url = &request.url;
    let normalized_url = app_state.url_normalizer.normalize_url(original_url).await;
    
    tracing::info!("URL normalization: {} -> {}", original_url, normalized_url);
    
    match es::insert_history(&es_client, original_url, &normalized_url, &request.timestamp, &request.domain).await {
        Ok(_) => {
            HttpResponse::Ok().json(json!({
                "status": "success",
                "message": "Record added successfully",
                "original_url": original_url,
                "normalized_url": normalized_url
            }))
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to insert history record");
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to store record"
            }))
        }
    }
}

/// Query history by URLs with normalization
#[utoipa::path(
    post,
    path = "/api/history/query",
    tag = "history",
    request_body = UrlQueryRequest,
    responses(
        (status = 200, description = "Query results"),
        (status = 400, description = "Invalid request data"),
        (status = 500, description = "Internal server error")
    )
)]
#[post("/api/history/query")]
async fn query_history_by_urls(
    request: web::Json<UrlQueryRequest>,
    es_client: web::Data<Arc<Elasticsearch>>,
    app_state: web::Data<Arc<AppState>>,
) -> impl Responder {
    tracing::info!(REQUEST = "query_history_by_urls", request = ?request);
    
    // 收集所有需要查询的URL
    let mut original_urls = Vec::new();
    
    if let Some(url) = &request.url {
        original_urls.push(url.clone());
    }
    
    if let Some(urls) = &request.urls {
        original_urls.extend(urls.clone());
    }
    
    if original_urls.is_empty() {
        return HttpResponse::BadRequest().json(json!({
            "status": "error",
            "message": "No URLs provided for query"
        }));
    }
    
    // 归一化所有URL
    let mut url_mapping = std::collections::HashMap::new();
    let mut normalized_urls = Vec::new();
    
    for original_url in &original_urls {
        let normalized = app_state.url_normalizer.normalize_url(original_url).await;
        url_mapping.insert(normalized.clone(), original_url.clone());
        normalized_urls.push(normalized);
    }
    
    // 查询ES
    match es::search_history_by_normalized_urls(&es_client, normalized_urls).await {
        Ok(results) => {
            // 将结果映射回原始URL
            let mut response_data = std::collections::HashMap::new();
            
            for (normalized_url, record) in results {
                if let Some(original_url) = url_mapping.get(&normalized_url) {
                    response_data.insert(original_url.clone(), record);
                }
            }
            
            HttpResponse::Ok().json(json!({
                "status": "success",
                "data": response_data,
                "total": response_data.len()
            }))
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to query history by URLs");
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to query history"
            }))
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 初始化 tracing
    tracing_config::init_tracing().expect("Failed to initialize tracing");
    tracing::info!("Starting application...");
    
    // 加载配置
    let config = Arc::new(AppConfig::new().expect("Failed to load config"));
    
    // 创建 ES 客户端
    let es_client = Arc::new(create_es_client(&config.elasticsearch).await);
    
    // 创建数据库服务
    let database = match DatabaseService::new(&config.database.url).await {
        Ok(db) => {
            tracing::info!("✓ Database connected: {}", config.database.url);
            
            // 初始化数据库表
            if let Err(e) = db.init_tables().await {
                tracing::error!("✗ Failed to initialize database tables: {}", e);
                panic!("Failed to initialize database tables: {}", e);
            }
            tracing::info!("✓ Database tables initialized");
            
            Arc::new(db)
        }
        Err(e) => {
            tracing::error!("✗ Database connection failed: {}", e);
            panic!("Failed to connect to database: {}", e);
        }
    };

    // 创建URL归一化服务
    let url_normalizer = Arc::new(UrlNormalizer::new(database.clone()));
    tracing::info!("✓ URL normalizer initialized");

    // 尝试创建缓存客户端 - 默认启用，如果Redis不可用则自动跳过
    let cache_client: Option<Box<dyn Cache>> = match RedisCache::new(&config.cache.redis_url).await {
        Ok(redis_cache) => {
            tracing::info!("✓ Redis cache enabled: {}", config.cache.redis_url);
            Some(Box::new(redis_cache))
        }
        Err(e) => {
            tracing::error!("✗ Redis cache unavailable ({}), will fallback to direct DB queries", e);
            None
        }
    };

    // 创建应用状态
    let app_state = Arc::new(AppState {
        config: config.clone(),
        cache: cache_client,
        database,
        url_normalizer,
    });
    
    tracing::info!("✓ AppState created successfully");
    tracing::info!("✓ AppState has cache: {}", app_state.cache.is_some());
    
    // 生成API文档
    let openapi = ApiDoc::openapi();

    tracing::info!("Starting server on {}:{}", config.server.host, config.server.port);
    tracing::info!("Elasticsearch URL: {}", config.elasticsearch.url);
    if app_state.cache.is_some() {
        tracing::info!("Cache TTL: {} seconds", config.cache.ttl_seconds);
    }

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .wrap(tracing_actix_web::TracingLogger::default())  // tracing中间件
            .app_data(web::Data::new(es_client.clone()))
            .app_data(web::Data::new(app_state.clone()))
            .service(
                SwaggerUi::new("/swagger-ui/{_:.*}")
                    .url("/api-docs/openapi.json", openapi.clone()),
            )
            .service(health)
            .service(search_history)
            .service(report_history)
            .service(query_history_by_urls)
            // 规则管理API
            .service(normalization::get_rules)
            .service(normalization::create_rule)
            .service(normalization::update_rule)
            .service(normalization::delete_rule)
            .service(normalization::test_rule)
            .service(normalization::refresh_cache)
    })
    .bind((config.server.host.as_str(), config.server.port))?
    .run()
    .await
}
