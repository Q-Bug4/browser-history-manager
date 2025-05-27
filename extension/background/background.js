/**
 * 后台服务脚本
 * 处理历史记录监听、消息传递和定期任务
 */

import { historyManager } from '../core/history-manager.js';
import { configManager } from '../utils/config-manager.js';
import { logger } from '../utils/logger.js';
import { 
  MESSAGE_TYPES, 
  EVENTS, 
  TIME_CONSTANTS,
  URL_PATTERNS 
} from '../utils/constants.js';

class BackgroundService {
  constructor() {
    this.logger = logger.createChild('BackgroundService');
    this.initialized = false;
    this.cleanupTimer = null;
  }

  /**
   * 初始化后台服务
   */
  async initialize() {
    try {
      this.logger.info('Initializing background service...');

      // 初始化配置管理器
      await configManager.initialize();

      // 初始化历史记录管理器
      await historyManager.initialize();

      // 设置事件监听器
      this.setupEventListeners();

      // 启动定期清理任务
      this.startCleanupTimer();

      this.initialized = true;
      this.logger.info('Background service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize background service:', error);
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 监听历史记录变化
    chrome.history.onVisited.addListener(this.handleHistoryVisited.bind(this));

    // 监听消息
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // 监听扩展启动
    chrome.runtime.onStartup.addListener(this.handleStartup.bind(this));

    // 监听扩展安装
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));

    // 监听配置变化
    configManager.on(EVENTS.CONFIG_UPDATED, this.handleConfigUpdate.bind(this));

    this.logger.debug('Event listeners set up');
  }

  /**
   * 处理历史记录访问事件
   * @param {Object} historyItem Chrome历史记录项
   */
  async handleHistoryVisited(historyItem) {
    try {
      if (!this.shouldProcessUrl(historyItem.url)) {
        this.logger.debug('Skipping URL:', historyItem.url);
        return;
      }

      const url = new URL(historyItem.url);
      const record = {
        url: historyItem.url,
        timestamp: new Date().toISOString(),
        domain: url.hostname,
        title: historyItem.title || '',
        visitCount: historyItem.visitCount || 1
      };

      this.logger.debug('Processing history visit:', record);

      // 异步上报，不阻塞主流程
      historyManager.reportHistory(record).catch(error => {
        this.logger.warn('Failed to report history in background:', error);
      });

    } catch (error) {
      this.logger.error('Error handling history visited:', error);
    }
  }

  /**
   * 判断是否应该处理该URL
   * @param {string} url URL字符串
   * @returns {boolean} 是否应该处理
   */
  shouldProcessUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // 检查无效URL模式
    for (const pattern of Object.values(URL_PATTERNS)) {
      if (pattern.test(url)) {
        return false;
      }
    }

    try {
      const parsedUrl = new URL(url);
      
      // 过滤内网地址（如果启用）
      if (configManager.get('filterInternalAddresses', false)) {
        if (this.isInternalAddress(parsedUrl.hostname)) {
          return false;
        }
      }

      // 过滤特定协议
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否为内网地址
   * @param {string} hostname 主机名
   * @returns {boolean} 是否为内网地址
   */
  isInternalAddress(hostname) {
    const internalPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];

    return internalPatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * 处理消息
   * @param {Object} message 消息对象
   * @param {Object} sender 发送者信息
   * @param {Function} sendResponse 响应函数
   * @returns {boolean} 是否异步响应
   */
  handleMessage(message, sender, sendResponse) {
    this.logger.debug('Received message:', message);

    // 异步处理消息
    this.processMessage(message, sender)
      .then(response => {
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        this.logger.error('Error processing message:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Unknown error' 
        });
      });

    // 返回true表示异步响应
    return true;
  }

  /**
   * 处理具体消息
   * @param {Object} message 消息对象
   * @param {Object} sender 发送者信息
   * @returns {Promise<any>} 处理结果
   */
  async processMessage(message, sender) {
    const { type, data } = message;

    switch (type) {
      case MESSAGE_TYPES.GET_CONFIG:
        return configManager.getAll();

      case MESSAGE_TYPES.UPDATE_CONFIG:
        await configManager.saveConfig(data);
        return { success: true };

      case MESSAGE_TYPES.GET_HISTORY:
        if (data.urls && Array.isArray(data.urls)) {
          const historyMap = await historyManager.batchGetHistoryRecords(data.urls, data.domain);
          // 将 Map 转换为普通对象，因为 Map 无法在消息传递中序列化
          return Object.fromEntries(historyMap);
        } else if (data.url) {
          return await historyManager.getHistoryRecord(data.url);
        }
        throw new Error('Invalid history request');

      case MESSAGE_TYPES.REPORT_HISTORY:
        await historyManager.reportHistory(data);
        return { success: true };

      case MESSAGE_TYPES.CLEAR_CACHE:
        await historyManager.clearCache();
        return { success: true };

      case MESSAGE_TYPES.HEALTH_CHECK:
        return await historyManager.healthCheck();

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  /**
   * 处理扩展启动
   */
  async handleStartup() {
    this.logger.info('Extension startup detected');
    
    try {
      // 执行健康检查
      const isHealthy = await historyManager.healthCheck();
      this.logger.info('Backend health check:', isHealthy ? 'healthy' : 'unhealthy');

      // 清理过期缓存
      await historyManager.clearCache();

    } catch (error) {
      this.logger.error('Error during startup:', error);
    }
  }

  /**
   * 处理扩展安装
   * @param {Object} details 安装详情
   */
  async handleInstalled(details) {
    this.logger.info('Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
      // 首次安装时的初始化
      this.logger.info('First time installation detected');
      
      try {
        // 可以在这里执行首次安装的特殊逻辑
        await this.performFirstTimeSetup();
      } catch (error) {
        this.logger.error('Error during first time setup:', error);
      }
    }
  }

  /**
   * 首次安装设置
   */
  async performFirstTimeSetup() {
    // 可以在这里添加首次安装的逻辑
    // 例如：显示欢迎页面、设置默认配置等
    this.logger.info('Performing first time setup...');
  }

  /**
   * 处理配置更新
   * @param {Object} event 配置更新事件
   */
  handleConfigUpdate(event) {
    this.logger.info('Configuration updated in background service');
    
    // 如果日志级别改变，更新日志器
    if (event.newConfig.logLevel !== event.oldConfig.logLevel) {
      logger.setLevel(event.newConfig.logLevel);
      this.logger.info('Log level updated to:', event.newConfig.logLevel);
    }

    // 如果清理间隔改变，重启清理定时器
    if (event.newConfig.cacheExpiration !== event.oldConfig.cacheExpiration) {
      this.startCleanupTimer();
    }
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    const cleanupInterval = TIME_CONSTANTS.CACHE_CHECK_INTERVAL;
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, cleanupInterval);

    this.logger.debug('Cleanup timer started with interval:', cleanupInterval);
  }

  /**
   * 执行清理任务
   */
  async performCleanup() {
    try {
      this.logger.debug('Performing periodic cleanup...');
      await historyManager.clearCache();
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }

  /**
   * 停止后台服务
   */
  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 移除事件监听器
    configManager.removeAllListeners();
    historyManager.destroy();

    this.initialized = false;
    this.logger.info('Background service stopped');
  }
}

// 创建并启动后台服务
const backgroundService = new BackgroundService();

// 初始化服务
backgroundService.initialize().catch(error => {
  console.error('Failed to initialize background service:', error);
});

// 导出服务实例供测试使用
export { backgroundService };