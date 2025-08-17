# 缓存功能说明

## 概述

历史管理服务已经集成了Redis缓存功能，用于提升`GET /api/history`接口的性能。**缓存是透明的**，API接口参数保持完全不变，只是在内部增加了缓存层。

## 功能特性

- **透明缓存**: API接口参数保持不变，缓存层完全透明
- **面向接口编程**: 使用trait定义缓存接口，便于扩展和测试
- **Redis实现**: 提供基于Redis的缓存具体实现
- **智能缓存策略**: 
  - 仅当查询结果有数据时才写入缓存
  - 支持可配置的过期时间（默认2分钟）
  - 访问时优先检查缓存，缓存命中则直接返回
- **容错设计**: 缓存服务异常不影响正常业务流程
- **异步操作**: 写入缓存采用异步方式，不阻塞API响应

## 配置说明

在`config/default.toml`中配置缓存参数：

```toml
[cache]
enabled = true                          # 是否启用缓存
redis_url = "redis://localhost:6379"    # Redis连接URL
ttl_seconds = 120                       # 缓存过期时间（秒）
```

### 环境变量覆盖

可以通过环境变量覆盖配置：

```bash
APP__CACHE__ENABLED=true
APP__CACHE__REDIS_URL=redis://redis:6379
APP__CACHE__TTL_SECONDS=300
```

## 缓存键策略

缓存键根据查询参数生成，格式如下：

```
history:search:{keyword}:{domain}:{start_date}:{end_date}:{page}:{page_size}
```

示例：
- `history:search:test:example.com:2024-01-01:2024-12-31:1:30`
- `history:search:::::1:30` (无过滤条件的查询)

## Docker部署

### 1. 启动Redis服务

项目已在`docker-compose.yml`中配置了Redis服务：

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes
```

### 2. 启动完整服务

```bash
docker-compose up -d
```

### 3. 查看服务状态

```bash
docker-compose ps
docker-compose logs history-server
```

## 性能优化

缓存策略能够显著提升API性能：

1. **缓存命中**: 直接返回缓存数据，响应时间< 10ms
2. **缓存未命中**: 查询Elasticsearch并异步写入缓存
3. **无数据查询**: 不写入缓存，避免缓存污染

## 监控和调试

### 日志输出

服务会输出缓存相关的日志信息：

```
Cache hit for key: history:search:test:::1:30
Cache miss for key: history:search:example:::1:30
Cached data for key: history:search:example:::1:30
Failed to set cache for key XXX: connection error
```

### Redis监控

可以使用Redis CLI监控缓存状态：

```bash
# 连接Redis
docker exec -it <redis_container> redis-cli

# 查看所有键
KEYS history:*

# 查看键的TTL
TTL history:search:test:::1:30

# 查看缓存内容
GET history:search:test:::1:30
```

## 开发和测试

### 本地开发

1. 启动Redis:
```bash
docker run -d -p 6379:6379 redis:alpine
```

2. 启动服务:
```bash
cargo run
```

### 测试缓存功能

缓存对客户端完全透明，API调用方式保持不变：

```bash
# 第一次请求 - 缓存未命中，查询Elasticsearch
curl "http://localhost:8080/api/history?keyword=test"

# 第二次相同请求 - 缓存命中，直接返回缓存数据
curl "http://localhost:8080/api/history?keyword=test"

# 不同参数的请求 - 新的缓存键
curl "http://localhost:8080/api/history?keyword=example&page=2"
```

**重要**: 接口的所有原有参数（keyword, domain, startDate, endDate, page, pageSize）都保持不变，缓存功能完全在后端内部处理。

## 故障排除

### 常见问题

1. **Redis连接失败**
   - 检查Redis服务是否运行
   - 验证连接URL配置
   - 服务会自动降级为无缓存模式

2. **缓存未生效**
   - 检查`cache.enabled`配置
   - 确认查询结果有数据（空结果不会缓存）
   - 查看服务日志确认缓存操作

3. **性能问题**
   - 适当调整TTL时间
   - 监控Redis内存使用
   - 考虑缓存预热策略

### 禁用缓存

如果需要临时禁用缓存：

```bash
# 环境变量方式
export APP__CACHE__ENABLED=false

# 或修改配置文件
[cache]
enabled = false
```
