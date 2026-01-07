# MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Model Context Protocol (MCP) server to SpyNet enabling AI assistants to configure mock APIs and control WebSocket messages.

**Architecture:** Single process running both HTTP server (port 8675) and MCP server (stdio) sharing SessionManager/WebSocketHub state. MCP tools wrap existing functionality with AI-friendly interface.

**Tech Stack:** Node.js, TypeScript, @modelcontextprotocol/sdk, Fastify (existing)

---

## Task 1: Update Dependencies and Port Configuration

**Files:**
- Modify: `package.json`
- Modify: `src/server.ts`
- Modify: `src/index.ts`

**Step 1: Install MCP SDK**

```bash
npm install @modelcontextprotocol/sdk
```

Expected: Package installed successfully

**Step 2: Add bin field to package.json**

Edit `package.json` to add bin configuration after "main":

```json
{
  "name": "spynet",
  "version": "0.1.0",
  "description": "Session-based mock server for client app development",
  "main": "dist/index.js",
  "bin": {
    "spynet": "./dist/mcp.js"
  },
  "type": "module",
```

**Step 3: Change default port in server.ts**

Find and replace in `src/server.ts`:

Change `port: number;` interface to include default documentation.

Update the ServerConfig interface comment or add a comment near usage showing default is 8675.

**Step 4: Change default port in index.ts**

Edit `src/index.ts`, change:

```typescript
const PORT = parseInt(process.env.PORT ?? '8080', 10);
```

To:

```typescript
const PORT = parseInt(process.env.PORT ?? '8675', 10);
```

**Step 5: Expose managers in server.ts**

Add after the server creation in `createServer()` function, before `await server.listen()`:

```typescript
  // Store managers for MCP access
  server.decorate('sessionManager', sessionManager);
  server.decorate('wsHub', wsHub);
```

Note: The sessionManager decoration already exists, so add wsHub decoration only.

**Step 6: Run tests to verify no breakage**

```bash
npm test
```

Expected: All tests pass (port change is internal, tests use port 0 for dynamic allocation)

**Step 7: Commit**

```bash
git add package.json package-lock.json src/server.ts src/index.ts
git commit -m "feat: add MCP SDK dependency and change default port to 8675"
```

---

## Task 2: Create MCP Tools Module

**Files:**
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/tools.test.ts`

**Step 1: Create mcp directory**

```bash
mkdir -p src/mcp
```

**Step 2: Write test for configure_endpoint tool**

Create `src/mcp/tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTools } from './tools.js';
import { SessionManager } from '../SessionManager.js';
import { WebSocketHub } from '../WebSocketHub.js';

