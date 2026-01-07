import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from './server.js';
import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';

describe('Server - Data Plane', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer({ port: 0, sessionTTL: 3600000 });
  });

  afterEach(async () => {
    await server.close();
  });

  it('should return 404 for unconfigured endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/session/test-1/api/users'
    });

    expect(response.statusCode).toBe(404);
  });

  it('should return configured response', async () => {
    // Configure endpoint via control plane
    await server.inject({
      method: 'POST',
      url: '/_mock/sessions/test-1/endpoints',
      payload: {
        method: 'GET',
        path: '/api/users',
        responses: [
          { status: 200, body: [{ id: 1, name: 'Test User' }] }
        ]
      }
    });

    // Request via data plane
    const response = await server.inject({
      method: 'GET',
      url: '/session/test-1/api/users'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 1, name: 'Test User' }]);
  });

  it('should handle sequential responses', async () => {
    // Configure endpoint with sequence
    await server.inject({
      method: 'POST',
      url: '/_mock/sessions/test-1/endpoints',
      payload: {
        method: 'GET',
        path: '/api/test',
        responses: [
          { status: 500, body: { error: 'Server error' } },
          { status: 200, body: { success: true } }
        ]
      }
    });

    const response1 = await server.inject({
      method: 'GET',
      url: '/session/test-1/api/test'
    });
    expect(response1.statusCode).toBe(500);

    const response2 = await server.inject({
      method: 'GET',
      url: '/session/test-1/api/test'
    });
    expect(response2.statusCode).toBe(200);
  });

  it('should isolate sessions', async () => {
    // Configure for session 1
    await server.inject({
      method: 'POST',
      url: '/_mock/sessions/session-1/endpoints',
      payload: {
        method: 'GET',
        path: '/api/test',
        responses: [{ status: 200, body: { session: 1 } }]
      }
    });

    // Configure for session 2
    await server.inject({
      method: 'POST',
      url: '/_mock/sessions/session-2/endpoints',
      payload: {
        method: 'GET',
        path: '/api/test',
        responses: [{ status: 200, body: { session: 2 } }]
      }
    });

    const response1 = await server.inject({
      method: 'GET',
      url: '/session/session-1/api/test'
    });
    expect(response1.json()).toEqual({ session: 1 });

    const response2 = await server.inject({
      method: 'GET',
      url: '/session/session-2/api/test'
    });
    expect(response2.json()).toEqual({ session: 2 });
  });
});

describe('Server - WebSocket', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer({ port: 8765, sessionTTL: 3600000 });
  });

  afterEach(async () => {
    await server.close();
  });

  it('should accept WebSocket connection', async () => {
    const ws = new WebSocket('ws://localhost:8765/session/test-1/socket');

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.close();
        resolve();
      });
    });
  });

  it('should send action message to connected client', async () => {
    const ws = new WebSocket('ws://localhost:8765/session/test-1/socket');

    await new Promise<void>((resolve) => {
      ws.on('open', async () => {
        // Send action via control API
        await server.inject({
          method: 'POST',
          url: '/_mock/sessions/test-1/socket/action',
          payload: {
            action: 'logout',
            params: { reason: 'timeout' }
          }
        });
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message).toEqual({
          type: 'action',
          action: 'logout',
          params: { reason: 'timeout' }
        });
        ws.close();
        resolve();
      });
    });
  });

  it('should send data message to connected client', async () => {
    const ws = new WebSocket('ws://localhost:8765/session/test-1/socket');

    await new Promise<void>((resolve) => {
      ws.on('open', async () => {
        await server.inject({
          method: 'POST',
          url: '/_mock/sessions/test-1/socket/message',
          payload: {
            data: { event: 'chat', text: 'Hello' }
          }
        });
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message).toEqual({
          type: 'data',
          data: { event: 'chat', text: 'Hello' }
        });
        ws.close();
        resolve();
      });
    });
  });

  it('should return 404 when sending to disconnected session', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/_mock/sessions/test-1/socket/action',
      payload: {
        action: 'logout'
      }
    });

    expect(response.statusCode).toBe(404);
  });
});
