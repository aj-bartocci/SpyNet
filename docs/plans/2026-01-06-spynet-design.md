# SpyNet - Mock Server Design

**Date:** 2026-01-06
**Purpose:** Session-based mock server for client application development with AI integration

## Overview

SpyNet is a session-based mock server for iOS (and other client) development. It runs as a standalone Node.js/TypeScript server that provides:

1. **REST API mocking** with session isolation
2. **WebSocket support** for both mock data and app control
3. **AI-friendly control API** for programmatic scenario management

### Core Concept

Each client app instance connects with a unique session ID in the URL path (`/session/{sessionId}/...`). Sessions are auto-created on first use and provide complete isolation - multiple simulators can run different test scenarios concurrently without interference.

The server has two API surfaces:
- **Data plane:** App makes normal requests (`/session/{id}/api/...`, `/session/{id}/socket`)
- **Control plane:** AI/developers configure responses (`/_mock/sessions/{id}/...`)

WebSocket messages use a simple envelope: `{ "type": "action" | "data", "data": <anything> }`. The thin wrapper routes based on type, and payload structure is defined by the app's needs.

## Session Management

Sessions provide complete isolation between concurrent app instances. Each session has:
- Unique identifier (can be UUID or friendly name like "simulator-1")
- Independent endpoint configurations
- Separate WebSocket connections
- Auto-cleanup after inactivity (configurable TTL, default 1 hour)

### Session Lifecycle

1. **Creation:** Auto-created on first use - no explicit setup needed
   - App requests `/session/my-test/api/user` → session "my-test" created automatically
2. **Usage:** All requests include session ID in URL path
   - REST: `/session/{sessionId}/api/...`
   - WebSocket: `/session/{sessionId}/socket`
3. **Cleanup:** Sessions expire after inactivity or can be deleted explicitly
   - `DELETE /_mock/sessions/{sessionId}` - immediate cleanup

### URL Structure

Everything for a session follows `/session/{sessionId}/...` pattern, making routing predictable and debugging easy (session ID visible in all logs).

This means AI can spin up isolated test scenarios with simple naming (login-test-1, payment-flow-2, etc.) and they won't interfere with each other.

## REST API Mocking

### Endpoint Configuration

AI configures endpoints per session using the control API:

```http
POST /_mock/sessions/{sessionId}/endpoints
Content-Type: application/json

{
  "method": "GET|POST|PUT|DELETE|PATCH",
  "path": "/api/users",
  "responses": [
    { "status": 200, "headers": {...}, "body": {...} },
    { "status": 500, "body": { "error": "Server error" } }
  ]
}
```

### Sequential Responses

The `responses` array defines a sequence. First request returns first response, second request returns second response, etc. Final response repeats for all subsequent calls.

**Examples:**
- Single static response: `responses: [{ status: 200, body: {...} }]`
- Fail then succeed: `responses: [{ status: 500 }, { status: 200, body: {...} }]`
- Empty then populated: `responses: [{ body: [] }, { body: [item1] }, { body: [item1, item2] }]`

### Reconfiguration

AI can reconfigure an endpoint anytime - just POST again to update/replace the response sequence. This allows dynamic scenario adjustments mid-test.

### Unconfigured Endpoints

Return `404 Not Found` by default, making it obvious when an endpoint needs configuration.

### Model Reuse

Since AI writes TypeScript code (not config files), it can use normal programming to avoid duplication:

```typescript
// Define models once
const createUser = (overrides = {}) => ({
  id: 123,
  name: "Test User",
  email: "test@example.com",
  role: "user",
  ...overrides
})

// Reuse across endpoints
await mock.configureEndpoint({
  method: 'GET',
  path: '/api/users/123',
  responses: [{ status: 200, body: createUser() }]
})

await mock.configureEndpoint({
  method: 'POST',
  path: '/api/profile',
  responses: [{ status: 200, body: createUser({ name: "Updated Name" }) }]
})
```

## WebSocket Support

### Connection

App connects to `/session/{sessionId}/socket` and maintains a persistent WebSocket connection. One connection per session handles both action commands and mock socket data.

### Message Format

All messages use a typed envelope:

**Actions:**
```json
{ "type": "action", "action": "logout", "params": {...} }
```

**Socket data:**
```json
{ "type": "data", "data": <anything> }
```

### Sending Messages to App

AI uses the control API to push messages to the connected app:

```http
POST /_mock/sessions/{sessionId}/socket/action
{ "action": "logout", "params": { "reason": "session_expired" } }

POST /_mock/sessions/{sessionId}/socket/message
{ "data": { "event": "chat", "userId": 123, "text": "Hello!" } }
```

The server immediately forwards these to the app's WebSocket connection with the appropriate type envelope.

### Use Cases

- **Actions:** Trigger app behavior (navigate to screen, show error, logout, etc.)
- **Socket data:** Simulate real backend socket events (chat messages, notifications, live updates)

## Control API Reference

AI and developers use these endpoints to manage sessions and configure scenarios:

### Session Management

```http
DELETE /_mock/sessions/{sessionId}
  - Immediately cleanup session (close connections, clear state)
  - Returns: 204 No Content

GET /_mock/sessions
  - List all active sessions with metadata
  - Returns: [{ id, createdAt, lastActivityAt, connected: boolean }]
```

### Endpoint Configuration

```http
POST /_mock/sessions/{sessionId}/endpoints
  - Configure/reconfigure REST endpoint with response sequence
  - Body: { method, path, responses: [{status, headers?, body?}] }
  - Returns: 201 Created

GET /_mock/sessions/{sessionId}/endpoints
  - List all configured endpoints for this session
  - Returns: [{ method, path, callCount, responses }]

DELETE /_mock/sessions/{sessionId}/endpoints
  - Clear all endpoint configurations
  - Query: ?method=GET&path=/api/users (optional, clears specific endpoint)
  - Returns: 204 No Content
```

