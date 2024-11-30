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

## 安装说明

### 环境要求
- Docker Compose
- Node.js
- Rust
- Chrome浏览器

### 部署步骤
1. 克隆项目代码
2. 在项目根目录执行Docker Compose命令启动服务
3. 在Chrome浏览器中加载插件
4. 访问Web界面进行配置

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