use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryRecord {
    pub timestamp: DateTime<Utc>,
    pub url: String,
    pub domain: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryQuery {
    pub url_keyword: Option<String>,
    pub domain: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}
