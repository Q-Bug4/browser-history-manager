import { DEFAULT_CONFIG } from './constants.js';

export class ConfigManager {
  static async getConfig() {
    const result = await chrome.storage.sync.get(DEFAULT_CONFIG);
    return result;
  }

  static async updateConfig(changes) {
    await chrome.storage.sync.set(changes);
  }
} 