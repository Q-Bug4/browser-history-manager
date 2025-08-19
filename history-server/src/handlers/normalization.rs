use actix_web::{web, HttpResponse, Responder, get, post, put, delete};
use serde_json::json;
use std::sync::Arc;
use utoipa::ToSchema;
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::services::database::{CreateRuleRequest, UpdateRuleRequest, TestRuleRequest, TestRuleResponse};

/// 获取所有归一化规则
#[utoipa::path(
    get,
    path = "/api/normalization-rules",
    tag = "normalization",
    responses(
        (status = 200, description = "List of normalization rules"),
        (status = 500, description = "Internal server error")
    )
)]
#[get("/api/normalization-rules")]
pub async fn get_rules(app_state: web::Data<Arc<AppState>>) -> impl Responder {
    tracing::info!("GET /api/normalization-rules");
    
    match app_state.database.get_all_normalization_rules().await {
        Ok(rules) => {
            HttpResponse::Ok().json(json!({
                "status": "success",
                "data": rules,
                "total": rules.len()
            }))
        }
        Err(e) => {
            tracing::error!("Failed to get normalization rules: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to retrieve rules"
            }))
        }
    }
}

/// 创建新的归一化规则
#[utoipa::path(
    post,
    path = "/api/normalization-rules",
    tag = "normalization",
    request_body = CreateRuleRequest,
    responses(
        (status = 201, description = "Rule created successfully"),
        (status = 400, description = "Invalid rule data"),
        (status = 500, description = "Internal server error")
    )
)]
#[post("/api/normalization-rules")]
pub async fn create_rule(
    app_state: web::Data<Arc<AppState>>,
    rule_data: web::Json<CreateRuleRequest>,
) -> impl Responder {
    tracing::info!("POST /api/normalization-rules: {:?}", rule_data);
    
    // 验证正则表达式
    if let Err(e) = regex::Regex::new(&rule_data.pattern) {
        return HttpResponse::BadRequest().json(json!({
            "status": "error",
            "message": format!("Invalid regex pattern: {}", e)
        }));
    }
    
    match app_state.database.create_rule(&rule_data).await {
        Ok(new_rule) => {
            // 刷新URL归一化器的缓存
            if let Err(e) = app_state.url_normalizer.refresh_rules_cache().await {
                tracing::error!("Failed to refresh normalizer cache: {}", e);
            }
            
            HttpResponse::Created().json(json!({
                "status": "success",
                "message": "Rule created successfully",
                "data": new_rule
            }))
        }
        Err(e) => {
            tracing::error!("Failed to create rule: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to create rule"
            }))
        }
    }
}

/// 更新归一化规则
#[utoipa::path(
    put,
    path = "/api/normalization-rules/{id}",
    tag = "normalization",
    params(
        ("id" = i32, Path, description = "Rule ID")
    ),
    request_body = UpdateRuleRequest,
    responses(
        (status = 200, description = "Rule updated successfully"),
        (status = 404, description = "Rule not found"),
        (status = 400, description = "Invalid rule data"),
        (status = 500, description = "Internal server error")
    )
)]
#[put("/api/normalization-rules/{id}")]
pub async fn update_rule(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<i32>,
    rule_data: web::Json<UpdateRuleRequest>,
) -> impl Responder {
    let rule_id = path.into_inner();
    tracing::info!("PUT /api/normalization-rules/{}: {:?}", rule_id, rule_data);
    
    // 验证正则表达式（如果提供了）
    if let Some(pattern) = &rule_data.pattern {
        if let Err(e) = regex::Regex::new(pattern) {
            return HttpResponse::BadRequest().json(json!({
                "status": "error",
                "message": format!("Invalid regex pattern: {}", e)
            }));
        }
    }
    
    match app_state.database.update_rule(rule_id, &rule_data).await {
        Ok(Some(updated_rule)) => {
            // 刷新URL归一化器的缓存
            if let Err(e) = app_state.url_normalizer.refresh_rules_cache().await {
                tracing::error!("Failed to refresh normalizer cache: {}", e);
            }
            
            HttpResponse::Ok().json(json!({
                "status": "success",
                "message": "Rule updated successfully",
                "data": updated_rule
            }))
        }
        Ok(None) => {
            HttpResponse::NotFound().json(json!({
                "status": "error",
                "message": "Rule not found"
            }))
        }
        Err(e) => {
            tracing::error!("Failed to update rule: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to update rule"
            }))
        }
    }
}

