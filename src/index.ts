import { createServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '8675', 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL ?? '3600000', 10);

async function main() {
  try {
    const server = await createServer({
      port: PORT,
      sessionTTL: SESSION_TTL
    });

    console.log(`🕵️  SpyNet server running on http://localhost:${PORT}`);
    console.log(`📝 Session TTL: ${SESSION_TTL / 1000}s`);
    console.log(`\n📚 API Documentation:`);
    console.log(`   Data plane:    /session/{sessionId}/*`);
    console.log(`   Control plane: /_mock/sessions/*`);
    console.log(`   WebSocket:     /session/{sessionId}/socket`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
