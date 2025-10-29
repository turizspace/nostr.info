---
permalink: /js/statistics.js
layout: none
---

// Statistics tracking and visualization for Nostr network
const LIMIT = 100; // Events to request from each relay
const UPDATE_INTERVAL = 5000; // Update stats every 5 seconds
const CHART_UPDATE_INTERVAL = 10000; // Update charts every 10 seconds

// Normalize relay URLs to avoid duplicates
function normalizeRelayUrl(url) {
  if (!url) return null;
  
  // Add wss:// if not present
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    url = 'wss://' + url;
  }
  
  // Remove trailing slash
  url = url.replace(/\/$/, '');
  
  // Convert to lowercase for consistency
  url = url.toLowerCase();
  
  return url;
}

// Global data storage
let relays = [];
let discoveredRelays = new Map(); // URL -> relay object
let allEvents = [];
let eventKindCounts = {};
let activeUsersPubkeys = new Set();
let statsStartTime = Date.now();
let timeRangeMs = 24 * 60 * 60 * 1000; // Default 24 hours
let relayDiscoveryInProgress = false;
let discoveredRelayCount = 0;

// Chart instances
let eventKindsChart = null;

// Initialize on page load
window.addEventListener('load', () => {
  initializeStatistics();
  setupCharts();
  connectToRelays();
  startPeriodicUpdates();
  startRelayDiscovery();
});

function initializeStatistics() {
  // Load relay list from Jekyll data
  const relayUrls = {{ site.data.relays.wss | jsonify }};
  
  // Normalize URLs to avoid duplicates
  const allRelayUrls = [...new Set(
    relayUrls.map(url => normalizeRelayUrl(url)).filter(url => url)
  )];
  
  relays = allRelayUrls.map(url => createRelayObject(url));
  
  // Initialize discovered relays map
  relays.forEach(relay => {
    discoveredRelays.set(relay.url, relay);
  });
  
  console.log(`Initialized with ${relays.length} curated relays`);
}

function createRelayObject(url) {
  return {
    url: url,
    connected: false,
    answered: false,
    events: 0,
    eventsByKind: {},
    eventsList: [],
    activeUsers: new Set(),
    latencies: [],
    connectedAt: null,
    disconnectedAt: null,
    ws: null,
    tried: false,
    isDiscovered: false,
    reliability: 0, // 0-100 score based on uptime and responsiveness
    lastConnectionAttempt: null
  };
}

function connectToRelays() {
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.innerHTML = `<div class="status-message">Connecting to ${relays.length} relays...</div>`;
  }
  
  // Connect to a subset of relays initially (to avoid overwhelming the browser)
  const initialCount = Math.min(20, relays.length);
  for (let i = 0; i < initialCount; i++) {
    setTimeout(() => setupWebSocket(relays[i], i), i * 100);
  }
  
  // Connect to remaining relays gradually
  for (let i = initialCount; i < relays.length; i++) {
    setTimeout(() => setupWebSocket(relays[i], i), initialCount * 100 + (i - initialCount) * 500);
  }
}

