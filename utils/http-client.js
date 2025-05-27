import { Logger } from './logger.js';
import { CONSTANTS } from './constants.js';

const logger = Logger.create('HttpClient');

export class HttpClient {
    constructor(baseURL = '', options = {}) {
        this.baseURL = baseURL;
        this.timeout = options.timeout || CONSTANTS.HTTP.TIMEOUT;
        this.maxRetries = options.maxRetries || CONSTANTS.HTTP.MAX_RETRIES;
        this.retryDelay = options.retryDelay || CONSTANTS.HTTP.RETRY_DELAY;
    }

    async request(url, options = {}) {
        const fullUrl = this.baseURL + url;
        const requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                logger.debug(`HTTP ${requestOptions.method} ${fullUrl} (attempt ${attempt + 1})`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                
                const response = await fetch(fullUrl, {
                    ...requestOptions,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                logger.debug(`HTTP ${requestOptions.method} ${fullUrl} success`);
                return data;
                
            } catch (error) {
                lastError = error;
                logger.warn(`HTTP ${requestOptions.method} ${fullUrl} failed (attempt ${attempt + 1}):`, error.message);
                
                if (attempt < this.maxRetries) {
                    await this.delay(this.retryDelay * Math.pow(2, attempt));
                }
            }
        }
        
        logger.error(`HTTP ${requestOptions.method} ${fullUrl} failed after ${this.maxRetries + 1} attempts`);
        throw lastError;
    }

    async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }

    async post(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }

    async healthCheck(endpoint = '/health') {
        try {
            await this.get(endpoint);
            return true;
        } catch (error) {
            logger.warn('Health check failed:', error.message);
            return false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
} 