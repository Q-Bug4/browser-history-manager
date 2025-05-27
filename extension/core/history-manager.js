/**
 * 历史记录管理器
 * 统一管理历史记录的上报、查询和缓存
 */

import { configManager } from '../utils/config-manager.js';
import { dbManager } from '../utils/db.js';
import { HttpClient } from '../utils/http-client.js';
import { logger } from '../utils/logger.js';
import { 
  API_ENDPOINTS, 
  EVENTS, 
  ERROR_CODES, 
  TIME_CONSTANTS,
  URL_PATTERNS 
} from '../utils/constants.js';
import { EventEmitter } from '../utils/event-emitter.js';

class HistoryManager extends EventEmitter {
  constructor() {
    super();
    this.logger = logger.createChild('HistoryManager');
    this.httpClient = null;
    this.initialized = false;
    this.retryTimer = null;
  }

  /**
   * 初始化历史记录管理器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing HistoryManager...');

      // 确保配置管理器已初始化
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }

      // 初始化数据库
      await dbManager.initialize();

      // 创建HTTP客户端
      this.createHttpClient();

      // 监听配置变化
      configManager.on(EVENTS.CONFIG_UPDATED, this.handleConfigUpdate.bind(this));

      // 启动重试机制
      this.startRetryMechanism();

      this.initialized = true;
      this.logger.info('HistoryManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize HistoryManager:', error);
      throw error;
    }
  }

  /**
   * 创建HTTP客户端
   */
  createHttpClient() {
    const config = configManager.getAll();
    this.httpClient = new HttpClient({
      baseURL: config.backendUrl,
      timeout: config.requestTimeout,
      maxRetries: config.maxRetries,
      retryDelay: config.retryInterval
    });
  }

  /**
   * 处理配置更新
   * @param {Object} event 配置更新事件
   */
  handleConfigUpdate(event) {
    this.logger.info('Config updated, recreating HTTP client');
    this.createHttpClient();
    
    // 更新日志级别
    if (event.newConfig.logLevel !== event.oldConfig.logLevel) {
      logger.setLevel(event.newConfig.logLevel);
    }
  }

