---
layout: page
title: Statistics
permalink: /
---

<link rel="stylesheet" href="/assets/css/main.css">
<link rel="stylesheet" href="/assets/css/statistics.css">
<script src="/js/statistics.js"></script>

<div class="statistics-container">
  
  <!-- Time Filter Controls -->
  <div class="controls-container">
    <div class="filter-group">
      <label for="time-range">Time Range:</label>
      <select name="time-range" id="time-range" class="filter-select" onchange="updateTimeRange()">
        <option value="24h" selected>📅 Last 24 Hours</option>
        <option value="7d">📅 Last 7 Days</option>
        <option value="30d">📅 Last 30 Days</option>
        <option value="90d">📅 Last 90 Days</option>
      </select>
    </div>
    <button id="refresh-stats" class="refresh-button" onclick="refreshStatistics()">🔄 Refresh</button>
  </div>

  <!-- Network Overview Infographic -->
  <section class="stats-section">
    <h2>📊 Network Overview</h2>
    <div class="overview-grid">
      <div class="stat-card active-relays">
        <div class="stat-icon">🟢</div>
        <div class="stat-content">
          <div class="stat-label">Active Relays</div>
          <div class="stat-value" id="stat-active-relays">
            <span class="loading">...</span>
          </div>
          <div class="stat-subtext" id="stat-total-relays">of <span class="loading">...</span> total</div>
        </div>
      </div>

      <div class="stat-card total-events">
        <div class="stat-icon">📝</div>
        <div class="stat-content">
          <div class="stat-label">Total Events</div>
          <div class="stat-value" id="stat-total-events">
            <span class="loading">...</span>
          </div>
          <div class="stat-subtext" id="stat-events-rate">
            <span class="loading">...</span> events/min
          </div>
        </div>
      </div>

      <div class="stat-card active-users">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
          <div class="stat-label">Active Users</div>
          <div class="stat-value" id="stat-active-users">
            <span class="loading">...</span>
          </div>
          <div class="stat-subtext" id="stat-unique-pubkeys">unique pubkeys</div>
        </div>
      </div>

      <div class="stat-card network-health">
        <div class="stat-icon">❤️</div>
        <div class="stat-content">
          <div class="stat-label">Network Health</div>
          <div class="stat-value" id="stat-network-health">
            <span class="loading">...</span>
          </div>
          <div class="stat-subtext" id="stat-health-desc">Calculating...</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Network Analytics -->
  <section class="stats-section">
    <h2>📈 Network Analytics</h2>
    <div class="analytics-grid">
      
      <div class="analytics-card">
        <h3>Relay Discovery</h3>
        <div class="relay-discovery-grid">
          <div class="discovery-item">
            <span class="disc-label">🎯 Bootstrap Relays</span>
            <span class="disc-value" id="relays-bootstrap">
              <span class="loading">...</span>
            </span>
          </div>
          <div class="discovery-item">
            <span class="disc-label">🔍 Discovered Relays</span>
            <span class="disc-value" id="relays-discovered">
              <span class="loading">...</span>
            </span>
          </div>
          <div class="discovery-item">
            <span class="disc-label">📋 Static Relays</span>
            <span class="disc-value" id="relays-static">
              <span class="loading">...</span>
            </span>
          </div>
          <div class="discovery-item">
            <span class="disc-label">✅ All Active</span>
            <span class="disc-value" id="relays-all-active">
              <span class="loading">...</span>
            </span>
          </div>
        </div>
      </div>
      
      <div class="analytics-card">
        <h3>Relay Performance</h3>
        <div class="relay-performance-grid">
          <div class="performance-item">
            <span class="perf-label">High Performance</span>
            <span class="perf-value" id="relays-high-perf">
              <span class="loading">...</span>
            </span>
            <div class="perf-bar">
              <div class="perf-bar-fill high" id="relays-high-perf-bar" style="width: 0%"></div>
            </div>
          </div>
          <div class="performance-item">
            <span class="perf-label">High Volume</span>
            <span class="perf-value" id="relays-high-vol">
              <span class="loading">...</span>
            </span>
            <div class="perf-bar">
              <div class="perf-bar-fill medium" id="relays-high-vol-bar" style="width: 0%"></div>
            </div>
          </div>
          <div class="performance-item">
            <span class="perf-label">Active</span>
            <span class="perf-value" id="relays-active">
              <span class="loading">...</span>
            </span>
            <div class="perf-bar">
              <div class="perf-bar-fill low" id="relays-active-bar" style="width: 0%"></div>
            </div>
          </div>
          <div class="performance-item">
            <span class="perf-label">Connected</span>
            <span class="perf-value" id="relays-connected">
              <span class="loading">...</span>
            </span>
            <div class="perf-bar">
              <div class="perf-bar-fill minimal" id="relays-connected-bar" style="width: 0%"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="analytics-card">
        <h3>Average Response Time</h3>
        <div class="latency-display">
          <div class="latency-value" id="avg-latency">
            <span class="loading">...</span>
          </div>
          <div class="latency-label">milliseconds</div>
        </div>
        <div class="latency-breakdown">
          <div class="latency-item">
            <span class="latency-type">Fastest</span>
            <span class="latency-time" id="fastest-latency"><span class="loading">...</span></span>
          </div>
          <div class="latency-item">
            <span class="latency-type">Slowest</span>
            <span class="latency-time" id="slowest-latency"><span class="loading">...</span></span>
          </div>
        </div>
      </div>

    </div>
  </section>

  <!-- Event Volume Over Time -->
  <section class="stats-section">
    <h2>⏱️ Event Volume Over Time</h2>
    <div class="chart-container">
      <canvas id="events-timeline-chart"></canvas>
    </div>
    <div class="chart-legend" id="timeline-legend"></div>
  </section>

  <!-- Event Kind Distribution -->
  <section class="stats-section">
    <h2>🎯 Event Kind Distribution</h2>
    <div class="distribution-container">
      <div class="chart-container chart-small">
        <canvas id="event-kinds-chart"></canvas>
      </div>
      <div class="kinds-table-container">
        <table class="kinds-distribution-table">
          <thead>
            <tr>
              <th>Event Kind</th>
              <th>Count</th>
              <th>Percentage</th>
              <th>Distribution</th>
            </tr>
          </thead>
          <tbody id="kinds-table-body">
            <tr>
              <td colspan="4" style="text-align:center;padding:2rem">
                <span class="loading">Loading event kinds...</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Top Relays by Activity -->
  <section class="stats-section">
    <h2>🏆 Top Relays by Activity</h2>
    <div class="top-relays-container">
      <table class="top-relays-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Relay URL</th>
            <th>Events</th>
            <th>Active Users</th>
            <th>Avg Latency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="top-relays-body">
          <tr>
            <td colspan="6" style="text-align:center;padding:2rem">
              <span class="loading">Loading relay data...</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Connection Status -->
  <section class="stats-section">
    <h2>🔌 Live Connection Status</h2>
    <div class="connection-status" id="connection-status">
      <div class="status-message">
        <span class="loading">Connecting to relays...</span>
      </div>
    </div>
  </section>

</div>
