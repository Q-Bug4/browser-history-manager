import { HistoryDB } from '../utils/db.js';
import { BACKEND_URL, BATCH_SIZE } from '../utils/constants.js';

class OptionsManager {
  constructor() {
    this.db = new HistoryDB();
    this.initializeElements();
    this.attachEventListeners();
    this.loadPendingRecords();
  }

  initializeElements() {
    this.pendingCount = document.getElementById('pendingCount');
    this.recordsList = document.getElementById('recordsList');
    this.retryAllButton = document.getElementById('retryAll');
    this.syncStartTime = document.getElementById('syncStartTime');
    this.syncEndTime = document.getElementById('syncEndTime');
    this.startSyncButton = document.getElementById('startSync');
    this.syncProgress = document.getElementById('syncProgress');
    
    // Set default date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.syncEndTime.value = now.toISOString().slice(0, 16);
    this.syncStartTime.value = weekAgo.toISOString().slice(0, 16);
  }

  attachEventListeners() {
    this.retryAllButton.addEventListener('click', () => this.retryAllRecords());
    this.startSyncButton.addEventListener('click', () => this.startManualSync());
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
    const response = await fetch(`${BACKEND_URL}/api/history`, {
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