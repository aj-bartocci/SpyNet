import type { WebSocket } from 'ws';

export interface ResponseConfig {
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

export interface EndpointConfig {
  method: string;
  path: string;
  responses: ResponseConfig[];
  callCount: number;
}

export interface RequestRecord {
  method: string;
  path: string;
  status: number;
  timestamp: Date;
  configured: boolean;
  responseTime: number;
}

export interface Session {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  endpoints: Map<string, EndpointConfig>;
  websocket: WebSocket | null;
  requestHistory: RequestRecord[];
}

export interface WebSocketMessage {
  type: 'action' | 'data';
  action?: string;
  params?: any;
  data?: any;
}

export interface SessionMetadata {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  connected: boolean;
}
