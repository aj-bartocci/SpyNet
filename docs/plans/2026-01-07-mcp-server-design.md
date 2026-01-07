# SpyNet MCP Server Design

**Date:** 2026-01-07
**Status:** Design Phase

## Overview

Add Model Context Protocol (MCP) server to SpyNet, enabling AI assistants like Claude Desktop to programmatically configure mock APIs and control WebSocket messages during development.

## Goals

- Allow Claude to configure mock endpoints via MCP tools
- Enable AI-assisted development workflow: Claude sets up mocks, developer tests their app
- Run HTTP server and MCP server in single process sharing state
- Provide both local development and npm distribution paths

## Architecture

### Single Process Design

When started via `node dist/mcp.js`, SpyNet runs:

1. **HTTP/WebSocket server** on port 8675 (configurable via PORT env var)
2. **MCP server** on stdio (stdin/stdout for Claude Desktop communication)
3. **Shared SessionManager instance** - both servers see identical state

```
Claude Desktop (MCP client)
  ↓ stdio (JSON-RPC)
MCP Server (src/mcp/server.ts)
  ↓ direct function calls
SessionManager/EndpointRegistry (shared state)
  ↑ HTTP requests
Developer's App (http://localhost:8675)
```

### File Structure

```
src/mcp/
  server.ts      - MCP server initialization, tool registration
  tools.ts       - Tool handler implementations
  mcp.ts         - Entry point: starts HTTP + MCP servers
```

## MCP Tools API

### Session Management

**`list_sessions()`**
- Returns: Array of session metadata (id, createdAt, lastActivityAt, connected)
- Use case: See active test sessions

**`delete_session(sessionId: string)`**
- Returns: Success boolean
- Use case: Clean up after testing

### Endpoint Configuration

**`configure_endpoint(args)`**
- Parameters:
  - `sessionId: string` - Session identifier
  - `method: string` - HTTP method (GET, POST, etc.)
  - `path: string` - Endpoint path (e.g., "/api/users")
  - `responses: ResponseConfig[]` - Array of responses for sequential behavior
- Returns: Success status
- Use case: Set up mock API responses

**`list_endpoints(sessionId: string)`**
- Returns: Array of configured endpoints with call counts
- Use case: Inspect current mock configuration

**`clear_endpoints(sessionId: string, method?: string, path?: string)`**
- Parameters: sessionId required, method/path optional for selective clearing
- Returns: Success status
- Use case: Reset mocks between test runs

### Request Inspection

**`get_request_history(sessionId: string, limit?: number)`**
- Parameters: sessionId, optional limit (default: 100)
- Returns: Array of request records with method, path, status, timestamp, configured flag
- Use case: Verify app made expected requests

### WebSocket Control

**`send_websocket_action(sessionId: string, action: string, params?: any)`**
- Sends action message: `{type: "action", action, params}`
- Returns: Success status (404 if not connected)
- Use case: Trigger app behaviors like logout, navigation

**`send_websocket_data(sessionId: string, data: any)`**
- Sends data message: `{type: "data", data}`
- Returns: Success status (404 if not connected)
- Use case: Simulate real-time events like chat messages, notifications

## Implementation Details

### Tool Handler Pattern

```typescript
// src/mcp/tools.ts
export function createTools(sessionManager: SessionManager, wsHub: WebSocketHub) {
  return {
    configure_endpoint: async (args) => {
      try {
        // Validation
        if (!args.sessionId || !args.method || !args.path) {
          return { success: false, error: "Missing required fields" };
        }

        // Implementation
        const session = sessionManager.getOrCreate(args.sessionId);
        const key = `${args.method.toUpperCase()}:${args.path}`;
        session.endpoints.set(key, {
          method: args.method,
          path: args.path,
          responses: args.responses,
          callCount: 0
        });

        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    // ... other tools
  };
}
```

### MCP Server Setup

```typescript
// src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export async function createMCPServer(sessionManager, wsHub) {
  const server = new Server({ name: 'spynet', version: '0.1.0' });
  const tools = createTools(sessionManager, wsHub);

  // Register tool list
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'configure_endpoint',
        description: 'Configure mock endpoint with sequential responses',
        inputSchema: { /* JSON Schema */ }
      },
      // ... other tool definitions
    ]
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const handler = tools[toolName];

    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const result = await handler(request.params.arguments);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  return server;
}
```

### Entry Point

```typescript
// src/mcp.ts
import { createServer } from './server.js';
import { createMCPServer } from './mcp/server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const PORT = parseInt(process.env.PORT ?? '8675', 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL ?? '3600000', 10);

async function main() {
  try {
    // Start HTTP server
    const httpServer = await createServer({ port: PORT, sessionTTL: SESSION_TTL });

    // Get shared managers
    const sessionManager = httpServer.sessionManager;
    const wsHub = httpServer.wsHub;

    // Start MCP server
    const mcpServer = await createMCPServer(sessionManager, wsHub);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    // Log to stderr (stdout reserved for MCP protocol)
    console.error(`🕵️  SpyNet MCP server running`);
    console.error(`   HTTP/WebSocket: http://localhost:${PORT}`);
    console.error(`   MCP: stdio`);
    console.error(`   Session TTL: ${SESSION_TTL / 1000}s`);
  } catch (error) {
    console.error('Failed to start SpyNet MCP server:', error);
    process.exit(1);
  }
}

