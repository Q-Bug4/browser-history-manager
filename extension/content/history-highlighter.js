// 默认后端URL
let BACKEND_URL = 'http://localhost:8080';
// 是否启用高亮
let highlightEnabled = true;
// 保存当前的tooltip元素和定时器
let currentTooltip = null;
let tooltipTimer = null;
// tooltip显示时间(毫秒)
const TOOLTIP_DURATION = 2000;
// 访问记录缓存（URL -> 记录）
const visitCache = new Map();
// 已处理的URL集合，避免重复处理
const processedUrls = new Set();

// 日志级别常量
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// 当前日志级别，默认INFO
let currentLogLevel = LOG_LEVELS.INFO;

// 设置URL关键词模式
let urlKeywordPattern = '';

// 设置URL模式映射
let urlPatternMap = {};

/**
 * 日志系统
 */
const logger = {
  debug: function(...args) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log('[History-HL Debug]', ...args);
    }
  },
  info: function(...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log('[History-HL Info]', ...args);
    }
  },
  warn: function(...args) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn('[History-HL Warn]', ...args);
    }
  },
  error: function(...args) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error('[History-HL Error]', ...args);
    }
  }
};

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
    logger.error('Invalid URL:', href, e);
    return null;
  }
}

/**
 * 高亮显示链接并添加事件处理
 * @param {HTMLAnchorElement} link 
 * @param {Object} historyRecord 可选的历史记录信息
 */
function highlightLink(link, historyRecord = null) {
  if (!link || !link.href) return;
  
  logger.debug(`Highlighting link: ${link.href}`);
  
  // 防止重复处理
  if (link.classList.contains('history-link-highlight')) {
    return;
  }
  
  // 使用父元素包裹可能更有效
  // 但有些复杂页面可能破坏样式，所以这里直接添加样式到a标签
  link.classList.add('history-link-highlight');
  
  // 添加数据属性，方便调试
  link.dataset.visitedHighlight = 'true';
  
  // 存储历史记录信息（如果有）
  if (historyRecord) {
    // 使用data属性直接存储信息不安全，改用Map缓存
    visitCache.set(link.href, historyRecord);
  }
  
  // 确保移除旧的事件监听器
  link.removeEventListener('mouseover', handleLinkMouseOver);
  link.removeEventListener('mouseout', handleLinkMouseOut);
  
  // 添加新的事件监听器
  link.addEventListener('mouseover', handleLinkMouseOver);
  link.addEventListener('mouseout', handleLinkMouseOut);
  
  // 直接绑定事件处理函数作为备份方案
  link.onmouseover = handleLinkMouseOver;
  link.onmouseout = handleLinkMouseOut;
  
  logger.debug(`Event listeners added to link: ${link.href}`);
}

/**
 * 为所有链接添加鼠标事件监听（无论是否高亮）
 */
function addEventListenersToAllLinks() {
  logger.debug('Adding event listeners to all links');
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    const url = getFullUrl(link);
    if (!url) return;
    
    // 确保移除旧的事件监听器
    link.removeEventListener('mouseover', logLinkHover);
    link.removeEventListener('mouseout', clearPendingOperations);
    
    // 添加监听器
    link.addEventListener('mouseover', logLinkHover);
    link.addEventListener('mouseout', clearPendingOperations);
    
    // 直接绑定事件处理函数作为备份方案
    if (!link.onmouseover) {
      link.onmouseover = logLinkHover;
    }
    if (!link.onmouseout) {
      link.onmouseout = clearPendingOperations;
    }
  });
}

// 用于存储延迟检查计时器
let hoverTimer = null;

/**
 * 记录链接悬停并检查访问状态
 * @param {MouseEvent} event 
 */
function logLinkHover(event) {
  const link = event.currentTarget;
  if (!link || !link.href) return;
  
  logger.debug(`Mouse hover on link: ${link.href}`);
  
  // 如果是已知的高亮链接，使用现有的处理逻辑
  if (link.classList.contains('history-link-highlight')) {
    return;
  }
  
  // 如果已经在缓存中，不需要再查询
  if (visitCache.has(link.href)) {
    logger.debug(`Link visit status cached: ${link.href} - visited`);
    return;
  }
  
  // 设置一个短暂延迟，避免频繁API调用
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    checkLinkVisitStatus(link);
  }, 100);
}

