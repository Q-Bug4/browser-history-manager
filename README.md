# Browser History Management System

[中文版](README-ZH.md)

## Overview
The Browser History Management System is a complete solution for collecting and managing browsing history. The system collects user browsing records in real-time through a Chrome extension, stores the data in a backend service, and provides a user-friendly web interface for querying and management.

## System Architecture
The system consists of three core modules:
1. Chrome Extension: Responsible for collecting and reporting browsing history
2. Backend Service: Developed in Rust, provides data storage and query services
3. Frontend Interface: Developed with Vue 3, provides user interaction interface

## Features
- Real-time browsing history collection
- Smart filtering of internal network access records
- Failure retry mechanism to ensure data reliability
- Multi-dimensional history record queries:
  - URL keyword search
  - Domain filtering
  - Time range filtering
- Paginated display with customizable page size
- Modern Material Design interface

## Technology Stack
- Extension: Chrome Extension API (JavaScript)
- Backend: Rust + Actix-web + Elasticsearch
- Frontend: Vue 3 + Material Design
- Deployment: Docker + Docker Compose

## Docker Deployment

### 1. Build Image
First, build the Docker image in the project root directory:

  ```bash
  docker build -t history-server:latest .
  ```

### 2. Start Services
Use Docker Compose to start all services:

  ```bash
  docker-compose up -d
  ```

### Environment Variables
history-server supports the following environment variable configurations:
- `APP__ELASTICSEARCH__URL`: Elasticsearch server address (default: http://elasticsearch:9200)
- `APP__SERVER__HOST`: Service listening address (default: 0.0.0.0)
- `APP__SERVER__PORT`: Service listening port (default: 8080)

To customize these configurations, you can add the corresponding environment variables in the environment section of docker-compose.yml.

## Installation

### Prerequisites
- Docker Compose
- Node.js
- Rust
- Chrome browser

### Deployment Steps
1. Clone the project code
2. Run Docker Compose command in the project root directory to start services
3. Load the extension in Chrome browser
4. Access the web interface for configuration

## Usage Guide

### Extension Configuration
1. Open Chrome extensions management page
2. Enable Developer Mode
3. Load unpacked extension
4. Select the extension directory to complete installation

### History Query
1. Access the system web interface
2. Use the search box to enter keywords
3. Use filters to set query conditions
4. View search results

## Development Guide

### Extension Development
- Source code located in extension directory
- Follows Chrome extension development specifications
- Developed using ES6+

### Backend Development
- Developed using Rust language
- Based on Actix-web framework
- Uses Elasticsearch for data storage

### Frontend Development
- Based on Vue 3 framework
- Uses Material Design component library
- Supports responsive design

## Contributing
Issues and Pull Requests are welcome. Please ensure:
1. Code complies with project standards
2. Complete test cases are provided
3. Related documentation is updated

## License
MIT License 