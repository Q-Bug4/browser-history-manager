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
    })
    .bind((config.server.host, config.server.port))?
    .run()
    .await
}