function setupWebSocket(relay, index) {
  if (relay.tried) return;
  
  relay.tried = true;
  const ws = new WebSocket(relay.url);
  relay.ws = ws;
  
  const reqSentAt = {};
  
  ws.onopen = () => {
    relay.connected = true;
    relay.answered = true;
    relay.connectedAt = Date.now();
    console.log(`Connected to ${relay.url}`);
    
    // Request recent events
    const now = Math.floor(Date.now() / 1000);
    const since = now - Math.floor(timeRangeMs / 1000);
    reqSentAt['main'] = Date.now();
    ws.send(JSON.stringify(["REQ", "stats-main", {
      "limit": LIMIT,
      "since": since,
      "until": now + 3600
    }]));
    
    // Request metadata
    reqSentAt['meta'] = Date.now();
    ws.send(JSON.stringify(["REQ", "stats-meta", {"kinds": [0], "limit": 100}]));
    
    updateConnectionStatus();
  };
  
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      
      if (data[0] === 'EVENT') {
        const subscriptionId = data[1];
        const event = data[2];
        
        // Calculate latency
        if (reqSentAt[subscriptionId.replace('stats-', '')]) {
          const latency = Date.now() - reqSentAt[subscriptionId.replace('stats-', '')];
          relay.latencies.push(latency);
          if (relay.latencies.length > 100) {
            relay.latencies.shift();
          }
        }
        
        // Process relay list events (NIP-65 kind 10002)
        if (event.kind === 10002 && subscriptionId === 'stats-relay-lists') {
          processRelayListEvent(event);
        }
        
        // Only process non-metadata events for main stats
        if (subscriptionId === 'stats-main' && event.kind !== 0 && event.kind !== 3) {
          relay.events++;
          relay.eventsList.push(event);
          
          // Track event kind
          if (!relay.eventsByKind[event.kind]) {
            relay.eventsByKind[event.kind] = 0;
          }
          relay.eventsByKind[event.kind]++;
          
          // Track global event kinds
          if (!eventKindCounts[event.kind]) {
            eventKindCounts[event.kind] = 0;
          }
          eventKindCounts[event.kind]++;
          
          // Track active user
          if (event.pubkey) {
            relay.activeUsers.add(event.pubkey);
            activeUsersPubkeys.add(event.pubkey);
          }
          
          // Add to global events list
          if (!allEvents.find(e => e.id === event.id)) {
            event.receivedAt = Date.now();
            event.relayUrl = relay.url;
            allEvents.push(event);
          }
        }
      } else if (data[0] === 'EOSE') {
        const subscriptionId = data[1];
        ws.send(JSON.stringify(["CLOSE", subscriptionId]));
      }
    } catch (e) {
      console.error(`Error processing message from ${relay.url}:`, e);
    }
  };
  
  ws.onclose = () => {
    relay.connected = false;
    console.log(`Disconnected from ${relay.url}`);
    updateConnectionStatus();
  };
  
  ws.onerror = (e) => {
    relay.connected = false;
    relay.disconnectedAt = Date.now();
    console.error(`Error with ${relay.url}:`, e);
    updateConnectionStatus();
    updateRelayReliability(relay);
  };
}

// Relay Discovery System
function startRelayDiscovery() {
  console.log('Starting relay discovery...');
  relayDiscoveryInProgress = true;
  
  // Wait a bit for initial connections, then start discovering
  setTimeout(() => {
    discoverRelaysFromUsers();
  }, 10000); // Wait 10 seconds for initial connections
  
  // Periodically check for new users and discover their relays
  setInterval(() => {
    discoverRelaysFromUsers();
  }, 60000); // Every minute
}

function discoverRelaysFromUsers() {
  if (activeUsersPubkeys.size === 0) {
    console.log('No active users yet, skipping relay discovery');
    return;
  }
  
  console.log(`Discovering relays from ${activeUsersPubkeys.size} active users...`);
  
  // Get connected relays
  const connectedRelays = relays.filter(r => r.connected && r.ws);
  if (connectedRelays.length === 0) {
    console.log('No connected relays to query');
    return;
  }
  
  // Request relay lists (NIP-65 kind 10002) from active users
  const pubkeyArray = Array.from(activeUsersPubkeys);
  const batchSize = 50; // Request in batches
  
  for (let i = 0; i < pubkeyArray.length; i += batchSize) {
    const batch = pubkeyArray.slice(i, i + batchSize);
    
    connectedRelays.forEach(relay => {
      if (relay.ws && relay.ws.readyState === WebSocket.OPEN) {
        relay.ws.send(JSON.stringify([
          "REQ",
          "stats-relay-lists",
          {
            "kinds": [10002],
            "authors": batch,
            "limit": batch.length
          }
        ]));
      }
    });
  }
}

