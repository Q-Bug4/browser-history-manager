/**
 * HTTP客户端
 * 提供统一的HTTP请求接口，支持超时、重试、错误处理
 */

import { ERROR_CODES, TIME_CONSTANTS } from './constants.js';
import { logger } from './logger.js';

class HttpClient {
  constructor(options = {}) {
    this.logger = logger.createChild('HttpClient');
    this.baseURL = options.baseURL || '';
    this.timeout = options.timeout || TIME_CONSTANTS.REQUEST_TIMEOUT;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || TIME_CONSTANTS.RETRY_DELAY;
  }

  /**
   * 创建带超时的fetch请求
   * @param {string} url 请求URL
   * @param {Object} options 请求选项
   * @returns {Promise<Response>} 响应对象
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`${ERROR_CODES.TIMEOUT_ERROR}: Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * 带重试的请求
   * @param {string} url 请求URL
   * @param {Object} options 请求选项
   * @param {number} retries 剩余重试次数
   * @returns {Promise<Response>} 响应对象
   */
  async requestWithRetry(url, options = {}, retries = this.maxRetries) {
    try {
      const response = await this.fetchWithTimeout(url, options);
      
      // 如果响应不成功且可以重试，则重试
      if (!response.ok && retries > 0 && this.shouldRetry(response.status)) {
        this.logger.warn(`Request failed with status ${response.status}, retrying... (${retries} retries left)`);
        await this.delay(this.retryDelay);
        return this.requestWithRetry(url, options, retries - 1);
      }
      
      return response;
    } catch (error) {
      if (retries > 0 && this.shouldRetryOnError(error)) {
        this.logger.warn(`Request failed with error: ${error.message}, retrying... (${retries} retries left)`);
        await this.delay(this.retryDelay);
        return this.requestWithRetry(url, options, retries - 1);
      }
      throw error;
    }
  }

  /**
   * 判断是否应该重试（基于状态码）
   * @param {number} status HTTP状态码
   * @returns {boolean} 是否应该重试
   */
  shouldRetry(status) {
    // 重试服务器错误和某些客户端错误
    return status >= 500 || status === 408 || status === 429;
  }

  /**
   * 判断是否应该重试（基于错误）
   * @param {Error} error 错误对象
   * @returns {boolean} 是否应该重试
   */
  shouldRetryOnError(error) {
    // 重试网络错误和超时错误
    return error.message.includes(ERROR_CODES.NETWORK_ERROR) || 
           error.message.includes(ERROR_CODES.TIMEOUT_ERROR);
  }

  /**
   * 延迟函数
   * @param {number} ms 延迟毫秒数
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 构建完整URL
   * @param {string} path 路径
   * @returns {string} 完整URL
   */
  buildURL(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${this.baseURL}${path}`;
  }

  /**
   * 处理响应
   * @param {Response} response 响应对象
   * @returns {Promise<any>} 解析后的数据
   */
  async handleResponse(response) {
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`${ERROR_CODES.PARSE_ERROR}: Invalid JSON response`);
      }
    }

    return response.text();
  }

  /**
   * GET请求
   * @param {string} path 请求路径
   * @param {Object} params 查询参数
   * @param {Object} options 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async get(path, params = {}, options = {}) {
    const url = new URL(this.buildURL(path));
    
    // 添加查询参数
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    this.logger.debug('GET request:', url.toString());

    const response = await this.requestWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    });

    return this.handleResponse(response);
  }

  /**
   * POST请求
   * @param {string} path 请求路径
   * @param {any} data 请求数据
   * @param {Object} options 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async post(path, data = null, options = {}) {
    const url = this.buildURL(path);
    
    this.logger.debug('POST request:', url, data);

    const requestOptions = {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (data !== null) {
      requestOptions.body = JSON.stringify(data);
    }

    const response = await this.requestWithRetry(url, requestOptions);
    return this.handleResponse(response);
  }

  /**
   * PUT请求
   * @param {string} path 请求路径
   * @param {any} data 请求数据
   * @param {Object} options 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async put(path, data = null, options = {}) {
    const url = this.buildURL(path);
    
    this.logger.debug('PUT request:', url, data);

    const requestOptions = {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (data !== null) {
      requestOptions.body = JSON.stringify(data);
    }

    const response = await this.requestWithRetry(url, requestOptions);
    return this.handleResponse(response);
  }

  /**
   * DELETE请求
   * @param {string} path 请求路径
   * @param {Object} options 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async delete(path, options = {}) {
    const url = this.buildURL(path);
    
    this.logger.debug('DELETE request:', url);

    const response = await this.requestWithRetry(url, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    });

    return this.handleResponse(response);
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 服务是否健康
   */
  async healthCheck() {
    try {
      await this.get('/api/health');
      return true;
    } catch (error) {
      this.logger.warn('Health check failed:', error.message);
      return false;
    }
  }
}

export { HttpClient }; 