main();
```

## Error Handling

All tool handlers follow consistent error pattern:

```typescript
{
  success: true,
  data?: any  // Optional result data
}

// OR

{
  success: false,
  error: string  // Descriptive error message
}
```

**Validation errors:**
- Missing required fields
- Invalid input types
- Empty arrays where data expected

**Runtime errors:**
- Session not found (auto-create for most operations)
- WebSocket not connected (404 for send operations)
- Internal errors (caught and wrapped)

**All logs use `console.error()`** since stdout is reserved for MCP protocol.

## Testing Strategy

### Unit Tests
```typescript
// Test tool handlers directly
describe('MCP Tools', () => {
  let sessionManager: SessionManager;
  let wsHub: WebSocketHub;
  let tools: any;

  beforeEach(() => {
    sessionManager = new SessionManager({ ttl: 3600000 });
    wsHub = new WebSocketHub();
    tools = createTools(sessionManager, wsHub);
  });

  it('should configure endpoint', async () => {
    const result = await tools.configure_endpoint({
      sessionId: 'test',
      method: 'GET',
      path: '/api/users',
      responses: [{ status: 200, body: [] }]
    });

    expect(result.success).toBe(true);
  });

  it('should validate required fields', async () => {
    const result = await tools.configure_endpoint({ sessionId: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required fields');
  });
});
```

### Integration Tests
- Use MCP SDK test client to verify protocol compliance
- Test full request/response cycle
- Verify tool registration and discovery

### Manual Testing
1. Build project: `npm run build`
2. Add to Claude Desktop config
3. Restart Claude Desktop
4. Use natural language to test: "Configure /api/users to return 3 test users"

## Usage

### Local Development

Add to Claude Desktop config (macOS):
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "spynet": {
      "command": "node",
      "args": ["/absolute/path/to/spynet/dist/mcp.js"]
    }
  }
}
```

### NPM Distribution (Future)

After publishing to npm:

```json
{
  "mcpServers": {
    "spynet": {
      "command": "npx",
      "args": ["-y", "spynet"]
    }
  }
}
```

Add to `package.json`:
```json
{
  "bin": {
    "spynet": "./dist/mcp.js"
  }
}
```

### Environment Variables

- `PORT` - HTTP server port (default: 8675)
- `SESSION_TTL` - Session timeout in ms (default: 3600000 = 1 hour)

## Example Workflow

1. **Developer:** Adds SpyNet to Claude Desktop config, restarts Claude
2. **Developer:** "I need to test my login flow"
3. **Claude:** Uses `configure_endpoint` to set up POST /api/login with sequential responses:
   - First call: `{status: 500, body: {error: "Server error"}}`
   - Second call: `{status: 200, body: {token: "abc123"}}`
4. **Developer:** Runs app, attempts login twice
5. **Claude:** Uses `get_request_history` to verify behavior
6. **Claude:** "I see your app called /api/login twice - first got 500 error, second got 200 success with token ✓"

## Dependencies

Add to package.json:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

## Documentation Updates

### README.md additions:

**MCP Server Setup**
```markdown
## Using with Claude Desktop

SpyNet can be controlled by AI assistants via the Model Context Protocol (MCP).

### Setup

1. Build SpyNet:
   ```bash
   npm run build
   ```

2. Add to Claude Desktop config:
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

### Usage

Ask Claude to configure your mocks:
- "Set up GET /api/users to return 3 test users"
- "Configure login to fail first, then succeed"
- "Send a WebSocket logout action to session demo"
- "Show me the request history for session test-1"

Your app connects to `http://localhost:8675` as usual.
```

### Troubleshooting section:
- Check stderr logs for SpyNet startup messages
- Verify port 8675 not in use: `lsof -ti:8675`
- Test HTTP server directly: `curl http://localhost:8675/_mock/sessions`

## Migration Notes

### Changes to existing code:

**src/server.ts:**
- Export `sessionManager` and `wsHub` on server instance for MCP access
- Change default PORT from 8080 to 8675

**src/index.ts:**
- Update default PORT to 8675
- Update console output

**package.json:**
- Add `@modelcontextprotocol/sdk` dependency
- Add `bin` field for npm distribution
- Update description to mention MCP support

## Success Criteria

- ✅ Claude can configure mock endpoints via MCP
- ✅ HTTP server and MCP server share state
- ✅ WebSocket actions can be triggered via MCP
- ✅ Request history is accessible via MCP
- ✅ All MCP tools handle errors gracefully
- ✅ Works with Claude Desktop config (local path)
- ✅ Logs go to stderr, not stdout
- ✅ Unit tests for all tool handlers
- ✅ README documents MCP setup

## Future Enhancements

- Publish to npm for easier distribution
- Add resource support (sessions as MCP resources)
- Prompt templates for common mock scenarios
- Session templates (e.g., "REST API", "Chat App")
