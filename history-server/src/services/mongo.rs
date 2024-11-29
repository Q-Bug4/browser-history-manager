use mongodb::{
    Client, Database,
    options::ClientOptions,
    bson::doc,
};
use serde::{Serialize, Deserialize};
use crate::{
    config::MongoConfig,
    error::AppError,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemConfig {
    pub key: String,
    pub value: String,
}

#[derive(Clone)]
pub struct MongoService {
    db: Database,
}

impl MongoService {
    pub async fn new(config: &MongoConfig) -> Result<Self, AppError> {
        let client_options = ClientOptions::parse(&config.url)
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;
            
        let client = Client::with_options(client_options)
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;
            
        let db = client.database(&config.database);
        
        Ok(Self { db })
    }

    pub async fn get_system_config(&self, key: &str) -> Result<Option<String>, AppError> {
        let collection = self.db.collection::<SystemConfig>("system_config");
        
        let filter = doc! { "key": key };
        let result = collection
            .find_one(filter, None)
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;
            
        Ok(result.map(|config| config.value))
    }

    pub async fn set_system_config(&self, key: &str, value: &str) -> Result<(), AppError> {
        let collection = self.db.collection::<SystemConfig>("system_config");
        
        let filter = doc! { "key": key };
        let update = doc! {
            "$set": {
                "key": key,
                "value": value
            }
        };
        let options = mongodb::options::UpdateOptions::builder()
            .upsert(true)
            .build();
            
        collection
            .update_one(filter, update, options)
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;
            
        Ok(())
    }
} 