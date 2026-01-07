import type { WebSocket } from 'ws';

export class WebSocketHub {
  private connections: Map<string, WebSocket>;

  constructor() {
    this.connections = new Map();
  }

  register(sessionId: string, ws: WebSocket): void {
    this.connections.set(sessionId, ws);
  }

  unregister(sessionId: string): void {
    this.connections.delete(sessionId);
  }

  get(sessionId: string): WebSocket | undefined {
    return this.connections.get(sessionId);
  }

  isConnected(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  sendAction(sessionId: string, action: string, params?: any): boolean {
    const ws = this.connections.get(sessionId);

    if (!ws) {
      return false;
    }

    const message = {
      type: 'action' as const,
      action,
      params
    };

    ws.send(JSON.stringify(message));
    return true;
  }

  sendData(sessionId: string, data: any): boolean {
    const ws = this.connections.get(sessionId);

    if (!ws) {
      return false;
    }

    const message = {
      type: 'data' as const,
      data
    };

    ws.send(JSON.stringify(message));
    return true;
  }
}