/// 删除归一化规则
#[utoipa::path(
    delete,
    path = "/api/normalization-rules/{id}",
    tag = "normalization",
    params(
        ("id" = i32, Path, description = "Rule ID")
    ),
    responses(
        (status = 200, description = "Rule deleted successfully"),
        (status = 404, description = "Rule not found"),
        (status = 500, description = "Internal server error")
    )
)]
#[delete("/api/normalization-rules/{id}")]
pub async fn delete_rule(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<i32>,
) -> impl Responder {
    let rule_id = path.into_inner();
    tracing::info!("DELETE /api/normalization-rules/{}", rule_id);
    
    match app_state.database.delete_rule(rule_id).await {
        Ok(true) => {
            // 刷新URL归一化器的缓存
            if let Err(e) = app_state.url_normalizer.refresh_rules_cache().await {
                tracing::error!("Failed to refresh normalizer cache: {}", e);
            }
            
            HttpResponse::Ok().json(json!({
                "status": "success",
                "message": format!("Rule {} deleted successfully", rule_id)
            }))
        }
        Ok(false) => {
            HttpResponse::NotFound().json(json!({
                "status": "error",
                "message": "Rule not found"
            }))
        }
        Err(e) => {
            tracing::error!("Failed to delete rule: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to delete rule"
            }))
        }
    }
}

/// 测试归一化规则
#[utoipa::path(
    post,
    path = "/api/normalization-rules/test",
    tag = "normalization",
    request_body = TestRuleRequest,
    responses(
        (status = 200, description = "Test result"),
        (status = 400, description = "Invalid test data"),
        (status = 500, description = "Internal server error")
    )
)]
#[post("/api/normalization-rules/test")]
pub async fn test_rule(
    app_state: web::Data<Arc<AppState>>,
    test_data: web::Json<TestRuleRequest>,
) -> impl Responder {
    tracing::info!("POST /api/normalization-rules/test: {:?}", test_data);
    
    match app_state.url_normalizer.test_rule(&test_data.pattern, &test_data.replacement, &test_data.test_url).await {
        Ok(result) => {
            let response = TestRuleResponse {
                original_url: result.original_url,
                normalized_url: result.normalized_url,
                matched: result.matched,
            };
            
            HttpResponse::Ok().json(json!({
                "status": "success",
                "data": response
            }))
        }
        Err(e) => {
            HttpResponse::BadRequest().json(json!({
                "status": "error",
                "message": format!("Test failed: {}", e)
            }))
        }
    }
}

/// 刷新规则缓存
#[utoipa::path(
    post,
    path = "/api/normalization-rules/refresh-cache",
    tag = "normalization",
    responses(
        (status = 200, description = "Cache refreshed successfully"),
        (status = 500, description = "Internal server error")
    )
)]
#[post("/api/normalization-rules/refresh-cache")]
pub async fn refresh_cache(app_state: web::Data<Arc<AppState>>) -> impl Responder {
    tracing::info!("POST /api/normalization-rules/refresh-cache");
    
    match app_state.url_normalizer.refresh_rules_cache().await {
        Ok(_) => {
            let (regex_cache_size, rules_cached) = app_state.url_normalizer.get_cache_stats().await;
            
            HttpResponse::Ok().json(json!({
                "status": "success",
                "message": "Rules cache refreshed successfully",
                "cache_stats": {
                    "regex_cache_size": regex_cache_size,
                    "rules_cached": rules_cached
                }
            }))
        }
        Err(e) => {
            tracing::error!("Failed to refresh cache: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to refresh cache"
            }))
        }
    }
}