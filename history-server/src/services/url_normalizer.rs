use regex::Regex;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use tracing::{info, warn, error};

use crate::services::database::{DatabaseService, NormalizationRule};

/// URL归一化服务
/// 负责根据数据库中的规则对URL进行归一化处理
pub struct UrlNormalizer {
    db: Arc<DatabaseService>,
    /// 缓存编译后的正则表达式，避免重复编译
    regex_cache: Arc<Mutex<HashMap<i32, (Regex, String, DateTime<Utc>)>>>,
    /// 缓存规则列表，减少数据库查询
    rules_cache: Arc<Mutex<Option<(Vec<NormalizationRule>, DateTime<Utc>)>>>,
    /// 缓存过期时间（秒）
    cache_ttl_seconds: u64,
}

#[derive(Debug)]
pub struct NormalizationResult {
    pub original_url: String,
    pub normalized_url: String,
    pub applied_rule: Option<NormalizationRule>,
    pub matched: bool,
}

impl UrlNormalizer {
    pub fn new(db: Arc<DatabaseService>) -> Self {
        Self {
            db,
            regex_cache: Arc::new(Mutex::new(HashMap::new())),
            rules_cache: Arc::new(Mutex::new(None)),
            cache_ttl_seconds: 300, // 5分钟缓存
        }
    }

    /// 归一化单个URL
    /// 按照规则顺序依次尝试，第一个匹配的规则生效
    pub async fn normalize_url(&self, original_url: &str) -> String {
        match self.normalize_url_detailed(original_url).await {
            Ok(result) => result.normalized_url,
            Err(e) => {
                error!("Failed to normalize URL {}: {}", original_url, e);
                original_url.to_string()
            }
        }
    }

    /// 详细的归一化处理，返回完整结果
    pub async fn normalize_url_detailed(&self, original_url: &str) -> Result<NormalizationResult, Box<dyn std::error::Error + Send + Sync>> {
        let rules = self.get_cached_rules().await?;
        
        for rule in rules.iter() {
            if !rule.enabled {
                continue;
            }

            match self.apply_rule(original_url, rule).await {
                Ok(Some(normalized_url)) => {
                    info!("URL normalized: {} -> {} (rule: {})", original_url, normalized_url, rule.id);
                    return Ok(NormalizationResult {
                        original_url: original_url.to_string(),
                        normalized_url,
                        applied_rule: Some(rule.clone()),
                        matched: true,
                    });
                }
                Ok(None) => {
                    // 规则不匹配，继续下一个
                    continue;
                }
                Err(e) => {
                    warn!("Rule {} failed to apply: {}", rule.id, e);
                    continue;
                }
            }
        }

        // 没有规则匹配，返回原URL
        Ok(NormalizationResult {
            original_url: original_url.to_string(),
            normalized_url: original_url.to_string(),
            applied_rule: None,
            matched: false,
        })
    }

    /// 批量归一化URL
    pub async fn normalize_urls(&self, original_urls: Vec<String>) -> Vec<String> {
        let mut results = Vec::with_capacity(original_urls.len());
        
        for url in original_urls {
            let normalized = self.normalize_url(&url).await;
            results.push(normalized);
        }
        
        results
    }

    /// 应用单个规则
    async fn apply_rule(&self, url: &str, rule: &NormalizationRule) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        let regex = self.get_cached_regex(rule).await?;
        
        let result = regex.replace(url, &rule.replacement);
        
        // 如果结果与原URL相同，说明没有匹配
        if result == url {
            Ok(None)
        } else {
            Ok(Some(result.to_string()))
        }
    }

    /// 获取缓存的正则表达式
    async fn get_cached_regex(&self, rule: &NormalizationRule) -> Result<Regex, Box<dyn std::error::Error + Send + Sync>> {
        let mut cache = self.regex_cache.lock().await;
        
        // 检查缓存中是否有该规则的正则表达式
        if let Some((regex, cached_pattern, cached_time)) = cache.get(&rule.id) {
            // 检查模式是否变化或缓存是否过期
            if cached_pattern == &rule.pattern && 
               (Utc::now() - *cached_time).num_seconds() < self.cache_ttl_seconds as i64 {
                return Ok(regex.clone());
            }
        }

        // 编译新的正则表达式
        let regex = Regex::new(&rule.pattern)
            .map_err(|e| format!("Invalid regex pattern '{}': {}", rule.pattern, e))?;
        
        // 更新缓存
        cache.insert(rule.id, (regex.clone(), rule.pattern.clone(), Utc::now()));
        
        Ok(regex)
    }

    /// 获取缓存的规则列表
    async fn get_cached_rules(&self) -> Result<Vec<NormalizationRule>, Box<dyn std::error::Error + Send + Sync>> {
        let mut cache = self.rules_cache.lock().await;
        
        // 检查缓存是否有效
        if let Some((rules, cached_time)) = cache.as_ref() {
            if (Utc::now() - *cached_time).num_seconds() < self.cache_ttl_seconds as i64 {
                return Ok(rules.clone());
            }
        }

        // 从数据库获取最新规则
        let rules = self.db.get_normalization_rules().await
            .map_err(|e| format!("Failed to load normalization rules: {}", e))?;
        
        info!("Loaded {} normalization rules from database", rules.len());
        
        // 更新缓存
        *cache = Some((rules.clone(), Utc::now()));
        
        Ok(rules)
    }

    /// 刷新规则缓存
    /// 在规则变更时调用，强制重新加载
    pub async fn refresh_rules_cache(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut rules_cache = self.rules_cache.lock().await;
        let mut regex_cache = self.regex_cache.lock().await;
        
        // 清除缓存
        *rules_cache = None;
        regex_cache.clear();
        
        info!("Normalization rules cache refreshed");
        Ok(())
    }

    /// 测试规则
    pub async fn test_rule(&self, pattern: &str, replacement: &str, test_url: &str) -> Result<NormalizationResult, Box<dyn std::error::Error + Send + Sync>> {
        let regex = Regex::new(pattern)
            .map_err(|e| format!("Invalid regex pattern '{}': {}", pattern, e))?;
        
        let result = regex.replace(test_url, replacement);
        let matched = result != test_url;
        
        Ok(NormalizationResult {
            original_url: test_url.to_string(),
            normalized_url: result.to_string(),
            applied_rule: None, // 测试时不返回具体规则
            matched,
        })
    }

    /// 获取缓存统计信息
    pub async fn get_cache_stats(&self) -> (usize, bool) {
        let regex_cache = self.regex_cache.lock().await;
        let rules_cache = self.rules_cache.lock().await;
        
        (regex_cache.len(), rules_cache.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_url_normalization() {
        // 这里可以添加URL归一化的单元测试
    }

    #[test]
    fn test_regex_pattern() {
        let pattern = r"https://example\.com/video/(\d+).*";
        let replacement = "https://example.com/video/$1";
        let test_url = "https://example.com/video/123-hd";
        
        let regex = Regex::new(pattern).unwrap();
        let result = regex.replace(test_url, replacement);
        
        assert_eq!(result, "https://example.com/video/123");
    }
}
