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
// 历史记录管理器
let historyManager = null;

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
  if (!link || !link.href) {
    console.log('Invalid link element:', link);
    return;
  }
  
  console.log(`Highlighting link: ${link.href}`);
  
  // 防止重复处理
  if (link.classList.contains('history-link-highlight')) {
    console.log('Link already highlighted:', link.href);
    return;
  }
  
  // 添加高亮样式
  link.classList.add('history-link-highlight');
  link.style.color = '#9c27b0'; // 紫色
  link.style.textDecoration = 'underline';
  link.style.fontWeight = 'bold';
  
  // 添加数据属性，方便调试
  link.dataset.visitedHighlight = 'true';
  
  // 存储历史记录信息（如果有）
  if (historyRecord) {
    console.log('Storing history record for link:', link.href, historyRecord);
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
  
  console.log(`Event listeners added to link: ${link.href}`);
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
  
  if (!historyManager) {
    logger.error('HistoryManager not initialized');
    return;
  }
  
  try {
    const historyRecord = await historyManager.getHistoryRecord(link.href);
    
    if (historyRecord) {
      logger.debug(`✓ Link has been visited: ${link.href}`);
      visitCache.set(link.href, historyRecord);
      
      // 如果链接尚未高亮，可能需要刷新页面高亮
      if (!link.classList.contains('history-link-highlight')) {
        logger.debug(`Link should be highlighted: ${link.href}`);
        highlightLink(link, historyRecord);
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
  return historyManager.getHistoryRecord(url);
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
    
    if (!historyManager) {
      logger.error('HistoryManager not initialized');
      return [];
    }
    
    logger.info(`Checking ${urls.length} URLs in history...`);
    
    // 使用历史记录管理器批量查询
    const domain = window.location.hostname;
    const historyMap = await historyManager.batchGetHistoryRecords(urls, domain);
    
    // 转换为URL数组
    const matchedUrls = Array.from(historyMap.keys());
    
    // 更新缓存
    for (const [url, record] of historyMap.entries()) {
      visitCache.set(url, record);
    }
    
    logger.info(`Found ${matchedUrls.length} matches out of ${urls.length} URLs`);
    return matchedUrls;
  } catch (error) {
    logger.error('Error checking history:', error);
    return [];
  }
}


/**
 * 处理页面上所有的链接
 */
async function processLinks() {
  // 如果不启用高亮，先移除所有高亮
  if (!highlightEnabled) {
    console.log('Highlighting is disabled, removing all highlights');
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
  
  if (uniqueUrls.length === 0) {
    console.log('No valid URLs found on page');
    return;
  }
  
  // 批量检查URL，排除已处理的URL
  const newUrls = uniqueUrls.filter(url => !processedUrls.has(url));
  console.log(`${newUrls.length} new URLs to check (excluded ${uniqueUrls.length - newUrls.length} already processed)`);
  
  // 记录已处理的URL
  newUrls.forEach(url => processedUrls.add(url));
  
  // 批量检查新URL
  console.log('Checking URLs in history:', newUrls);
  const historyUrls = await checkUrlsInHistory(newUrls);
  console.log(`Found ${historyUrls.length} visited URLs`);
  
  // 高亮历史链接
  historyUrls.forEach(url => {
    const elements = urlMap.get(url) || [];
    const record = visitCache.get(url);
    console.log(`Highlighting ${elements.length} elements for URL ${url}`, record);
    elements.forEach(link => highlightLink(link, record));
  });
  
  console.log('Finished processing links');
  
  // 为所有链接添加鼠标事件监听器，以便记录所有访问状态
  addEventListenersToAllLinks();
  
  // 检查是否所有高亮链接都具有正确的事件监听器
  setTimeout(() => {
    const highlightedLinks = document.querySelectorAll('.history-link-highlight');
    console.log(`Verifying ${highlightedLinks.length} highlighted links have event listeners`);
    
    highlightedLinks.forEach(link => {
      // 再次确保事件监听器已绑定
      if (!link.onmouseover || !link.onmouseout) {
        console.log(`Fixing missing event listeners on ${link.href}`);
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
  try {
    console.log('Initializing history highlighter...');
    
    // 创建 HistoryManager 实例
    historyManager = new HistoryManager();
    await historyManager.initialize();
    
    console.log('HistoryManager initialized successfully');
    
    // 获取配置
    const config = await ConfigManager.getConfig();
    console.log('Current config:', config);
    
    // 检查是否启用了高亮功能
    if (!config.highlightVisitedLinks) {
      console.log('Highlighting is disabled in config');
      return;
    }
    
    // 开始处理页面
    processLinks();
    
    // 监听DOM变化
    observeDOMChanges();
  } catch (error) {
    console.error('Failed to initialize history highlighter:', error);
  }
}

// 启动
initialize(); 