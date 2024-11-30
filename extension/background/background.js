import { HistoryDB } from '../utils/db.js';
import { BACKEND_URL, RETRY_INTERVAL, BATCH_SIZE } from '../utils/constants.js';

const db = new HistoryDB();

async function initialize() {
  await db.init();
  // 初始启动时执行一次重试
  await retryFailedRecords();
  // 启动定期重试
  setInterval(retryFailedRecords, RETRY_INTERVAL);
}

// 启动初始化
initialize().catch(error => {
  console.error('Failed to initialize:', error);
});

// 监听历史记录变化
chrome.history.onVisited.addListener(async (historyItem) => {
  const url = new URL(historyItem.url);
  
  // 过滤内网地址
  if (isInternalAddress(url.hostname)) {
    return;
  }
  
  const record = {
    timestamp: new Date().toISOString(),
    url: historyItem.url,
    domain: url.hostname
  };

  try {
    await reportToBackend(record);
  } catch (error) {
    console.error('Failed to report history:', error);
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

// 上报到后端
async function reportToBackend(record) {
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
        await reportToBackend(record);
        successfulTimestamps.push(record.timestamp);
      } catch (error) {
        console.error('Retry failed for record:', error);
        // 跳过失败的记录，继续处理下一条
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