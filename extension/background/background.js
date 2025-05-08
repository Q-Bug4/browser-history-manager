import { HistoryDB } from '../utils/db.js';
import { RETRY_INTERVAL, BATCH_SIZE, DEFAULT_CONFIG } from '../utils/constants.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager } from '../core/history-manager.js';

const db = new HistoryDB();
const historyManager = new HistoryManager();

async function initialize() {
  await db.init();
  await historyManager.initialize();
  // 初始启动时执行一次重试
  await retryFailedRecords();
  // 启动定期重试
  setInterval(retryFailedRecords, RETRY_INTERVAL);
}

// 监听历史记录变化
chrome.history.onVisited.addListener(async (historyItem) => {
  const url = new URL(historyItem.url);
  
  // Get current config
  const config = await ConfigManager.getConfig();
  
  // Only filter if enabled
  if (config.filterInternalAddresses && isInternalAddress(url.hostname)) {
    return;
  }
  
  const record = {
    timestamp: new Date().toISOString(),
    url: historyItem.url,
    domain: url.hostname
  };

  try {
    await historyManager.reportHistory(record);
  } catch (error) {
    console.error('Failed to report history:', error);
    await showFailureNotification(record.url);
    await cacheFailedRecord(record);
  }
});

// 检查是否为内网地址
function isInternalAddress(hostname) {
  return hostname.startsWith('10.') || 
         hostname.startsWith('192.168.') ||
         hostname.startsWith('localhost') ||
         hostname === '127.0.0.1';
}

// 缓存失败记录
async function cacheFailedRecord(record) {
  await db.addRecord(record);
}

// 定期重试上报失败的记录
async function retryFailedRecords() {
  try {
    const records = await db.getFailedRecords(BATCH_SIZE);
    if (records.length === 0) return;

    const successfulTimestamps = [];

    for (const record of records) {
      try {
        await historyManager.reportHistory(record);
        successfulTimestamps.push(record.timestamp);
      } catch (error) {
        console.error('Retry failed for record:', error);
        continue;
      }
    }

    // 删除成功上报的记录
    if (successfulTimestamps.length > 0) {
      await db.removeRecords(successfulTimestamps);
    }
  } catch (error) {
    console.error('Error during retry:', error);
  }
}

// 1x1像素的透明PNG图片的base64编码
const TRANSPARENT_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';

// 修改通知函数
async function showFailureNotification(url) {
  try {
    const config = await ConfigManager.getConfig();
    console.log('Notification config:', config.showFailureNotifications);
    
    if (!config.showFailureNotifications) {
      console.log('Notifications are disabled');
      return;
    }

    const notificationOptions = {
      type: 'basic',
      iconUrl: TRANSPARENT_ICON,
      title: 'History Report Failed',
      message: `Failed to report history for: ${url}\n\nYou can disable these notifications in the extension popup.`,
      priority: 2
    };
    
    console.log('Creating notification with options:', notificationOptions);
    
    chrome.notifications.create('', notificationOptions, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('Test notification failed:', chrome.runtime.lastError.message);
      } else {
        console.log('Notification created with ID:', notificationId);
      }
    });
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

// 启动
initialize();