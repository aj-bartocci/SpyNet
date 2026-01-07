import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager } from './SessionManager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ ttl: 3600000 });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should create session on first access', () => {
    const session = manager.getOrCreate('test-1');

    expect(session.id).toBe('test-1');
    expect(session.endpoints.size).toBe(0);
    expect(session.websocket).toBeNull();
    expect(session.requestHistory).toEqual([]);
  });

  it('should return existing session', () => {
    const session1 = manager.getOrCreate('test-1');
    const session2 = manager.getOrCreate('test-1');

    expect(session1).toBe(session2);
  });

  it('should list all sessions', () => {
    manager.getOrCreate('test-1');
    manager.getOrCreate('test-2');

    const sessions = manager.listSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('test-1');
    expect(sessions[1].id).toBe('test-2');
  });

  it('should delete session', () => {
    manager.getOrCreate('test-1');
    const deleted = manager.deleteSession('test-1');

    expect(deleted).toBe(true);
    expect(manager.listSessions()).toHaveLength(0);
  });

  it('should return false when deleting non-existent session', () => {
    const deleted = manager.deleteSession('non-existent');

    expect(deleted).toBe(false);
  });

  it('should update lastActivityAt on access', () => {
    vi.useFakeTimers();

    const session = manager.getOrCreate('test-1');
    const firstAccess = session.lastActivityAt;

    vi.advanceTimersByTime(1000);

    manager.updateActivity('test-1');
    const session2 = manager.getOrCreate('test-1');

    expect(session2.lastActivityAt.getTime()).toBeGreaterThan(firstAccess.getTime());

    vi.useRealTimers();
  });

  it('should cleanup expired sessions', () => {
    vi.useFakeTimers();

    manager.getOrCreate('test-1');

    // Advance time beyond TTL
    vi.advanceTimersByTime(3700000);

    manager.cleanupExpired();

    expect(manager.listSessions()).toHaveLength(0);

    vi.useRealTimers();
  });
});
