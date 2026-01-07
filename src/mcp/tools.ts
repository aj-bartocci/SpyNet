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
