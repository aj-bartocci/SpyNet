import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMCPServer } from './server.js';
import { SessionManager } from '../SessionManager.js';
import { WebSocketHub } from '../WebSocketHub.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

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

  describe('tools/list', () => {
    it('should list all available tools', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/list');
      expect(handler).toBeDefined();

      const response = await handler({
        method: 'tools/list',
        params: {},
      });

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

    it('should include proper schema for configure_endpoint', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/list');
      const response = await handler({
        method: 'tools/list',
        params: {},
      });

      const configureEndpoint = response.tools.find(
        (t: any) => t.name === 'configure_endpoint'
      );

      expect(configureEndpoint).toBeDefined();
      expect(configureEndpoint.description).toContain('mock API endpoint');
      expect(configureEndpoint.inputSchema.required).toEqual([
        'sessionId',
        'method',
        'path',
        'responses',
      ]);
    });
  });

  describe('tools/call - configure_endpoint', () => {
    it('should handle configure_endpoint tool call', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      expect(handler).toBeDefined();

      const response = await handler({
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
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
    });

    it('should configure endpoint in session', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');

      await handler({
        method: 'tools/call',
        params: {
          name: 'configure_endpoint',
          arguments: {
            sessionId: 'test-session',
            method: 'POST',
            path: '/api/login',
            responses: [
              { status: 200, body: { token: 'abc123' } },
              { status: 401, body: { error: 'Invalid credentials' } },
            ],
          },
        },
      });

      const session = sessionManager.getOrCreate('test-session');
      const endpoint = session.endpoints.get('POST:/api/login');

      expect(endpoint).toBeDefined();
      expect(endpoint?.responses).toHaveLength(2);
      expect(endpoint?.callCount).toBe(0);
    });

    it('should return error for missing required fields', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'configure_endpoint',
          arguments: {
            sessionId: 'test',
            method: 'GET',
            // missing path
            responses: [{ status: 200 }],
          },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should return error for empty responses array', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'configure_endpoint',
          arguments: {
            sessionId: 'test',
            method: 'GET',
            path: '/api/test',
            responses: [],
          },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('at least one response');
    });
  });

  describe('tools/call - list_sessions', () => {
    it('should handle list_sessions tool call', async () => {
      sessionManager.getOrCreate('session-1');
      sessionManager.getOrCreate('session-2');

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'list_sessions',
          arguments: {},
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data.map((s: any) => s.id)).toEqual(['session-1', 'session-2']);
    });

    it('should return empty list when no sessions exist', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'list_sessions',
          arguments: {},
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('tools/call - delete_session', () => {
    it('should delete existing session', async () => {
      sessionManager.getOrCreate('test-session');

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'delete_session',
          arguments: { sessionId: 'test-session' },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(sessionManager.listSessions()).toHaveLength(0);
    });

    it('should return error for non-existent session', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'delete_session',
          arguments: { sessionId: 'non-existent' },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('tools/call - list_endpoints', () => {
    it('should list configured endpoints', async () => {
      const session = sessionManager.getOrCreate('test-session');
      session.endpoints.set('GET:/api/users', {
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: [] }],
        callCount: 0,
      });
      session.endpoints.set('POST:/api/users', {
        method: 'POST',
        path: '/api/users',
        responses: [{ status: 201, body: {} }],
        callCount: 0,
      });

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'list_endpoints',
          arguments: { sessionId: 'test-session' },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return empty list for session with no endpoints', async () => {
      sessionManager.getOrCreate('empty-session');

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'list_endpoints',
          arguments: { sessionId: 'empty-session' },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('tools/call - clear_endpoints', () => {
    it('should clear all endpoints when no specific endpoint provided', async () => {
      const session = sessionManager.getOrCreate('test-session');
      session.endpoints.set('GET:/api/users', {
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: [] }],
        callCount: 0,
      });
      session.endpoints.set('POST:/api/users', {
        method: 'POST',
        path: '/api/users',
        responses: [{ status: 201, body: {} }],
        callCount: 0,
      });

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      await handler({
        method: 'tools/call',
        params: {
          name: 'clear_endpoints',
          arguments: { sessionId: 'test-session' },
        },
      });

      expect(session.endpoints.size).toBe(0);
    });

    it('should clear specific endpoint when method and path provided', async () => {
      const session = sessionManager.getOrCreate('test-session');
      session.endpoints.set('GET:/api/users', {
        method: 'GET',
        path: '/api/users',
        responses: [{ status: 200, body: [] }],
        callCount: 0,
      });
      session.endpoints.set('POST:/api/users', {
        method: 'POST',
        path: '/api/users',
        responses: [{ status: 201, body: {} }],
        callCount: 0,
      });

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      await handler({
        method: 'tools/call',
        params: {
          name: 'clear_endpoints',
          arguments: {
            sessionId: 'test-session',
            method: 'GET',
            path: '/api/users',
          },
        },
      });

      expect(session.endpoints.size).toBe(1);
      expect(session.endpoints.has('GET:/api/users')).toBe(false);
      expect(session.endpoints.has('POST:/api/users')).toBe(true);
    });
  });

  describe('tools/call - get_request_history', () => {
    it('should return request history', async () => {
      const session = sessionManager.getOrCreate('test-session');
      session.requestHistory.push({
        method: 'GET',
        path: '/api/users',
        timestamp: new Date(),
        status: 200,
        configured: true,
        responseTime: 10,
      });
      session.requestHistory.push({
        method: 'POST',
        path: '/api/users',
        timestamp: new Date(),
        status: 201,
        configured: true,
        responseTime: 15,
      });

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'get_request_history',
          arguments: { sessionId: 'test-session' },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      const session = sessionManager.getOrCreate('test-session');
      for (let i = 0; i < 10; i++) {
        session.requestHistory.push({
          method: 'GET',
          path: '/api/test',
          timestamp: new Date(),
          status: 200,
          configured: true,
          responseTime: 10,
        });
      }

      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'get_request_history',
          arguments: { sessionId: 'test-session', limit: 5 },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
    });
  });

  describe('tools/call - send_websocket_action', () => {
    it('should return error when no connection exists', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'send_websocket_action',
          arguments: {
            sessionId: 'test-session',
            action: 'logout',
            params: { reason: 'test' },
          },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active connection');
    });

    it('should return error when missing required fields', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'send_websocket_action',
          arguments: {
            sessionId: 'test-session',
            // missing action
          },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('tools/call - send_websocket_data', () => {
    it('should return error when no connection exists', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'send_websocket_data',
          arguments: {
            sessionId: 'test-session',
            data: { message: 'Hello' },
          },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active connection');
    });

    it('should return error when data is missing', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'send_websocket_data',
          arguments: {
            sessionId: 'test-session',
            // missing data
          },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('tools/call - unknown tool', () => {
    it('should throw error for unknown tool', async () => {
      const handler = (mcpServer as any)._requestHandlers.get('tools/call');

      await expect(
        handler({
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        })
      ).rejects.toThrow('Unknown tool');
    });
  });
});
