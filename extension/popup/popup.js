import { HistoryDB } from '../utils/db.js';
import { ConfigManager } from '../utils/config.js';
import { DEFAULT_CONFIG } from '../utils/constants.js';

class PopupManager {
  constructor() {
    this.connectionStatus = document.getElementById('connectionStatus');
    this.cacheStatus = document.getElementById('cacheStatus');
    this.filterToggle = document.getElementById('filterInternalAddresses');
    this.notificationToggle = document.getElementById('showFailureNotifications');
    this.highlightToggle = document.getElementById('highlightVisitedLinks');
    
    this.initializeUI();
    
    // 添加打开配置页面的事件监听
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  
  async initializeUI() {
    // Load and set config
    const config = await ConfigManager.getConfig();
    this.filterToggle.checked = config.filterInternalAddresses;
    this.notificationToggle.checked = config.showFailureNotifications;
    this.highlightToggle.checked = config.highlightVisitedLinks;
    this.backendUrl = config.backendUrl || DEFAULT_CONFIG.backendUrl;
    
    // Add event listeners
    this.filterToggle.addEventListener('change', async (e) => {
      await ConfigManager.updateConfig({
        filterInternalAddresses: e.target.checked
      });
    });

    this.notificationToggle.addEventListener('change', async (e) => {
      await ConfigManager.updateConfig({
        showFailureNotifications: e.target.checked
      });
    });
    
    this.highlightToggle.addEventListener('change', async (e) => {
      await ConfigManager.updateConfig({
        highlightVisitedLinks: e.target.checked
      });
      
      // 向所有标签页发送消息，通知设置变更
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'HIGHLIGHT_SETTING_CHANGED',
            enabled: e.target.checked
          }).catch(err => {
            // 内容脚本可能还未加载，忽略错误
            console.log(`Failed to send message to tab ${tab.id}:`, err);
          });
        });
      });
    });
    
    this.updateStatus();
  }
  
  async updateStatus() {
    // 更新连接状态
    try {
      const response = await fetch(`${this.backendUrl}/api/health`);
      console.log('Backend health check response:', response);
      if (response.ok) {
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
    
    // 更新缓存状态
    const db = new HistoryDB();
    await db.init();
    const cachedCount = await db.getFailedRecordsCount();
    this.cacheStatus.textContent = 
      cachedCount > 0 ? 
      `${cachedCount} records pending upload` : 
      'No pending records';
  }
}

new PopupManager(); 