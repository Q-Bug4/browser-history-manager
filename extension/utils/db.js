/**
 * IndexedDB数据库管理器
 * 提供统一的数据存储接口，支持缓存和失败重试队列
 */

import { STORAGE_KEYS, ERROR_CODES, TIME_CONSTANTS } from './constants.js';
import { logger } from './logger.js';

class DatabaseManager {
  constructor() {
    this.logger = logger.createChild('DatabaseManager');
    this.dbName = 'HistoryManagerDB';
    this.dbVersion = 1;
    this.db = null;
    this.initialized = false;
  }

  /**
   * 初始化数据库
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing database...');
      this.db = await this.openDatabase();
      this.initialized = true;
      this.logger.info('Database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw new Error(`${ERROR_CODES.STORAGE_ERROR}: ${error.message}`);
    }
  }

  /**
   * 打开数据库连接
   * @returns {Promise<IDBDatabase>} 数据库实例
   */
  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.createStores(db);
      };
    });
  }

  /**
   * 创建对象存储
   * @param {IDBDatabase} db 数据库实例
   */
  createStores(db) {
    // 历史记录缓存存储
    if (!db.objectStoreNames.contains('historyCache')) {
      const historyStore = db.createObjectStore('historyCache', { keyPath: 'url' });
      historyStore.createIndex('domain', 'domain', { unique: false });
      historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      historyStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
    }

    // 失败请求队列存储
    if (!db.objectStoreNames.contains('failedRequests')) {
      const failedStore = db.createObjectStore('failedRequests', { keyPath: 'id', autoIncrement: true });
      failedStore.createIndex('timestamp', 'timestamp', { unique: false });
      failedStore.createIndex('retryCount', 'retryCount', { unique: false });
    }

    // 配置存储
    if (!db.objectStoreNames.contains('config')) {
      db.createObjectStore('config', { keyPath: 'key' });
    }
  }

  /**
   * 确保数据库已初始化
   * @throws {Error} 如果数据库未初始化
   */
  ensureInitialized() {
    if (!this.initialized || !this.db) {
      throw new Error(`${ERROR_CODES.STORAGE_ERROR}: Database not initialized`);
    }
  }

  /**
   * 执行事务
   * @param {string} storeName 存储名称
   * @param {string} mode 事务模式
   * @param {Function} operation 操作函数
   * @returns {Promise<any>} 操作结果
   */
  async executeTransaction(storeName, mode, operation) {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);

      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error}`));
      };

      transaction.oncomplete = () => {
        // 事务完成，结果在operation中处理
      };

      try {
        const request = operation(store);
        
        if (request && typeof request.onsuccess === 'function') {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error(`Operation failed: ${request.error}`));
        } else {
          resolve(request);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 缓存历史记录
   * @param {Object} record 历史记录
   * @returns {Promise<void>}
   */
  async cacheHistoryRecord(record) {
    const cacheRecord = {
      url: record.url,
      domain: new URL(record.url).hostname,
      timestamp: record.timestamp || Date.now(),
      lastAccessed: Date.now(),
      visitCount: record.visitCount || 1,
      title: record.title || '',
      data: record
    };

    await this.executeTransaction('historyCache', 'readwrite', (store) => {
      return store.put(cacheRecord);
    });

    this.logger.debug('Cached history record:', record.url);
  }

  /**
   * 批量缓存历史记录
   * @param {Array} records 历史记录数组
   * @returns {Promise<void>}
   */
  async batchCacheHistoryRecords(records) {
    if (!records || records.length === 0) {
      return;
    }

    await this.executeTransaction('historyCache', 'readwrite', (store) => {
      records.forEach(record => {
        const cacheRecord = {
          url: record.url,
          domain: new URL(record.url).hostname,
          timestamp: record.timestamp || Date.now(),
          lastAccessed: Date.now(),
          visitCount: record.visitCount || 1,
          title: record.title || '',
          data: record
        };
        store.put(cacheRecord);
      });
    });

    this.logger.debug(`Batch cached ${records.length} history records`);
  }

  /**
   * 获取缓存的历史记录
   * @param {string} url URL
   * @returns {Promise<Object|null>} 历史记录或null
   */
  async getCachedHistoryRecord(url) {
    try {
      const record = await this.executeTransaction('historyCache', 'readonly', (store) => {
        return store.get(url);
      });

      if (record) {
        // 更新最后访问时间
        record.lastAccessed = Date.now();
        await this.executeTransaction('historyCache', 'readwrite', (store) => {
          return store.put(record);
        });

        this.logger.debug('Retrieved cached history record:', url);
        return record.data;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get cached history record:', error);
      return null;
    }
  }

  /**
   * 批量获取缓存的历史记录
   * @param {Array} urls URL数组
   * @returns {Promise<Map>} URL到记录的映射
   */
  async batchGetCachedHistoryRecords(urls) {
    const results = new Map();

    try {
      await this.executeTransaction('historyCache', 'readwrite', (store) => {
        return new Promise((resolve, reject) => {
          let completed = 0;
          const total = urls.length;

          if (total === 0) {
            resolve();
            return;
          }

          urls.forEach((url) => {
            const request = store.get(url);
            
            request.onsuccess = () => {
              if (request.result) {
                // 更新最后访问时间
                request.result.lastAccessed = Date.now();
                const putRequest = store.put(request.result);
                putRequest.onsuccess = () => {
                  results.set(url, request.result.data);
                  completed++;
                  if (completed === total) {
                    resolve();
                  }
                };
                putRequest.onerror = () => {
                  completed++;
                  if (completed === total) {
                    resolve();
                  }
                };
              } else {
                completed++;
                if (completed === total) {
                  resolve();
                }
              }
            };

            request.onerror = () => {
              completed++;
              if (completed === total) {
                resolve();
              }
            };
          });
        });
      });

      this.logger.debug(`Batch retrieved ${results.size} cached records from ${urls.length} URLs`);
      return results;
    } catch (error) {
      this.logger.error('Failed to batch get cached history records:', error);
      return new Map();
    }
  }

  /**
   * 清理过期的缓存记录
   * @param {number} maxAge 最大年龄（毫秒）
   * @returns {Promise<number>} 清理的记录数
   */
  async cleanExpiredCache(maxAge = TIME_CONSTANTS.CACHE_EXPIRATION) {
    const cutoffTime = Date.now() - maxAge;
    let deletedCount = 0;

    await this.executeTransaction('historyCache', 'readwrite', (store) => {
      const index = store.index('lastAccessed');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };
    });

    this.logger.info(`Cleaned ${deletedCount} expired cache records`);
    return deletedCount;
  }

  /**
   * 添加失败的请求到重试队列
   * @param {Object} request 失败的请求
   * @returns {Promise<void>}
   */
  async addFailedRequest(request) {
    const failedRequest = {
      url: request.url,
      method: request.method || 'POST',
      data: request.data,
      timestamp: Date.now(),
      retryCount: 0,
      lastError: request.error || 'Unknown error'
    };

    await this.executeTransaction('failedRequests', 'readwrite', (store) => {
      return store.add(failedRequest);
    });

    this.logger.debug('Added failed request to retry queue:', request.url);
  }

  /**
   * 获取待重试的失败请求
   * @param {number} maxRetries 最大重试次数
   * @returns {Promise<Array>} 失败请求数组
   */
  async getFailedRequests(maxRetries = 3) {
    const requests = [];

    await this.executeTransaction('failedRequests', 'readonly', (store) => {
      const index = store.index('retryCount');
      const range = IDBKeyRange.upperBound(maxRetries - 1);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          requests.push(cursor.value);
          cursor.continue();
        }
      };
    });

    return requests;
  }

  /**
   * 更新失败请求的重试次数
   * @param {number} id 请求ID
   * @param {string} error 错误信息
   * @returns {Promise<void>}
   */
  async updateFailedRequest(id, error = null) {
    await this.executeTransaction('failedRequests', 'readwrite', (store) => {
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.retryCount++;
          record.lastError = error || record.lastError;
          record.timestamp = Date.now();
          store.put(record);
        }
      };
    });
  }

  /**
   * 删除失败请求
   * @param {number} id 请求ID
   * @returns {Promise<void>}
   */
  async removeFailedRequest(id) {
    await this.executeTransaction('failedRequests', 'readwrite', (store) => {
      return store.delete(id);
    });
  }

  /**
   * 清空所有数据
   * @returns {Promise<void>}
   */
  async clearAllData() {
    const storeNames = ['historyCache', 'failedRequests', 'config'];
    
    for (const storeName of storeNames) {
      await this.executeTransaction(storeName, 'readwrite', (store) => {
        return store.clear();
      });
    }

    this.logger.info('Cleared all database data');
  }

  /**
   * 获取数据库统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const stats = {
      historyCache: 0,
      failedRequests: 0,
      config: 0
    };

    for (const storeName of Object.keys(stats)) {
      try {
        await this.executeTransaction(storeName, 'readonly', (store) => {
          const request = store.count();
          request.onsuccess = () => {
            stats[storeName] = request.result;
          };
        });
      } catch (error) {
        this.logger.error(`Failed to get stats for ${storeName}:`, error);
      }
    }

    return stats;
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.logger.info('Database connection closed');
    }
  }
}

// 创建单例实例
export const dbManager = new DatabaseManager();

// 导出类供测试使用
export { DatabaseManager }; 