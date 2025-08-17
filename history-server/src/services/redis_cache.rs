use super::cache::{Cache, CacheError};
use async_trait::async_trait;
use redis::{AsyncCommands, Client, RedisError};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

/// Redis缓存实现
#[derive(Clone)]
pub struct RedisCache {
    client: Client,
    connection: Arc<Mutex<Option<redis::aio::MultiplexedConnection>>>,
}

impl RedisCache {
    /// 创建新的Redis缓存实例
    /// 
    /// # Arguments
    /// * `redis_url` - Redis连接URL
    pub async fn new(redis_url: &str) -> Result<Self, CacheError> {
        let client = Client::open(redis_url)
            .map_err(|e| CacheError::Connection(format!("Failed to create Redis client: {}", e)))?;

        // 测试连接
        let connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| CacheError::Connection(format!("Failed to connect to Redis: {}", e)))?;

        Ok(Self {
            client,
            connection: Arc::new(Mutex::new(Some(connection))),
        })
    }

    /// 获取Redis连接
    async fn get_connection(&self) -> Result<redis::aio::MultiplexedConnection, CacheError> {
        let mut conn_guard = self.connection.lock().await;
        
        match conn_guard.take() {
            Some(conn) => Ok(conn),
            None => {
                // 重新建立连接
                self.client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| CacheError::Connection(format!("Failed to reconnect to Redis: {}", e)))
            }
        }
    }

    /// 归还Redis连接
    async fn return_connection(&self, connection: redis::aio::MultiplexedConnection) {
        let mut conn_guard = self.connection.lock().await;
        *conn_guard = Some(connection);
    }

    /// 将RedisError转换为CacheError
    fn map_redis_error(err: RedisError) -> CacheError {
        match err.kind() {
            redis::ErrorKind::IoError => CacheError::Connection(err.to_string()),
            redis::ErrorKind::TypeError => CacheError::Serialization(err.to_string()),
            _ => CacheError::General(err.to_string()),
        }
    }
}

#[async_trait]
impl Cache for RedisCache {
    async fn get(&self, key: &str) -> Result<Option<Value>, CacheError> {
        let mut conn = self.get_connection().await?;
        
        let result: Option<String> = conn
            .get(key)
            .await
            .map_err(Self::map_redis_error)?;

        self.return_connection(conn).await;

        match result {
            Some(json_str) => {
                let value = serde_json::from_str(&json_str)
                    .map_err(|e| CacheError::Serialization(format!("Failed to deserialize JSON: {}", e)))?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    async fn set(&self, key: &str, value: &Value, ttl: Duration) -> Result<(), CacheError> {
        let mut conn = self.get_connection().await?;
        
        let json_str = serde_json::to_string(value)
            .map_err(|e| CacheError::Serialization(format!("Failed to serialize JSON: {}", e)))?;

        let ttl_seconds = ttl.as_secs();
        
        conn.set_ex(key, json_str, ttl_seconds)
            .await
            .map_err(Self::map_redis_error)?;

        self.return_connection(conn).await;
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<(), CacheError> {
        let mut conn = self.get_connection().await?;
        
        conn.del(key)
            .await
            .map_err(Self::map_redis_error)?;

        self.return_connection(conn).await;
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CacheError> {
        let mut conn = self.get_connection().await?;
        
        let exists: bool = conn
            .exists(key)
            .await
            .map_err(Self::map_redis_error)?;

        self.return_connection(conn).await;
        Ok(exists)
    }

    async fn clear(&self) -> Result<(), CacheError> {
        let mut conn = self.get_connection().await?;
        
        redis::cmd("FLUSHDB")
            .query_async(&mut conn)
            .await
            .map_err(Self::map_redis_error)?;

        self.return_connection(conn).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // 注意：这些测试需要运行的Redis实例
    // 可以通过docker运行: docker run -d -p 6379:6379 redis:alpine

    #[tokio::test]
    #[ignore] // 忽略此测试，除非有可用的Redis实例
    async fn test_redis_cache_basic_operations() {
        let cache = RedisCache::new("redis://127.0.0.1:6379")
            .await
            .expect("Failed to create Redis cache");

        let key = "test:key";
        let value = json!({"test": "value"});

        // 测试设置缓存
        cache
            .set(key, &value, Duration::from_secs(60))
            .await
            .expect("Failed to set cache");

        // 测试获取缓存
        let cached_value = cache
            .get(key)
            .await
            .expect("Failed to get cache");

        assert_eq!(cached_value, Some(value));

        // 测试存在性检查
        let exists = cache
            .exists(key)
            .await
            .expect("Failed to check existence");

        assert!(exists);

        // 测试删除缓存
        cache
            .delete(key)
            .await
            .expect("Failed to delete cache");

        // 测试删除后获取
        let cached_value_after_delete = cache
            .get(key)
            .await
            .expect("Failed to get cache after delete");

        assert_eq!(cached_value_after_delete, None);
    }
}
