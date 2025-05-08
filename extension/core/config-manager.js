/**
 * 配置管理器类
 * 负责管理扩展的配置信息
 */
export class ConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  // ... rest of the class implementation ...
}

// 将类添加到全局作用域（用于content scripts）
if (typeof window !== 'undefined') {
  window.ConfigManager = ConfigManager;
} 