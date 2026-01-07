# SpyNet

Session-based mock server for client application development with AI integration.

## Features

- **REST API Mocking** with sequential response support
- **WebSocket Support** for both mock data and app control
- **Session Isolation** for concurrent testing
- **MCP Integration** for AI-driven development (coming soon)

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm run dev

# Server runs on http://localhost:8080
```

## Usage

### Configure Mock Endpoint

```bash
curl -X POST http://localhost:8080/_mock/sessions/test-1/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "path": "/api/users",
    "responses": [
      { "status": 200, "body": [{"id": 1, "name": "Test User"}] }
    ]
  }'
```

### Request via Data Plane

```bash
curl http://localhost:8080/session/test-1/api/users
# Returns: [{"id": 1, "name": "Test User"}]
```

### Send WebSocket Message

```bash
curl -X POST http://localhost:8080/_mock/sessions/test-1/socket/action \
  -H "Content-Type: application/json" \
  -d '{"action": "logout", "params": {"reason": "timeout"}}'
```

## API Reference

See [Design Document](docs/plans/2026-01-06-spynet-design.md) for complete API documentation.

## Development

```bash
# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck
```

## License

MIT