### WebSocket Control

```http
POST /_mock/sessions/{sessionId}/socket/action
  - Send action command to app
  - Body: { action: string, params?: any }
  - Returns: 200 OK (or 404 if no WebSocket connected)

POST /_mock/sessions/{sessionId}/socket/message
  - Send mock socket data to app
  - Body: { data: any }
  - Returns: 200 OK (or 404 if no WebSocket connected)
```

### Request Monitoring

```http
GET /_mock/sessions/{sessionId}/requests
  - Get request history for debugging/discovery
  - Query: ?limit=50 (default 100, max 1000)
  - Returns: [{
      method, path, status, timestamp,
      configured: boolean, responseTime
    }]
```

This gives AI visibility into what the app is requesting, what's failing, and what needs configuration.

## Error Handling & Edge Cases

### WebSocket Disconnection

- App WebSocket disconnects → session remains active (data preserved)
- App can reconnect to same session
- AI sending messages to disconnected session → returns `404` with `{ error: "No active connection" }`

### Invalid Session Operations

- Configuring endpoints for non-existent session → session auto-created (same as data plane)
- Sending socket messages to session with no connection → `404` error
- Deleting non-existent session → `404` error

### Response Sequence Exhaustion

- When sequence completes, final response repeats indefinitely
- Example: `[{status: 500}, {status: 200}]` → first call gets 500, all subsequent calls get 200

### Concurrent Requests

- Sequence advances per request, not per concurrent batch
- Thread-safe sequence counter per endpoint

### Path Matching

- Exact path matching only (no wildcards/patterns in initial version)
- `/api/users/123` and `/api/users/456` are different endpoints

## Thin Client Wrapper (iOS Example)

The app uses a thin wrapper library that handles SpyNet integration.

### Network Configuration

- Points all HTTP requests to `http://localhost:8080/session/{sessionId}/...`
- Establishes WebSocket connection to `/session/{sessionId}/socket`
- Manages session ID (hardcoded, environment variable, or runtime configuration)

### WebSocket Message Routing

```swift
// Pseudo-code example
func onWebSocketMessage(_ message: Message) {
  switch message.type {
  case "action":
    // Route to app-specific action handler
    actionHandler.handle(message.action, params: message.params)
  case "data":
    // Forward to app's existing socket handler as-is
    realSocketHandler.onMessage(message.data)
  }
}
```

### Action Handler Registration

```swift
// App registers handlers for actions
spynet.registerAction("logout") { params in
  // Perform logout
}

spynet.registerAction("navigate") { params in
  // Navigate to params.screen
}
```

### Key Principle

The wrapper is thin - it's just routing and connection management. All the mocking intelligence lives in the SpyNet server. Different client platforms (iOS, Android, Web) implement the same simple protocol.

## AI Integration (MCP Server)

### MCP Server Implementation

SpyNet includes a Model Context Protocol server that exposes operations as tools. AI can invoke these directly without writing HTTP code.

### Available MCP Tools

- `configure_endpoint` - Set up REST endpoint with response sequence
- `send_action` - Send action command to app via WebSocket
- `send_socket_message` - Send mock socket data to app
- `get_requests` - View request history for a session
- `list_sessions` - See active sessions
- `delete_session` - Clean up session

### Usage from AI Perspective

```
AI: "Configure the login endpoint to fail first, then succeed"
→ Calls configure_endpoint tool with session, endpoint, and responses
→ SpyNet configures the endpoint
→ AI continues building the feature
```

### Deployment

- MCP server runs alongside SpyNet HTTP server (same process)
- Configured in Claude Code or other MCP-compatible tools
- AI gets full control without writing any HTTP/SDK code

### Fallback

TypeScript SDK available for non-MCP environments or when developers want to script scenarios manually.

## Implementation Notes

### Technology Stack

- Node.js/TypeScript for the server
- Express or Fastify for HTTP routing
- ws library for WebSocket support
- In-memory state management (Map-based session store)

### Key Components

1. **Session Manager:** Creates, tracks, and cleans up sessions (TTL-based expiry)
2. **Endpoint Registry:** Stores endpoint configurations per session with sequence state
3. **WebSocket Hub:** Manages WebSocket connections and message routing per session
4. **Request Handler:** Routes data plane requests to configured endpoints or returns 404

### State Structure Per Session

```typescript
{
  id: string,
  createdAt: Date,
  lastActivityAt: Date,
  endpoints: Map<string, EndpointConfig>,  // key: "GET:/api/users"
  websocket: WebSocket | null,
  requestHistory: Request[]
}
```

### Deployment

- Runs locally during development (localhost:8080)
- Single process (no clustering needed for dev use)
- Environment variables for port, session TTL, request history limits

## Response Discovery

AI discovers correct response shapes by reading the app's code while building features. AI naturally inspects model definitions and networking code:

```swift
struct User: Codable {
  let id: Int
  let name: String
  let email: String
}
```

AI generates matching mock responses based on these definitions.

**Future enhancement:** Optional recording/proxy mode could be added later to capture real backend responses for quick scenario bootstrapping.

## Future Considerations

These features are explicitly deferred for initial version (YAGNI):

- Response conditionals (matching on request body/headers)
- Recording/proxy mode for capturing real backend responses
- Path wildcards/patterns for endpoint matching
- Persistent scenario storage
- Authentication/authorization for control API
- Multi-connection session support

Add these only when real use cases emerge.
