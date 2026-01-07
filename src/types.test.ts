import { describe, it, expect } from 'vitest';
import type { Session, EndpointConfig, RequestRecord } from './types.js';

describe('Types', () => {
  it('should create valid Session object', () => {
    const session: Session = {
      id: 'test-1',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      endpoints: new Map(),
      websocket: null,
      requestHistory: []
    };

    expect(session.id).toBe('test-1');
    expect(session.endpoints.size).toBe(0);
  });

  it('should create valid EndpointConfig', () => {
    const config: EndpointConfig = {
      method: 'GET',
      path: '/api/users',
      responses: [
        { status: 200, body: { users: [] } }
      ],
      callCount: 0
    };

    expect(config.responses).toHaveLength(1);
    expect(config.callCount).toBe(0);
  });

  it('should create valid RequestRecord', () => {
    const record: RequestRecord = {
      method: 'GET',
      path: '/api/users',
      status: 200,
      timestamp: new Date(),
      configured: true,
      responseTime: 15
    };

    expect(record.configured).toBe(true);
  });
});
