/**
 * 简单的事件发射器
 * 用于模块间的事件通信
 */

export class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  /**
   * 添加事件监听器
   * @param {string} event 事件名称
   * @param {Function} listener 监听器函数
   * @returns {EventEmitter} 返回自身以支持链式调用
   */
  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(listener);
    return this;
  }

  /**
   * 添加一次性事件监听器
   * @param {string} event 事件名称
   * @param {Function} listener 监听器函数
   * @returns {EventEmitter} 返回自身以支持链式调用
   */
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.on(event, onceWrapper);
  }

  /**
   * 移除事件监听器
   * @param {string} event 事件名称
   * @param {Function} listener 监听器函数
   * @returns {EventEmitter} 返回自身以支持链式调用
   */
  off(event, listener) {
    if (!this.events.has(event)) {
      return this;
    }

    const listeners = this.events.get(event);
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.events.delete(event);
    }

    return this;
  }

  /**
   * 发射事件
   * @param {string} event 事件名称
   * @param {...any} args 事件参数
   * @returns {boolean} 是否有监听器处理了事件
   */
  emit(event, ...args) {
    if (!this.events.has(event)) {
      return false;
    }

    const listeners = this.events.get(event).slice(); // 复制数组以避免在迭代时修改
    for (const listener of listeners) {
      try {
        listener.apply(this, args);
      } catch (error) {
        console.error(`Error in event listener for '${event}':`, error);
      }
    }

    return true;
  }

  /**
   * 移除所有监听器
   * @param {string} [event] 可选的事件名称，如果不提供则移除所有事件的监听器
   * @returns {EventEmitter} 返回自身以支持链式调用
   */
  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  /**
   * 获取事件的监听器数量
   * @param {string} event 事件名称
   * @returns {number} 监听器数量
   */
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).length : 0;
  }

  /**
   * 获取所有事件名称
   * @returns {string[]} 事件名称数组
   */
  eventNames() {
    return Array.from(this.events.keys());
  }
} 