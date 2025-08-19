import { DEFAULT_CONFIG, LOG_LEVELS, MESSAGE_TYPES } from '../utils/constants.js';

class OptionsManager {
  constructor() {
    this.backendUrl = '';
    this.logLevel = DEFAULT_CONFIG.logLevel;
    this.highlightEnabled = DEFAULT_CONFIG.highlightVisitedLinks;
    this.initializeElements();
    this.loadConfig();
    this.attachEventListeners();
    this.setupTabs();
    this.loadPendingRecords();
    this.initializeSyncTab();
  }

  initializeElements() {
    // Tab elements
    this.tabButtons = document.querySelectorAll('.tab-button');
    this.tabContents = document.querySelectorAll('.tab-content');
    
    // Backend URL configuration elements
    this.backendUrlInput = document.getElementById('backendUrl');
    this.saveBackendUrlButton = document.getElementById('saveBackendUrl');
    this.urlStatus = document.getElementById('urlStatus');
    
    // System settings elements
    this.logLevelSelect = document.getElementById('logLevel');
    this.saveLogLevelButton = document.getElementById('saveLogLevel');
    this.logLevelStatus = document.getElementById('logLevelStatus');
    this.currentSettingsDisplay = document.getElementById('currentSettings');
    
    // Highlight control elements
    this.highlightToggle = document.getElementById('highlightToggle');
    this.saveHighlightButton = document.getElementById('saveHighlight');
    this.highlightStatus = document.getElementById('highlightStatus');
    
    // Notification control elements
    this.notificationToggle = document.getElementById('notificationToggle');
    this.saveNotificationButton = document.getElementById('saveNotification');
    this.notificationStatus = document.getElementById('notificationStatus');
    

    
    // Sync tab elements
    this.pendingCountElement = document.getElementById('pendingCount');
    this.retryAllButton = document.getElementById('retryAll');
    this.recordsListElement = document.getElementById('recordsList');
    this.startSyncButton = document.getElementById('startSync');
    this.syncStartTimeInput = document.getElementById('syncStartTime');
    this.syncEndTimeInput = document.getElementById('syncEndTime');
    this.syncProgressElement = document.getElementById('syncProgress');
  }

