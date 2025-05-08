/**
 * 配置管理器类
 * 负责管理扩展的配置信息
 */
class ConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  /**
   * 获取配置
   * @returns {Promise<Object>} 配置对象
   */
  static async getConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['config'], (result) => {
        resolve(result.config || {});
      });
    });
  }

  /**
   * 更新配置
   * @param {Object} config 新的配置对象
   * @returns {Promise<void>}
   */
  static async updateConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ config }, resolve);
    });
  }
}

// 将类添加到全局作用域
window.ConfigManager = ConfigManager; 