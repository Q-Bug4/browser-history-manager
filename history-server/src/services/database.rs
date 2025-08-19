use sqlx::{PgPool, Row, FromRow};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct NormalizationRule {
    pub id: i32,
    pub pattern: String,
    pub replacement: String,
    pub enabled: bool,
    pub order_index: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRuleRequest {
    pub pattern: String,
    pub replacement: String,
    pub enabled: Option<bool>,
    pub order_index: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub pattern: Option<String>,
    pub replacement: Option<String>,
    pub enabled: Option<bool>,
    pub order_index: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct TestRuleRequest {
    pub pattern: String,
    pub replacement: String,
    pub test_url: String,
}

#[derive(Debug, Serialize)]
pub struct TestRuleResponse {
    pub original_url: String,
    pub normalized_url: String,
    pub matched: bool,
}

pub struct DatabaseService {
    pool: PgPool,
}

impl DatabaseService {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPool::connect(database_url).await?;
        Ok(Self { pool })
    }

    /// 初始化数据库表结构
    pub async fn init_tables(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS normalization_rules (
                id SERIAL PRIMARY KEY,
                pattern VARCHAR(500) NOT NULL,
                replacement VARCHAR(500) NOT NULL,
                enabled BOOLEAN DEFAULT true,
                order_index INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
            "#
        )
        .execute(&self.pool)
        .await?;

        // 创建索引
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_normalization_rules_order 
            ON normalization_rules(order_index) 
            WHERE enabled = true
            "#
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_normalization_rules_enabled 
            ON normalization_rules(enabled)
            "#
        )
        .execute(&self.pool)
        .await?;

        // 插入示例规则（如果表为空）
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM normalization_rules")
            .fetch_one(&self.pool)
            .await?;

        if count == 0 {
            sqlx::query(
                r#"
                INSERT INTO normalization_rules (pattern, replacement, enabled, order_index) VALUES
                ('https://example\.com/video/(\d+).*', 'https://example.com/video/$1', true, 1),
                ('https://blog\.example\.com/(\d+).*', 'https://blog.example.com/$1', true, 2),
                ('https://shop\.example\.com/product/([^/?#]+).*', 'https://shop.example.com/product/$1', true, 3)
                "#
            )
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    /// 获取所有归一化规则，按order_index排序
    pub async fn get_normalization_rules(&self) -> Result<Vec<NormalizationRule>, sqlx::Error> {
        let rules = sqlx::query_as::<_, NormalizationRule>(
            r#"
            SELECT id, pattern, replacement, enabled, order_index, created_at, updated_at
            FROM normalization_rules 
            WHERE enabled = true
            ORDER BY order_index ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rules)
    }

    /// 获取所有规则（包括禁用的），用于管理界面
    pub async fn get_all_normalization_rules(&self) -> Result<Vec<NormalizationRule>, sqlx::Error> {
        let rules = sqlx::query_as::<_, NormalizationRule>(
            r#"
            SELECT id, pattern, replacement, enabled, order_index, created_at, updated_at
            FROM normalization_rules 
            ORDER BY order_index ASC, id ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rules)
    }

    /// 创建新规则
    pub async fn create_rule(&self, rule: &CreateRuleRequest) -> Result<NormalizationRule, sqlx::Error> {
        let enabled = rule.enabled.unwrap_or(true);
        let order_index = match rule.order_index {
            Some(index) => index,
            None => {
                // 如果没有指定顺序，放在最后
                let max_order: Option<i32> = sqlx::query_scalar(
                    "SELECT MAX(order_index) FROM normalization_rules"
                )
                .fetch_one(&self.pool)
                .await?;
                max_order.unwrap_or(0) + 1
            }
        };

        let rule = sqlx::query_as::<_, NormalizationRule>(
            r#"
            INSERT INTO normalization_rules (pattern, replacement, enabled, order_index)
            VALUES ($1, $2, $3, $4)
            RETURNING id, pattern, replacement, enabled, order_index, created_at, updated_at
            "#
        )
        .bind(&rule.pattern)
        .bind(&rule.replacement)
        .bind(enabled)
        .bind(order_index)
        .fetch_one(&self.pool)
        .await?;

        Ok(rule)
    }

    /// 更新规则
    pub async fn update_rule(&self, id: i32, rule: &UpdateRuleRequest) -> Result<Option<NormalizationRule>, sqlx::Error> {
        // 先获取当前规则
        let current_rule = sqlx::query_as::<_, NormalizationRule>(
            "SELECT id, pattern, replacement, enabled, order_index, created_at, updated_at FROM normalization_rules WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        let Some(current) = current_rule else {
            return Ok(None);
        };

        // 使用提供的值或保持原值
        let pattern = rule.pattern.as_ref().unwrap_or(&current.pattern);
        let replacement = rule.replacement.as_ref().unwrap_or(&current.replacement);
        let enabled = rule.enabled.unwrap_or(current.enabled);
        let order_index = rule.order_index.unwrap_or(current.order_index);

        let updated_rule = sqlx::query_as::<_, NormalizationRule>(
            r#"
            UPDATE normalization_rules 
            SET pattern = $1, replacement = $2, enabled = $3, order_index = $4, updated_at = NOW()
            WHERE id = $5
            RETURNING id, pattern, replacement, enabled, order_index, created_at, updated_at
            "#
        )
        .bind(pattern)
        .bind(replacement)
        .bind(enabled)
        .bind(order_index)
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(Some(updated_rule))
    }

    /// 删除规则
    pub async fn delete_rule(&self, id: i32) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM normalization_rules WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// 获取规则数量
    pub async fn get_rules_count(&self) -> Result<i64, sqlx::Error> {
        let count = sqlx::query_scalar("SELECT COUNT(*) FROM normalization_rules")
            .fetch_one(&self.pool)
            .await?;

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_database_operations() {
        // 这里可以添加数据库操作的单元测试
        // 需要测试数据库连接配置
    }
}