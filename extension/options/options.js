import { HistoryDB } from '../utils/db.js';
import { BATCH_SIZE, DEFAULT_CONFIG, LOG_LEVELS, LOG_LEVEL_NAMES } from '../utils/constants.js';
import { ConfigManager } from '../utils/config.js';

class OptionsManager {
  constructor() {
    this.db = new HistoryDB();
    this.backendUrl = '';
    this.logLevel = DEFAULT_CONFIG.logLevel;
    this.highlightEnabled = DEFAULT_CONFIG.highlightVisitedLinks;
    this.initializeElements();
    this.loadConfig();
    this.attachEventListeners();
    this.loadPendingRecords();
    this.setupTabs();
  }

  initializeElements() {
    // 选项卡元素
    this.tabButtons = document.querySelectorAll('.tab-button');
    this.tabContents = document.querySelectorAll('.tab-content');
    
    // 后端URL配置元素
    this.backendUrlInput = document.getElementById('backendUrl');
    this.saveBackendUrlButton = document.getElementById('saveBackendUrl');
    this.urlStatus = document.getElementById('urlStatus');
    
    // URL模式映射元素
    this.urlPatternMapInput = document.getElementById('urlPatternMap');
    this.saveUrlPatternButton = document.getElementById('saveUrlPattern');
    this.urlPatternStatus = document.getElementById('urlPatternStatus');
    
    // 失败记录元素
    this.pendingCount = document.getElementById('pendingCount');
    this.recordsList = document.getElementById('recordsList');
    this.retryAllButton = document.getElementById('retryAll');
    
    // 同步控制元素
    this.syncStartTime = document.getElementById('syncStartTime');
    this.syncEndTime = document.getElementById('syncEndTime');
    this.startSyncButton = document.getElementById('startSync');
    this.syncProgress = document.getElementById('syncProgress');
    
    // 系统设置元素
    this.logLevelSelect = document.getElementById('logLevel');
    this.saveLogLevelButton = document.getElementById('saveLogLevel');
    this.logLevelStatus = document.getElementById('logLevelStatus');
    this.currentSettingsDisplay = document.getElementById('currentSettings');
    
    // 高亮控制元素
    this.highlightToggle = document.getElementById('highlightToggle');
    this.saveHighlightButton = document.getElementById('saveHighlight');
    this.highlightStatus = document.getElementById('highlightStatus');
    
    // 设置默认日期范围 (最近7天)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.syncEndTime.value = now.toISOString().slice(0, 16);
    this.syncStartTime.value = weekAgo.toISOString().slice(0, 16);
  }

  async loadConfig() {
    const config = await ConfigManager.getConfig();
    this.backendUrl = config.backendUrl || DEFAULT_CONFIG.backendUrl;
    this.logLevel = config.logLevel !== undefined ? config.logLevel : DEFAULT_CONFIG.logLevel;
    this.highlightEnabled = config.highlightVisitedLinks !== undefined ? config.highlightVisitedLinks : DEFAULT_CONFIG.highlightVisitedLinks;
    
    this.backendUrlInput.value = this.backendUrl;
    this.logLevelSelect.value = this.logLevel;
    this.urlPatternMapInput.value = JSON.stringify(config.urlPatternMap || {}, null, 2);
    
    // 如果高亮开关元素存在，设置其状态
    if (this.highlightToggle) {
      this.highlightToggle.checked = this.highlightEnabled;
    }
    
    this.updateSettingsDisplay(config);
    
    // 确保本地存储与同步存储一致
    this.syncToLocalStorage(config);
  }
  
  syncToLocalStorage(config) {
    // 将同步存储中的配置同步到本地存储
    chrome.storage.local.set({
      backendUrl: config.backendUrl || DEFAULT_CONFIG.backendUrl,
      config: config
    });
  }