function processRelayListEvent(event) {
  if (!event.tags || !Array.isArray(event.tags)) return;
  
  // Extract relay URLs from tags
  const relayUrls = event.tags
    .filter(tag => tag[0] === 'r' && tag[1])
    .map(tag => normalizeRelayUrl(tag[1]))
    .filter(url => {
      if (!url) return false;
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
  
  relayUrls.forEach(url => addDiscoveredRelay(url));
}

function addDiscoveredRelay(url) {
  // Normalize the URL before checking/adding
  url = normalizeRelayUrl(url);
  if (!url) return;
  
  // Check if we already have this relay
  if (discoveredRelays.has(url)) {
    const existingRelay = discoveredRelays.get(url);
    if (!existingRelay.isDiscovered) {
      existingRelay.isDiscovered = true;
    }
    return;
  }
  
  // Add new discovered relay
  console.log(`Discovered new relay: ${url}`);
  const newRelay = createRelayObject(url);
  newRelay.isDiscovered = true;
  
  discoveredRelays.set(url, newRelay);
  relays.push(newRelay);
  discoveredRelayCount++;
  
  // Try to connect to the new relay
  setTimeout(() => {
    setupWebSocket(newRelay, relays.length - 1);
  }, Math.random() * 5000); // Random delay 0-5 seconds
}

function updateRelayReliability(relay) {
  // Calculate reliability score based on:
  // - Connection success/failure
  // - Uptime
  // - Response time (latency)
  // - Number of events delivered
  
  let score = 0;
  
  // Connection history
  if (relay.answered) score += 40;
  if (relay.connected) score += 20;
  
  // Uptime (if we have connection time)
  if (relay.connectedAt && relay.connected) {
    const uptimeMinutes = (Date.now() - relay.connectedAt) / 60000;
    score += Math.min(20, uptimeMinutes / 5); // Up to 20 points for 100+ minutes uptime
  }
  
  // Latency (average of recent latencies)
  if (relay.latencies.length > 0) {
    const avgLatency = relay.latencies.reduce((a, b) => a + b, 0) / relay.latencies.length;
    if (avgLatency < 100) score += 10;
    else if (avgLatency < 500) score += 5;
  }
  
  // Events delivered
  if (relay.events > 50) score += 10;
  else if (relay.events > 10) score += 5;
  
  relay.reliability = Math.min(100, score);
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connection-status');
  if (!statusEl) return;
  
  const connected = relays.filter(r => r.connected).length;
  const total = relays.length;
  const percentage = ((connected / total) * 100).toFixed(1);
  
  // Discovered relays: Additional relays found from user profiles (NIP-65)
  const discoveredRelays = relays.filter(r => r.isDiscovered);
  const discoveredConnected = discoveredRelays.filter(r => r.connected).length;
  const discoveredTotal = discoveredRelays.length;
  
  // Curated relays: Relays from our curated list (not discovered)
  const curatedRelays = relays.filter(r => !r.isDiscovered);
  const curatedConnected = curatedRelays.filter(r => r.connected).length;
  const curatedTotal = curatedRelays.length;
  
  // Verify math: total should equal curated + discovered
  const calculatedTotal = curatedTotal + discoveredTotal;
  const breakdown = `${curatedTotal} curated + ${discoveredTotal} discovered = ${calculatedTotal}`;
  
  statusEl.innerHTML = `
    <div class="status-grid">
      <div class="status-item" title="Currently active WebSocket connections out of all unique relays we know about. ${breakdown}">
        <span class="status-label">🟢 Connected Relays:</span>
        <span class="status-value">${connected} / ${total}</span>
      </div>
      <div class="status-item" title="Percentage of all relays we successfully connected to">
        <span class="status-label">📊 Success Rate:</span>
        <span class="status-value">${percentage}%</span>
      </div>
      <div class="status-item" title="Our curated list of known, reliable relays">
        <span class="status-label">📋 Curated:</span>
        <span class="status-value">${curatedConnected} / ${curatedTotal}</span>
      </div>
      <div class="status-item" title="Relays discovered from user profiles (NIP-65 relay lists) - we actively find and connect to these">
        <span class="status-label">🔍 Discovered:</span>
        <span class="status-value">${discoveredConnected} / ${discoveredTotal}</span>
      </div>
      <div class="status-breakdown" style="grid-column: 1 / -1; text-align: center; font-size: 0.875rem; color: #6c757d; padding: 0.5rem;">
        Total = ${curatedTotal} curated + ${discoveredTotal} discovered
      </div>
      <div class="status-progress">
        <div class="progress-bar" style="width: ${percentage}%"></div>
      </div>
    </div>
  `;
}

function startPeriodicUpdates() {
  // Update statistics display
  setInterval(() => {
    updateStatistics();
  }, UPDATE_INTERVAL);
  
  // Update charts less frequently (they're more expensive)
  setInterval(() => {
    updateCharts();
  }, CHART_UPDATE_INTERVAL);
  
  // Initial update
  setTimeout(() => {
    updateStatistics();
    updateCharts();
  }, 2000);
}

function updateStatistics() {
  updateNetworkOverview();
  updateNetworkAnalytics();
  updateTopRelays();
  updateKindsTable();
}

function updateNetworkOverview() {
  const now = Date.now();
  const cutoffTime = now - timeRangeMs;
  
  // Total relays being monitored
  const totalRelays = relays.length;
  const connectedRelays = relays.filter(r => r.connected).length;
  
  // Active relays (connected and actually sending events)
  const activeRelays = relays.filter(r => r.connected && r.events > 0).length;
  
  // Total events in time range
  const recentEvents = allEvents.filter(e => e.created_at * 1000 >= cutoffTime);
  const totalEvents = recentEvents.length;
  
  // Average response time across all relays with latency data
  const relaysWithLatency = relays.filter(r => r.latencies.length > 0);
  let avgResponse = 'N/A';
  if (relaysWithLatency.length > 0) {
    const allLatencies = relaysWithLatency.flatMap(r => r.latencies);
    avgResponse = (allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length).toFixed(0) + 'ms';
  }
  
  // Update DOM
  setElementText('stat-total-relays', totalRelays);
  setElementText('stat-connected-relays', connectedRelays);
  setElementText('stat-active-relays', activeRelays);
  setElementText('stat-total-events', totalEvents.toLocaleString());
  setElementText('stat-avg-response', avgResponse);
}

function updateNetworkAnalytics() {
  const totalRelays = relays.length;
  
  // Relay discovery stats
  const discoveredCount = relays.filter(r => r.isDiscovered).length;
  const curatedCount = relays.filter(r => !r.isDiscovered).length;
  const allActive = relays.filter(r => r.connected && r.events > 0).length;
  
  setElementText('relays-discovered', `${discoveredCount} (${relays.filter(r => r.isDiscovered && r.connected).length} connected)`);
  setElementText('relays-curated', `${curatedCount} (${relays.filter(r => !r.isDiscovered && r.connected).length} connected)`);
  setElementText('relays-all-active', allActive);
  
  // Relay performance categories
  const highPerf = relays.filter(r => r.events >= LIMIT && r.connected).length;
  const highVol = relays.filter(r => r.events >= LIMIT).length;
  const active = relays.filter(r => r.connected && r.events > 0).length; // Same as allActive
  const connected = relays.filter(r => r.connected).length;
  
  setElementText('relays-high-perf', highPerf);
  setElementText('relays-high-vol', highVol);
  setElementText('relays-active', active);
  setElementText('relays-connected', connected);
  
  // Update bars
  setBarWidth('relays-high-perf-bar', (highPerf / totalRelays) * 100);
  setBarWidth('relays-high-vol-bar', (highVol / totalRelays) * 100);
  setBarWidth('relays-active-bar', (active / totalRelays) * 100);
  setBarWidth('relays-connected-bar', (connected / totalRelays) * 100);
  
  // Average latency with relay names
  const relaysWithLatency = relays.filter(r => r.latencies.length > 0);
  if (relaysWithLatency.length > 0) {
    // Calculate average latency for each relay
    const relayAvgLatencies = relaysWithLatency.map(r => ({
      url: r.url,
      avgLatency: r.latencies.reduce((sum, l) => sum + l, 0) / r.latencies.length
    }));
    
    // Find fastest and slowest
    const fastest = relayAvgLatencies.reduce((min, r) => r.avgLatency < min.avgLatency ? r : min);
    const slowest = relayAvgLatencies.reduce((max, r) => r.avgLatency > max.avgLatency ? r : max);
    
    // Overall average
    const allLatencies = relaysWithLatency.flatMap(r => r.latencies);
    const avgLatency = (allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length).toFixed(0);
    
    setElementText('avg-latency', avgLatency);
    setElementText('fastest-latency', `${fastest.avgLatency.toFixed(0)}ms`);
    setElementText('fastest-relay', fastest.url);
    setElementText('slowest-latency', `${slowest.avgLatency.toFixed(0)}ms`);
    setElementText('slowest-relay', slowest.url);
  }
}

function updateTopRelays() {
  const topRelays = [...relays]
    .filter(r => r.events > 0)
    .sort((a, b) => b.events - a.events)
    .slice(0, 10);
  
  const tbody = document.getElementById('top-relays-body');
  if (!tbody) return;
  
  if (topRelays.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">No relay activity yet. Waiting for events...</td></tr>';
    return;
  }
  
  tbody.innerHTML = topRelays.map((relay, idx) => {
    const avgLatency = relay.latencies.length > 0
      ? (relay.latencies.reduce((sum, l) => sum + l, 0) / relay.latencies.length).toFixed(0)
      : '-';
    
    const status = relay.connected
      ? '<span class="status-badge online">Online</span>'
      : '<span class="status-badge offline">Offline</span>';
    
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${relay.url}</code></td>
        <td><strong>${relay.events}</strong></td>
        <td>${relay.activeUsers.size}</td>
        <td>${avgLatency}ms</td>
        <td>${status}</td>
      </tr>
    `;
  }).join('');
}

function updateKindsTable() {
  const tbody = document.getElementById('kinds-table-body');
  if (!tbody) return;
  
  const sortedKinds = Object.entries(eventKindCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20); // Top 20 kinds
  
  if (sortedKinds.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem">No events received yet</td></tr>';
    return;
  }
  
  const totalEvents = sortedKinds.reduce((sum, [_, count]) => sum + count, 0);
  
  tbody.innerHTML = sortedKinds.map(([kind, count]) => {
    const percentage = ((count / totalEvents) * 100).toFixed(1);
    const kindName = getKindName(parseInt(kind));
    
    return `
      <tr>
        <td><strong>${kindName}</strong> <small>(${kind})</small></td>
        <td>${count.toLocaleString()}</td>
        <td>${percentage}%</td>
        <td>
          <div class="distribution-bar">
            <div class="distribution-fill" style="width: ${percentage}%"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setupCharts() {
  // Check if Chart.js is available
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded, loading from CDN...');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = () => {
      console.log('Chart.js loaded');
      initializeCharts();
    };
    document.head.appendChild(script);
  } else {
    initializeCharts();
  }
}

function initializeCharts() {
  // Event kinds pie chart
  const kindsCanvas = document.getElementById('event-kinds-chart');
  if (kindsCanvas) {
    eventKindsChart = new Chart(kindsCanvas, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)',
            'rgba(255, 159, 64, 0.8)',
            'rgba(199, 199, 199, 0.8)',
            'rgba(83, 102, 255, 0.8)',
            'rgba(255, 99, 255, 0.8)',
            'rgba(99, 255, 132, 0.8)'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right',
            labels: {
              boxWidth: 15,
              padding: 10
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }
}

function updateCharts() {
  updateKindsChart();
}

function updateKindsChart() {
  if (!eventKindsChart) return;
  
  const sortedKinds = Object.entries(eventKindCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10 for pie chart
  
  if (sortedKinds.length === 0) return;
  
  const labels = sortedKinds.map(([kind, _]) => getKindName(parseInt(kind)));
  const data = sortedKinds.map(([_, count]) => count);
  
  eventKindsChart.data.labels = labels;
  eventKindsChart.data.datasets[0].data = data;
  eventKindsChart.update('none');
}

function updateTimeRange() {
  const select = document.getElementById('time-range');
  if (!select) return;
  
  const value = select.value;
  switch (value) {
    case '24h':
      timeRangeMs = 24 * 60 * 60 * 1000;
      break;
    case '7d':
      timeRangeMs = 7 * 24 * 60 * 60 * 1000;
      break;
    case '30d':
      timeRangeMs = 30 * 24 * 60 * 60 * 1000;
      break;
    case '90d':
      timeRangeMs = 90 * 24 * 60 * 60 * 1000;
      break;
  }
  
  // Reconnect with new time range
  refreshStatistics();
}

function refreshStatistics() {
  // Clear existing data
  allEvents = [];
  eventTimeline = [];
  eventKindCounts = {};
  activeUsersPubkeys = new Set();
  statsStartTime = Date.now();
  
  // Disconnect and reconnect
  relays.forEach(relay => {
    if (relay.ws) {
      relay.ws.close();
    }
    relay.connected = false;
    relay.tried = false;
    relay.events = 0;
    relay.eventsByKind = {};
    relay.eventsList = [];
    relay.activeUsers = new Set();
    relay.latencies = [];
  });
  
  // Reconnect
  setTimeout(() => {
    connectToRelays();
  }, 500);
  
  // Update immediately
  updateStatistics();
  updateCharts();
}

// Utility functions
function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function setBarWidth(id, percentage) {
  const el = document.getElementById(id);
  if (el) {
    el.style.width = `${Math.min(100, percentage)}%`;
  }
}

function formatTimeBucket(timestamp, bucketSize) {
  const date = new Date(timestamp);
  const hours = timeRangeMs / (1000 * 60 * 60);
  
  if (hours <= 24) {
    // Show hours for 24h view
    return date.getHours().toString().padStart(2, '0') + ':00';
  } else if (hours <= 168) {
    // Show day/hour for 7d view
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()] + ' ' + date.getHours().toString().padStart(2, '0') + 'h';
  } else {
    // Show date for 30d/90d view
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

function getKindName(kind) {
  const kindNames = {
    0: 'Metadata',
    1: 'Text Note',
    2: 'Relay Recommendation',
    3: 'Contacts',
    4: 'Encrypted DM',
    5: 'Event Deletion',
    6: 'Repost',
    7: 'Reaction',
    30: 'Chess (PGN)',
    40: 'Channel Creation',
    41: 'Channel Metadata',
    42: 'Channel Message',
    43: 'Channel Hide',
    44: 'Channel Mute',
    60: 'Ride Sharing',
    1059: 'Gift Wrap',
    1984: 'Reporting',
    9734: 'Zap Request',
    9735: 'Zap',
    10000: 'Mute List',
    10001: 'Pin List',
    10002: 'Relay List',
    22820: 'WebRTC Connection',
    22955: 'WebRTC Signaling',
    30000: 'Categorized People',
    30001: 'Categorized Bookmarks',
    30023: 'Long-form Content'
  };
  return kindNames[kind] || `Kind ${kind}`;
}
