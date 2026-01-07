import { describe, it, expect } from 'vitest';
import { EndpointRegistry } from './EndpointRegistry.js';
import type { EndpointConfig } from './types.js';

describe('EndpointRegistry', () => {
  it('should configure endpoint', () => {
    const registry = new EndpointRegistry();

    registry.configure({
      method: 'GET',
      path: '/api/users',
      responses: [{ status: 200, body: [] }],
      callCount: 0
    });

    const config = registry.get('GET', '/api/users');
    expect(config).toBeDefined();
    expect(config?.responses).toHaveLength(1);
  });

  it('should get next response in sequence', () => {
    const registry = new EndpointRegistry();

    registry.configure({
      method: 'GET',
      path: '/api/test',
      responses: [
        { status: 500, body: { error: 'Server error' } },
        { status: 200, body: { success: true } }
      ],
      callCount: 0
    });

    const response1 = registry.getNextResponse('GET', '/api/test');
    expect(response1?.status).toBe(500);

    const response2 = registry.getNextResponse('GET', '/api/test');
    expect(response2?.status).toBe(200);

    // Should repeat final response
    const response3 = registry.getNextResponse('GET', '/api/test');
    expect(response3?.status).toBe(200);
  });

  it('should return null for unconfigured endpoint', () => {
    const registry = new EndpointRegistry();

    const response = registry.getNextResponse('GET', '/api/unknown');
    expect(response).toBeNull();
  });

  it('should list all endpoints', () => {
    const registry = new EndpointRegistry();

    registry.configure({
      method: 'GET',
      path: '/api/users',
      responses: [{ status: 200, body: [] }],
      callCount: 0
    });

    registry.configure({
      method: 'POST',
      path: '/api/users',
      responses: [{ status: 201, body: {} }],
      callCount: 0
    });

    const endpoints = registry.list();
    expect(endpoints).toHaveLength(2);
  });

  it('should clear specific endpoint', () => {
    const registry = new EndpointRegistry();

    registry.configure({
      method: 'GET',
      path: '/api/users',
      responses: [{ status: 200, body: [] }],
      callCount: 0
    });

    const deleted = registry.clear('GET', '/api/users');
    expect(deleted).toBe(true);

    const config = registry.get('GET', '/api/users');
    expect(config).toBeUndefined();
  });

  it('should clear all endpoints', () => {
    const registry = new EndpointRegistry();

    registry.configure({
      method: 'GET',
      path: '/api/users',
      responses: [{ status: 200, body: [] }],
      callCount: 0
    });

    registry.configure({
      method: 'POST',
      path: '/api/users',
      responses: [{ status: 201, body: {} }],
      callCount: 0
    });

    registry.clearAll();

    expect(registry.list()).toHaveLength(0);
  });

  it('should reconfigure existing endpoint', () => {
    const registry = new EndpointRegistry();

    registry.configure({
      method: 'GET',
      path: '/api/test',
      responses: [{ status: 200, body: { v: 1 } }],
      callCount: 0
    });

    // Reconfigure with new responses
    registry.configure({
      method: 'GET',
      path: '/api/test',
      responses: [{ status: 200, body: { v: 2 } }],
      callCount: 0
    });

    const response = registry.getNextResponse('GET', '/api/test');
    expect(response?.body).toEqual({ v: 2 });
  });
});
