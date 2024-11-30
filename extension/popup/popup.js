import { HistoryDB } from '../utils/db.js';
import { BACKEND_URL } from '../utils/constants.js';

class PopupManager {
  constructor() {
    this.connectionStatus = document.getElementById('connectionStatus');
    this.cacheStatus = document.getElementById('cacheStatus');
    
    this.updateStatus();
  }
  
  async updateStatus() {
    // 更新连接状态
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`);
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

// 初始化popup
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
}); 