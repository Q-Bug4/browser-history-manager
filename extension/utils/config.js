import { DEFAULT_CONFIG } from './constants.js';

export class ConfigManager {
  static async getConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_CONFIG, (result) => {
        // 确保所有默认值都存在
        const config = { ...DEFAULT_CONFIG, ...result };
        resolve(config);
      });
    });
  }

  static async updateConfig(changes) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(changes, () => {
        // 同步到本地存储
        chrome.storage.local.get(['config'], (result) => {
          const localConfig = result.config || {};
          const updatedConfig = { ...localConfig, ...changes };
          chrome.storage.local.set({ config: updatedConfig }, () => {
            resolve(updatedConfig);
          });
        });
      });
    });
  }
  
  static async saveConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(config, () => {
        // 同步到本地存储
        chrome.storage.local.set({ 
          config,
          backendUrl: config.backendUrl || DEFAULT_CONFIG.backendUrl
        }, () => {
          resolve(config);
        });
      });
    });
  }
} 