  /**
   * 启动重试机制
   */
  startRetryMechanism() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }

    const retryInterval = configManager.get('retryInterval', TIME_CONSTANTS.RETRY_INTERVAL);
    this.retryTimer = setInterval(() => {
      this.retryFailedRequests();
    }, retryInterval);

    this.logger.debug('Retry mechanism started');
  }

  /**
   * 停止重试机制
   */
  stopRetryMechanism() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      this.logger.debug('Retry mechanism stopped');
    }
  }

  /**
   * 上报历史记录
   * @param {Object} record 历史记录
   * @returns {Promise<void>}
   */
  async reportHistory(record) {
    try {
      this.logger.debug('Reporting history record:', record);

      if (!this.validateHistoryRecord(record)) {
        throw new Error('Invalid history record format');
      }

      // 尝试上报
      await this.httpClient.post(API_ENDPOINTS.HISTORY, record);
      
      // 缓存成功上报的记录
      await dbManager.cacheHistoryRecord(record);
      
      this.logger.debug('History record reported successfully:', record.url);
      this.emit(EVENTS.HISTORY_UPDATED, { type: 'reported', record });

    } catch (error) {
      this.logger.error('Failed to report history record:', error);
      
      // 将失败的请求添加到重试队列
      await dbManager.addFailedRequest({
        url: record.url,
        method: 'POST',
        data: record,
        error: error.message
      });

      // 如果启用了通知，发送失败通知
      if (configManager.get('showNotifications', true)) {
        this.sendFailureNotification(error.message);
      }

      throw error;
    }
  }

  /**
   * 批量上报历史记录
   * @param {Array} records 历史记录数组
   * @returns {Promise<Object>} 上报结果统计
   */
  async batchReportHistory(records) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    const batchSize = configManager.get('batchSize', 100);
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      for (const record of batch) {
        try {
          await this.reportHistory(record);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ record, error: error.message });
        }
      }
    }

    this.logger.info(`Batch report completed: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  /**
   * 查询单个URL的历史记录
   * @param {string} url 要查询的URL
   * @param {boolean} useCache 是否使用缓存
   * @returns {Promise<Object|null>} 历史记录或null
   */
  async getHistoryRecord(url, useCache = true) {
    try {
      if (!url || !this.isValidUrl(url)) {
        this.logger.warn('Invalid URL provided:', url);
        return null;
      }

      this.logger.debug('Getting history record for URL:', url);

      // 首先检查缓存
      if (useCache) {
        const cachedRecord = await dbManager.getCachedHistoryRecord(url);
        if (cachedRecord) {
          this.logger.debug('Found cached history record:', url);
          return cachedRecord;
        }
      }

      // 从后端查询
      const normalizedUrl = this.normalizeUrl(url);
      const response = await this.httpClient.get(API_ENDPOINTS.HISTORY, {
        keyword: normalizedUrl,
        pageSize: 1
      });

      if (response.items && response.items.length > 0) {
        const record = {
          url: response.items[0].url,
          timestamp: response.items[0].timestamp,
          visitCount: 1,
          title: response.items[0].title || ''
        };

        // 缓存查询结果
        await dbManager.cacheHistoryRecord(record);
        
        this.logger.debug('Found history record:', record);
        return record;
      }

      this.logger.debug('No history record found for URL:', url);
      return null;

    } catch (error) {
      this.logger.error('Error getting history record:', error);
      return null;
    }
  }

  /**
   * 批量查询URL的历史记录
   * @param {Array} urls URL数组
   * @param {string} domain 域名过滤
   * @param {boolean} useCache 是否使用缓存
   * @returns {Promise<Map>} URL到历史记录的映射
   */
  async batchGetHistoryRecords(urls, domain = null, useCache = true) {
    try {
      if (!urls || urls.length === 0) {
        return new Map();
      }

      this.logger.debug(`Batch getting history records for ${urls.length} URLs`);

      const results = new Map();
      const uncachedUrls = [];

      // 首先检查缓存
      if (useCache) {
        const cachedResults = await dbManager.batchGetCachedHistoryRecords(urls);
        for (const [url, record] of cachedResults) {
          results.set(url, record);
        }
        
        // 找出未缓存的URL
        for (const url of urls) {
          if (!results.has(url)) {
            uncachedUrls.push(url);
          }
        }
      } else {
        uncachedUrls.push(...urls);
      }

      // 从后端批量查询未缓存的URL
      if (uncachedUrls.length > 0) {
        const queryParams = {
          pageSize: 2000
        };

        if (domain) {
          queryParams.domain = domain;
        }

        const response = await this.httpClient.get(API_ENDPOINTS.HISTORY, queryParams);

        if (response.items && Array.isArray(response.items)) {
          const historyMap = new Map();
          const recordsToCache = [];

          // 预处理历史记录
          for (const item of response.items) {
            if (!item || !item.url) continue;

            const record = {
              url: item.url,
              timestamp: item.timestamp,
              visitCount: 1,
              title: item.title || ''
            };

            historyMap.set(item.url, record);
            historyMap.set(this.normalizeUrl(item.url), record);
            recordsToCache.push(record);
          }

          // 匹配URL
          for (const url of uncachedUrls) {
            if (historyMap.has(url)) {
              results.set(url, historyMap.get(url));
            } else {
              const normalizedUrl = this.normalizeUrl(url);
              if (historyMap.has(normalizedUrl)) {
                results.set(url, historyMap.get(normalizedUrl));
              }
            }
          }

          // 批量缓存新记录
          if (recordsToCache.length > 0) {
            await dbManager.batchCacheHistoryRecords(recordsToCache);
          }
        }
      }

      this.logger.debug(`Batch query completed: found ${results.size} records out of ${urls.length} URLs`);
      return results;

    } catch (error) {
      this.logger.error('Error batch getting history records:', error);
      return new Map();
    }
  }

  /**
   * 重试失败的请求
   */
  async retryFailedRequests() {
    try {
      const maxRetries = configManager.get('maxRetries', 3);
      const failedRequests = await dbManager.getFailedRequests(maxRetries);

      if (failedRequests.length === 0) {
        return;
      }

      this.logger.info(`Retrying ${failedRequests.length} failed requests`);

      for (const request of failedRequests) {
        try {
          // 尝试重新发送请求
          await this.httpClient.post(API_ENDPOINTS.HISTORY, request.data);
          
          // 成功后从重试队列中移除
          await dbManager.removeFailedRequest(request.id);
          
          // 缓存成功的记录
          await dbManager.cacheHistoryRecord(request.data);
          
          this.logger.debug('Retry successful for request:', request.id);

        } catch (error) {
          // 更新重试次数
          await dbManager.updateFailedRequest(request.id, error.message);
          
          // 如果达到最大重试次数，移除请求
          if (request.retryCount >= maxRetries - 1) {
            await dbManager.removeFailedRequest(request.id);
            this.logger.warn('Max retries reached for request:', request.id);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error during retry mechanism:', error);
    }
  }

  /**
   * 规范化URL
   * @param {string} url 原始URL
   * @returns {string} 规范化后的URL
   */
  normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      
      // 移除片段标识符
      parsed.hash = '';
      
      // 移除末尾斜杠（除了根路径）
      if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      
      // 转换为小写
      return parsed.toString().toLowerCase();
    } catch (error) {
      this.logger.warn('Failed to normalize URL:', url, error);
      return url.toLowerCase();
    }
  }

  /**
   * 验证URL是否有效
   * @param {string} url URL字符串
   * @returns {boolean} 是否有效
   */
  isValidUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // 检查是否是无效的URL模式
    for (const pattern of Object.values(URL_PATTERNS)) {
      if (pattern.test(url)) {
        return false;
      }
    }

    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证历史记录格式
   * @param {Object} record 历史记录
   * @returns {boolean} 是否有效
   */
  validateHistoryRecord(record) {
    if (!record || typeof record !== 'object') {
      return false;
    }

    // 必需字段
    if (!record.url || !this.isValidUrl(record.url)) {
      return false;
    }

    // 可选字段验证
    if (record.timestamp && (typeof record.timestamp !== 'number' && typeof record.timestamp !== 'string')) {
      return false;
    }

    if (record.visitCount && typeof record.visitCount !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * 发送失败通知
   * @param {string} message 错误消息
   */
  sendFailureNotification(message) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        title: 'History Manager',
        message: `Failed to sync history: ${message}`
      });
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 后端服务是否健康
   */
  async healthCheck() {
    try {
      return await this.httpClient.healthCheck();
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * 清理缓存
   * @returns {Promise<void>}
   */
  async clearCache() {
    try {
      const cacheExpiration = configManager.get('cacheExpiration', TIME_CONSTANTS.CACHE_EXPIRATION);
      const deletedCount = await dbManager.cleanExpiredCache(cacheExpiration);
      
      this.logger.info(`Cache cleanup completed: ${deletedCount} records deleted`);
      this.emit(EVENTS.CACHE_CLEARED, { deletedCount });
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
    }
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    try {
      const dbStats = await dbManager.getStats();
      const isHealthy = await this.healthCheck();
      
      return {
        database: dbStats,
        backend: {
          healthy: isHealthy,
          url: configManager.get('backendUrl')
        },
        config: configManager.getAll()
      };
    } catch (error) {
      this.logger.error('Failed to get stats:', error);
      return null;
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.stopRetryMechanism();
    this.removeAllListeners();
    dbManager.close();
    this.initialized = false;
    this.logger.info('HistoryManager destroyed');
  }
}

// 创建单例实例
export const historyManager = new HistoryManager();

// 导出类供测试使用
export { HistoryManager }; 