/**
 * 统一日志系统
 * 提供格式化的日志输出和级别控制
 */

import { LOG_LEVELS, DEFAULT_CONFIG } from './constants.js';

class Logger {
  constructor(context = 'Extension') {
    this.context = context;
    this.currentLevel = LOG_LEVELS[DEFAULT_CONFIG.logLevel] || LOG_LEVELS.INFO;
  }

  /**
   * 设置日志级别
   * @param {string|number} level 日志级别
   */
  setLevel(level) {
    if (typeof level === 'string') {
      this.currentLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else if (typeof level === 'number') {
      this.currentLevel = level;
    }
  }

  /**
   * 格式化日志消息
   * @param {string} level 日志级别
   * @param {Array} args 日志参数
   * @returns {Array} 格式化后的参数
   */
  formatMessage(level, args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.context}] [${level}]`;
    return [prefix, ...args];
  }

  /**
   * 输出日志
   * @param {number} level 日志级别
   * @param {string} levelName 级别名称
   * @param {Function} consoleFn console方法
   * @param {Array} args 参数
   */
  log(level, levelName, consoleFn, ...args) {
    if (this.currentLevel <= level) {
      const formattedArgs = this.formatMessage(levelName, args);
      consoleFn.apply(console, formattedArgs);
    }
  }

  /**
   * 调试日志
   * @param {...any} args 日志参数
   */
  debug(...args) {
    this.log(LOG_LEVELS.DEBUG, 'DEBUG', console.log, ...args);
  }

  /**
   * 信息日志
   * @param {...any} args 日志参数
   */
  info(...args) {
    this.log(LOG_LEVELS.INFO, 'INFO', console.log, ...args);
  }

  /**
   * 警告日志
   * @param {...any} args 日志参数
   */
  warn(...args) {
    this.log(LOG_LEVELS.WARN, 'WARN', console.warn, ...args);
  }

  /**
   * 错误日志
   * @param {...any} args 日志参数
   */
  error(...args) {
    this.log(LOG_LEVELS.ERROR, 'ERROR', console.error, ...args);
  }

  /**
   * 创建子日志器
   * @param {string} subContext 子上下文
   * @returns {Logger} 新的日志器实例
   */
  createChild(subContext) {
    const childLogger = new Logger(`${this.context}:${subContext}`);
    childLogger.setLevel(this.currentLevel);
    return childLogger;
  }
}

// 创建默认日志器实例
export const logger = new Logger();

// 导出Logger类供其他模块使用
export { Logger }; 