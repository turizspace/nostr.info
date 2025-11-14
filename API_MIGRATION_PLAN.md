# Nostr.info API Migration Plan
## Moving from Client-Side to Precomputed Processing

### Phase 1: Backend Data Collector (Week 1-2)

#### 1.1 Create Data Collection Service
```bash
/backend/
  /services/
    relay-collector.js      # Connects to relays, collects events
    event-processor.js      # Processes and aggregates events
    statistics-computer.js  # Computes all statistics
  /models/
    relay.js               # Relay data model
    event.js               # Event data model
    statistics.js          # Statistics data model
  /database/
    schema.sql             # PostgreSQL schema
    redis-config.js        # Redis for real-time data
  /api/
    routes.js              # API endpoint definitions
    middleware.js          # CORS, rate limiting
  scheduler.js             # Cron jobs for data updates
  server.js                # Express/Fastify server
```

#### 1.2 Database Schema
```sql
-- PostgreSQL tables
CREATE TABLE relays (
    url TEXT PRIMARY KEY,
    last_connected TIMESTAMP,
    avg_latency INTEGER,
    total_events BIGINT,
    nip11_data JSONB,
    health_score FLOAT,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE events_aggregated (
    day DATE,
    relay_url TEXT,
    event_kind INTEGER,
    event_count INTEGER,
    PRIMARY KEY (day, relay_url, event_kind)
);

CREATE TABLE statistics_snapshots (
    computed_at TIMESTAMP PRIMARY KEY,
    time_range TEXT, -- '24h', '7d', '30d'
    data JSONB -- All computed stats
);

CREATE INDEX idx_events_day ON events_aggregated(day);
CREATE INDEX idx_relay_health ON relays(health_score DESC);
```

#### 1.3 Data Collection Service
```javascript
// backend/services/relay-collector.js
const { WebSocket } = require('ws');
const { Client } = require('pg');

class RelayCollector {
  constructor() {
    this.relays = []; // Load from relays.yml
    this.connections = new Map();
    this.eventBuffer = [];
    this.db = new Client(/* config */);
  }

  async start() {
    await this.db.connect();
    await this.loadRelays();
    await this.connectToRelays();
    
    // Flush buffer every 10 seconds
    setInterval(() => this.flushEvents(), 10000);
    
    // Compute stats every 5 minutes
    setInterval(() => this.computeStatistics(), 300000);
  }

  async connectToRelays() {
    for (const relay of this.relays) {
      this.connectRelay(relay.url);
    }
  }

  connectRelay(url) {
    const ws = new WebSocket(url);
    const startTime = Date.now();
    
    ws.on('open', () => {
      const latency = Date.now() - startTime;
      this.updateRelayHealth(url, latency, 'connected');
      
      // Subscribe to recent events
      ws.send(JSON.stringify([
        'REQ', 
        'sub-' + Date.now(),
        { kinds: [0,1,2,3,7,9735], limit: 1000, since: Math.floor(Date.now()/1000) - 3600 }
      ]));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg[0] === 'EVENT') {
          this.eventBuffer.push({
            relay: url,
            event: msg[2],
            received_at: Date.now()
          });
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    });

    ws.on('error', () => {
      this.updateRelayHealth(url, null, 'error');
    });

    ws.on('close', () => {
      // Reconnect after 30 seconds
      setTimeout(() => this.connectRelay(url), 30000);
    });

    this.connections.set(url, ws);
  }

  async flushEvents() {
    if (this.eventBuffer.length === 0) return;
    
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    
    // Batch insert to database
    await this.insertEvents(events);
    console.log(`Flushed ${events.length} events to database`);
  }

  async insertEvents(events) {
    const query = `
      INSERT INTO events_aggregated (day, relay_url, event_kind, event_count)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (day, relay_url, event_kind)
      DO UPDATE SET event_count = events_aggregated.event_count + 1
    `;
    
    for (const {relay, event} of events) {
      const day = new Date(event.created_at * 1000).toISOString().split('T')[0];
      await this.db.query(query, [day, relay, event.kind]);
    }
  }

  async computeStatistics() {
    console.log('Computing statistics...');
    
    const stats = {
      computed_at: new Date(),
      relays: await this.computeRelayStats(),
      events_24h: await this.computeEventStats('24h'),
      events_7d: await this.computeEventStats('7d'),
      events_30d: await this.computeEventStats('30d'),
      clients: await this.computeClientStats(),
      active_users: await this.computeActiveUsers()
    };

    // Save to database
    await this.saveStatistics(stats);
    
    // Generate JSON files for API
    await this.generateAPIFiles(stats);
  }

  async generateAPIFiles(stats) {
    const fs = require('fs').promises;
    const apiDir = './api/v1';
    
    await fs.mkdir(`${apiDir}/stats`, { recursive: true });
    
    // Write individual endpoint files
    await fs.writeFile(
      `${apiDir}/stats/overview.json`,
      JSON.stringify({
        total_relays: stats.relays.total,
        active_relays: stats.relays.active,
        total_events_24h: stats.events_24h.total,
        avg_latency: stats.relays.avg_latency,
        updated_at: stats.computed_at
      }, null, 2)
    );

    await fs.writeFile(
      `${apiDir}/stats/relays.json`,
      JSON.stringify(stats.relays.list, null, 2)
    );

    await fs.writeFile(
      `${apiDir}/stats/events-24h.json`,
      JSON.stringify(stats.events_24h, null, 2)
    );

    // More files...
  }
}

module.exports = RelayCollector;
```