/**
 * 清除待处理的操作
 */
function clearPendingOperations() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

/**
 * 检查链接是否被访问过
 * @param {HTMLAnchorElement} link 
 */
async function checkLinkVisitStatus(link) {
  if (!link || !link.href) return;
  
  logger.debug(`Checking visit status for: ${link.href}`);
  
  try {
    // 规范化URL
    const normalizedUrl = normalizeUrl(link.href);
    logger.debug(`Normalized URL for query: ${normalizedUrl}`);
    
    // 构建查询参数
    const queryParams = new URLSearchParams({
      keyword: normalizedUrl,
      pageSize: 1
    });
    
    const apiUrl = `${BACKEND_URL}/api/history?${queryParams}`;
    
    // 打印请求详情
    logger.debug(`📤 Link visit check request:`, {
      method: 'GET',
      url: apiUrl,
      params: Object.fromEntries(queryParams.entries())
    });
    
    // 发送请求
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 打印响应详情
    logger.debug(`📥 Link visit check response:`, JSON.stringify(data, null, 2));
    
    // 检查是否有匹配的记录
    if (data.items && data.items.length > 0) {
      logger.debug(`✓ Link has been visited: ${link.href}`);
      const record = {
        url: link.href,
        lastVisitTime: data.items[0].timestamp,
        visitCount: 1
      };
      visitCache.set(link.href, record);
      
      // 如果链接尚未高亮，可能需要刷新页面高亮
      if (!link.classList.contains('history-link-highlight')) {
        logger.debug(`Link should be highlighted: ${link.href}`);
        highlightLink(link, record);
      }
    } else {
      logger.debug(`✗ Link has not been visited: ${link.href}`);
    }
  } catch (error) {
    logger.error(`Error checking visit status for ${link.href}:`, error);
  }
}

/**
 * 鼠标悬停事件处理函数
 * @param {MouseEvent} event 
 */
function handleLinkMouseOver(event) {
  logger.debug("mouseover event triggered for:", event.currentTarget?.href);
  
  const link = event.currentTarget;
  // 确保当前元素是高亮链接
  if (!link || !link.classList.contains('history-link-highlight')) {
    logger.debug('Link is not highlighted, skipping tooltip');
    return;
  }
  
  logger.debug(`Mouse over link: ${link.href}`);
  
  // 如果缓存中有记录，直接使用
  if (visitCache.has(link.href)) {
    const historyRecord = visitCache.get(link.href);
    logger.debug(`Using cached history record:`, historyRecord);
    showTooltip(event, historyRecord);
    return;
  }
  
  // 如果没有缓存，尝试从后端获取记录
  getHistoryRecord(link.href)
    .then(historyRecord => {
      if (historyRecord) {
        visitCache.set(link.href, historyRecord);
        showTooltip(event, historyRecord);
      } else {
        logger.debug(`No history record found for ${link.href}`);
        // 如果没有找到记录，仍然显示基本提示
        showTooltip(event);
      }
    })
    .catch(error => {
      logger.error(`Error fetching history for ${link.href}:`, error);
    });
}

/**
 * 鼠标移出事件处理函数
 */
function handleLinkMouseOut(event) {
  logger.debug('Mouse out from link:', event.currentTarget?.href);
  hideTooltip();
}

/**
 * 获取单个URL的历史记录
 * @param {string} url 
 * @returns {Promise<Object|null>} 历史记录对象或null
 */
