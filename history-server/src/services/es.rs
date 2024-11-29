use elasticsearch::{
    Elasticsearch,
    Error as ElasticsearchError,
    http::transport::Transport,
    indices::{IndicesCreateParts, IndicesExistsParts},
    params::Refresh,
    SearchParts,
    CreateParts,
};
use serde_json::{json, Value};
use crate::{
    models::history::{HistoryRecord, HistoryQuery},
    error::AppError,
    config::ElasticsearchConfig,
};

#[derive(Clone)]
pub struct EsService {
    client: Elasticsearch,
    index: String,
}

impl EsService {
    pub async fn new(config: &ElasticsearchConfig) -> Result<Self, AppError> {
        let transport = Transport::single_node(&config.url)
            .map_err(|e| AppError::InternalError(e.to_string()))?;
        let client = Elasticsearch::new(transport);
        let service = Self {
            client,
            index: config.index.clone(),
        };
        
        // 确保索引存在
        service.ensure_index().await?;
        Ok(service)
    }

    async fn ensure_index(&self) -> Result<(), AppError> {
        let exists = self.client
            .indices()
            .exists(IndicesExistsParts::Index(&[&self.index]))
            .send()
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?
            .status_code()
            .is_success();

        if !exists {
            self.client
                .indices()
                .create(IndicesCreateParts::Index(&self.index))
                .body(json!({
                    "mappings": {
                        "properties": {
                            "timestamp": { "type": "date" },
                            "url": { "type": "keyword" },
                            "domain": { "type": "keyword" }
                        }
                    }
                }))
                .send()
                .await
                .map_err(|e| AppError::DatabaseError(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn insert_record(&self, record: &HistoryRecord) -> Result<(), AppError> {
        self.client
            .create(CreateParts::IndexId(&self.index, &uuid::Uuid::new_v4().to_string()))
            .body(record)
            .refresh(Refresh::True)
            .send()
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;
        Ok(())
    }

    pub async fn search_records(&self, query: &HistoryQuery) -> Result<Vec<HistoryRecord>, AppError> {
        let mut query_body = json!({
            "sort": [
                { "timestamp": { "order": "desc" } }
            ]
        });

        // 构建查询条件
        let mut must_conditions = Vec::new();

        if let Some(ref keyword) = query.url_keyword {
            must_conditions.push(json!({
                "wildcard": {
                    "url": {
                        "value": format!("*{}*", keyword)
                    }
                }
            }));
        }

        if let Some(ref domain) = query.domain {
            must_conditions.push(json!({
                "term": {
                    "domain": domain
                }
            }));
        }

        let mut range = json!({});
        if query.start_time.is_some() || query.end_time.is_some() {
            let mut range_conditions = json!({});
            
            if let Some(start_time) = query.start_time {
                range_conditions["gte"] = json!(start_time);
            }
            if let Some(end_time) = query.end_time {
                range_conditions["lte"] = json!(end_time);
            }
            
            range = json!({
                "range": {
                    "timestamp": range_conditions
                }
            });
            must_conditions.push(range);
        }

        if !must_conditions.is_empty() {
            query_body["query"] = json!({
                "bool": {
                    "must": must_conditions
                }
            });
        }

        // 分页
        let page = query.page.unwrap_or(1);
        let page_size = query.page_size.unwrap_or(30);
        query_body["from"] = json!((page - 1) * page_size);
        query_body["size"] = json!(page_size);

        let response = self.client
            .search(SearchParts::Index(&[&self.index]))
            .body(query_body)
            .send()
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;

        let response_body = response.json::<Value>()
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;

        let hits = response_body["hits"]["hits"]
            .as_array()
            .ok_or_else(|| AppError::DatabaseError("Invalid response format".to_string()))?;

        // 修改这里的结果处理逻辑
        let records: Result<Vec<HistoryRecord>, _> = hits
            .iter()
            .map(|hit| {
                serde_json::from_value::<HistoryRecord>(hit["_source"].clone())
                    .map_err(|e| AppError::DatabaseError(e.to_string()))
            })
            .collect();

        records
    }
} 