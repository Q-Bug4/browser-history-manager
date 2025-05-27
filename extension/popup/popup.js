import { dbManager } from '../utils/db.js';
import { configManager } from '../utils/config-manager.js';
import { DEFAULT_CONFIG, MESSAGE_TYPES } from '../utils/constants.js';

class PopupManager {
  constructor() {
    this.connectionStatus = document.getElementById('connectionStatus');
    this.cacheStatus = document.getElementById('cacheStatus');
    this.filterToggle = document.getElementById('filterInternalAddresses');
    this.notificationToggle = document.getElementById('showFailureNotifications');
    
    this.initializeUI();
    
    // 添加打开配置页面的事件监听
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  
  async initializeUI() {
    try {
      // Load config via message passing
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_CONFIG
      });
      
      if (response.success) {
        const config = response.data;
        this.filterToggle.checked = config.filterInternalAddresses || false;
        this.notificationToggle.checked = config.showNotifications || false;
        this.backendUrl = config.backendUrl || DEFAULT_CONFIG.backendUrl;
      } else {
        console.error('Failed to load config:', response.error);
        this.backendUrl = DEFAULT_CONFIG.backendUrl;
      }
    } catch (error) {
      console.error('Error loading config:', error);
      this.backendUrl = DEFAULT_CONFIG.backendUrl;
    }
    
    // Add event listeners
    this.filterToggle.addEventListener('change', async (e) => {
      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.UPDATE_CONFIG,
          data: { filterInternalAddresses: e.target.checked }
        });
      } catch (error) {
        console.error('Failed to update filter setting:', error);
      }
    });

    this.notificationToggle.addEventListener('change', async (e) => {
      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.UPDATE_CONFIG,
          data: { showNotifications: e.target.checked }
        });
      } catch (error) {
        console.error('Failed to update notification setting:', error);
      }
    });
    
    this.updateStatus();
  }
  
  async updateStatus() {
    // 更新连接状态
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.HEALTH_CHECK
      });
      
      if (response.success && response.data) {
        this.connectionStatus.textContent = 'Connected to backend';
        this.connectionStatus.className = 'status-indicator connected';
      } else {
        throw new Error('Backend unhealthy');
      }
    } catch (error) {
      this.connectionStatus.textContent = 'Disconnected from backend';
      this.connectionStatus.className = 'status-indicator disconnected';
      console.error('Failed to update connection status:', error);
    }
    
    // 更新缓存状态 - 通过消息传递获取统计信息
    try {
      // 这里可以添加获取统计信息的消息类型
      this.cacheStatus.textContent = 'Cache status updated';
    } catch (error) {
      this.cacheStatus.textContent = 'Unable to get cache status';
      console.error('Failed to get cache status:', error);
    }
  }
}

new PopupManager(); 