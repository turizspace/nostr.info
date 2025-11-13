---
layout: page
title: Statistics
permalink: /
---

<link rel="stylesheet" href="/assets/css/main.css">
<link rel="stylesheet" href="/assets/css/statistics.css">
<link rel="stylesheet" href="/assets/css/analytics.css">
<script src="/js/analytics.js"></script>
<script src="/js/components/time-filter.js"></script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="/assets/dist/charts.js"></script>
<script src="/js/analytics-init.js"></script>
<script src="/js/statistics.js"></script>

<div class="statistics-container">

  <div class="stats-connection-block">
    <div class="stats-connection-header">
      <h2 class="stats-connection-title">{% fa_svg fas.fa-plug %} Live Connection Status</h2>
      <p class="stats-connection-sub">Real-time view of the relay pool powering these metrics.</p>
    </div>
    <div class="connection-status" id="connection-status">
      <div class="status-message">
        <span class="loading">Connecting to relays...</span>
      </div>
    </div>
    <details class="connection-info" name="connection-details">
      <summary>What these buckets represent</summary>
      <ul>
        <li><strong>Curated Relays:</strong> Our manually maintained list of known, reliable relays collected and verified over time.</li>
        <li><strong>Discovered Relays:</strong> Additional relays we find dynamically by reading user profiles (NIP-65 relay lists) to surface active infrastructure.</li>
        <li><strong>Total:</strong> All unique relays combined (curated + discovered); we continuously attempt new connections to keep coverage fresh.</li>
      </ul>
    </details>
  </div>

    <!-- Analytics Dashboard Section -->
  <div class="analytics-dashboard-container">
    <div class="analytics-dashboard-header">
      <h2 class="analytics-dashboard-title">{% fa_svg fas.fa-chart-area %}   </h2>
      <p class="analytics-dashboard-sub">Comprehensive real-time analytics and insights for the Nostr network</p>
    </div>

    <!-- Time Range Filter - DISABLED: Not yet implemented for real-time sorting -->
    <!-- <div id="analytics-time-filter"></div> -->

    <!-- Analytics Dashboard -->
    <div id="analytics-dashboard-root"></div>
  </div>

  <!-- Legacy Statistics Controls -->
  <div class="controls-container">
    <div class="filter-group">
      <label for="time-range">Legacy Time Range:</label>
      <select name="time-range" id="time-range" class="filter-select" onchange="updateTimeRange()">
        <option value="24h" selected>Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
      </select>
    </div>
    <button id="refresh-stats" class="refresh-button" onclick="refreshStatistics()">{% fa_svg fas.fa-arrows-rotate %} Refresh</button>
  </div>

  <nav class="stats-tabs" aria-label="Statistics sections" role="tablist">
    <button type="button" class="stats-tab active" id="tab-button-overview" role="tab" aria-selected="true" aria-controls="tab-overview" data-tab="overview">{% fa_svg fas.fa-chart-line %}<span>Legacy Overview</span></button>
    <button type="button" class="stats-tab" id="tab-button-analysis" role="tab" aria-selected="false" aria-controls="tab-analysis" data-tab="analysis">{% fa_svg fas.fa-square-poll-vertical %}<span>Legacy Analytics</span></button>
  <button type="button" class="stats-tab" id="tab-button-distribution" role="tab" aria-selected="false" aria-controls="tab-distribution" data-tab="distribution">{% fa_svg fas.fa-bullseye %}<span>Event Distribution</span></button>
  <button type="button" class="stats-tab" id="tab-button-top-relays" role="tab" aria-selected="false" aria-controls="tab-top-relays" data-tab="top-relays">{% fa_svg fas.fa-trophy %}<span>Top Relays</span></button>
  </nav>

  <div class="tab-panels">
    <section class="stats-section tab-panel active" id="tab-overview" data-tab-panel="overview" role="tabpanel" aria-labelledby="tab-button-overview">
      <div class="overview-grid">
        <div class="stat-card total-relays">
          <div class="stat-icon">{% fa_svg fas.fa-globe %}</div>
          <div class="stat-content">
            <div class="stat-label">Total Relays</div>
            <div class="stat-value" id="stat-total-relays">
              <span class="loading">...</span>
            </div>
            <div class="stat-subtext"><span id="stat-connected-relays"><span class="loading">...</span></span> connected</div>
          </div>
        </div>

        <div class="stat-card total-events">
          <div class="stat-icon">{% fa_svg fas.fa-database %}</div>
          <div class="stat-content">
            <div class="stat-label">Events Collected</div>
            <div class="stat-value" id="stat-total-events">
              <span class="loading">...</span>
            </div>
          </div>
        </div>

        <div class="stat-card response-time">
          <div class="stat-icon">{% fa_svg fas.fa-bolt %}</div>
          <div class="stat-content">
            <div class="stat-label">Avg Response Time</div>
            <div class="stat-value" id="stat-avg-response">
              <span class="loading">...</span>
            </div>
            <div class="stat-subtext">milliseconds</div>
          </div>
        </div>

        <div class="stat-card active-relays">
          <div class="stat-icon">{% fa_svg fas.fa-signal %}</div>
          <div class="stat-content">
            <div class="stat-label">Active Relays</div>
            <div class="stat-value" id="stat-active-relays">
              <span class="loading">...</span>
            </div>
            <div class="stat-subtext">responding with events</div>
          </div>
        </div>
      </div>
    </section>
  <section class="stats-section tab-panel" id="tab-analysis" data-tab-panel="analysis" role="tabpanel" aria-labelledby="tab-button-analysis" hidden>
      <div class="analytics-grid">
        <div class="analytics-card">
          <h3>Relay Discovery</h3>
          <div class="relay-discovery-grid">
            <div class="discovery-item">
              <span class="disc-label">{% fa_svg fas.fa-clipboard-list %} Curated Relays</span>
              <span class="disc-value" id="relays-curated">
                <span class="loading">...</span>
              </span>
            </div>
            <div class="discovery-item">
              <span class="disc-label">{% fa_svg fas.fa-magnifying-glass %} Discovered Relays</span>
              <span class="disc-value" id="relays-discovered">
                <span class="loading">...</span>
              </span>
            </div>
            <div class="discovery-item">
              <span class="disc-label">{% fa_svg fas.fa-circle-check %} All Active</span>
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
              <span class="latency-type">{% fa_svg fas.fa-bolt %} Fastest</span>
              <span class="latency-time" id="fastest-latency"><span class="loading">...</span></span>
              <div class="latency-relay" id="fastest-relay"><span class="loading">...</span></div>
            </div>
            <div class="latency-item">
              <span class="latency-type">{% fa_svg fas.fa-hourglass-end %} Slowest</span>
              <span class="latency-time" id="slowest-latency"><span class="loading">...</span></span>
              <div class="latency-relay" id="slowest-relay"><span class="loading">...</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  <section class="stats-section tab-panel" id="tab-distribution" data-tab-panel="distribution" role="tabpanel" aria-labelledby="tab-button-distribution" hidden>
      <div class="distribution-container">
        <div class="chart-container chart-small" style="width:100%;max-width:400px;margin:auto;display:inline-block;vertical-align:top;">
          <canvas id="event-kinds-chart"></canvas>
          <div style="text-align:center;color:#888;margin-top:0.5em;">
            <small>Pie chart: Proportional breakdown of event kinds.</small>
          </div>
        </div>
        <div class="chart-container chart-large" style="width:100%;max-width:700px;margin:auto;display:inline-block;vertical-align:top;">
          <canvas id="event-kinds-bar-chart"></canvas>
          <div style="text-align:center;color:#888;margin-top:0.5em;">
            <small>Bar chart: Client software usage.</small>
          </div>
        </div>
      </div>
    </section>
    <section class="stats-section tab-panel" id="tab-top-relays" data-tab-panel="top-relays" role="tabpanel" aria-labelledby="tab-button-top-relays" hidden>
      <div class="top-relays-grid" id="top-relays-grid">
        <!-- Cards will be rendered here by statistics.js -->
        <div class="loading" style="text-align:center;padding:2rem">Loading relay data...</div>
      </div>
    </section>
  </div>

</div>