  async loadConfig() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_CONFIG
      });
      
      if (response.success) {
        const config = response.data;
        this.backendUrl = config.backendUrl || DEFAULT_CONFIG.backendUrl;
        this.logLevel = config.logLevel !== undefined ? config.logLevel : DEFAULT_CONFIG.logLevel;
        this.highlightEnabled = config.highlightVisitedLinks !== undefined ? config.highlightVisitedLinks : DEFAULT_CONFIG.highlightVisitedLinks;
        
        this.backendUrlInput.value = this.backendUrl;
        this.logLevelSelect.value = this.logLevel;
        
        if (this.highlightToggle) {
          this.highlightToggle.checked = this.highlightEnabled;
        }
        
        if (this.notificationToggle) {
          this.notificationToggle.checked = config.showNotifications || false;
        }
        
        this.updateSettingsDisplay(config);
      } else {
        console.error('Failed to load config:', response.error);
        this.loadDefaultConfig();
      }
    } catch (error) {
      console.error('Error loading config:', error);
      this.loadDefaultConfig();
    }
  }
  
  loadDefaultConfig() {
    this.backendUrl = DEFAULT_CONFIG.backendUrl;
    this.logLevel = DEFAULT_CONFIG.logLevel;
    this.highlightEnabled = DEFAULT_CONFIG.highlightVisitedLinks;
    
    this.backendUrlInput.value = this.backendUrl;
    this.logLevelSelect.value = this.logLevel;
    
    if (this.highlightToggle) {
      this.highlightToggle.checked = this.highlightEnabled;
    }
    
    if (this.notificationToggle) {
      this.notificationToggle.checked = DEFAULT_CONFIG.showNotifications;
    }
  }

  setupTabs() {
    document.querySelector('.tabs').addEventListener('click', (e) => {
      const button = e.target.closest('.tab-button');
      if (!button) return;
      
      const tabName = button.dataset.tab;
      
      // Remove all active states
      this.tabButtons.forEach(btn => btn.classList.remove('active'));
      this.tabContents.forEach(content => content.classList.remove('active'));
      
      // Set current tab active
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  }

  attachEventListeners() {
    // Use event delegation for all buttons
    document.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      switch (button.id) {
        case 'saveBackendUrl':
          this.saveBackendUrl();
          break;
        case 'saveLogLevel':
          this.saveLogLevel();
          break;
        case 'saveHighlight':
          this.toggleHighlightSetting();
          break;
        case 'saveNotification':
          this.toggleNotificationSetting();
          break;
        case 'testConnection':
          this.testConnection();
          break;
        case 'clearCache':
          this.clearCache();
          break;

        case 'retryAll':
          this.retryAllPendingRecords();
          break;
        case 'startSync':
          this.startManualSync();
          break;
      }
    });
    
    // Handle enter key in input fields
    this.backendUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveBackendUrl();
      }
    });
  }
  
  async toggleHighlightSetting() {
    if (!this.highlightToggle) return;
    
    const newValue = this.highlightToggle.checked;
    
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_CONFIG,
        data: { highlightVisitedLinks: newValue }
      });
      this.highlightEnabled = newValue;
      
      this.showStatus(this.highlightStatus, 
        newValue ? 'Link highlighting enabled' : 'Link highlighting disabled', 
        true);
    } catch (error) {
      console.error('Failed to toggle highlight setting:', error);
      this.showStatus(this.highlightStatus, 'Failed to update highlight setting', false);
      this.highlightToggle.checked = this.highlightEnabled;
    }
  }
  
  async toggleNotificationSetting() {
    if (!this.notificationToggle) return;
    
    const newValue = this.notificationToggle.checked;
    
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_CONFIG,
        data: { showNotifications: newValue }
      });
      
      this.showStatus(this.notificationStatus, 
        newValue ? 'Notifications enabled' : 'Notifications disabled', 
        true);
    } catch (error) {
      console.error('Failed to toggle notification setting:', error);
      this.showStatus(this.notificationStatus, 'Failed to update notification setting', false);
      this.notificationToggle.checked = !newValue;
    }
  }
  
  async saveBackendUrl() {
    const newUrl = this.backendUrlInput.value.trim();
    if (!newUrl) {
      this.showStatus(this.urlStatus, 'URL cannot be empty', false);
      return;
    }
    
    try {
      new URL(newUrl);
      
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_CONFIG,
        data: { backendUrl: newUrl }
      });
      
      this.backendUrl = newUrl;
      this.showStatus(this.urlStatus, 'Backend URL saved successfully', true);
      
    } catch (error) {
      if (error.name === 'TypeError') {
        this.showStatus(this.urlStatus, 'Invalid URL format', false);
      } else {
        console.error('Failed to save backend URL:', error);
        this.showStatus(this.urlStatus, 'Failed to save backend URL', false);
      }
    }
  }
  
  async saveLogLevel() {
    const newLevel = this.logLevelSelect.value;
    
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_CONFIG,
        data: { logLevel: newLevel }
      });
      
      this.logLevel = newLevel;
      this.showStatus(this.logLevelStatus, `Log level set to ${newLevel}`, true);
      
    } catch (error) {
      console.error('Failed to save log level:', error);
      this.showStatus(this.logLevelStatus, 'Failed to save log level', false);
    }
  }
  
  async testConnection() {
    try {
      this.showStatus(this.urlStatus, 'Testing connection...', true);
      
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.HEALTH_CHECK
      });
      
      if (response.success && response.data) {
        this.showStatus(this.urlStatus, 'Connection successful!', true);
      } else {
        this.showStatus(this.urlStatus, 'Connection failed', false);
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      this.showStatus(this.urlStatus, 'Connection test failed', false);
    }
  }
  
  async clearCache() {
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.CLEAR_CACHE
      });
      
      this.showStatus(this.currentSettingsDisplay, 'Cache cleared successfully', true);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      this.showStatus(this.currentSettingsDisplay, 'Failed to clear cache', false);
    }
  }

  updateSettingsDisplay(config) {
    if (!this.currentSettingsDisplay) return;
    
    const settings = {
      'Backend URL': config.backendUrl || 'Not set',
      'Log Level': config.logLevel || 'INFO',
      'Link Highlighting': config.highlightVisitedLinks ? 'Enabled' : 'Disabled',
      'Notifications': config.showNotifications ? 'Enabled' : 'Disabled',
      'Cache Expiration': `${Math.round((config.cacheExpiration || DEFAULT_CONFIG.cacheExpiration) / (1000 * 60 * 60))} hours`,
      'Retry Interval': `${Math.round((config.retryInterval || DEFAULT_CONFIG.retryInterval) / (1000 * 60))} minutes`
    };
    
    this.currentSettingsDisplay.innerHTML = Object.entries(settings)
      .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
      .join('');
  }

  showStatus(element, message, isSuccess) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `status ${isSuccess ? 'success' : 'error'}`;
    
    setTimeout(() => {
      element.textContent = '';
      element.className = 'status';
    }, 3000);
  }


  

  
  getCurrentConfig() {
    // This should ideally get the current config from the background script
    // For now, we'll construct it from the current UI state
    return {};
  }
  

  
  showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
  }
  
  hideError(element) {
    element.style.display = 'none';
    element.textContent = '';
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Pending Records and Sync Methods
  async loadPendingRecords() {
    try {
      if (!this.pendingCountElement) return;
      
      this.pendingCountElement.textContent = 'Loading...';
      
      // Get pending records from storage
      const result = await chrome.storage.local.get(['failed_requests']);
      const failedRequests = result.failed_requests || [];
      
      this.pendingCountElement.textContent = `${failedRequests.length} pending records`;
      
      if (this.recordsListElement) {
        this.displayPendingRecords(failedRequests);
      }
      
    } catch (error) {
      console.error('Failed to load pending records:', error);
      if (this.pendingCountElement) {
        this.pendingCountElement.textContent = 'Error loading records';
      }
    }
  }
  
  displayPendingRecords(records) {
    if (!this.recordsListElement) return;
    
    if (records.length === 0) {
      this.recordsListElement.innerHTML = '<div class="no-records">No pending records to sync.</div>';
      return;
    }
    
    const recordsHtml = records.map((record, index) => `
      <div class="record-item" data-index="${index}">
        <div class="record-url">${this.escapeHtml(record.url || 'Unknown URL')}</div>
        <div class="record-timestamp">${new Date(record.timestamp || Date.now()).toLocaleString()}</div>
        <div class="record-domain">${this.escapeHtml(record.domain || 'Unknown domain')}</div>
        <div class="record-error">${this.escapeHtml(record.error || 'Unknown error')}</div>
        <button class="action-button retry-single" data-index="${index}">Retry</button>
      </div>
    `).join('');
    
    this.recordsListElement.innerHTML = recordsHtml;
    
    // Attach retry listeners
    this.recordsListElement.querySelectorAll('.retry-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.retrySingleRecord(index);
      });
    });
  }
  
  async retryAllPendingRecords() {
    try {
      if (!this.retryAllButton) return;
      
      this.retryAllButton.disabled = true;
      this.retryAllButton.textContent = 'Syncing...';
      
      const response = await chrome.runtime.sendMessage({
        type: 'RETRY_FAILED_REQUESTS'
      });
      
      if (response && response.success) {
        // Reload pending records
        await this.loadPendingRecords();
        alert(`Successfully retried ${response.processed || 0} records`);
      } else {
        alert('Failed to retry records: ' + (response?.error || 'Unknown error'));
      }
      
    } catch (error) {
      console.error('Failed to retry all records:', error);
      alert('Failed to retry records: ' + error.message);
    } finally {
      if (this.retryAllButton) {
        this.retryAllButton.disabled = false;
        this.retryAllButton.textContent = 'Sync All Pending Records';
      }
    }
  }
  
  async retrySingleRecord(index) {
    try {
      const result = await chrome.storage.local.get(['failed_requests']);
      const failedRequests = result.failed_requests || [];
      
      if (index >= 0 && index < failedRequests.length) {
        const record = failedRequests[index];
        
        // Send the record to background script for retry
        const response = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.REPORT_HISTORY,
          data: record
        });
        
        if (response && response.success) {
          // Remove from failed requests
          failedRequests.splice(index, 1);
          await chrome.storage.local.set({ failed_requests: failedRequests });
          
          // Reload display
          await this.loadPendingRecords();
          alert('Record synced successfully');
        } else {
          alert('Failed to sync record: ' + (response?.error || 'Unknown error'));
        }
      }
      
    } catch (error) {
      console.error('Failed to retry single record:', error);
      alert('Failed to retry record: ' + error.message);
    }
  }
  
  initializeSyncTab() {
    // Set default date range (last 24 hours)
    if (this.syncStartTimeInput && this.syncEndTimeInput) {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      this.syncEndTimeInput.value = now.toISOString().slice(0, -1);
      this.syncStartTimeInput.value = yesterday.toISOString().slice(0, -1);
    }
    
    // Hide progress initially
    if (this.syncProgressElement) {
      this.syncProgressElement.style.display = 'none';
    }
  }
  
  async startManualSync() {
    try {
      if (!this.syncStartTimeInput || !this.syncEndTimeInput || !this.startSyncButton) return;
      
      const startTime = new Date(this.syncStartTimeInput.value);
      const endTime = new Date(this.syncEndTimeInput.value);
      
      if (startTime >= endTime) {
        alert('Start time must be before end time');
        return;
      }
      
      this.startSyncButton.disabled = true;
      this.startSyncButton.textContent = 'Syncing...';
      
      if (this.syncProgressElement) {
        this.syncProgressElement.style.display = 'block';
        this.updateSyncProgress(0, 'Starting sync...');
      }
      
      // Send sync request to background script
      const response = await chrome.runtime.sendMessage({
        type: 'MANUAL_SYNC',
        data: {
          startTime: startTime.getTime(),
          endTime: endTime.getTime()
        }
      });
      
      if (response && response.success) {
        this.updateSyncProgress(100, `Sync completed. ${response.processed || 0} records processed.`);
        setTimeout(() => {
          if (this.syncProgressElement) {
            this.syncProgressElement.style.display = 'none';
          }
        }, 3000);
      } else {
        this.updateSyncProgress(0, 'Sync failed: ' + (response?.error || 'Unknown error'));
      }
      
    } catch (error) {
      console.error('Failed to start manual sync:', error);
      this.updateSyncProgress(0, 'Sync failed: ' + error.message);
    } finally {
      if (this.startSyncButton) {
        this.startSyncButton.disabled = false;
        this.startSyncButton.textContent = 'Start Sync';
      }
    }
  }
  
  updateSyncProgress(percentage, message) {
    if (!this.syncProgressElement) return;
    
    const progressFill = this.syncProgressElement.querySelector('.progress-fill');
    const progressText = this.syncProgressElement.querySelector('.progress-text');
    
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    
    if (progressText) {
      progressText.textContent = message;
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
}); 