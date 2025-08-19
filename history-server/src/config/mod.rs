use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AppConfig {
    pub elasticsearch: ElasticsearchConfig,
    pub server: ServerConfig,
    pub cache: CacheConfig,
    pub database: DatabaseConfig,
}

#[derive(Debug, Deserialize)]
pub struct ElasticsearchConfig {
    pub url: String,
    pub index: String,
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
pub struct CacheConfig {
    pub enabled: bool,
    pub redis_url: String,
    pub ttl_seconds: u64,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct RedisConfig {
    pub url: String,
}

impl AppConfig {
    pub fn new() -> Result<Self, config::ConfigError> {
        let run_mode = std::env::var("RUN_MODE").unwrap_or_else(|_| "development".into());

        let config = config::Config::builder()
            // 首先读取默认配置
            .add_source(config::File::with_name("config/default"))
            // 然后读取环境特定的配置
            .add_source(config::File::with_name(&format!("config/{}", run_mode)).required(false))
            // 最后读取环境变量，环境变量会覆盖文件中的配置
            .add_source(config::Environment::with_prefix("APP").separator("__"))
            .build()?;
            
        config.try_deserialize()
    }
}
