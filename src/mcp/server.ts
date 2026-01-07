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
