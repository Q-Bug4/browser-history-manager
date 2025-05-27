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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
}); 