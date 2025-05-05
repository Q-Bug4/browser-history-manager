// 默认后端URL
let BACKEND_URL = 'http://localhost:8080';
// 是否启用高亮
let highlightEnabled = true;

/**
 * 从链接元素获取正确的URL
 * @param {HTMLAnchorElement} link 
 * @returns {string} 完整的URL
 */
function getFullUrl(link) {
  // 直接使用href属性，这会返回绝对URL
  const href = link.href;
  
  // 忽略JavaScript链接和锚点链接
  if (!href || href.startsWith('javascript:') || href === '#' || href.endsWith('#')) {
    return null;
  }
  
  // 处理相对URL和绝对URL
  try {
    // 尝试创建URL以验证格式，如果成功则返回原始href
    new URL(href);
    return href;
  } catch (e) {
    console.error('Invalid URL:', href, e);
    return null;
  }
}

/**
 * 高亮显示链接
 * @param {HTMLAnchorElement} link 
 */
function highlightLink(link) {
  // 使用父元素包裹可能更有效
  // 但有些复杂页面可能破坏样式，所以这里直接添加样式到a标签
  link.classList.add('history-link-highlight');
  
  // 添加数据属性，方便调试
  link.dataset.visitedHighlight = 'true';
}

/**
 * 移除所有高亮
 */
function removeAllHighlights() {
  document.querySelectorAll('.history-link-highlight').forEach(element => {
    element.classList.remove('history-link-highlight');
    delete element.dataset.visitedHighlight;
  });
}

/**
 * 批量检查链接是否在历史记录中存在
 * @param {string[]} urls 要检查的URL数组
 * @returns {Promise<string[]>} 存在于历史记录中的URL数组
 */
async function checkUrlsInHistory(urls) {
  try {
    // 如果不启用高亮，直接返回空数组
    if (!highlightEnabled) {
      return [];
    }
    
    // 获取当前域名
    const domain = window.location.hostname;
    
    // 先获取当前域名的所有记录
    const queryParams = new URLSearchParams({
      domain,
      pageSize: 1000 // 获取大量记录
    });
    
    console.log(`Fetching history from ${BACKEND_URL}/api/history?${queryParams}`);
    
    const response = await fetch(`${BACKEND_URL}/api/history?${queryParams}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Retrieved ${data.items.length} history records for domain ${domain}`);
    
    const historyUrls = data.items.map(item => item.url);
    
    // 找出存在于历史记录中的URL
    const matchedUrls = urls.filter(url => {
      if (!url) return false;
      
      return historyUrls.some(historyUrl => {
        // 处理URL差异：去除末尾斜杠、查询参数等
        const normalizedUrl = normalizeUrl(url);
        const normalizedHistoryUrl = normalizeUrl(historyUrl);
        
        const isMatch = normalizedUrl === normalizedHistoryUrl;
        if (isMatch) {
          console.log(`Match found for ${url}`);
        }
        return isMatch;
      });
    });
    
    console.log(`Found ${matchedUrls.length} matches out of ${urls.length} URLs`);
    return matchedUrls;
  } catch (error) {
    console.error('Error checking history:', error);
    return [];
  }
}

/**
 * 规范化URL以进行比较
 * @param {string} url 
 * @returns {string} 规范化后的URL
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // 移除末尾斜杠
    let normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
    // 保留查询参数但移除碎片标识符
    if (parsed.search) {
      normalized += parsed.search;
    }
    return normalized.toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

/**
 * 处理页面上所有的链接
 */
async function processLinks() {
  // 如果不启用高亮，先移除所有高亮
  if (!highlightEnabled) {
    removeAllHighlights();
    return;
  }
  
  console.log('Processing links on page...');
  
  // 获取页面上所有链接
  const links = Array.from(document.querySelectorAll('a'));
  console.log(`Found ${links.length} links on page`);
  
  // 获取有效的URL
  const urlMap = new Map(); // 用Map来保存URL和对应的元素
  links.forEach(link => {
    const url = getFullUrl(link);
    if (url) {
      if (!urlMap.has(url)) {
        urlMap.set(url, []);
      }
      urlMap.get(url).push(link);
    }
  });
  
  const uniqueUrls = Array.from(urlMap.keys());
  console.log(`Found ${uniqueUrls.length} unique URLs on page`);
  
  if (uniqueUrls.length === 0) return;
  
  // 批量检查URL
  const historyUrls = await checkUrlsInHistory(uniqueUrls);
  
  // 高亮历史链接
  historyUrls.forEach(url => {
    const elements = urlMap.get(url) || [];
    console.log(`Highlighting ${elements.length} elements for URL ${url}`);
    elements.forEach(highlightLink);
  });
  
  console.log('Finished processing links');
}

/**
 * 监听DOM变化，处理新增的链接
 */
function observeDOMChanges() {
  const observer = new MutationObserver((mutations) => {
    let hasNewLinks = false;
    
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        // 检查新增的节点是否包含链接
        const links = Array.from(mutation.addedNodes)
          .filter(node => node.nodeType === Node.ELEMENT_NODE)
          .flatMap(node => {
            if (node.tagName === 'A') return [node];
            return Array.from(node.querySelectorAll('a'));
          });
        
        if (links.length > 0) {
          hasNewLinks = true;
          console.log(`DOM changed, found ${links.length} new links`);
        }
      }
    });
    
    // 如果有新的链接，重新处理
    if (hasNewLinks) {
      processLinks();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('DOM observer started');
}

/**
 * 初始化: 从存储中获取配置并开始处理
 */
async function initialize() {
  console.log('Initializing history-highlighter...');
  
  // 从storage中获取配置
  chrome.storage.local.get(['backendUrl', 'config'], (result) => {
    if (result.backendUrl) {
      BACKEND_URL = result.backendUrl;
    }
    
    if (result.config && result.config.highlightVisitedLinks !== undefined) {
      highlightEnabled = result.config.highlightVisitedLinks;
    }
    
    console.log(`Using backend URL: ${BACKEND_URL}, highlight enabled: ${highlightEnabled}`);
    
    // 开始处理链接
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        processLinks();
        observeDOMChanges();
      });
    } else {
      processLinks();
      observeDOMChanges();
    }
  });
  
  // 监听存储变化，更新配置
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.backendUrl) {
      BACKEND_URL = changes.backendUrl.newValue;
      console.log(`Backend URL updated: ${BACKEND_URL}`);
      // 重新处理链接
      processLinks();
    }
    
    if (changes.config && changes.config.newValue && 
        changes.config.newValue.highlightVisitedLinks !== undefined) {
      highlightEnabled = changes.config.newValue.highlightVisitedLinks;
      console.log(`Highlight setting updated: ${highlightEnabled}`);
      // 重新处理链接
      processLinks();
    }
  });
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'HIGHLIGHT_SETTING_CHANGED') {
      highlightEnabled = message.enabled;
      console.log(`Highlight setting changed: ${highlightEnabled}`);
      // 重新处理链接
      processLinks();
    }
    return true;
  });
}

// 启动
initialize(); 