import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from './SessionManager.js';
import { EndpointRegistry } from './EndpointRegistry.js';
import { WebSocketHub } from './WebSocketHub.js';

export interface ServerConfig {
  port: number; // Default: 8675
  sessionTTL: number;
}

export async function createServer(config: ServerConfig): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  await server.register(websocket);

  const sessionManager = new SessionManager({ ttl: config.sessionTTL });
  const wsHub = new WebSocketHub();

  // Store session-specific registries in session objects
  // We'll use EndpointRegistry per session

  // Data Plane: Session-scoped endpoints
  server.all('/session/:sessionId/*', async (request: FastifyRequest<{
    Params: { sessionId: string; '*': string }
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const path = '/' + request.params['*'];
    const method = request.method;

    const startTime = Date.now();

    // Get or create session
    const session = sessionManager.getOrCreate(sessionId);
    sessionManager.updateActivity(sessionId);

    // Get endpoint config directly from session
    const key = `${method.toUpperCase()}:${path}`;
    const config = session.endpoints.get(key);

    const responseTime = Date.now() - startTime;

    if (!config || config.responses.length === 0) {
      // Record request as unconfigured
      session.requestHistory.push({
        method,
        path,
        status: 404,
        timestamp: new Date(),
        configured: false,
        responseTime
      });

      return reply.code(404).send({
        error: 'Endpoint not configured',
        method,
        path
      });
    }

    // Get current response based on call count
    const index = Math.min(config.callCount, config.responses.length - 1);
    const response = config.responses[index];

    // Increment call count
    config.callCount++;

    // Update session endpoints with new call count
    session.endpoints.set(key, config);

    // Record request
    session.requestHistory.push({
      method,
      path,
      status: response.status,
      timestamp: new Date(),
      configured: true,
      responseTime
    });

    // Trim history to last 1000 items
    if (session.requestHistory.length > 1000) {
      session.requestHistory = session.requestHistory.slice(-1000);
    }

    // Send response
    reply.code(response.status);

    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        reply.header(key, value);
      }
    }

    return reply.send(response.body ?? null);
  });

  // Control Plane: Configure endpoints
  server.post('/_mock/sessions/:sessionId/endpoints', async (request: FastifyRequest<{
    Params: { sessionId: string };
    Body: {
      method: string;
      path: string;
      responses: Array<{ status: number; headers?: Record<string, string>; body?: any }>;
    };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const { method, path, responses } = request.body;

    const session = sessionManager.getOrCreate(sessionId);
    sessionManager.updateActivity(sessionId);

    const key = `${method.toUpperCase()}:${path}`;
    session.endpoints.set(key, {
      method,
      path,
      responses,
      callCount: 0
    });

    return reply.code(201).send({ success: true });
  });

  // Control Plane: List endpoints
  server.get('/_mock/sessions/:sessionId/endpoints', async (request: FastifyRequest<{
    Params: { sessionId: string };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const session = sessionManager.getOrCreate(sessionId);

    const endpoints = Array.from(session.endpoints.values());

    return reply.send(endpoints);
  });

  // Control Plane: Clear endpoints
  server.delete('/_mock/sessions/:sessionId/endpoints', async (request: FastifyRequest<{
    Params: { sessionId: string };
    Querystring: { method?: string; path?: string };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const { method, path } = request.query;

    const session = sessionManager.getOrCreate(sessionId);

    if (method && path) {
      const key = `${method.toUpperCase()}:${path}`;
      session.endpoints.delete(key);
    } else {
      session.endpoints.clear();
    }

    return reply.code(204).send();
  });

  // Control Plane: Get request history
  server.get('/_mock/sessions/:sessionId/requests', async (request: FastifyRequest<{
    Params: { sessionId: string };
    Querystring: { limit?: string };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const limit = parseInt(request.query.limit ?? '100', 10);

    const session = sessionManager.getOrCreate(sessionId);

    const requests = session.requestHistory.slice(-Math.min(limit, 1000));

    return reply.send(requests);
  });

  // Control Plane: List sessions
  server.get('/_mock/sessions', async (_request: FastifyRequest, reply: FastifyReply) => {
    const sessions = sessionManager.listSessions();
    return reply.send(sessions);
  });

  // Control Plane: Delete session
  server.delete('/_mock/sessions/:sessionId', async (request: FastifyRequest<{
    Params: { sessionId: string };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const deleted = sessionManager.deleteSession(sessionId);

    if (!deleted) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return reply.code(204).send();
  });

  // WebSocket endpoint (placeholder for next task)
  server.register(async (fastify) => {
    fastify.get('/session/:sessionId/socket', { websocket: true }, (socket, request) => {
      const sessionId = (request.params as { sessionId: string }).sessionId;

      const session = sessionManager.getOrCreate(sessionId);
      session.websocket = socket as any;
      wsHub.register(sessionId, socket as any);

      socket.on('close', () => {
        session.websocket = null;
        wsHub.unregister(sessionId);
      });
    });
  });

  // Control Plane: Send action
  server.post('/_mock/sessions/:sessionId/socket/action', async (request: FastifyRequest<{
    Params: { sessionId: string };
    Body: { action: string; params?: any };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const { action, params } = request.body;

    const sent = wsHub.sendAction(sessionId, action, params);

    if (!sent) {
      return reply.code(404).send({ error: 'No active connection' });
    }

    return reply.send({ success: true });
  });

  // Control Plane: Send socket message
  server.post('/_mock/sessions/:sessionId/socket/message', async (request: FastifyRequest<{
    Params: { sessionId: string };
    Body: { data: any };
  }>, reply: FastifyReply) => {
    const { sessionId } = request.params;
    const { data } = request.body;

    const sent = wsHub.sendData(sessionId, data);

    if (!sent) {
      return reply.code(404).send({ error: 'No active connection' });
    }

    return reply.send({ success: true });
  });

  // Store managers for cleanup and MCP access
  server.decorate('sessionManager', sessionManager);
  server.decorate('wsHub', wsHub);

  server.addHook('onClose', async () => {
    sessionManager.destroy();
  });

  await server.listen({ port: config.port });

  return server;
}
