import { HistoryDB } from '../utils/db.js';
import { BATCH_SIZE, DEFAULT_CONFIG } from '../utils/constants.js';
import { ConfigManager } from '../utils/config.js';

class OptionsManager {
  constructor() {
    this.db = new HistoryDB();
    this.backendUrl = '';
    this.initializeElements();
    this.loadConfig();
    this.attachEventListeners();
    this.loadPendingRecords();
  }

  initializeElements() {
    // 后端URL配置元素
    this.backendUrlInput = document.getElementById('backendUrl');
    this.saveBackendUrlButton = document.getElementById('saveBackendUrl');
    this.urlStatus = document.getElementById('urlStatus');
    
    // 失败记录元素
    this.pendingCount = document.getElementById('pendingCount');
    this.recordsList = document.getElementById('recordsList');
    this.retryAllButton = document.getElementById('retryAll');
    
    // 同步控制元素
    this.syncStartTime = document.getElementById('syncStartTime');
    this.syncEndTime = document.getElementById('syncEndTime');
    this.startSyncButton = document.getElementById('startSync');
    this.syncProgress = document.getElementById('syncProgress');
    
    // 设置默认日期范围 (最近7天)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.syncEndTime.value = now.toISOString().slice(0, 16);
    this.syncStartTime.value = weekAgo.toISOString().slice(0, 16);
  }

  async loadConfig() {
    const config = await ConfigManager.getConfig();
    this.backendUrl = config.backendUrl || DEFAULT_CONFIG.backendUrl;
    this.backendUrlInput.value = this.backendUrl;
  }

  attachEventListeners() {
    this.saveBackendUrlButton.addEventListener('click', () => this.saveBackendUrl());
    this.retryAllButton.addEventListener('click', () => this.retryAllRecords());
    this.startSyncButton.addEventListener('click', () => this.startManualSync());
    
    // 输入框按回车也触发保存
    this.backendUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveBackendUrl();
      }
    });
  }
  
  async saveBackendUrl() {
    const newUrl = this.backendUrlInput.value.trim();
    if (!newUrl) {
      this.showUrlStatus('URL cannot be empty', false);
      return;
    }
    
    try {
      // 尝试验证URL格式
      new URL(newUrl);
      
      // 尝试连接到健康检查端点
      try {
        const response = await fetch(`${newUrl}/api/health`);
        if (response.ok) {
          this.showUrlStatus('Connection successful', true);
        } else {
          this.showUrlStatus('Backend responded with error', false);
          return;
        }
      } catch (error) {
        this.showUrlStatus('Failed to connect to backend', false);
        return;
      }
      
      // 保存URL到配置
      await ConfigManager.updateConfig({ backendUrl: newUrl });
      this.backendUrl = newUrl;
      
      // 更新本地存储以便content script可以访问
      chrome.storage.local.set({ backendUrl: newUrl });
      
    } catch (error) {
      this.showUrlStatus('Invalid URL format', false);
    }
  }
  
  showUrlStatus(message, isSuccess) {
    this.urlStatus.textContent = message;
    this.urlStatus.className = isSuccess ? 'status-text success' : 'status-text error';
    
    // 3秒后清除状态
    setTimeout(() => {
      this.urlStatus.textContent = '';
    }, 3000);
  }

  async loadPendingRecords() {
    await this.db.init();
    const records = await this.db.getFailedRecords();
    this.pendingCount.textContent = `${records.length} records pending`;
    this.renderRecordsList(records);
  }

  renderRecordsList(records) {
    this.recordsList.innerHTML = records.map(record => `
      <div class="record-item">
        <span class="record-url">${record.url}</span>
        <span class="record-time">${new Date(record.timestamp).toLocaleString()}</span>
        <button onclick="retryRecord('${record.timestamp}')">Retry</button>
      </div>
    `).join('');

    // Add global function for retry button
    window.retryRecord = async (timestamp) => {
      const record = records.find(r => r.timestamp === timestamp);
      if (record) {
        try {
          await this.reportToBackend(record);
          await this.db.removeRecords([timestamp]);
          await this.loadPendingRecords(); // Refresh the list
        } catch (error) {
          console.error('Failed to retry record:', error);
        }
      }
    };
  }

  async retryAllRecords() {
    this.retryAllButton.disabled = true;
    try {
      const records = await this.db.getFailedRecords();
      const successfulTimestamps = [];

      for (const record of records) {
        try {
          await this.reportToBackend(record);
          successfulTimestamps.push(record.timestamp);
        } catch (error) {
          console.error('Failed to retry record:', error);
        }
      }

      if (successfulTimestamps.length > 0) {
        await this.db.removeRecords(successfulTimestamps);
      }
      
      await this.loadPendingRecords();
    } finally {
      this.retryAllButton.disabled = false;
    }
  }

  async startManualSync() {
    const startTime = new Date(this.syncStartTime.value).getTime();
    const endTime = new Date(this.syncEndTime.value).getTime();
    
    if (startTime >= endTime) {
      alert('Start time must be before end time');
      return;
    }

    this.startSyncButton.disabled = true;
    this.syncProgress.style.display = 'block';
    const progressFill = this.syncProgress.querySelector('.progress-fill');
    const progressText = this.syncProgress.querySelector('.progress-text');

    try {
      const items = await this.getHistoryItems(startTime, endTime);
      let processed = 0;

      for (const item of items) {
        try {
          const record = {
            timestamp: new Date(item.lastVisitTime).toISOString(),
            url: item.url,
            domain: new URL(item.url).hostname
          };

          await this.reportToBackend(record);
          processed++;
          
          // Update progress
          const progress = (processed / items.length) * 100;
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `Processed ${processed} of ${items.length} items`;
        } catch (error) {
          console.error('Failed to sync history item:', error);
          await this.db.addRecord(record);
        }
      }

      await this.loadPendingRecords();
    } finally {
      this.startSyncButton.disabled = false;
      setTimeout(() => {
        this.syncProgress.style.display = 'none';
        progressFill.style.width = '0';
      }, 2000);
    }
  }

  getHistoryItems(startTime, endTime) {
    return new Promise((resolve) => {
      chrome.history.search({
        text: '',
        startTime,
        endTime,
        maxResults: 0
      }, resolve);
    });
  }

  async reportToBackend(record) {
    const config = await ConfigManager.getConfig();
    const backendUrl = config.backendUrl || DEFAULT_CONFIG.backendUrl;
    
    const response = await fetch(`${backendUrl}/api/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      throw new Error(`Failed to report history: ${response.statusText}`);
    }
  }
}

new OptionsManager(); 