export class HistoryDB {
  constructor() {
    this.dbName = 'BrowserHistoryDB';
    this.storeName = 'failedRecords';
    this.version = 1;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { 
            keyPath: 'timestamp' 
          });
        }
      };
    });
  }

  async addRecord(record) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getFailedRecords(limit = 0) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll(null, limit);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeRecords(timestamps) {
    await this.init();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return Promise.all(
      timestamps.map(timestamp => 
        new Promise((resolve, reject) => {
          const request = store.delete(timestamp);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      )
    );
  }

  async getFailedRecordsCount() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
} 