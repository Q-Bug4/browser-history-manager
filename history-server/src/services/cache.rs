use async_trait::async_trait;
use serde_json::Value;
use std::time::Duration;

/// 缓存操作错误
#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("Connection error: {0}")]
    Connection(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Cache error: {0}")]
    General(String),
}

/// 支持克隆的trait
pub trait CacheClone {
    fn clone_box(&self) -> Box<dyn Cache>;
}

impl<T> CacheClone for T
where
    T: 'static + Cache + Clone,
{
    fn clone_box(&self) -> Box<dyn Cache> {
        Box::new(self.clone())
    }
}

impl Clone for Box<dyn Cache> {
    fn clone(&self) -> Box<dyn Cache> {
        self.clone_box()
    }
}

/// 缓存接口，定义所有缓存操作
#[async_trait]
pub trait Cache: Send + Sync + CacheClone {
    /// 获取缓存数据
    /// 
    /// # Arguments
    /// * `key` - 缓存键
    /// 
    /// # Returns
    /// * `Ok(Some(value))` - 如果缓存存在
    /// * `Ok(None)` - 如果缓存不存在
    /// * `Err(error)` - 如果发生错误
    async fn get(&self, key: &str) -> Result<Option<Value>, CacheError>;

    /// 设置缓存数据
    /// 
    /// # Arguments
    /// * `key` - 缓存键
    /// * `value` - 缓存值
    /// * `ttl` - 生存时间
    async fn set(&self, key: &str, value: &Value, ttl: Duration) -> Result<(), CacheError>;

    /// 删除缓存数据
    /// 
    /// # Arguments
    /// * `key` - 缓存键
    async fn delete(&self, key: &str) -> Result<(), CacheError>;

    /// 检查缓存是否存在
    /// 
    /// # Arguments
    /// * `key` - 缓存键
    async fn exists(&self, key: &str) -> Result<bool, CacheError>;

    /// 清空所有缓存
    async fn clear(&self) -> Result<(), CacheError>;
}

/// 缓存键生成器
pub struct CacheKeyGenerator;

impl CacheKeyGenerator {
    /// 为历史搜索生成缓存键 - 基于查询的URL
    pub fn history_search_key(
        keyword: &Option<String>,
        domain: &Option<String>,
        start_date: &Option<String>,
        end_date: &Option<String>,
        page: i32,
        page_size: i32,
    ) -> String {
        let keyword = keyword.as_ref().map(|s| s.as_str()).unwrap_or("");
        let domain = domain.as_ref().map(|s| s.as_str()).unwrap_or("");
        let start_date = start_date.as_ref().map(|s| s.as_str()).unwrap_or("");
        let end_date = end_date.as_ref().map(|s| s.as_str()).unwrap_or("");
        
        // 生成查询URL作为缓存key的一部分
        let mut query_parts = Vec::new();
        if !keyword.is_empty() {
            query_parts.push(format!("keyword={}", keyword));
        }
        if !domain.is_empty() {
            query_parts.push(format!("domain={}", domain));
        }
        if !start_date.is_empty() {
            query_parts.push(format!("startDate={}", start_date));
        }
        if !end_date.is_empty() {
            query_parts.push(format!("endDate={}", end_date));
        }
        query_parts.push(format!("page={}", page));
        query_parts.push(format!("pageSize={}", page_size));
        
        let query_url = if query_parts.is_empty() {
            "/api/history".to_string()
        } else {
            format!("/api/history?{}", query_parts.join("&"))
        };
        
        // 使用查询URL的hash作为缓存键
        format!("history:url:{:x}", Self::hash_string(&query_url))
    }
    
    /// 计算字符串的简单哈希值
    fn hash_string(s: &str) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        s.hash(&mut hasher);
        hasher.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_generation() {
        let key = CacheKeyGenerator::history_search_key(
            &Some("test".to_string()),
            &Some("example.com".to_string()),
            &Some("2024-01-01".to_string()),
            &Some("2024-12-31".to_string()),
            1,
            30,
        );
        
        assert_eq!(key, "history:search:test:example.com:2024-01-01:2024-12-31:1:30");
    }

    #[test]
    fn test_cache_key_generation_with_none_values() {
        let key = CacheKeyGenerator::history_search_key(
            &None,
            &None,
            &None,
            &None,
            1,
            30,
        );
        
        assert_eq!(key, "history:search:::::1:30");
    }
}