### Phase 2: API Endpoints (Week 2-3)

#### 2.1 REST API Server
```javascript
// backend/api/server.js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// CORS configuration - allow others to use your API
app.use(cors({
  origin: '*', // Or specify allowed domains
  methods: ['GET'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Serve static JSON files
app.use('/api/v1', express.static('./api/v1'));

// Dynamic endpoints with database queries
app.get('/api/v1/stats/realtime', async (req, res) => {
  const stats = await getRealtimeStats(); // From Redis
  res.json(stats);
});

app.get('/api/v1/relays/:url/events', async (req, res) => {
  const { url } = req.params;
  const { timeRange = '24h' } = req.query;
  
  const events = await getRelayEvents(url, timeRange);
  res.json(events);
});

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.listen(3000, () => {
  console.log('API server running on port 3000');
});
```

#### 2.2 API Documentation
Create `/api/v1/docs.json` (OpenAPI spec):
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Nostr.info API",
    "version": "1.0.0",
    "description": "Precomputed statistics and analytics for the Nostr network"
  },
  "servers": [
    { "url": "https://nostr.info/api/v1" }
  ],
  "paths": {
    "/stats/overview": {
      "get": {
        "summary": "Get overview statistics",
        "responses": {
          "200": {
            "description": "Overview statistics",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "total_relays": { "type": "integer" },
                    "active_relays": { "type": "integer" },
                    "total_events_24h": { "type": "integer" },
                    "avg_latency": { "type": "number" },
                    "updated_at": { "type": "string", "format": "date-time" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Phase 3: Frontend Migration (Week 3-4)

#### 3.1 Update Frontend to Use API
```javascript
// assets/js/analytics-api.js
class NostrAnalyticsAPI {
  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
    this.cache = new Map();
    this.cacheExpiry = 60000; // 1 minute
  }

  async fetchWithCache(endpoint) {
    const cached = this.cache.get(endpoint);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`);
    const data = await response.json();
    
    this.cache.set(endpoint, { data, timestamp: Date.now() });
    return data;
  }

  async getOverview() {
    return this.fetchWithCache('/stats/overview');
  }

  async getRelays() {
    return this.fetchWithCache('/stats/relays');
  }

  async getEvents(timeRange = '24h') {
    return this.fetchWithCache(`/stats/events-${timeRange}`);
  }

  async getClients() {
    return this.fetchWithCache('/stats/clients');
  }
}

// Usage in statistics.js
const api = new NostrAnalyticsAPI();

async function loadStatistics() {
  try {
    const overview = await api.getOverview();
    document.getElementById('stat-total-relays').textContent = overview.total_relays;
    document.getElementById('stat-total-events').textContent = overview.total_events_24h;
    // etc...
  } catch (error) {
    console.error('Failed to load statistics:', error);
  }
}
```

#### 3.2 Hybrid Approach (Optional Real-time)
```javascript
// Keep real-time for specific features
class HybridAnalytics {
  constructor() {
    this.api = new NostrAnalyticsAPI();
    this.liveConnection = null; // Optional WebSocket for real-time updates
  }

  async initialize() {
    // Load precomputed data first (fast)
    const baseData = await this.api.getOverview();
    this.displayData(baseData);
    
    // Optionally connect for real-time updates
    if (this.shouldConnectRealtime()) {
      this.connectRealtime();
    }
  }

  shouldConnectRealtime() {
    // Only connect if user stays on page > 30 seconds
    return document.hasFocus();
  }

  connectRealtime() {
    // Connect to a few relays for live feed (not all 240+)
    const priorityRelays = ['wss://relay.damus.io', 'wss://nos.lol'];
    // ... light real-time connection
  }
}
```

### Phase 4: Public API & Documentation (Week 4)

#### 4.1 Create API Landing Page
```markdown
# _pages/api.md
---
layout: page
title: API
permalink: /api/
---

# Nostr.info Public API

Access precomputed Nostr network statistics via our REST API.

## Base URL
```
https://nostr.info/api/v1
```

## Endpoints

### Statistics
- `GET /stats/overview` - General network statistics
- `GET /stats/relays` - Relay health and performance data
- `GET /stats/events-{timeRange}` - Event counts by time range (24h, 7d, 30d)
- `GET /stats/clients` - Client distribution statistics

### Rate Limits
- 100 requests per 15 minutes per IP
- No authentication required

### Example Request
```bash
curl https://nostr.info/api/v1/stats/overview
```

### Example Response
```json
{
  "total_relays": 245,
  "active_relays": 187,
  "total_events_24h": 1234567,
  "avg_latency": 156,
  "updated_at": "2025-11-14T10:30:00Z"
}
```

## CORS
All endpoints support CORS. You can call them from any domain.

## OpenAPI Spec
[Download OpenAPI specification](/api/v1/docs.json)
```

#### 4.2 Add API Usage Examples
```javascript
// Example for third-party developers
const response = await fetch('https://nostr.info/api/v1/stats/overview');
const data = await response.json();
console.log(`Nostr has ${data.total_relays} relays!`);
```

### Phase 5: Deployment & Monitoring (Week 5)

#### 5.1 Infrastructure
```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: nostr_analytics
      POSTGRES_USER: nostr
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

  collector:
    build: ./backend
    command: node services/relay-collector.js
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgres://nostr:${DB_PASSWORD}@postgres/nostr_analytics
      REDIS_URL: redis://redis:6379

  api:
    build: ./backend
    command: node api/server.js
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

#### 5.2 Monitoring
- Use Prometheus + Grafana for monitoring
- Track API response times, error rates
- Monitor relay connection health
- Alert on data collection failures

## Benefits Summary

### Performance
- **Page load**: 3-5s → <500ms
- **Relay connections**: 240 per client → 240 total (shared)
- **Data freshness**: 5-15 minute lag (acceptable for analytics)

### Scalability
- **Current**: Limited by client browsers
- **New**: Handle 1000s of concurrent users
- **Cost**: Predictable server costs vs unpredictable client load

### User Experience
- Instant page loads
- No connection delays
- Works offline (cached data)
- Consistent data across users

### Developer Experience
- **Public API** for community use
- **Documentation** with examples
- **Rate limits** to prevent abuse
- **CORS enabled** for web apps

## Migration Timeline

| Week | Tasks |
|------|-------|
| 1-2 | Build backend collector service |
| 2-3 | Create API endpoints & deploy |
| 3-4 | Update frontend to use API |
| 4 | Document API, create landing page |
| 5 | Deploy, monitor, optimize |

## Next Steps

1. **Start small**: Migrate one feature (e.g., relay list)
2. **Test in parallel**: Keep old system running
3. **Gradual rollout**: Feature flags for A/B testing
4. **Monitor metrics**: Compare performance before/after
5. **Gather feedback**: API users & website visitors
