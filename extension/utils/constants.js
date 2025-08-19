/**
 * 扩展常量定义
 * 集中管理所有常量，避免硬编码
 */

// 存储键名
export const STORAGE_KEYS = {
  CONFIG: 'extension_config',
  CACHE: 'history_cache',
  FAILED_REQUESTS: 'failed_requests'
};

// 默认配置
export const DEFAULT_CONFIG = {
  backendUrl: 'http://localhost:8080',
  highlightVisitedLinks: true,
  showNotifications: true,
  enableTooltips: true,
  cacheExpiration: 24 * 60 * 60 * 1000, // 24小时
  retryInterval: 5 * 60 * 1000, // 5分钟
  maxRetries: 3,
  batchSize: 100,
  requestTimeout: 10000, // 10秒
  logLevel: 'INFO'
};

// API端点
export const API_ENDPOINTS = {
  HISTORY: '/api/history',
  HEALTH: '/api/health'
};

// 事件名称
export const EVENTS = {
  CONFIG_UPDATED: 'config_updated',
  HISTORY_UPDATED: 'history_updated',
  LINK_VISITED: 'link_visited',
  CACHE_CLEARED: 'cache_cleared'
};

// CSS类名
export const CSS_CLASSES = {
  HIGHLIGHTED_LINK: 'history-link-highlighted',
  TOOLTIP: 'history-tooltip',
  TOOLTIP_CONTENT: 'history-tooltip-content',
  PROCESSING: 'history-processing'
};

// 日志级别
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// 消息类型
export const MESSAGE_TYPES = {
  GET_CONFIG: 'get_config',
  UPDATE_CONFIG: 'update_config',
  REPORT_HISTORY: 'report_history',
  GET_HISTORY: 'get_history',
  CLEAR_CACHE: 'clear_cache',
  HEALTH_CHECK: 'health_check'
};

// 通知类型
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// 时间常量
export const TIME_CONSTANTS = {
  TOOLTIP_DURATION: 3000,
  HOVER_DELAY: 200,
  DEBOUNCE_DELAY: 300,
  RETRY_DELAY: 1000,
  CACHE_CHECK_INTERVAL: 60000, // 1分钟
  CACHE_EXPIRATION: 24 * 60 * 60 * 1000, // 24小时
  RETRY_INTERVAL: 5 * 60 * 1000, // 5分钟
  REQUEST_TIMEOUT: 10000 // 10秒
};

// URL模式
export const URL_PATTERNS = {
  JAVASCRIPT: /^javascript:/i,
  MAILTO: /^mailto:/i,
  TEL: /^tel:/i,
  HASH_ONLY: /^#/,
  DATA: /^data:/i
};

// 错误代码
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR'
};