# Browser History Manager Extension

A modern Chrome extension for managing browser history with advanced features including link highlighting, backend synchronization, and intelligent caching.

## Features

- **Automatic History Reporting**: Automatically sync browsing history to a backend server
- **Link Highlighting**: Visually highlight previously visited links on web pages
- **Smart Tooltips**: Show visit timestamps and details on hover
- **Intelligent Caching**: Local caching with automatic expiration and cleanup
- **Retry Mechanism**: Automatic retry for failed requests with exponential backoff
- **Configurable Settings**: Comprehensive settings panel for customization
- **Notification System**: Optional notifications for sync failures
- **Health Monitoring**: Backend health checks and status monitoring

## Architecture

### Core Components

#### 1. Utils Layer (`utils/`)
- **constants.js**: Centralized constants and configuration
- **logger.js**: Unified logging system with level control
- **config-manager.js**: Configuration management with validation
- **event-emitter.js**: Event system for inter-module communication
- **http-client.js**: HTTP client with retry and timeout support
- **db.js**: IndexedDB wrapper for local data storage

#### 2. Core Layer (`core/`)
- **history-manager.js**: Main history management logic

#### 3. Background Service (`background/`)
- **background.js**: Service worker for background tasks

#### 4. Content Scripts (`content/`)
- **link-highlighter.js**: Link highlighting and tooltip functionality

#### 5. UI Components (`popup/`, `options/`)
- Popup interface for quick settings
- Options page for detailed configuration

## Installation

1. Clone or download the extension files
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

## Configuration

### Backend URL
Configure the backend server URL in the options page. Default: `http://localhost:8080`

### Available Settings
- **Backend URL**: Server endpoint for history synchronization
- **Link Highlighting**: Enable/disable visual link highlighting
- **Tooltips**: Show/hide hover tooltips with visit information
- **Notifications**: Enable/disable failure notifications
- **Cache Expiration**: How long to keep cached data (default: 24 hours)
- **Retry Settings**: Configure retry attempts and intervals
- **Log Level**: Control logging verbosity (DEBUG, INFO, WARN, ERROR)

## API Integration

The extension expects a REST API with the following endpoints:

### GET /api/health
Health check endpoint
```json
Response: { "status": "ok" }
```

### GET /api/history
Query history records
```
Query Parameters:
- keyword: URL to search for
- domain: Filter by domain
- pageSize: Number of results (default: 100)
```

```json
Response: {
  "items": [
    {
      "url": "https://example.com",
      "timestamp": "2023-01-01T00:00:00Z",
      "title": "Example Page"
    }
  ]
}
```

### POST /api/history
Submit new history record
```json
Request: {
  "url": "https://example.com",
  "timestamp": "2023-01-01T00:00:00Z",
  "domain": "example.com",
  "title": "Example Page",
  "visitCount": 1
}
```

## Development

### Project Structure
```
extension/
├── manifest.json           # Extension manifest
├── background/
│   └── background.js       # Service worker
├── content/
│   └── link-highlighter.js # Content script
├── core/
│   └── history-manager.js  # Core business logic
├── utils/
│   ├── constants.js        # Constants and config
│   ├── logger.js          # Logging system
│   ├── config-manager.js  # Configuration management
│   ├── event-emitter.js   # Event system
│   ├── http-client.js     # HTTP client
│   └── db.js              # Database management
├── popup/
│   ├── popup.html         # Popup interface
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
└── options/
    ├── options.html       # Options page
    ├── options.js         # Options logic
    └── options.css        # Options styles
```

### Key Design Principles

1. **Modular Architecture**: Clear separation of concerns with well-defined interfaces
2. **Error Handling**: Comprehensive error handling with graceful degradation
3. **Performance**: Efficient caching and batching strategies
4. **Configurability**: All behavior configurable through settings
5. **Extensibility**: Easy to add new features and modify existing ones
6. **Standards Compliance**: Follows Chrome extension best practices

### Event System

The extension uses a custom event system for inter-module communication:

```javascript
// Listen for events
configManager.on(EVENTS.CONFIG_UPDATED, (event) => {
  console.log('Config updated:', event.newConfig);
});

// Emit events
historyManager.emit(EVENTS.HISTORY_UPDATED, { type: 'reported', record });
```

### Message Passing

Communication between different parts of the extension:

```javascript
// From content script to background
chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.GET_HISTORY,
  data: { urls: ['https://example.com'] }
});

// From popup to background
chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.UPDATE_CONFIG,
  data: { backendUrl: 'https://new-server.com' }
});
```

## Troubleshooting

### Common Issues

1. **Links not highlighting**
   - Check if highlighting is enabled in settings
   - Verify backend connectivity
   - Check browser console for errors

2. **History not syncing**
   - Verify backend URL is correct
   - Check network connectivity
   - Review failed requests in storage

3. **Performance issues**
   - Adjust cache expiration settings
   - Reduce batch size for large datasets
   - Check log level (avoid DEBUG in production)

### Debug Mode

Enable debug logging by setting log level to "DEBUG" in options:
1. Open extension options
2. Set "Log Level" to "DEBUG"
3. Check browser console for detailed logs

### Storage Management

The extension uses IndexedDB for local storage:
- History cache: Stores frequently accessed records
- Failed requests: Queues failed sync attempts
- Configuration: Stores user settings

Clear storage if needed:
```javascript
// In browser console
chrome.runtime.sendMessage({
  type: 'clear_cache'
});
```

## Security Considerations

- All HTTP requests include proper headers and validation
- User data is stored locally and only sent to configured backend
- No third-party analytics or tracking
- Minimal required permissions

## Browser Compatibility

- Chrome 88+
- Manifest V3 compatible
- Modern JavaScript features (ES2020+)

## License

This project is licensed under the MIT License.

## Contributing

1. Follow the existing code style and architecture
2. Add appropriate error handling and logging
3. Update documentation for new features
4. Test thoroughly across different scenarios
5. Ensure backward compatibility when possible 