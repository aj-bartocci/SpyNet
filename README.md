# SpyNet

Session-based mock server for client application development with AI integration.

## Features

- **REST API Mocking** with sequential response support
- **WebSocket Support** for both mock data and app control
- **Session Isolation** for concurrent testing
- **MCP Integration** for AI-driven development with Claude Desktop

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm run dev

# Server runs on http://localhost:8675 (default)
# Or configure with PORT=8080 npm run dev
```

## Usage

### Configure Mock Endpoint

```bash
curl -X POST http://localhost:8675/_mock/sessions/test-1/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "path": "/api/users",
    "responses": [
      { "status": 200, "body": [{"id": 1, "name": "Test User"}] }
    ]
  }'
```

### Request via Data Plane

```bash
curl http://localhost:8675/session/test-1/api/users
# Returns: [{"id": 1, "name": "Test User"}]
```

### Send WebSocket Message

```bash
curl -X POST http://localhost:8675/_mock/sessions/test-1/socket/action \
  -H "Content-Type: application/json" \
  -d '{"action": "logout", "params": {"reason": "timeout"}}'
```

## Using with Claude Desktop

SpyNet can be controlled by AI assistants via the Model Context Protocol (MCP).

### Setup

1. Build SpyNet:
   ```bash
   npm run build
   ```

2. Add to Claude Desktop config:

   **macOS:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

   **Windows:** Edit `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "spynet": {
         "command": "node",
         "args": ["/absolute/path/to/spynet/dist/mcp.js"]
       }
     }
   }
   ```

3. Restart Claude Desktop

### Usage with Claude

Ask Claude to configure your mocks:
- "Set up GET /api/users to return 3 test users"
- "Configure login to fail first, then succeed"
- "Send a WebSocket logout action to session demo"
- "Show me the request history for session test-1"

Your app connects to `http://localhost:8675` as usual.

### Available MCP Tools

- `configure_endpoint` - Set up mock API responses with sequential behavior
- `list_sessions` - View all active sessions
- `delete_session` - Clean up a session
- `list_endpoints` - See configured endpoints and call counts
- `clear_endpoints` - Remove mock configurations
- `get_request_history` - Inspect request logs
- `send_websocket_action` - Trigger app actions via WebSocket
- `send_websocket_data` - Send real-time data via WebSocket

### Troubleshooting

**Check if SpyNet is running:**
```bash
curl http://localhost:8675/_mock/sessions
```

**View MCP server logs:**
MCP logs go to stderr. Check Claude Desktop's logs or run directly:
```bash
node dist/mcp.js
```

**Port already in use:**
```bash
# Check what's using port 8675
lsof -ti:8675

# Use different port
PORT=9000 node dist/mcp.js
```

## API Reference

See [Design Document](docs/plans/2026-01-06-spynet-design.md) for complete API documentation.

## Development

```bash
# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck
```

## License

MIT