  setupTabs() {
    this.tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // 移除所有活动状态
        this.tabButtons.forEach(btn => btn.classList.remove('active'));
        this.tabContents.forEach(content => content.classList.remove('active'));
        
        // 设置当前选项卡活动
        button.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
      });
    });
  }

  attachEventListeners() {
    this.saveBackendUrlButton.addEventListener('click', () => this.saveBackendUrl());
    this.retryAllButton.addEventListener('click', () => this.retryAllRecords());
    this.startSyncButton.addEventListener('click', () => this.startManualSync());
    this.saveLogLevelButton.addEventListener('click', () => this.saveLogLevel());
    this.saveUrlPatternButton.addEventListener('click', () => this.saveUrlPattern());
    
    // 如果高亮设置按钮存在，添加事件监听
    if (this.saveHighlightButton) {
      this.saveHighlightButton.addEventListener('click', () => this.toggleHighlightSetting());
    }
    
    // 输入框按回车也触发保存
    this.backendUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveBackendUrl();
      }
    });
  }
  
  // 添加高亮设置切换功能
  async toggleHighlightSetting() {
    if (!this.highlightToggle) return;
    
    const newValue = this.highlightToggle.checked;
    
    try {
      // 更新配置
      const config = await ConfigManager.getConfig();
      config.highlightVisitedLinks = newValue;
      await ConfigManager.saveConfig(config);
      this.highlightEnabled = newValue;
      
      // 更新本地存储
      chrome.storage.local.get(['config'], (result) => {
        const localConfig = result.config || {};
        localConfig.highlightVisitedLinks = newValue;
        chrome.storage.local.set({ config: localConfig });
        
        // 发送消息给content scripts
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'HIGHLIGHT_SETTING_CHANGED',
              enabled: newValue
            }).catch(() => {
              // 忽略发送消息的错误
            });
          });
        });
        
        // 更新设置显示
        this.updateSettingsDisplay(config);
        this.showStatus(this.highlightStatus, 
          newValue ? 'Highlight enabled' : 'Highlight disabled', 
          true);
      });
    } catch (error) {
      console.error('Failed to toggle highlight setting:', error);
      this.showStatus(this.highlightStatus, 'Failed to update highlight setting', false);
      // 重置UI状态
      this.highlightToggle.checked = this.highlightEnabled;
    }
  }
  
  async saveBackendUrl() {
    const newUrl = this.backendUrlInput.value.trim();
    if (!newUrl) {
      this.showStatus(this.urlStatus, 'URL cannot be empty', false);
      return;
    }
    
    try {
      // 尝试验证URL格式
      new URL(newUrl);
      
      // 尝试连接到健康检查端点
      try {
        const response = await fetch(`${newUrl}/api/health`);
        if (response.ok) {
          this.showStatus(this.urlStatus, 'Connection successful', true);
        } else {
          this.showStatus(this.urlStatus, 'Backend responded with error', false);
          return;
        }
      } catch (error) {
        this.showStatus(this.urlStatus, 'Failed to connect to backend', false);
        return;
      }
      
      // 保存URL到配置
      const config = await ConfigManager.getConfig();
      config.backendUrl = newUrl;
      await ConfigManager.saveConfig(config);
      this.backendUrl = newUrl;
      
      // 更新本地存储以便content script可以访问
      // 先获取现有配置避免覆盖
      chrome.storage.local.get(['config'], (result) => {
        const localConfig = result.config || {};
        localConfig.backendUrl = newUrl;
        
        // 同时更新backendUrl和config
        chrome.storage.local.set({ 
          backendUrl: newUrl, 
          config: localConfig 
        });
        
        // 更新设置显示
        this.updateSettingsDisplay(config);
      });
      
    } catch (error) {
      console.error('Invalid URL format:', error);
      this.showStatus(this.urlStatus, 'Invalid URL format', false);
    }
  }
  
  async saveLogLevel() {
    const newLogLevel = parseInt(this.logLevelSelect.value);
    if (isNaN(newLogLevel) || newLogLevel < 0 || newLogLevel > 4) {
      this.showStatus(this.logLevelStatus, 'Invalid log level', false);
      return;
    }
    
    try {
      // 更新配置
      const config = await ConfigManager.getConfig();
      config.logLevel = newLogLevel;
      await ConfigManager.saveConfig(config);
      this.logLevel = newLogLevel;
      
      // 更新本地存储 - 注意这里使用单独的对象来避免覆盖其他设置
      chrome.storage.local.get(['config'], (result) => {
        const localConfig = result.config || {};
        localConfig.logLevel = newLogLevel;
        chrome.storage.local.set({ config: localConfig });
        
        // 更新设置显示
        this.updateSettingsDisplay(config);
        
        // 向所有内容脚本发送消息
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'LOG_LEVEL_CHANGED',
              level: newLogLevel
            }).catch(() => {
              // 忽略发送消息的错误 - 有些标签页可能没有内容脚本
            });
          });
        });
        
        this.showStatus(this.logLevelStatus, 'Log level saved', true);
      });
    } catch (error) {
      console.error('Failed to save log level:', error);
      this.showStatus(this.logLevelStatus, 'Failed to save log level', false);
    }
  }
  
  async saveUrlPattern() {
    const patternMapText = this.urlPatternMapInput.value.trim();
    
    try {
      // 验证JSON格式
      console.log(this.urlPatternMapInput.value)
      console.log(patternMapText)
      const patternMap = JSON.parse(patternMapText);
      
      // 验证每个键值对
      for (const [pattern, replacement] of Object.entries(patternMap)) {
        // 验证正则表达式
        new RegExp(pattern);
        // 验证替换字符串中的捕获组引用
        if (replacement.includes('$')) {
          const captureGroups = pattern.match(/\([^)]+\)/g) || [];
          const maxGroup = captureGroups.length;
          const groupRefs = replacement.match(/\$(\d+)/g) || [];
          for (const ref of groupRefs) {
            const groupNum = parseInt(ref.slice(1));
            if (groupNum > maxGroup) {
              throw new Error(`Invalid capture group reference $${groupNum} in replacement pattern`);
            }
          }
        }
      }
      
      // 更新配置
      const config = await ConfigManager.getConfig();
      config.urlPatternMap = patternMap;
      await ConfigManager.saveConfig(config);
      
      // 更新本地存储
      chrome.storage.local.get(['config'], (result) => {
        const localConfig = result.config || {};
        localConfig.urlPatternMap = patternMap;
        chrome.storage.local.set({ config: localConfig });
        
        // 更新设置显示
        this.updateSettingsDisplay(config);
        
        // 向所有内容脚本发送消息
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'URL_PATTERN_CHANGED',
              patternMap: patternMap
            }).catch(() => {
              // 忽略发送消息的错误
            });
          });
        });
        
        this.showStatus(this.urlPatternStatus, 'URL pattern mapping saved', true);
      });
    } catch (error) {
      console.error('Failed to save URL pattern mapping:', error);
      this.showStatus(this.urlPatternStatus, `Failed to save URL pattern mapping: ${error.message}`, false);
    }
  }
  
  updateSettingsDisplay(config) {
    const settings = [];
    
    // 添加后端URL
    settings.push(`<div><strong>Backend URL:</strong> ${config.backendUrl || DEFAULT_CONFIG.backendUrl}</div>`);
    
    // 添加高亮设置
    const highlightValue = config.highlightVisitedLinks !== undefined ? config.highlightVisitedLinks : DEFAULT_CONFIG.highlightVisitedLinks;
    settings.push(`<div><strong>Highlight visited links:</strong> ${highlightValue ? 'Enabled' : 'Disabled'}</div>`);
    
    // 添加URL模式映射
    const patternMap = config.urlPatternMap || DEFAULT_CONFIG.urlPatternMap;
    settings.push(`<div><strong>URL Pattern Mapping:</strong> ${Object.keys(patternMap).length ? 'Configured' : 'Not set'}</div>`);
    
    // 添加日志级别
    const logLevel = config.logLevel !== undefined ? config.logLevel : DEFAULT_CONFIG.logLevel;
    settings.push(`<div><strong>Log Level:</strong> ${LOG_LEVEL_NAMES[logLevel]} (${logLevel})</div>`);
    
    // 添加其他设置
    settings.push(`<div><strong>Show failure notifications:</strong> ${config.showFailureNotifications ? 'Enabled' : 'Disabled'}</div>`);
    settings.push(`<div><strong>Filter internal addresses:</strong> ${config.filterInternalAddresses !== false ? 'Enabled' : 'Disabled'}</div>`);
    
    this.currentSettingsDisplay.innerHTML = settings.join('');
  }
  
  showStatus(element, message, isSuccess) {
    element.textContent = message;
    element.className = isSuccess ? 'status-text success' : 'status-text error';
    
    // 3秒后清除状态
    setTimeout(() => {
      element.textContent = '';
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
        maxResults: 10000 // 设置更大的值，确保能获取足够多的记录
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