/**
 * 链接高亮器
 * 负责高亮已访问的链接并显示悬浮提示
 */

// 直接定义常量，避免使用 import
const CSS_CLASSES = {
  HIGHLIGHTED_LINK: 'history-link-highlighted',
  TOOLTIP: 'history-tooltip',
  TOOLTIP_CONTENT: 'history-tooltip-content'
};

const TIME_CONSTANTS = {
  HOVER_DELAY: 150,  // 减少到150ms，让响应更快
  TOOLTIP_DURATION: 3000,
  DEBOUNCE_DELAY: 100
};

const MESSAGE_TYPES = {
  GET_CONFIG: 'get_config',
  GET_HISTORY: 'get_history'
};

const URL_PATTERNS = {
  JAVASCRIPT: /^javascript:/i,
  MAILTO: /^mailto:/i,
  TEL: /^tel:/i,
  HASH_ONLY: /^#/,
  DATA: /^data:/i
};

class LinkHighlighter {
  constructor() {
    this.initialized = false;
    this.config = null;
    this.visitCache = new Map();
    this.processedUrls = new Set();
    this.currentTooltip = null;
    this.tooltipTimer = null;
    this.hoverTimer = null;
    this.observer = null;
    this.eventHandlers = new Map();
    this.processNewLinksTimer = null;
  }

