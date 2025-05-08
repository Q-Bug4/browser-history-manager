/**
 * 历史记录管理类
 * 统一管理历史记录的上报和查询逻辑
 */
class HistoryManager {
  constructor() {
    this.initialized = false;
    this.backendUrl = null;
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log('[HistoryManager] Initializing...');
    const config = await ConfigManager.getConfig();
    if (config.backendUrl) {
      this.backendUrl = config.backendUrl;
      console.log('[HistoryManager] Backend URL updated:', this.backendUrl);
    }
    console.log('[HistoryManager] Initialization completed');
  }

  /**
   * 上报历史记录到后端
   * @param {Object} record 历史记录对象
   * @param {string} record.url 访问的URL
   * @param {string} record.timestamp 访问时间戳
   * @param {string} record.domain 域名
   * @returns {Promise<void>}
   */
  async reportHistory(record) {
    console.log('[HistoryManager] Reporting history record:', record);
    const response = await fetch(`${this.backendUrl}/api/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      console.error('[HistoryManager] Failed to report history:', response.statusText);
      throw new Error(`Failed to report history: ${response.statusText}`);
    }
    console.log('[HistoryManager] History record reported successfully');
  }

  /**
   * 查询单个URL的历史记录
   * @param {string} url 要查询的URL
   * @param {boolean} normalize 是否规范化URL
   * @returns {Promise<Object|null>} 历史记录对象或null
   */
  async getHistoryRecord(url, normalize = true) {
    try {
      console.log('[HistoryManager] Getting history record for URL:', url);
      
      if (!this.backendUrl) {
        console.error('[HistoryManager] Backend URL not set');
        return null;
      }
      
      // 如果启用规范化，使用规范化后的URL进行查询
      const queryUrl = normalize ? this.normalizeUrl(url) : url;
      if (normalize) {
        console.log('[HistoryManager] Normalized URL:', queryUrl);
      }
      
      const queryParams = new URLSearchParams({
        keyword: queryUrl,
        pageSize: 1
      });
      
      const apiUrl = `${this.backendUrl}/api/history?${queryParams}`;
      console.log('[HistoryManager] Requesting:', apiUrl, 'with params:', Object.fromEntries(queryParams.entries()));
      
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorText = await response.text().catch(e => 'Unable to get response text');
          console.error('[HistoryManager] Failed to fetch history:', response.status, response.statusText, 'Error:', errorText);
          return null;
        }
        
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
          const record = {
            url: data.items[0].url,
            lastVisitTime: data.items[0].timestamp,
            visitCount: 1
          };
          console.log('[HistoryManager] Found history record:', record);
          return record;
        }
        
        console.log('[HistoryManager] No history record found for URL:', url);
        return null;
      } catch (fetchError) {
        console.error('[HistoryManager] Network error while fetching history:', fetchError);
        return null;
      }
    } catch (error) {
      console.error('[HistoryManager] Error fetching history record:', error);
      return null;
    }
  }

  /**
   * 批量查询URL的历史记录
   * @param {string[]} urls 要查询的URL数组
   * @param {string} domain 域名过滤
   * @param {boolean} normalize 是否规范化URL
   * @returns {Promise<Map<string, Object>>} URL到历史记录的映射
   */
  async batchGetHistoryRecords(urls, domain = null, normalize = true) {
    try {
      if (!this.backendUrl) {
        console.error('[HistoryManager] Backend URL not set');
        return new Map();
      }

      const queryParams = new URLSearchParams({
        pageSize: 2000
      });

      if (domain) {
        queryParams.append('domain', domain);
      }
      
      const apiUrl = `${this.backendUrl}/api/history?${queryParams}`;
      console.log('[HistoryManager] Requesting:', apiUrl, 'with params:', Object.fromEntries(queryParams.entries()));
      
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorText = await response.text().catch(e => 'Unable to get response text');
          console.error('[HistoryManager] Failed to fetch history:', response.status, response.statusText, 'Error:', errorText);
          return new Map();
        }
        
        const data = await response.json();
        
        if (!data.items || !Array.isArray(data.items)) {
          console.log('[HistoryManager] No history records found');
          return new Map();
        }

        // 创建历史记录映射
        const historyMap = new Map();
        const historyUrlSet = new Set();

        // 预处理历史记录
        data.items.forEach(item => {
          if (!item || !item.url) return;
          
          // 存储原始URL
          historyUrlSet.add(item.url);
          historyMap.set(item.url, {
            url: item.url,
            lastVisitTime: item.timestamp,
            visitCount: 1
          });
          
          // 如果启用规范化，存储规范化后的URL
          if (normalize) {
            const normalizedUrl = this.normalizeUrl(item.url);
            if (normalizedUrl !== item.url) {
              historyUrlSet.add(normalizedUrl);
              historyMap.set(normalizedUrl, {
                url: item.url,
                lastVisitTime: item.timestamp,
                visitCount: 1
              });
            }
          }
        });

        // 匹配URL
        const resultMap = new Map();
        for (const url of urls) {
          if (!url) continue;
          
          // 检查原始URL
          if (historyUrlSet.has(url)) {
            resultMap.set(url, historyMap.get(url));
            continue;
          }
          
          // 如果启用规范化，检查规范化后的URL
          if (normalize) {
            const normalizedUrl = this.normalizeUrl(url);
            if (historyUrlSet.has(normalizedUrl)) {
              resultMap.set(url, historyMap.get(normalizedUrl));
            }
          }
        }

        return resultMap;
      } catch (fetchError) {
        console.error('[HistoryManager] Network error while batch fetching history:', fetchError);
        return new Map();
      }
    } catch (error) {
      console.error('[HistoryManager] Error batch fetching history records:', error);
      return new Map();
    }
  }

  /**
   * 规范化URL
   * @param {string} url 
   * @returns {string} 规范化后的URL
   */
  normalizeUrl(url) {
    try {
      // 获取URL模式映射
      const urlPatternMap = ConfigManager.getConfig().urlPatternMap || {};
      
      // 尝试使用模式映射
      for (const [pattern, replacement] of Object.entries(urlPatternMap)) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(url)) {
            const normalized = url.replace(regex, replacement).toLowerCase();
            return normalized;
          }
        } catch (e) {
          console.error('[HistoryManager] Invalid regex pattern:', pattern, e);
        }
      }
      
      // 如果没有匹配的模式，使用基本规范化
      const parsed = new URL(url);
      
      // 提取基本URL组件
      let normalized = parsed.origin;
      
      // 处理路径 - 移除末尾斜杠
      let path = parsed.pathname;
      if (path.endsWith('/') && path !== '/') {
        path = path.slice(0, -1);
      }
      normalized += path;
      
      // 保留查询参数
      if (parsed.search) {
        normalized += parsed.search;
      }
      
      normalized = normalized.toLowerCase();
      console.log('[HistoryManager] URL normalized using basic rules:', url, '->', normalized);
      return normalized;
    } catch (e) {
      console.error('[HistoryManager] Error normalizing URL:', url, e);
      return url.toLowerCase();
    }
  }
}

// 将类添加到全局作用域
window.HistoryManager = HistoryManager; 