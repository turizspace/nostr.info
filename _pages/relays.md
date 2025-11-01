---
layout: page
title: Relays
permalink: /relays/
---

<link rel="stylesheet" href="/assets/css/main.css">
<link rel="stylesheet" href="/assets/css/relays.css">
<link rel="stylesheet" href="/assets/css/relays-grid.css">
<script src="/js/relays.js"></script>

<div class="relays-container">

  <div class="controls-container">
    <select name="tab" id="tab" class="tab-select" onchange="setDirty()">
      <option value="relays">📡 Show Relays</option>
      <option value="events">📝 Show Events</option>
    </select>

    <div id="relay-filters">
      <div class="filters-row">
        <div class="filter-item">
          <label for="relay-filter">{% fa_svg fas.fa-filter %} Performance</label>
          <select name="relay-filter" id="relay-filter" class="filter-select" onchange="setDirty()">
            <option value="sentConnected">{% fa_svg fas.fa-star %} High Performance</option>
            <option value="sentMany">{% fa_svg fas.fa-chart-line %} High Volume</option>
            <option value="sent">{% fa_svg fas.fa-paper-plane %} Active</option>
            <option value="didConnect" selected>{% fa_svg fas.fa-plug %} Connected</option>
            <option value="all">{% fa_svg fas.fa-list %} All Relays</option>
          </select>
        </div>
        
        <div class="filter-item">
          <label for="activity-filter">{% fa_svg fas.fa-chart-bar %} Activity</label>
          <select name="activity-filter" id="activity-filter" class="filter-select" onchange="setDirty()">
            <option value="all" selected>All Levels</option>
            <option value="high">{% fa_svg fas.fa-fire %} High (100+)</option>
            <option value="medium">{% fa_svg fas.fa-bolt %} Medium (10-99)</option>
            <option value="low">{% fa_svg fas.fa-seedling %} Low (1-9)</option>
            <option value="none">{% fa_svg fas.fa-circle-xmark %} None</option>
          </select>
        </div>
        
        <div class="filter-item">
          <label for="uptime-filter">{% fa_svg fas.fa-signal %} Uptime</label>
          <select name="uptime-filter" id="uptime-filter" class="filter-select" onchange="setDirty()">
            <option value="all" selected>All Uptimes</option>
            <option value="connected">{% fa_svg fas.fa-circle-check %} Connected</option>
            <option value="disconnected">{% fa_svg fas.fa-circle-xmark %} Disconnected</option>
            <option value="never">{% fa_svg fas.fa-ban %} Never Connected</option>
          </select>
        </div>
      </div>
      
      <button id="connectNewRelays" class="connect-button" onclick="connectRelays()">
        {% fa_svg fas.fa-arrows-rotate %} Connect New Relays
      </button>
    </div>
    <div id="event-filters">
      <div class="filters-row">
        <div class="filter-item">
          <label for="kind-filter">{% fa_svg fas.fa-shapes %} Event Type</label>
          <select name="kind-filter" id="kind-filter" class="filter-select" onchange="setDirty()">
            <option value="all">{% fa_svg fas.fa-list %} All Types</option>
            <option value="unknown">{% fa_svg fas.fa-circle-question %} Unhandled</option>
            <option value="0">{% fa_svg fas.fa-user %} Metadata</option>
            <option value="1">{% fa_svg fas.fa-comment %} Public Post</option>
            <option value="2">{% fa_svg fas.fa-tower-broadcast %} Relay Rec</option>
            <option value="3">{% fa_svg fas.fa-users %} Follows</option>
            <option value="4">{% fa_svg fas.fa-envelope %} DM</option>
            <option value="5">{% fa_svg fas.fa-trash %} Deletions</option>
            <option value="6">{% fa_svg fas.fa-retweet %} Boost</option>
            <option value="7">{% fa_svg fas.fa-heart %} Reactions</option>
            <option value="30">{% fa_svg fas.fa-chess %} Chess</option>
            <option value="40">{% fa_svg fas.fa-bullhorn %} Channel Create</option>
            <option value="41">{% fa_svg fas.fa-pen %} Channel Update</option>
            <option value="42">{% fa_svg fas.fa-comments %} Channel Msg</option>
            <option value="43">{% fa_svg fas.fa-eye-slash %} Hide</option>
            <option value="44">{% fa_svg fas.fa-volume-xmark %} Mute</option>
            <option value="60">{% fa_svg fas.fa-car %} Ride Share</option>
          </select>
        </div>

        <div class="filter-item filter-item-wide">
          <label for="pubkey-filter">{% fa_svg fas.fa-key %} Public Key</label>
          <input type="text" 
                 name="pubkey-filter" 
                 id="pubkey-filter" 
                 class="filter-input" 
                 placeholder="Enter public key (hex or npub)..." 
                 onchange="setDirty()">
        </div>

        <div class="filter-item">
          <label for="degree-filter">{% fa_svg fas.fa-diagram-project %} Depth</label>
          <select name="degree-filter" 
                  id="degree-filter" 
                  class="filter-select" 
                  disabled 
                  onchange="setDirty()">
            <option value="0">{% fa_svg fas.fa-bullseye %} Direct</option>
            <option value="1">{% fa_svg fas.fa-user-group %} 1st Degree</option>
            <option value="2">{% fa_svg fas.fa-share-nodes %} 2nd Degree</option>
            <option value="3">{% fa_svg fas.fa-sitemap %} 3rd Degree</option>
            <option value="4">{% fa_svg fas.fa-network-wired %} 4th Degree</option>
            <option value="5">{% fa_svg fas.fa-globe %} 5th Degree</option>
          </select>
        </div>
      </div>
    </div>
<br>
<div id="output"></div>
