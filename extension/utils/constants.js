export const RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const BATCH_SIZE = 500; // Number of records to send in one batch 
export const DEFAULT_CONFIG = {
  filterInternalAddresses: true,
  showFailureNotifications: false,
  highlightVisitedLinks: true,
  backendUrl: 'http://localhost:8080',
  logLevel: 1, // 默认INFO级别
  urlPatternMap: {} // 使用对象存储URL模式映射
};

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

export const LOG_LEVEL_NAMES = [
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "NONE"
];