async function getHistoryRecord(url) {
  try {
    logger.debug(`Fetching history for URL: ${url}`);
    
    // 规范化URL
    const normalizedUrl = normalizeUrl(url);
    logger.debug(`Normalized URL for query: ${normalizedUrl}`);
    
    // 按照API规范构建查询参数
    const queryParams = new URLSearchParams({
      keyword: normalizedUrl,
      pageSize: 1
    });
    
    const apiUrl = `${BACKEND_URL}/api/history?${queryParams}`;
    logger.debug(`API request: ${apiUrl}`);
    
    // 打印完整请求信息
    logger.debug(`📤 Request details:`, {
      method: 'GET',
      url: apiUrl,
      params: Object.fromEntries(queryParams.entries())
    });
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 打印完整响应数据
    logger.debug(`📥 Response data:`, JSON.stringify(data, null, 2));
    
    // 检查是否有匹配的记录
    if (data.items && data.items.length > 0) {
      return {
        url: data.items[0].url,
        lastVisitTime: data.items[0].timestamp,
        visitCount: 1 // 假设访问次数为1，因为API可能不提供这个信息
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Error fetching history record:', error);
    return null;
  }
}

/**
 * 显示已访问提示
 * @param {MouseEvent} event 
 * @param {Object} historyRecord 历史记录信息
 */
function showTooltip(event, historyRecord = null) {
  if (!event || !event.currentTarget) {
    logger.error('Invalid event for tooltip');
    return;
  }
  
  const link = event.currentTarget;
  logger.debug('Showing tooltip for link:', link.href);
  
  // 清除上一个tooltip和定时器
  clearTooltip();
  
  // 创建tooltip元素
  const tooltip = document.createElement('div');
  tooltip.className = 'history-tooltip';
  
  // 如果有历史记录信息，显示详细信息
  if (historyRecord && historyRecord.lastVisitTime) {
    const visitDate = new Date(historyRecord.lastVisitTime);
    const visitCount = historyRecord.visitCount || 1;
    
    tooltip.innerHTML = `
      <div>上次访问时间: ${visitDate.toLocaleString()}</div>
      <div>访问次数: ${visitCount}</div>
    `;
  } else {
    tooltip.textContent = '您已经访问过此链接';
  }
  
  document.body.appendChild(tooltip);
  
  // 获取链接位置
  const linkRect = link.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  
  // 设置tooltip位置 - 在链接正下方居中
  tooltip.style.left = (linkRect.left + linkRect.width / 2) + 'px';
  tooltip.style.top = (linkRect.bottom + scrollY + 10) + 'px';
  
  // 显示tooltip
  setTimeout(() => {
    tooltip.classList.add('show');
  }, 10);
  
  // 保存当前tooltip引用
  currentTooltip = tooltip;
  
  // 设置自动隐藏
  tooltipTimer = setTimeout(() => {
    hideTooltip();
  }, TOOLTIP_DURATION);
  
  logger.debug('Tooltip created and displayed');
}

/**
 * 隐藏提示
 */
function hideTooltip() {
  logger.debug('Hiding tooltip');
  
  if (currentTooltip) {
    currentTooltip.classList.remove('show');
    
    // 等待淡出动画完成后移除元素
    setTimeout(() => {
      if (currentTooltip && currentTooltip.parentNode) {
        currentTooltip.parentNode.removeChild(currentTooltip);
      }
      currentTooltip = null;
    }, 300);
  }
  
  // 清除定时器
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
}

/**
 * 清除当前的tooltip
 */
function clearTooltip() {
  hideTooltip();
  
  // 移除页面上所有的tooltip(以防有未清理的)
  document.querySelectorAll('.history-tooltip').forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
}

/**
 * 移除所有高亮
 */
function removeAllHighlights() {
  logger.info('Removing all highlights');
  
  document.querySelectorAll('.history-link-highlight').forEach(element => {
    // 移除事件监听器
    element.removeEventListener('mouseover', handleLinkMouseOver);
    element.removeEventListener('mouseout', handleLinkMouseOut);
    element.onmouseover = null;
    element.onmouseout = null;
    
    // 移除样式类和属性
    element.classList.remove('history-link-highlight');
    delete element.dataset.visitedHighlight;
  });
  
  // 清除访问缓存
  visitCache.clear();
  processedUrls.clear();
  
  // 确保清除任何残留的tooltip
  clearTooltip();
  
  logger.info('All highlights removed');
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
      logger.info('Highlight is disabled, skipping history check');
      return [];
    }
    
    logger.info(`Checking ${urls.length} URLs in history...`);
    
    // 构建高效的API请求 - 根据API能力选择最优方法
    // 使用当前页面域名查询相关记录
    
    const domain = window.location.hostname;
    const queryParams = new URLSearchParams({
      domain,
      pageSize: 2000 // 尝试获取更多记录
    });
    
    const apiUrl = `${BACKEND_URL}/api/history?${queryParams}`;
    logger.debug(`Fetching history from ${apiUrl}`);
    
    // 打印完整请求信息
    logger.debug(`📤 Batch request details:`, {
      method: 'GET',
      url: apiUrl,
      params: Object.fromEntries(queryParams.entries())
    });
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 打印响应摘要（可能太大不适合完整打印）
    logger.debug(`📥 Batch response summary:`, {
      total: data.total || 0,
      itemCount: data.items?.length || 0,
      firstFewItems: data.items?.slice(0, 3) || []
    });
    
    // 如果需要完整响应数据，取消下面的注释
    logger.debug(`📥 Complete batch response data:`, JSON.stringify(data, null, 2));
    
    if (!data.items || !Array.isArray(data.items)) {
      logger.error('Invalid response format:', data);
      return [];
    }
    
    logger.info(`Retrieved ${data.items.length} history records for domain ${domain}`);
    
    // 创建一个Set来快速查找历史URL
    const historyUrlSet = new Set();
    const historyMap = new Map();
    
    // 预处理历史记录
    data.items.forEach(item => {
      if (!item || !item.url) return;
      
      // 存储原始URL
      historyUrlSet.add(item.url);
      historyMap.set(item.url, {
        url: item.url,
        lastVisitTime: item.timestamp,
        visitCount: 1
      });
      
      // 存储规范化后的URL，以便更好地匹配
      const normalizedUrl = normalizeUrl(item.url);
      if (normalizedUrl !== item.url) {
        historyUrlSet.add(normalizedUrl);
        historyMap.set(normalizedUrl, {
          url: item.url,
          lastVisitTime: item.timestamp,
          visitCount: 1  
        });
      }
    });
    
    logger.debug(`Normalized history set has ${historyUrlSet.size} entries`);
    
    // 匹配页面上的URL
    const matchedUrls = [];
    
    for (const url of urls) {
      if (!url) continue;
      
      // 检查原始URL是否在历史记录中
      if (historyUrlSet.has(url)) {
        logger.debug(`✓ Direct match for URL: ${url}`);
        matchedUrls.push(url);
        visitCache.set(url, historyMap.get(url));
        continue;
      }
      
      // 尝试规范化URL进行匹配
      const normalizedUrl = normalizeUrl(url);
      if (historyUrlSet.has(normalizedUrl)) {
        logger.debug(`✓ Normalized match for URL: ${url} -> ${normalizedUrl}`);
        matchedUrls.push(url);
        visitCache.set(url, historyMap.get(normalizedUrl));
      } else {
        logger.debug(`✗ No match for URL: ${url}`);
      }
    }
    
    logger.info(`Found ${matchedUrls.length} matches out of ${urls.length} URLs`);
    return matchedUrls;
  } catch (error) {
    logger.error('Error checking history:', error);
    return [];
  }
}

