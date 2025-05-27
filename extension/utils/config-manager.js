/**
 * 配置管理器
 * 统一管理扩展配置，支持验证、默认值和事件通知
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, EVENTS, ERROR_CODES } from './constants.js';
import { logger } from './logger.js';
import { EventEmitter } from './event-emitter.js';

class ConfigManager extends EventEmitter {
  constructor() {
    super();
    this.logger = logger.createChild('ConfigManager');
    this.config = null;
    this.initialized = false;
  }

  /**
   * 初始化配置管理器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing ConfigManager...');
      await this.loadConfig();
      this.initialized = true;
      this.logger.info('ConfigManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize ConfigManager:', error);
      throw error;
    }
  }

  /**
   * 加载配置
   * @returns {Promise<Object>} 配置对象
   */
  async loadConfig() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.CONFIG]);
      const storedConfig = result[STORAGE_KEYS.CONFIG] || {};
      
      // 合并默认配置和存储的配置
      this.config = this.mergeConfig(DEFAULT_CONFIG, storedConfig);
      
      // 验证配置
      this.validateConfig(this.config);
      
      this.logger.debug('Config loaded:', this.config);
      return this.config;
    } catch (error) {
      this.logger.error('Failed to load config:', error);
      this.config = { ...DEFAULT_CONFIG };
      throw new Error(`${ERROR_CODES.CONFIG_ERROR}: ${error.message}`);
    }
  }

  /**
   * 保存配置
   * @param {Object} newConfig 新配置
   * @returns {Promise<void>}
   */
  async saveConfig(newConfig) {
    try {
      // 验证新配置
      this.validateConfig(newConfig);
      
      // 合并配置
      const mergedConfig = this.mergeConfig(this.config, newConfig);
      
      // 保存到存储
      await chrome.storage.local.set({
        [STORAGE_KEYS.CONFIG]: mergedConfig
      });
      
      const oldConfig = this.config;
      this.config = mergedConfig;
      
      this.logger.info('Config saved successfully');
      
      // 发出配置更新事件
      this.emit(EVENTS.CONFIG_UPDATED, {
        oldConfig,
        newConfig: this.config
      });
      
    } catch (error) {
      this.logger.error('Failed to save config:', error);
      throw new Error(`${ERROR_CODES.CONFIG_ERROR}: ${error.message}`);
    }
  }

  /**
   * 获取配置值
   * @param {string} key 配置键，支持点号分隔的嵌套键
   * @param {any} defaultValue 默认值
   * @returns {any} 配置值
   */
  get(key, defaultValue = undefined) {
    if (!this.config) {
      this.logger.warn('Config not loaded, returning default value for key:', key);
      return defaultValue;
    }

    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * 设置配置值
   * @param {string} key 配置键
   * @param {any} value 配置值
   * @returns {Promise<void>}
   */
  async set(key, value) {
    const keys = key.split('.');
    const newConfig = { ...this.config };
    let current = newConfig;
    
    // 导航到目标位置
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    // 设置值
    current[keys[keys.length - 1]] = value;
    
    await this.saveConfig(newConfig);
  }

  /**
   * 获取完整配置
   * @returns {Object} 配置对象的副本
   */
  getAll() {
    return this.config ? { ...this.config } : { ...DEFAULT_CONFIG };
  }

  /**
   * 重置配置为默认值
   * @returns {Promise<void>}
   */
  async reset() {
    this.logger.info('Resetting config to defaults');
    await this.saveConfig(DEFAULT_CONFIG);
  }

  /**
   * 合并配置对象
   * @param {Object} base 基础配置
   * @param {Object} override 覆盖配置
   * @returns {Object} 合并后的配置
   */
  mergeConfig(base, override) {
    const result = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mergeConfig(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * 验证配置
   * @param {Object} config 要验证的配置
   * @throws {Error} 验证失败时抛出错误
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }

    // 验证后端URL
    if (config.backendUrl) {
      try {
        new URL(config.backendUrl);
      } catch (error) {
        throw new Error('Invalid backend URL format');
      }
    }

    // 验证数值配置
    const numericFields = ['cacheExpiration', 'retryInterval', 'maxRetries', 'batchSize', 'requestTimeout'];
    for (const field of numericFields) {
      if (config[field] !== undefined) {
        if (typeof config[field] !== 'number' || config[field] < 0) {
          throw new Error(`${field} must be a non-negative number`);
        }
      }
    }

    // 验证布尔配置
    const booleanFields = ['highlightVisitedLinks', 'showNotifications', 'enableTooltips'];
    for (const field of booleanFields) {
      if (config[field] !== undefined && typeof config[field] !== 'boolean') {
        throw new Error(`${field} must be a boolean`);
      }
    }

    // 验证日志级别
    if (config.logLevel !== undefined) {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
      if (!validLevels.includes(config.logLevel)) {
        throw new Error(`logLevel must be one of: ${validLevels.join(', ')}`);
      }
    }
  }

  /**
   * 检查配置是否已初始化
   * @returns {boolean} 是否已初始化
   */
  isInitialized() {
    return this.initialized;
  }
}

// 创建单例实例
export const configManager = new ConfigManager();

// 导出类供测试使用
export { ConfigManager }; 