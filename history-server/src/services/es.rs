use elasticsearch::{
    Elasticsearch,
    SearchParts,
    Error as ElasticsearchError,
    IndexParts,
};
use tracing::info;
use serde_json::{json, Value};
use std::collections::HashMap;

pub async fn search_history(
    client: &Elasticsearch,
    keyword: Option<String>,
    domain: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<Value, ElasticsearchError> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(30).min(1000);
    let from = (page - 1) * page_size;

    // 构建查询
    let mut query = json!({
        "bool": {
            "must": []
        }
    });

    let must_array = query["bool"]["must"].as_array_mut().unwrap();

    // 添加关键词搜索
    if let Some(keyword) = keyword {
        if !keyword.is_empty() {
            must_array.push(json!({
                "multi_match": {
                    "query": keyword,
                    "fields": ["url", "domain"],
                    "type": "phrase_prefix"
                }
            }));
        }
    }

    // 添加域名过滤
    if let Some(domain) = domain {
        if !domain.is_empty() {
            must_array.push(json!({
                "term": {
                    "domain.keyword": domain
                }
            }));
        }
    }

    // 添加时间范围过滤
    if start_date.is_some() || end_date.is_some() {
        let mut range = json!({
            "range": {
                "timestamp": {}
            }
        });

        if let Some(start) = start_date {
            range["range"]["timestamp"]["gte"] = json!(start);
        }
        if let Some(end) = end_date {
            range["range"]["timestamp"]["lte"] = json!(end);
        }

        must_array.push(range);
    }

    // 如果没有任何查询条件，使用 match_all
    if must_array.is_empty() {
        query = json!({
            "match_all": {}
        });
    }

    // 构建完整的搜索请求,添加track_total_hits确保获取准确的总数
    let body = json!({
        "query": query,
        "from": from,
        "size": page_size,
        "track_total_hits": true,
        "sort": [
            { "timestamp": { "order": "desc" } }
        ]
    });

    tracing::info!("ES Query: {}", serde_json::to_string_pretty(&body).unwrap());

    let response = client
        .search(SearchParts::Index(&["browser-history"]))
        .body(body)
        .send()
        .await?;

    let response_body = response.json::<Value>().await?;
    
    // 从ES响应中提取需要的数据
    let hits = response_body["hits"]["hits"].as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|hit| hit["_source"].clone())
        .collect::<Vec<Value>>();

    // 获取总记录数    
    let total = response_body["hits"]["total"]["value"]
        .as_i64()
        .unwrap_or(0) as i32;

    // 构建新的返回格式    
    let result = json!({
        "items": hits,
        "total": total,
        "page": page,
        "pageSize": page_size
    });

    Ok(result)
}

pub async fn insert_history(
    client: &Elasticsearch,
    original_url: &str,
    normalized_url: &str,
    timestamp: &str,
    domain: &str,
) -> Result<(), ElasticsearchError> {
    let doc = json!({
        "timestamp": timestamp,
        "original_url": original_url,
        "normalized_url": normalized_url,
        "domain": domain,
        // 保留url字段用于兼容性（但不再使用）
        "url": original_url
    });

    client
        .index(IndexParts::Index("browser-history"))
        .body(doc)
        .send()
        .await?;

    Ok(())
}

// 兼容旧API的写入方法
pub async fn insert_history_legacy(
    client: &Elasticsearch,
    url: &str,
    timestamp: &str,
    domain: &str,
) -> Result<(), ElasticsearchError> {
    // 对于旧API，original_url和normalized_url都是同一个值
    insert_history(client, url, url, timestamp, domain).await
}

/// 根据归一化URL查询历史记录（单个URL）
pub async fn search_history_by_normalized_url(
    client: &Elasticsearch,
    normalized_url: &str,
) -> Result<Option<Value>, ElasticsearchError> {
    let query = json!({
        "query": {
            "term": {
                "normalized_url.keyword": normalized_url
            }
        },
        "size": 1,
        "sort": [
            { "timestamp": { "order": "desc" } }
        ]
    });

    tracing::info!("ES Query for normalized URL {}: {}", normalized_url, serde_json::to_string_pretty(&query).unwrap());

    let response = client
        .search(SearchParts::Index(&["browser-history"]))
        .body(query)
        .send()
        .await?;

    let response_body = response.json::<Value>().await?;
    
    // 提取第一个匹配的文档
    if let Some(hits) = response_body["hits"]["hits"].as_array() {
        if let Some(first_hit) = hits.first() {
            return Ok(Some(first_hit["_source"].clone()));
        }
    }

    Ok(None)
}

/// 批量查询归一化URL的历史记录
pub async fn search_history_by_normalized_urls(
    client: &Elasticsearch,
    normalized_urls: Vec<String>,
) -> Result<HashMap<String, Value>, ElasticsearchError> {
    if normalized_urls.is_empty() {
        return Ok(HashMap::new());
    }

    let query = json!({
        "query": {
            "terms": {
                "normalized_url.keyword": normalized_urls
            }
        },
        "size": normalized_urls.len(),
        "sort": [
            { "timestamp": { "order": "desc" } }
        ]
    });

    tracing::info!("ES Query for {} normalized URLs: {}", normalized_urls.len(), serde_json::to_string_pretty(&query).unwrap());

    let response = client
        .search(SearchParts::Index(&["browser-history"]))
        .body(query)
        .send()
        .await?;

    let response_body = response.json::<Value>().await?;
    
    let mut results = HashMap::new();
    
    // 提取匹配的文档，按normalized_url分组
    if let Some(hits) = response_body["hits"]["hits"].as_array() {
        for hit in hits {
            if let Some(source) = hit.get("_source") {
                if let Some(normalized_url) = source["normalized_url"].as_str() {
                    // 只保留每个normalized_url的最新记录
                    if !results.contains_key(normalized_url) {
                        results.insert(normalized_url.to_string(), source.clone());
                    }
                }
            }
        }
    }

    Ok(results)
} 