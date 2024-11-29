use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AppConfig {
    pub elasticsearch: ElasticsearchConfig,
    pub mongodb: MongoConfig,
    pub server: ServerConfig,
}

#[derive(Debug, Deserialize)]
pub struct ElasticsearchConfig {
    pub url: String,
    pub index: String,
}

#[derive(Debug, Deserialize)]
pub struct MongoConfig {
    pub url: String,
    pub database: String,
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

impl AppConfig {
    pub fn new() -> Result<Self, config::ConfigError> {
        let config = config::Config::builder()
            .add_source(config::File::with_name("config/default"))
            .add_source(config::Environment::with_prefix("APP"))
            .build()?;
            
        config.try_deserialize()
    }
}
