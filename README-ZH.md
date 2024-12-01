# 浏览器历史记录管理系统

[English](README.md)

## 项目简介
浏览器历史记录管理系统是一个完整的浏览历史采集和管理解决方案。系统通过Chrome插件实时采集用户的浏览记录，将数据存储到后端服务，并提供友好的Web界面进行查询和管理。

## 系统架构
系统由三个核心模块组成：
1. Chrome插件：负责采集浏览历史并上报
2. 后端服务：基于Rust开发，提供数据存储和查询服务
3. 前端界面：基于Vue 3开发，提供用户交互界面

## 功能特性
- 实时采集浏览历史记录
- 智能过滤内网地址访问记录
- 失败重试机制，确保数据可靠性
- 支持多维度历史记录查询：
  - URL关键字搜索
  - 域名筛选
  - 时间范围筛选
- 分页显示，支持自定义每页条数
- 现代化Material Design界面

## 技术栈
- 插件：Chrome Extension API (JavaScript)
- 后端：Rust + Actix-web + Elasticsearch
- 前端：Vue 3 + Material Design
- 部署：Docker + Docker Compose

## Docker 部署说明

### 1. 构建镜像
首先在项目根目录下构建Docker镜像：

  ```bash
  docker build -t history-server:latest .
  ```

### 2. 启动服务
使用 Docker Compose 启动所有服务：

  ```bash
  docker-compose up -d
  ```
### 环境变量说明
history-server 支持以下环境变量配置：
- `APP__ELASTICSEARCH__URL`: Elasticsearch服务器地址（默认：http://elasticsearch:9200）
- `APP__SERVER__HOST`: 服务监听地址（默认：0.0.0.0）
- `APP__SERVER__PORT`: 服务监听端口（默认：8080）

如需自定义这些配置，可以在 docker-compose.yml 的 environment 部分添加相应的环境变量。

## 使用说明

### 插件配置
1. 打开Chrome扩展管理页面
2. 启用开发者模式
3. 加载已解压的扩展程序
4. 选择插件目录完成安装

### 历史记录查询
1. 访问系统Web界面
2. 使用搜索框输入关键字
3. 使用过滤器设置查询条件
4. 查看搜索结果

## 开发指南

### 插件开发
- 源码位于extension目录
- 遵循Chrome插件开发规范
- 使用ES6+开发

### 后端开发
- 使用Rust语言开发
- 基于Actix-web框架
- 使用Elasticsearch存储数据

### 前端开发
- 基于Vue 3框架
- 使用Material Design组件库
- 支持响应式设计

## 贡献指南
欢迎提交Issue和Pull Request，请确保：
1. 代码符合项目规范
2. 提供完整的测试用例
3. 更新相关文档

## 许可证
MIT License