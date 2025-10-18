---
layout: page
title: Relays
permalink: /relays/
---

<link rel="stylesheet" href="/assets/css/main.css">
<link rel="stylesheet" href="/assets/css/relays.css">
<script src="/js/relays.js"></script>

<div class="relays-container">
  <div class="page-header">
    <h1>Nostr Relays</h1>
  </div>

  <div class="controls-container">
    <select name="tab" id="tab" class="tab-select" onchange="setDirty()">
      <option value="relays">📡 Show Relays</option>
      <option value="events">📝 Show Events</option>
    </select>

    <div id="relay-filters">
      <div class="filter-group">
        <label for="relay-filter">Filter by Relay Performance:</label>
        <select name="relay-filter" id="relay-filter" class="filter-select" onchange="setDirty()">
          <option value="sentConnected">🌟 High Performance (Many Events, Stable)</option>
          <option value="sentMany">📈 High Volume (Many Events)</option>
          <option value="sent">✉️ Active (Sent Events)</option>
          <option value="didConnect" selected>🔌 Connected (WebSocket Active)</option>
          <option value="all">📋 All Relays</option>
        </select>
      </div>
      <button id="connectNewRelays" class="connect-button" onclick="connectRelays()">
        🔄 Connect New Relays
      </button>
    </div>
    <div id="event-filters">
      <div class="filter-group">
        <label for="kind-filter">Event Type:</label>
        <select name="kind-filter" id="kind-filter" class="filter-select" onchange="setDirty()">
          <option value="all">📋 All Event Types</option>
          <option value="unknown">❓ Unhandled Types</option>
          <option value="0">👤 Metadata</option>
          <option value="1">📝 Public Post</option>
          <option value="2">📡 Relay Recommendation</option>
          <option value="3">👥 Follows List</option>
          <option value="4">✉️ Direct Message</option>
          <option value="5">🗑️ Deletions</option>
          <option value="6">🔄 Quoted Boost</option>
          <option value="7">👍 Reactions</option>
          <option value="30">♟️ Chess</option>
          <option value="40">📢 Channel Created</option>
          <option value="41">📝 Channel Update</option>
          <option value="42">💬 Channel Message</option>
          <option value="43">🚫 Hide Message</option>
          <option value="44">🔇 Mute User</option>
          <option value="60">🚗 Ride Sharing</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="pubkey-filter">Public Key Filter:</label>
        <input type="text" 
               name="pubkey-filter" 
               id="pubkey-filter" 
               class="filter-input" 
               placeholder="Enter public key..." 
               onchange="setDirty()">
      </div>

      <div class="filter-group">
        <label for="degree-filter">Connection Depth:</label>
        <select name="degree-filter" 
                id="degree-filter" 
                class="filter-select" 
                disabled 
                onchange="setDirty()">
          <option value="0">🎯 Direct Match Only</option>
          <option value="1">👥 Direct Follows</option>
          <option value="2">🌐 Second Degree</option>
          <option value="3">🔄 Third Degree</option>
          <option value="4">📈 Fourth Degree</option>
          <option value="5">🌍 Fifth Degree</option>
        </select>
      </div>
    </div>
<br>
<div id="output"></div>
