use actix_web::{web, HttpResponse};
use serde_json::json;
use crate::{
    models::history::{HistoryRecord, HistoryQuery},
    services::EsService,
    error::AppError,
};

pub async fn insert_history(
    es_service: web::Data<EsService>,
    record: web::Json<HistoryRecord>,
) -> Result<HttpResponse, AppError> {
    es_service.insert_record(&record).await?;
    Ok(HttpResponse::Ok().json(json!({ "status": "success" })))
}

pub async fn query_history(
    es_service: web::Data<EsService>,
    query: web::Query<HistoryQuery>,
) -> Result<HttpResponse, AppError> {
    let records = es_service.search_records(&query).await?;
    Ok(HttpResponse::Ok().json(records))
} 