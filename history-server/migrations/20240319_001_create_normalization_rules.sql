-- 创建归一化规则表
CREATE TABLE IF NOT EXISTS normalization_rules (
    id SERIAL PRIMARY KEY,
    pattern VARCHAR(500) NOT NULL,
    replacement VARCHAR(500) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_normalization_rules_order 
ON normalization_rules(order_index) 
WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_normalization_rules_enabled 
ON normalization_rules(enabled);

-- 插入一些示例规则
INSERT INTO normalization_rules (pattern, replacement, enabled, order_index) VALUES
('https://example\.com/video/(\d+).*', 'https://example.com/video/$1', true, 1),
('https://blog\.example\.com/(\d+).*', 'https://blog.example.com/$1', true, 2),
('https://shop\.example\.com/product/([^/?#]+).*', 'https://shop.example.com/product/$1', true, 3)
ON CONFLICT DO NOTHING;
