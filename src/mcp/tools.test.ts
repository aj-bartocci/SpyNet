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
