#!/usr/bin/env node
import { createServer } from './server.js';
import { startMCPServer } from './mcp/server.js';

const PORT = parseInt(process.env.PORT ?? '8675', 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL ?? '3600000', 10);

async function main() {
  try {
    // Start HTTP/WebSocket server
    const httpServer = await createServer({
      port: PORT,
      sessionTTL: SESSION_TTL,
    });

    // Get shared managers from server
    const sessionManager = (httpServer as any).sessionManager;
    const wsHub = (httpServer as any).wsHub;

    // Start MCP server on stdio
    await startMCPServer(sessionManager, wsHub);

    // Log to stderr (stdout reserved for MCP protocol)
    console.error(`🕵️  SpyNet MCP server running`);
    console.error(`   HTTP/WebSocket: http://localhost:${PORT}`);
    console.error(`   MCP: stdio`);
    console.error(`   Session TTL: ${SESSION_TTL / 1000}s`);
  } catch (error) {
    console.error('Failed to start SpyNet MCP server:', error);
    process.exit(1);
  }
}

main();