  /**
   * 初始化链接高亮器
   */
  async initialize() {
    try {
      console.log('[LinkHighlighter] Initializing...');

      // 获取配置
      await this.loadConfig();

      // 如果高亮功能被禁用，直接返回
      if (!this.config.highlightVisitedLinks) {
        console.log('[LinkHighlighter] Highlighting disabled in config');
        return;
      }

      // 注入样式
      this.injectStyles();

      // 处理现有链接
      await this.processExistingLinks();

      // 监听DOM变化
      this.observeDOMChanges();

      // 监听配置变化
      this.listenForConfigChanges();

      this.initialized = true;
      console.log('[LinkHighlighter] Initialized successfully');

    } catch (error) {
      console.error('[LinkHighlighter] Failed to initialize:', error);
    }
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      console.log('[LinkHighlighter] Loading config...');
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_CONFIG
      });

      console.log('[LinkHighlighter] Config response:', response);

      if (response && response.success) {
        this.config = response.data;
        console.log('[LinkHighlighter] Config loaded:', this.config);
      } else {
        throw new Error(response?.error || 'Failed to get config');
      }
    } catch (error) {
      console.error('[LinkHighlighter] Failed to load config:', error);
      // 使用默认配置
      this.config = {
        highlightVisitedLinks: true,
        enableTooltips: true
      };
      console.log('[LinkHighlighter] Using default config:', this.config);
    }
  }

  /**
   * 注入样式
   */
  injectStyles() {
    if (document.getElementById('link-highlighter-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'link-highlighter-styles';
    style.textContent = `
      .${CSS_CLASSES.HIGHLIGHTED_LINK} {
        border: 2px solid #9c27b0 !important;
        border-radius: 3px !important;
        background-color: rgba(156, 39, 176, 0.1) !important;
        transition: all 0.2s ease !important;
      }

      .${CSS_CLASSES.HIGHLIGHTED_LINK}:hover {
        background-color: rgba(156, 39, 176, 0.2) !important;
        box-shadow: 0 2px 8px rgba(156, 39, 176, 0.3) !important;
      }

      .${CSS_CLASSES.TOOLTIP} {
        position: fixed !important;
        z-index: 10000 !important;
        background: #333 !important;
        color: white !important;
        padding: 8px 12px !important;
        border-radius: 6px !important;
        font-size: 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        max-width: 300px !important;
        word-wrap: break-word !important;
        opacity: 0 !important;
        transition: opacity 0.2s ease !important;
        pointer-events: none !important;
        display: block !important;
        visibility: visible !important;
      }

      .${CSS_CLASSES.TOOLTIP}.show {
        opacity: 1 !important;
      }

      .${CSS_CLASSES.TOOLTIP_CONTENT} {
        line-height: 1.4;
      }

      .${CSS_CLASSES.TOOLTIP} .tooltip-time {
        font-weight: bold;
        margin-bottom: 4px;
        color: #9c27b0;
      }

      .${CSS_CLASSES.TOOLTIP} .tooltip-url {
        font-size: 11px;
        opacity: 0.8;
        word-break: break-all;
      }
    `;

    document.head.appendChild(style);
    console.log('[LinkHighlighter] Styles injected');
  }

  /**
   * 处理现有链接
   */
  async processExistingLinks() {
    const links = this.getAllValidLinks();
    console.log(`[LinkHighlighter] Found ${links.length} valid links`);

    if (links.length === 0) {
      return;
    }

    // 提取URL
    const urls = links.map(link => link.href).filter(Boolean);
    const uniqueUrls = [...new Set(urls)];

    console.log(`[LinkHighlighter] Checking ${uniqueUrls.length} unique URLs`);

    // 批量查询历史记录
    const visitedUrls = await this.batchCheckHistory(uniqueUrls);

    // 高亮已访问的链接
    this.highlightVisitedLinks(links, visitedUrls);

    // 为所有链接添加事件监听器
    this.addEventListenersToLinks(links);
  }

  /**
   * 获取所有有效链接
   */
  getAllValidLinks() {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.filter(link => this.isValidLink(link));
  }

  /**
   * 检查链接是否有效
   */
  isValidLink(link) {
    if (!link || !link.href) {
      return false;
    }

    const href = link.href;

    // 检查无效URL模式
    for (const pattern of Object.values(URL_PATTERNS)) {
      if (pattern.test(href)) {
        return false;
      }
    }

    try {
      const url = new URL(href);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  /**
   * 批量检查历史记录
   */
  async batchCheckHistory(urls) {
    try {
      console.log('[LinkHighlighter] Requesting history for URLs:', urls);
      
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_HISTORY,
        data: {
          urls: urls,
          domain: window.location.hostname
        }
      });

      console.log('[LinkHighlighter] History response:', response);

      if (response && response.success) {
        console.log('[LinkHighlighter] History data:', response.data);
        
        const historyMap = new Map(Object.entries(response.data || {}));
        console.log('[LinkHighlighter] History map size:', historyMap.size);
        
        // 更新缓存
        for (const [url, record] of historyMap) {
          this.visitCache.set(url, record);
        }

        return historyMap;
      } else {
        console.error('[LinkHighlighter] Failed to check history:', response?.error || 'No response');
        return new Map();
      }
    } catch (error) {
      console.error('[LinkHighlighter] Error checking history:', error);
      return new Map();
    }
  }

  /**
   * 高亮已访问的链接
   */
  highlightVisitedLinks(links, visitedUrls) {
    let highlightedCount = 0;

    for (const link of links) {
      if (visitedUrls.has(link.href)) {
        this.highlightLink(link);
        highlightedCount++;
      }
    }

    console.log(`[LinkHighlighter] Highlighted ${highlightedCount} visited links`);
  }

  /**
   * 高亮单个链接
   */
  highlightLink(link) {
    if (link.classList.contains(CSS_CLASSES.HIGHLIGHTED_LINK)) {
      return;
    }

    link.classList.add(CSS_CLASSES.HIGHLIGHTED_LINK);
    link.dataset.visitedHighlight = 'true';
  }

  /**
   * 为链接添加事件监听器
   */
  addEventListenersToLinks(links) {
    for (const link of links) {
      this.addEventListenersToLink(link);
    }
  }

  /**
   * 为单个链接添加事件监听器
   */
  addEventListenersToLink(link) {
    // 避免重复添加
    if (this.eventHandlers.has(link)) {
      return;
    }

    const mouseOverHandler = (event) => this.handleMouseOver(event);
    const mouseOutHandler = (event) => this.handleMouseOut(event);

    link.addEventListener('mouseover', mouseOverHandler);
    link.addEventListener('mouseout', mouseOutHandler);

    // 保存处理器引用以便后续移除
    this.eventHandlers.set(link, {
      mouseover: mouseOverHandler,
      mouseout: mouseOutHandler
    });
  }

  /**
   * 处理鼠标悬停
   */
  handleMouseOver(event) {
    const link = event.currentTarget;
    
    console.log('[LinkHighlighter] Mouse over link:', link.href);

    // 清除之前的定时器
    this.clearHoverTimer();

    // 设置延迟显示tooltip
    this.hoverTimer = setTimeout(async () => {
      await this.handleLinkHover(link, event);
    }, TIME_CONSTANTS.HOVER_DELAY);
  }

  /**
   * 处理链接悬停逻辑
   */
  async handleLinkHover(link, event) {
    if (!link || !link.href) {
      return;
    }

    console.log('[LinkHighlighter] Handling hover for:', link.href);

    // 保存链接位置信息，避免异步操作后event失效
    const linkRect = link.getBoundingClientRect();
    const linkPosition = {
      left: linkRect.left + window.scrollX,
      top: linkRect.top + window.scrollY,
      bottom: linkRect.bottom + window.scrollY,
      width: linkRect.width,
      height: linkRect.height
    };

    // 首先检查链接是否已被访问
    let historyRecord = this.visitCache.get(link.href);
    
    if (!historyRecord) {
      // 如果缓存中没有，查询历史记录
      console.log('[LinkHighlighter] No cached record, querying history...');
      historyRecord = await this.getSingleHistoryRecord(link.href);
    }

    if (historyRecord) {
      console.log('[LinkHighlighter] Link has been visited:', historyRecord);
      
      // 如果链接已被访问但还没高亮，现在高亮它
      if (!link.classList.contains(CSS_CLASSES.HIGHLIGHTED_LINK)) {
        this.highlightLink(link);
        console.log('[LinkHighlighter] Link highlighted on hover');
      }

      // 显示tooltip（如果启用）
      if (this.config.enableTooltips) {
        this.createTooltip(link, historyRecord, linkPosition);
      }
    } else {
      console.log('[LinkHighlighter] Link has not been visited');
    }
  }

  /**
   * 处理鼠标移出
   */
  handleMouseOut(event) {
    this.clearHoverTimer();
    this.hideTooltip();
  }



  /**
   * 获取单个历史记录
   */
  async getSingleHistoryRecord(url) {
    try {
      console.log('[LinkHighlighter] Requesting single history record for:', url);
      
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_HISTORY,
        data: { 
          urls: [url],  // 使用数组格式，和批量查询保持一致
          domain: window.location.hostname 
        }
      });

      console.log('[LinkHighlighter] Single history response:', response);

      if (response && response.success) {
        const historyData = response.data;
        
        // 检查返回的数据格式
        if (historyData && typeof historyData === 'object') {
          // 如果是对象格式，查找对应的URL
          const record = historyData[url];
          if (record) {
            this.visitCache.set(url, record);
            console.log('[LinkHighlighter] Found and cached single history record:', record);
            return record;
          }
        }
      }

      console.log('[LinkHighlighter] No history record found for:', url);
      return null;
    } catch (error) {
      console.error('[LinkHighlighter] Error getting single history record:', error);
      return null;
    }
  }

  /**
   * 创建tooltip
   */
  createTooltip(link, historyRecord, linkPosition) {
    console.log('[LinkHighlighter] Creating tooltip for:', link.href, historyRecord);

    // 只为已访问的链接显示tooltip
    if (!historyRecord) {
      console.log('[LinkHighlighter] No history record, skipping tooltip');
      return;
    }

    // 移除现有tooltip
    this.hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = CSS_CLASSES.TOOLTIP;

    const content = document.createElement('div');
    content.className = CSS_CLASSES.TOOLTIP_CONTENT;

    // 添加访问时间
    const timeElement = document.createElement('div');
    timeElement.className = 'tooltip-time';
    
    if (historyRecord.timestamp) {
      const visitTime = new Date(historyRecord.timestamp);
      timeElement.textContent = `Visited: ${visitTime.toLocaleString()}`;
    } else {
      timeElement.textContent = 'Previously visited';
    }
    
    content.appendChild(timeElement);

    // 添加标题信息（如果有）
    if (historyRecord.title) {
      const titleElement = document.createElement('div');
      titleElement.className = 'tooltip-title';
      titleElement.textContent = historyRecord.title;
      titleElement.style.fontWeight = 'bold';
      titleElement.style.marginBottom = '4px';
      content.appendChild(titleElement);
    }

    // 添加URL信息
    const urlElement = document.createElement('div');
    urlElement.className = 'tooltip-url';
    urlElement.textContent = link.href;
    content.appendChild(urlElement);

    tooltip.appendChild(content);

    // 添加到页面
    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;

    // 定位tooltip - 使用保存的位置信息
    this.positionTooltip(tooltip, linkPosition);

    console.log('[LinkHighlighter] Tooltip created and added to DOM');

    // 显示动画 - 使用 setTimeout 确保 DOM 更新完成
    setTimeout(() => {
      tooltip.classList.add('show');
      console.log('[LinkHighlighter] Tooltip show class added, should be visible now');
      
      // 调试：检查 tooltip 的实际样式
      const computedStyle = window.getComputedStyle(tooltip);
      console.log('[LinkHighlighter] Tooltip computed styles:', {
        opacity: computedStyle.opacity,
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        position: computedStyle.position,
        zIndex: computedStyle.zIndex,
        background: computedStyle.background,
        left: computedStyle.left,
        top: computedStyle.top
      });
      
      // 检查CSS规则是否被正确应用
      const hasShowClass = tooltip.classList.contains('show');
      console.log('[LinkHighlighter] Tooltip CSS check:', {
        hasShowClass,
        className: tooltip.className,
        expectedOpacity: hasShowClass ? '1' : '0',
        actualOpacity: computedStyle.opacity
      });
      
      // 如果样式不正确，尝试强制设置
      if (computedStyle.opacity !== '1') {
        console.log('[LinkHighlighter] Forcing tooltip visibility...');
        tooltip.style.opacity = '1';
        tooltip.style.display = 'block';
        tooltip.style.visibility = 'visible';
      }
    }, 10);

    // 设置自动隐藏
    this.tooltipTimer = setTimeout(() => {
      this.hideTooltip();
    }, TIME_CONSTANTS.TOOLTIP_DURATION);
  }

  /**
   * 定位tooltip
   */
  positionTooltip(tooltip, linkPosition) {
    // tooltip已经在DOM中，直接获取其尺寸
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = linkPosition.left;
    let top = linkPosition.bottom + 5;

    console.log('[LinkHighlighter] Initial positioning:', {
      linkPosition,
      tooltipSize: { width: tooltipRect.width, height: tooltipRect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY }
    });

    // 确保tooltip不超出视窗右边
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 10;
      console.log('[LinkHighlighter] Adjusted left to avoid overflow:', left);
    }

    // 确保tooltip不超出视窗下边
    if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
      top = linkPosition.top - tooltipRect.height - 5;
      console.log('[LinkHighlighter] Moved tooltip above link:', top);
    }

    // 确保tooltip不会出现在负坐标
    const finalLeft = Math.max(10, left);
    const finalTop = Math.max(10, top);

    tooltip.style.left = `${finalLeft}px`;
    tooltip.style.top = `${finalTop}px`;
    
    console.log('[LinkHighlighter] Final tooltip position:', { 
      left: finalLeft, 
      top: finalTop,
      adjustedLeft: finalLeft !== left,
      adjustedTop: finalTop !== top
    });
  }

  /**
   * 隐藏tooltip
   */
  hideTooltip() {
    if (this.currentTooltip) {
      this.currentTooltip.classList.remove('show');
      
      setTimeout(() => {
        if (this.currentTooltip && this.currentTooltip.parentNode) {
          this.currentTooltip.parentNode.removeChild(this.currentTooltip);
        }
        this.currentTooltip = null;
      }, 200);
    }

    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
  }

  /**
   * 清除悬停定时器
   */
  clearHoverTimer() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  /**
   * 监听DOM变化
   */
  observeDOMChanges() {
    this.observer = new MutationObserver((mutations) => {
      let hasNewLinks = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'A' && this.isValidLink(node)) {
                hasNewLinks = true;
              } else {
                const links = node.querySelectorAll && node.querySelectorAll('a[href]');
                if (links && links.length > 0) {
                  hasNewLinks = true;
                }
              }
            }
          }
        }
      }

      if (hasNewLinks) {
        // 防抖处理
        this.debounceProcessNewLinks();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[LinkHighlighter] DOM observer started');
  }

  /**
   * 防抖处理新链接
   */
  debounceProcessNewLinks() {
    if (this.processNewLinksTimer) {
      clearTimeout(this.processNewLinksTimer);
    }

    this.processNewLinksTimer = setTimeout(() => {
      this.processExistingLinks();
    }, TIME_CONSTANTS.DEBOUNCE_DELAY);
  }

  /**
   * 监听配置变化
   */
  listenForConfigChanges() {
    // 这里可以添加配置变化的监听逻辑
    // 由于content script的限制，可能需要通过消息传递来实现
  }

  /**
   * 移除所有高亮
   */
  removeAllHighlights() {
    const highlightedLinks = document.querySelectorAll(`.${CSS_CLASSES.HIGHLIGHTED_LINK}`);
    
    for (const link of highlightedLinks) {
      link.classList.remove(CSS_CLASSES.HIGHLIGHTED_LINK);
      delete link.dataset.visitedHighlight;

      // 移除事件监听器
      const handlers = this.eventHandlers.get(link);
      if (handlers) {
        link.removeEventListener('mouseover', handlers.mouseover);
        link.removeEventListener('mouseout', handlers.mouseout);
        this.eventHandlers.delete(link);
      }
    }

    this.visitCache.clear();
    this.processedUrls.clear();
    this.hideTooltip();

    console.log('[LinkHighlighter] All highlights removed');
  }

  /**
   * 销毁高亮器
   */
  destroy() {
    this.removeAllHighlights();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.clearHoverTimer();
    this.hideTooltip();

    // 移除样式
    const styleElement = document.getElementById('link-highlighter-styles');
    if (styleElement) {
      styleElement.remove();
    }

    this.initialized = false;
    console.log('[LinkHighlighter] Destroyed');
  }
}

// 创建并初始化高亮器
const linkHighlighter = new LinkHighlighter();

// 等待DOM加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    linkHighlighter.initialize();
  });
} else {
  linkHighlighter.initialize();
} 