describe('MCP Tools', () => {
  let sessionManager: SessionManager;
  let wsHub: WebSocketHub;
  let tools: any;

  beforeEach(() => {
    sessionManager = new SessionManager({ ttl: 3600000 });
    wsHub = new WebSocketHub();
    tools = createTools(sessionManager, wsHub);
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  describe('configure_endpoint', () => {
    it('should configure endpoint successfully', async () => {
      const result = await tools.configure_endpoint({
        sessionId: 'test',
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: { users: [] } }]
      });

      expect(result.success).toBe(true);

      const session = sessionManager.getOrCreate('test');
      expect(session.endpoints.has('GET:/api/users')).toBe(true);
    });

    it('should validate required fields', async () => {
      const result = await tools.configure_endpoint({
        sessionId: 'test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should validate responses array', async () => {
      const result = await tools.configure_endpoint({
        sessionId: 'test',
        method: 'GET',
        path: '/api/test',
        responses: []
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least one response');
    });
  });

  describe('list_sessions', () => {
    it('should list all sessions', async () => {
      sessionManager.getOrCreate('session-1');
      sessionManager.getOrCreate('session-2');

      const result = await tools.list_sessions();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('session-1');
      expect(result.data[1].id).toBe('session-2');
    });

    it('should return empty array when no sessions', async () => {
      const result = await tools.list_sessions();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('delete_session', () => {
    it('should delete existing session', async () => {
      sessionManager.getOrCreate('test');

      const result = await tools.delete_session({ sessionId: 'test' });

      expect(result.success).toBe(true);
      expect(sessionManager.listSessions()).toHaveLength(0);
    });

    it('should handle non-existent session', async () => {
      const result = await tools.delete_session({ sessionId: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('list_endpoints', () => {
    it('should list configured endpoints', async () => {
      const session = sessionManager.getOrCreate('test');
      session.endpoints.set('GET:/api/users', {
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: [] }],
        callCount: 0
      });

      const result = await tools.list_endpoints({ sessionId: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].method).toBe('GET');
      expect(result.data[0].path).toBe('/api/users');
    });
  });

  describe('clear_endpoints', () => {
    it('should clear all endpoints when no method/path specified', async () => {
      const session = sessionManager.getOrCreate('test');
      session.endpoints.set('GET:/api/users', {
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: [] }],
        callCount: 0
      });

      const result = await tools.clear_endpoints({ sessionId: 'test' });

      expect(result.success).toBe(true);
      expect(session.endpoints.size).toBe(0);
    });

    it('should clear specific endpoint when method/path provided', async () => {
      const session = sessionManager.getOrCreate('test');
      session.endpoints.set('GET:/api/users', {
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: [] }],
        callCount: 0
      });
      session.endpoints.set('POST:/api/users', {
        method: 'POST',
        path: '/api/users',
        responses: [{ status: 201, body: {} }],
        callCount: 0
      });

      const result = await tools.clear_endpoints({
        sessionId: 'test',
        method: 'GET',
        path: '/api/users'
      });

      expect(result.success).toBe(true);
      expect(session.endpoints.size).toBe(1);
      expect(session.endpoints.has('POST:/api/users')).toBe(true);
    });
  });

  describe('get_request_history', () => {
    it('should return request history', async () => {
      const session = sessionManager.getOrCreate('test');
      session.requestHistory.push({
        method: 'GET',
        path: '/api/test',
        status: 200,
        timestamp: new Date(),
        configured: true,
        responseTime: 10
      });

      const result = await tools.get_request_history({ sessionId: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].method).toBe('GET');
    });

    it('should respect limit parameter', async () => {
      const session = sessionManager.getOrCreate('test');
      for (let i = 0; i < 10; i++) {
        session.requestHistory.push({
          method: 'GET',
          path: '/api/test',
          status: 200,
          timestamp: new Date(),
          configured: true,
          responseTime: 10
        });
      }

      const result = await tools.get_request_history({
        sessionId: 'test',
        limit: 5
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
    });
  });

  describe('send_websocket_action', () => {
    it('should send action to connected session', async () => {
      const mockWs = {
        send: (data: string) => {
          const msg = JSON.parse(data);
          expect(msg.type).toBe('action');
          expect(msg.action).toBe('logout');
          expect(msg.params).toEqual({ reason: 'test' });
        }
      } as any;

      wsHub.register('test', mockWs);

      const result = await tools.send_websocket_action({
        sessionId: 'test',
        action: 'logout',
        params: { reason: 'test' }
      });

      expect(result.success).toBe(true);
    });

    it('should return error when session not connected', async () => {
      const result = await tools.send_websocket_action({
        sessionId: 'test',
        action: 'logout'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active connection');
    });
  });

  describe('send_websocket_data', () => {
    it('should send data to connected session', async () => {
      const mockWs = {
        send: (data: string) => {
          const msg = JSON.parse(data);
          expect(msg.type).toBe('data');
          expect(msg.data).toEqual({ test: 'value' });
        }
      } as any;

      wsHub.register('test', mockWs);

      const result = await tools.send_websocket_data({
        sessionId: 'test',
        data: { test: 'value' }
      });

      expect(result.success).toBe(true);
    });

    it('should return error when session not connected', async () => {
      const result = await tools.send_websocket_data({
        sessionId: 'test',
        data: { test: 'value' }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active connection');
    });
  });
});
```

**Step 3: Run test to verify it fails**

```bash
npm test src/mcp/tools.test.ts
```

Expected: FAIL - Cannot find module './tools.js'

**Step 4: Write tools implementation**

Create `src/mcp/tools.ts`:

```typescript
import type { SessionManager } from '../SessionManager.js';
import type { WebSocketHub } from '../WebSocketHub.js';

export function createTools(sessionManager: SessionManager, wsHub: WebSocketHub) {
  return {
    configure_endpoint: async (args: any) => {
      try {
        const { sessionId, method, path, responses } = args;

        if (!sessionId || !method || !path) {
          return {
            success: false,
            error: 'Missing required fields: sessionId, method, path'
          };
        }

        if (!responses || !Array.isArray(responses) || responses.length === 0) {
          return {
            success: false,
            error: 'Must provide at least one response'
          };
        }

        const session = sessionManager.getOrCreate(sessionId);
        const key = `${method.toUpperCase()}:${path}`;

        session.endpoints.set(key, {
          method,
          path,
          responses,
          callCount: 0
        });

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to configure endpoint: ${error.message}`
        };
      }
    },

    list_sessions: async () => {
      try {
        const sessions = sessionManager.listSessions();
        return { success: true, data: sessions };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to list sessions: ${error.message}`
        };
      }
    },

    delete_session: async (args: any) => {
      try {
        const { sessionId } = args;

        if (!sessionId) {
          return {
            success: false,
            error: 'Missing required field: sessionId'
          };
        }

        const deleted = sessionManager.deleteSession(sessionId);

        if (!deleted) {
          return {
            success: false,
            error: `Session not found: ${sessionId}`
          };
        }

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to delete session: ${error.message}`
        };
      }
    },

    list_endpoints: async (args: any) => {
      try {
        const { sessionId } = args;

        if (!sessionId) {
          return {
            success: false,
            error: 'Missing required field: sessionId'
          };
        }

        const session = sessionManager.getOrCreate(sessionId);
        const endpoints = Array.from(session.endpoints.values());

        return { success: true, data: endpoints };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to list endpoints: ${error.message}`
        };
      }
    },

    clear_endpoints: async (args: any) => {
      try {
        const { sessionId, method, path } = args;

        if (!sessionId) {
          return {
            success: false,
            error: 'Missing required field: sessionId'
          };
        }

        const session = sessionManager.getOrCreate(sessionId);

        if (method && path) {
          const key = `${method.toUpperCase()}:${path}`;
          session.endpoints.delete(key);
        } else {
          session.endpoints.clear();
        }

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to clear endpoints: ${error.message}`
        };
      }
    },

    get_request_history: async (args: any) => {
      try {
        const { sessionId, limit = 100 } = args;

        if (!sessionId) {
          return {
            success: false,
            error: 'Missing required field: sessionId'
          };
        }

        const session = sessionManager.getOrCreate(sessionId);
        const history = session.requestHistory.slice(-Math.min(limit, 1000));

        return { success: true, data: history };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to get request history: ${error.message}`
        };
      }
    },

    send_websocket_action: async (args: any) => {
      try {
        const { sessionId, action, params } = args;

        if (!sessionId || !action) {
          return {
            success: false,
            error: 'Missing required fields: sessionId, action'
          };
        }

        const sent = wsHub.sendAction(sessionId, action, params);

        if (!sent) {
          return {
            success: false,
            error: 'No active connection for session'
          };
        }

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to send action: ${error.message}`
        };
      }
    },

    send_websocket_data: async (args: any) => {
      try {
        const { sessionId, data } = args;

        if (!sessionId || data === undefined) {
          return {
            success: false,
            error: 'Missing required fields: sessionId, data'
          };
        }

        const sent = wsHub.sendData(sessionId, data);

        if (!sent) {
          return {
            success: false,
            error: 'No active connection for session'
          };
        }

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to send data: ${error.message}`
        };
      }
    }
  };
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test src/mcp/tools.test.ts
```

Expected: PASS - All 16 tests pass

**Step 6: Commit**

```bash
git add src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat: implement MCP tools for session and endpoint management"
```

---

## Task 3: Create MCP Server Module

**Files:**
- Create: `src/mcp/server.ts`

**Step 1: Write MCP server implementation**

Create `src/mcp/server.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { SessionManager } from '../SessionManager.js';
import type { WebSocketHub } from '../WebSocketHub.js';
import { createTools } from './tools.js';

export async function createMCPServer(
  sessionManager: SessionManager,
  wsHub: WebSocketHub
) {
  const server = new Server(
    {
      name: 'spynet',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools = createTools(sessionManager, wsHub);

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'configure_endpoint',
        description: 'Configure a mock API endpoint with sequential responses',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
            method: {
              type: 'string',
              description: 'HTTP method (GET, POST, etc.)',
            },
            path: {
              type: 'string',
              description: 'Endpoint path (e.g., /api/users)',
            },
            responses: {
              type: 'array',
              description: 'Array of responses for sequential behavior',
              items: {
                type: 'object',
                properties: {
                  status: { type: 'number' },
                  headers: { type: 'object' },
                  body: {},
                },
                required: ['status'],
              },
            },
          },
          required: ['sessionId', 'method', 'path', 'responses'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List all active sessions with metadata',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delete_session',
        description: 'Delete a session and clean up resources',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier to delete',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'list_endpoints',
        description: 'List configured endpoints for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'clear_endpoints',
        description: 'Clear configured endpoints (all or specific)',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
            method: {
              type: 'string',
              description: 'Optional: HTTP method to clear',
            },
            path: {
              type: 'string',
              description: 'Optional: endpoint path to clear',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'get_request_history',
        description: 'Get request history for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of requests to return (default: 100)',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'send_websocket_action',
        description: 'Send an action message to connected WebSocket client',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
            action: {
              type: 'string',
              description: 'Action name (e.g., logout, navigate)',
            },
            params: {
              type: 'object',
              description: 'Optional action parameters',
            },
          },
          required: ['sessionId', 'action'],
        },
      },
      {
        name: 'send_websocket_data',
        description: 'Send a data message to connected WebSocket client',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
            data: {
              description: 'Data payload to send',
            },
          },
          required: ['sessionId', 'data'],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolHandler = tools[toolName as keyof typeof tools];

    if (!toolHandler) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const result = await toolHandler(request.params.arguments ?? {});

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}

export async function startMCPServer(
  sessionManager: SessionManager,
  wsHub: WebSocketHub
) {
  const server = await createMCPServer(sessionManager, wsHub);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout reserved for MCP protocol)
  console.error('MCP server started on stdio');

  return server;
}
```

**Step 2: Verify TypeScript compilation**

```bash
npm run build
```

Expected: Clean build with no errors

**Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: implement MCP server with tool registration"
```

---

## Task 4: Create MCP Entry Point

**Files:**
- Create: `src/mcp.ts`

**Step 1: Write MCP entry point**

Create `src/mcp.ts`:

```typescript
import { createServer } from './server.js';
import { startMCPServer } from './mcp/server.js';

const PORT = parseInt(process.env.PORT ?? '8675', 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL ?? '3600000', 10);

async function main() {
  try {
    // Start HTTP/WebSocket server
    const httpServer = await createServer({
      port: PORT,
      sessionTTL: SESSION_TTL,
    });

    // Get shared managers from server
    const sessionManager = (httpServer as any).sessionManager;
    const wsHub = (httpServer as any).wsHub;

    // Start MCP server on stdio
    await startMCPServer(sessionManager, wsHub);

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

**Step 2: Make entry point executable**

```bash
chmod +x src/mcp.ts
```

**Step 3: Build and test manually**

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/mcp.js
```

Expected: Should output MCP protocol response with tool list (via stdout) and startup logs (via stderr)

**Step 4: Commit**

```bash
git add src/mcp.ts
git commit -m "feat: add MCP entry point combining HTTP and MCP servers"
```

---

## Task 5: Update TypeScript Declarations

**Files:**
- Modify: `src/server.ts`

**Step 1: Add type declarations for decorated properties**

Add near the top of `src/server.ts` after imports:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    sessionManager: SessionManager;
    wsHub: WebSocketHub;
  }
}
```

**Step 2: Update wsHub decoration**

Find where `sessionManager` is decorated and add `wsHub` decoration:

```typescript
  // Store managers for cleanup and MCP access
  server.decorate('sessionManager', sessionManager);
  server.decorate('wsHub', wsHub);
```

**Step 3: Build to verify types**

```bash
npm run build
```

Expected: Clean build with no TypeScript errors

**Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat: expose wsHub on server instance for MCP access"
```

---

## Task 6: Update README with MCP Documentation

**Files:**
- Modify: `README.md`

**Step 1: Add MCP section after Usage section**

Add to `README.md` after the "Usage" section:

```markdown
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
```

**Step 2: Update Features section**

Find the Features section and update it:

```markdown
## Features

- **REST API Mocking** with sequential response support
- **WebSocket Support** for both mock data and app control
- **Session Isolation** for concurrent testing
- **MCP Integration** for AI-driven development with Claude Desktop
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add MCP setup and usage instructions to README"
```

---

## Task 7: Integration Testing

**Files:**
- Create: `src/mcp/integration.test.ts`

**Step 1: Create integration test**

Create `src/mcp/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMCPServer } from './server.js';
import { SessionManager } from '../SessionManager.js';
import { WebSocketHub } from '../WebSocketHub.js';

describe('MCP Server Integration', () => {
  let sessionManager: SessionManager;
  let wsHub: WebSocketHub;
  let mcpServer: any;

  beforeEach(async () => {
    sessionManager = new SessionManager({ ttl: 3600000 });
    wsHub = new WebSocketHub();
    mcpServer = await createMCPServer(sessionManager, wsHub);
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  it('should list all available tools', async () => {
    const response = await mcpServer.request(
      {
        method: 'tools/list',
        params: {},
      },
      { type: 'request', id: 1, jsonrpc: '2.0', method: 'tools/list' }
    );

    expect(response.tools).toHaveLength(8);
    expect(response.tools.map((t: any) => t.name)).toEqual([
      'configure_endpoint',
      'list_sessions',
      'delete_session',
      'list_endpoints',
      'clear_endpoints',
      'get_request_history',
      'send_websocket_action',
      'send_websocket_data',
    ]);
  });

  it('should handle configure_endpoint tool call', async () => {
    const response = await mcpServer.request(
      {
        method: 'tools/call',
        params: {
          name: 'configure_endpoint',
          arguments: {
            sessionId: 'test',
            method: 'GET',
            path: '/api/users',
            responses: [{ status: 200, body: { users: [] } }],
          },
        },
      },
      {
        type: 'request',
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'configure_endpoint',
          arguments: {
            sessionId: 'test',
            method: 'GET',
            path: '/api/users',
            responses: [{ status: 200, body: { users: [] } }],
          },
        },
      }
    );

    expect(response.content).toHaveLength(1);
    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
  });

  it('should handle list_sessions tool call', async () => {
    sessionManager.getOrCreate('session-1');
    sessionManager.getOrCreate('session-2');

    const response = await mcpServer.request(
      {
        method: 'tools/call',
        params: {
          name: 'list_sessions',
          arguments: {},
        },
      },
      {
        type: 'request',
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'list_sessions', arguments: {} },
      }
    );

    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('should return error for unknown tool', async () => {
    await expect(
      mcpServer.request(
        {
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        },
        {
          type: 'request',
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'unknown_tool', arguments: {} },
        }
      )
    ).rejects.toThrow('Unknown tool');
  });
});
```

**Step 2: Run integration tests**

```bash
npm test src/mcp/integration.test.ts
```

Expected: All integration tests pass

**Step 3: Commit**

```bash
git add src/mcp/integration.test.ts
git commit -m "test: add MCP server integration tests"
```

---

## Task 8: Manual End-to-End Testing

**Files:**
- Create: `test-mcp.sh` (temporary script)

**Step 1: Create test script**

Create `test-mcp.sh`:

```bash
#!/bin/bash
set -e

echo "Building SpyNet..."
npm run build

echo ""
echo "Starting MCP server..."
node dist/mcp.js &
MCP_PID=$!

sleep 2

echo ""
echo "Testing tools/list..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | nc localhost 8675 2>/dev/null || true

echo ""
echo "Cleaning up..."
kill $MCP_PID 2>/dev/null || true

echo ""
echo "Manual test complete!"
echo "Next: Add to Claude Desktop config and test with real client"
```

**Step 2: Make executable and run**

```bash
chmod +x test-mcp.sh
./test-mcp.sh
```

Expected: Script runs, server starts, shows it's working

**Step 3: Test with Claude Desktop**

Manual steps (document in commit message):
1. Add to Claude Desktop config with full path
2. Restart Claude Desktop
3. Test with prompt: "List all sessions in SpyNet"
4. Verify Claude can see and use MCP tools

**Step 4: Remove test script and commit**

```bash
rm test-mcp.sh
git add -A
git commit -m "test: verify MCP server works end-to-end with manual testing"
```

---

## Task 9: Final Validation

**Files:**
- All existing files

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass (including new MCP tests)

**Step 2: Build project**

```bash
npm run build
```

Expected: Clean build, no errors

**Step 3: Verify all files exist**

```bash
ls -la dist/mcp.js dist/mcp/server.js dist/mcp/tools.js
```

Expected: All MCP files compiled to dist/

**Step 4: Run type check**

```bash
npm run typecheck
```

Expected: No TypeScript errors

**Step 5: Create final summary commit**

```bash
git add -A
git commit -m "chore: final validation - all tests passing, MCP server complete"
```

---

## Summary

MCP server integration complete with:
- ✅ 8 MCP tools (configure_endpoint, list_sessions, etc.)
- ✅ HTTP + MCP servers running in single process
- ✅ Shared state via SessionManager/WebSocketHub
- ✅ Port changed to 8675 to avoid conflicts
- ✅ Full test coverage (unit + integration)
- ✅ README documentation with setup instructions
- ✅ Ready for Claude Desktop integration

Next steps:
1. Add to Claude Desktop config
2. Test with real AI assistant
3. Optionally publish to npm for wider distribution