/**
 * 规范化URL，使用模式映射
 * @param {string} url 
 * @returns {string} 规范化后的URL
 */
function normalizeUrl(url) {
  try {
    // 尝试使用模式映射
    for (const [pattern, replacement] of Object.entries(urlPatternMap)) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
          const normalized = url.replace(regex, replacement);
          logger.debug(`URL normalized using pattern: ${url} -> ${normalized}`);
          return normalized.toLowerCase();
        }
      } catch (e) {
        logger.error(`Invalid regex pattern: ${pattern}`, e);
      }
    }
    
    // 如果没有匹配的模式，使用基本规范化
    const parsed = new URL(url);
    
    // 提取基本URL组件
    let normalized = parsed.origin;
    
    // 处理路径 - 移除末尾斜杠
    let path = parsed.pathname;
    if (path.endsWith('/') && path !== '/') {
      path = path.slice(0, -1);
    }
    normalized += path;
    
    // 保留查询参数
    if (parsed.search) {
      normalized += parsed.search;
    }
    
    return normalized.toLowerCase();
  } catch (e) {
    logger.error(`Error normalizing URL: ${url}`, e);
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
  
  logger.info('Processing links on page...');
  
  // 获取页面上所有链接
  const links = Array.from(document.querySelectorAll('a'));
  logger.info(`Found ${links.length} links on page`);
  
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
  logger.info(`Found ${uniqueUrls.length} unique URLs on page`);
  
  if (uniqueUrls.length === 0) return;
  
  // 批量检查URL，排除已处理的URL
  const newUrls = uniqueUrls.filter(url => !processedUrls.has(url));
  logger.info(`${newUrls.length} new URLs to check (excluded ${uniqueUrls.length - newUrls.length} already processed)`);
  
  // 记录已处理的URL
  newUrls.forEach(url => processedUrls.add(url));
  
  // 批量检查新URL
  const historyUrls = await checkUrlsInHistory(newUrls);
  
  // 高亮历史链接
  historyUrls.forEach(url => {
    const elements = urlMap.get(url) || [];
    const record = visitCache.get(url);
    logger.debug(`Highlighting ${elements.length} elements for URL ${url}`, record);
    elements.forEach(link => highlightLink(link, record));
  });
  
  logger.info('Finished processing links');
  
  // 为所有链接添加鼠标事件监听器，以便记录所有访问状态
  addEventListenersToAllLinks();
  
  // 检查是否所有高亮链接都具有正确的事件监听器
  setTimeout(() => {
    const highlightedLinks = document.querySelectorAll('.history-link-highlight');
    logger.debug(`Verifying ${highlightedLinks.length} highlighted links have event listeners`);
    
    highlightedLinks.forEach(link => {
      // 再次确保事件监听器已绑定
      if (!link.onmouseover || !link.onmouseout) {
        logger.debug(`Fixing missing event listeners on ${link.href}`);
        link.onmouseover = handleLinkMouseOver;
        link.onmouseout = handleLinkMouseOut;
      }
    });
  }, 500);
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
          logger.debug(`DOM changed, found ${links.length} new links`);
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
  
  logger.info('DOM observer started');
}

