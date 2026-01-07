import type { Session, SessionMetadata } from './types.js';

export interface SessionManagerConfig {
  ttl: number; // Time to live in milliseconds
}

export class SessionManager {
  private sessions: Map<string, Session>;
  private config: SessionManagerConfig;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(config: SessionManagerConfig) {
    this.sessions = new Map();
    this.config = config;

    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  getOrCreate(sessionId: string): Session {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        endpoints: new Map(),
        websocket: null,
        requestHistory: []
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    // Close websocket if connected
    if (session.websocket) {
      session.websocket.close();
    }

    this.sessions.delete(sessionId);
    return true;
  }

  listSessions(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      connected: session.websocket !== null
    }));
  }

  cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      const age = now - session.lastActivityAt.getTime();
      if (age > this.config.ttl) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.deleteSession(id);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    for (const id of this.sessions.keys()) {
      this.deleteSession(id);
    }
  }
}
