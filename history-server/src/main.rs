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
        App::new()
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