/**
 * 验证所有高亮链接是否有正确的事件监听器
 */
function verifyEventListeners() {
  const highlightedLinks = document.querySelectorAll('.history-link-highlight');
  logger.debug(`Verifying event listeners for ${highlightedLinks.length} highlighted links`);
  
  highlightedLinks.forEach(link => {
    const hasOnMouseover = typeof link.onmouseover === 'function';
    const hasOnMouseout = typeof link.onmouseout === 'function';
    
    if (!hasOnMouseover || !hasOnMouseout) {
      logger.debug(`Link ${link.href} is missing events:`, 
        hasOnMouseover ? 'has mouseover' : 'no mouseover',
        hasOnMouseout ? 'has mouseout' : 'no mouseout');
      
      // 重新添加事件
      logger.debug(`Re-adding event listeners to link: ${link.href}`);
      link.onmouseover = handleLinkMouseOver;
      link.onmouseout = handleLinkMouseOut;
    }
  });
}

/**
 * 初始化: 从存储中获取配置并开始处理
 */
async function initialize() {
  logger.info('Initializing history-highlighter...');
  
  // 检查high-contrast模式
  if (window.matchMedia('(prefers-contrast: more)').matches) {
    logger.info('High contrast mode detected, adjusting styles');
  }
  
  // 从storage中获取配置
  chrome.storage.local.get(['backendUrl', 'config'], (result) => {
    if (result.backendUrl) {
      BACKEND_URL = result.backendUrl;
    }
    
    if (result.config) {
      // 如果配置中有highlightVisitedLinks字段，则使用该值
      if (result.config.highlightVisitedLinks !== undefined) {
        highlightEnabled = Boolean(result.config.highlightVisitedLinks);
        logger.info(`Highlight setting read from config: ${highlightEnabled}`);
      }
      
      // 设置日志级别
      if (result.config.logLevel !== undefined) {
        currentLogLevel = Number(result.config.logLevel);
        logger.info(`Log level set to: ${currentLogLevel}`);
      }

      // 设置URL模式映射
      if (result.config.urlPatternMap !== undefined) {
        urlPatternMap = result.config.urlPatternMap;
        logger.info(`URL pattern mapping set:`, urlPatternMap);
      }
    }
    
    logger.info(`Using backend URL: ${BACKEND_URL}, highlight enabled: ${highlightEnabled}`);
    
    // 打印当前扩展配置
    logger.info('📋 Extension configuration:', {
      backendUrl: BACKEND_URL,
      highlightEnabled: highlightEnabled,
      tooltipDuration: TOOLTIP_DURATION,
      currentPage: window.location.href,
      domain: window.location.hostname,
      logLevel: currentLogLevel,
      urlPatternMap: urlPatternMap
    });
    
    // 开始处理链接
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        // 只有当启用高亮时才处理链接
        if (highlightEnabled) {
          processLinks();
        }
        observeDOMChanges();
      });
    } else {
      // 只有当启用高亮时才处理链接
      if (highlightEnabled) {
        processLinks();
      } else {
        // 如果高亮被禁用，确保页面上没有高亮元素
        removeAllHighlights();
      }
      observeDOMChanges();
    }
  });
  
  // 监听存储变化，更新配置
  chrome.storage.onChanged.addListener((changes) => {
    let configChanged = false;
    
    if (changes.backendUrl) {
      BACKEND_URL = changes.backendUrl.newValue;
      logger.info(`Backend URL updated: ${BACKEND_URL}`);
      // 清除缓存
      visitCache.clear();
      processedUrls.clear();
      configChanged = true;
    }
    
    if (changes.config && changes.config.newValue) {
      const newConfig = changes.config.newValue;
      
      // 处理高亮设置变更
      if (newConfig.highlightVisitedLinks !== undefined) {
        const previousValue = highlightEnabled;
        highlightEnabled = Boolean(newConfig.highlightVisitedLinks);
        
        if (previousValue !== highlightEnabled) {
          logger.info(`Highlight setting updated: ${highlightEnabled}`);
          configChanged = true;
          
          // 如果关闭了高亮，立即清除
          if (!highlightEnabled) {
            removeAllHighlights();
          }
        }
      }
      
      // 更新日志级别
      if (newConfig.logLevel !== undefined) {
        currentLogLevel = Number(newConfig.logLevel);
        logger.info(`Log level updated to: ${currentLogLevel}`);
      }

      // 更新URL模式映射
      if (newConfig.urlPatternMap !== undefined) {
        const previousMap = urlPatternMap;
        urlPatternMap = newConfig.urlPatternMap;
        
        if (JSON.stringify(previousMap) !== JSON.stringify(urlPatternMap)) {
          logger.info(`URL pattern mapping updated:`, urlPatternMap);
          configChanged = true;
          
          // 清除缓存并重新处理链接
          visitCache.clear();
          processedUrls.clear();
        }
      }
    }
    
    // 如果配置改变且高亮启用，则处理链接
    if (configChanged && highlightEnabled) {
      processLinks();
    }
  });
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'HIGHLIGHT_SETTING_CHANGED') {
      const previousValue = highlightEnabled;
      highlightEnabled = Boolean(message.enabled);
      
      if (previousValue !== highlightEnabled) {
        logger.info(`Highlight setting changed via message: ${highlightEnabled}`);
        
        // 如果关闭了高亮，立即清除
        if (!highlightEnabled) {
          removeAllHighlights();
        } else {
          // 如果启用了高亮，处理链接
          processLinks();
        }
      }
    } else if (message.type === 'LOG_LEVEL_CHANGED') {
      currentLogLevel = Number(message.level);
      logger.info(`Log level changed to: ${currentLogLevel}`);
    } else if (message.type === 'URL_PATTERN_CHANGED') {
      const previousMap = urlPatternMap;
      urlPatternMap = message.patternMap;
      
      if (JSON.stringify(previousMap) !== JSON.stringify(urlPatternMap)) {
        logger.info(`URL pattern mapping changed via message:`, urlPatternMap);
        
        // 清除缓存并重新处理链接
        visitCache.clear();
        processedUrls.clear();
        if (highlightEnabled) {
          processLinks();
        }
      }
    }
    return true;
  });
  
  // 在页面卸载时清理tooltip
  window.addEventListener('beforeunload', clearTooltip);
}

// 启动
initialize(); 