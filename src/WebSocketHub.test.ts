import { describe, it, expect, vi } from 'vitest';
import { WebSocketHub } from './WebSocketHub.js';
import type { WebSocket } from 'ws';

// Mock WebSocket
const createMockWebSocket = () => {
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    readyState: 1 // OPEN
  } as unknown as WebSocket;
};

describe('WebSocketHub', () => {
  it('should register websocket for session', () => {
    const hub = new WebSocketHub();
    const ws = createMockWebSocket();

    hub.register('test-1', ws);

    expect(hub.isConnected('test-1')).toBe(true);
  });

  it('should unregister websocket', () => {
    const hub = new WebSocketHub();
    const ws = createMockWebSocket();

    hub.register('test-1', ws);
    hub.unregister('test-1');

    expect(hub.isConnected('test-1')).toBe(false);
  });

  it('should send action message', () => {
    const hub = new WebSocketHub();
    const ws = createMockWebSocket();

    hub.register('test-1', ws);
    const sent = hub.sendAction('test-1', 'logout', { reason: 'timeout' });

    expect(sent).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'action',
        action: 'logout',
        params: { reason: 'timeout' }
      })
    );
  });

  it('should send data message', () => {
    const hub = new WebSocketHub();
    const ws = createMockWebSocket();

    hub.register('test-1', ws);
    const sent = hub.sendData('test-1', { event: 'chat', text: 'Hello' });

    expect(sent).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'data',
        data: { event: 'chat', text: 'Hello' }
      })
    );
  });

  it('should return false when sending to disconnected session', () => {
    const hub = new WebSocketHub();

    const sent = hub.sendAction('test-1', 'logout');

    expect(sent).toBe(false);
  });

  it('should get websocket for session', () => {
    const hub = new WebSocketHub();
    const ws = createMockWebSocket();

    hub.register('test-1', ws);
    const retrieved = hub.get('test-1');

    expect(retrieved).toBe(ws);
  });

  it('should replace existing websocket on re-register', () => {
    const hub = new WebSocketHub();
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    hub.register('test-1', ws1);
    hub.register('test-1', ws2);

    const retrieved = hub.get('test-1');
    expect(retrieved).toBe(ws2);
  });
});
