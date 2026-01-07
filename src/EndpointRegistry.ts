import type { EndpointConfig, ResponseConfig } from './types.js';

export class EndpointRegistry {
  private endpoints: Map<string, EndpointConfig>;

  constructor() {
    this.endpoints = new Map();
  }

  private makeKey(method: string, path: string): string {
    return `${method.toUpperCase()}:${path}`;
  }

  configure(config: EndpointConfig): void {
    const key = this.makeKey(config.method, config.path);
    this.endpoints.set(key, {
      ...config,
      callCount: 0 // Reset call count on reconfiguration
    });
  }

  get(method: string, path: string): EndpointConfig | undefined {
    const key = this.makeKey(method, path);
    return this.endpoints.get(key);
  }

  getNextResponse(method: string, path: string): ResponseConfig | null {
    const config = this.get(method, path);

    if (!config || config.responses.length === 0) {
      return null;
    }

    // Get current response based on call count
    const index = Math.min(config.callCount, config.responses.length - 1);
    const response = config.responses[index];

    // Increment call count
    config.callCount++;

    return response;
  }

  list(): EndpointConfig[] {
    return Array.from(this.endpoints.values());
  }

  clear(method: string, path: string): boolean {
    const key = this.makeKey(method, path);
    return this.endpoints.delete(key);
  }

  clearAll(): void {
    this.endpoints.clear();
  }
}
