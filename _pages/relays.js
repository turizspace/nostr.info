---
permalink: /js/relays.js
layout: none
---

function shuffle(array) {
  var random = array.map(Math.random);
  array.sort(function(a, b) {
    return random[a] - random[b];
  });
}

window.addEventListener('load', () => {
  window.relays = {{ site.data.relays.wss | jsonify }}.map(it=>{ return {
    url: `wss://${it}`,
    tried: -1, // we tried to connect it
    connected: false, // currently connected
    answered: false, // was connected in the past
    events: 0, // event counter
    wrongKind: 0, // count unexpected events
    invalid: 0, // events with missing parts
    msg: "",
    latencies: [], // track request-response times
    activeUsers: new Set(), // unique pubkeys seen
    eventsByKind: {}, // count events by kind number
    eventsList: [], // store actual events from this relay
    connectedAt: null, // timestamp when connection established
    firstEventAt: null, // timestamp of first event received
    nip11: null // relay metadata from NIP-11
  }})
  shuffle(relays)
  relays.forEach((r, id) => { setupWs(r, id) })
  window.tab = document.getElementById("tab")
  window.relayFilters = document.getElementById("relay-filters")
  window.relayQualityFilter = document.getElementById("relay-filter")
  window.activityFilter = document.getElementById("activity-filter")
  window.uptimeFilter = document.getElementById("uptime-filter")
  window.connectRelaysBtn = document.getElementById("connectNewRelays")
  window.eventFilters = document.getElementById("event-filters")
  window.kindFilter = document.getElementById("kind-filter")
  window.pubkeyFilter = document.getElementById("pubkey-filter")
  window.degreeFilter = document.getElementById("degree-filter")
  window.output = document.getElementById("output")
  window.expandedEvent = ""
  
  // Add scroll listeners to pause updates during scrolling
  window.addEventListener('scroll', handleScrollStart, true) // Use capture to catch all scroll events
  output.addEventListener('scroll', handleScrollStart)
})

const LIMIT = 100 // how many events to show
const throttleMs = 500
var received = []
const meta = {}
const follows = {}

var tUpdate = 0
var isScrolling = false
var scrollTimeout = null

// Detect when user is scrolling and pause updates
function handleScrollStart() {
  isScrolling = true
  clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    isScrolling = false
  }, 150) // User stopped scrolling for 150ms
}

function setDirty() {
  const t = ts()
  // ms since last scheduled update. Negative if in the future.
  const dt = t - tUpdate
  if (dt > 0) {
    // No update is scheduled for now or the future. Schedule one for at least
    // [throttleMs] ms after the prior one.
    tUpdate = Math.max(tUpdate + throttleMs, t)    
    setTimeout(() => {
      // Skip update if user is actively scrolling
      if (!isScrolling) {
        update()
      } else {
        // Reschedule for later
        setDirty()
      }
    }, tUpdate - t)
  }
}

function update() {
  const nearFuture = ts() / 1000 + 60 * 60
  received = received
    // near future
    .filter(it=>it.created_at<nearFuture)
    // newest first
    .sort( (a,b) => b.created_at - a.created_at )
    // clip to only LIMIT events
    .slice(0, LIMIT)

  // Save scroll position before updating
  const outputElement = output
  const scrollLeft = outputElement.scrollLeft
  const scrollTop = outputElement.scrollTop
  
  // Find any scrollable table wrapper and save its scroll position
  const tableWrapper = outputElement.querySelector('.relay-table-wrapper')
  const tableScrollLeft = tableWrapper ? tableWrapper.scrollLeft : 0
  const hasScrolled = tableScrollLeft > 0

  eventFilters.hidden = true
  relayFilters.hidden = true
  switch(tab.value) {
    case "relays":
      relayFilters.hidden = false
      output.innerHTML = relaysTable()
      break
    case "events":
      if (pubkeyFilter.value) {
        degreeFilter.removeAttribute('disabled')
      } else {
        degreeFilter.setAttribute('disabled', '')
      }
      eventFilters.hidden = false
      output.innerHTML = eventsTable()
      break
  }
  
  // Only restore scroll if user had scrolled before
  if (hasScrolled || scrollLeft > 0 || scrollTop > 0) {
    // Restore scroll position after updating - use immediate + RAF for reliability
    const newTableWrapper = outputElement.querySelector('.relay-table-wrapper')
    if (newTableWrapper && tableScrollLeft > 0) {
      // Set immediately
      newTableWrapper.scrollLeft = tableScrollLeft
      // Also set after next paint
      requestAnimationFrame(() => {
        if (newTableWrapper.scrollLeft !== tableScrollLeft) {
          newTableWrapper.scrollLeft = tableScrollLeft
        }
      })
      // Add scroll listener to this new wrapper
      newTableWrapper.addEventListener('scroll', handleScrollStart, { passive: true })
    }
    
    outputElement.scrollLeft = scrollLeft
    outputElement.scrollTop = scrollTop
  }
}

function connectRelays() {
  relays.forEach((r, id) => {
    if (r.tried < 0) {
      setupWs(r, id)
    }
  })
}

function relaysTable() {
  connectRelaysBtn.hidden = relays.filter(it=>it.tried<0).length === 0
  return '<div class="relay-table-wrapper"><table class="relay-table">' +
    '<thead><tr>' +
    '<th>Relay URL</th>' +
    '<th>Events<sup>1</sup></th>' +
    '<th>Active Users</th>' +
    '<th>Avg Latency</th>' +
    '<th>Connected Time</th>' +
    '<th>Status<sup>2</sup></th>' +
    '<th>Information</th>' +
    '</tr></thead><tbody>' +
    relays.filter(r=>{
      // Performance filter
      let passesPerformance = false
      switch (relayQualityFilter.value) {
        case 'all': passesPerformance = true; break
        case 'didConnect': passesPerformance = r.answered; break
        case 'sent': passesPerformance = r.events > 0; break
        case 'sentMany': passesPerformance = r.events >= LIMIT; break
        case 'sentConnected': passesPerformance = r.events >= LIMIT && r.connected; break
        default: passesPerformance = false
      }
      
      // Activity filter
      let passesActivity = true
      if (activityFilter && activityFilter.value !== 'all') {
        switch (activityFilter.value) {
          case 'high': passesActivity = r.events >= 100; break
          case 'medium': passesActivity = r.events >= 10 && r.events < 100; break
          case 'low': passesActivity = r.events >= 1 && r.events < 10; break
          case 'none': passesActivity = r.events === 0; break
        }
      }
      
      // Uptime filter
      let passesUptime = true
      if (uptimeFilter && uptimeFilter.value !== 'all') {
        switch (uptimeFilter.value) {
          case 'connected': passesUptime = r.connected; break
          case 'disconnected': passesUptime = !r.connected && r.answered; break
          case 'never': passesUptime = !r.answered; break
        }
      }
      
      return passesPerformance && passesActivity && passesUptime
    }).map((r, idx)=>{
      // Find the original index in the relays array
      const originalIdx = relays.findIndex(relay => relay.url === r.url)
      
      const status = r.tried < 0
        ? '<span class="status pending">Pending</span>'
        : r.connected
          ? '<span class="status connected">Connected</span>'
          : r.answered
            ? '<span class="status disconnected">Disconnected</span>'
            : '<span class="status disconnected">Failed</span>';
      
      const avgLatency = r.latencies.length > 0 
        ? (r.latencies.reduce((sum, l) => sum + l, 0) / r.latencies.length).toFixed(0) + 'ms'
        : '-';
      
      const connectedTime = r.connectedAt 
        ? formatDuration(ts() - r.connectedAt)
        : '-';
      
      const activeUsers = r.activeUsers.size;
      
      const info = [];
      if (r.wrongKind > 0) info.push(`${r.wrongKind} unrequested events`);
      if (r.invalid > 0) info.push(`${r.invalid} invalid events`);
      if (r.msg.length > 0) info.push(r.msg);
      
      return `<tr class="relay-row" onclick="showRelayDetails(${originalIdx})" style="cursor:pointer">
        <td><code>${r.url}</code></td>
        <td>${r.events > 0 ? `<strong>${r.events}</strong>` : '0'}</td>
        <td>${activeUsers > 0 ? activeUsers : '-'}</td>
        <td>${avgLatency}</td>
        <td>${connectedTime}</td>
        <td>${status}</td>
        <td>${info.join('<br>')}</td>
      </tr>`;
    }).join('') +
        `</tbody><tfoot>
          <tr><td colspan="7">
            <sup>1</sup> Events count shows the number of events received after requesting ${LIMIT} most recent events. 
            Events for metadata and follows are not included in this count.
          </td></tr>
          <tr><td colspan="7">
            <sup>2</sup> Status indicates current connection state: 
            Connected (active), Disconnected (lost connection), 
            Failed (never connected), or Pending (not yet attempted).
          </td></tr>
        </tfoot></table></div>
  <div style='margin:8px'>
    Total: ${relays.length} relays. ${relays.filter(r => r.connected).length} connected. ${relays.filter(r => r.events > 0).length} active.
  </div>`
}

function eventsTable() {
  const kindFiltered = filterByKind()
  const filtered = filterByPubkey(kindFiltered)
  
  return `${filtered.length}/${LIMIT} Events:<br>`
    + filtered.map(it => eventBadge(it)).join('<br>')
}

function filterByPubkey(list) {
  const pubkey = pubkeyFilter.value
  const degree = degreeFilter.value
  if (!pubkey) {
    return list
  }
  if (pubkey.length != 64) {
    return []
  }
  const followsByDegree = [new Set()]
  followsByDegree[0].add(pubkey)
  for (n=1; n<= degree; n++) {
    // determine the n-th degree of follows
    const f = new Set()
    followsByDegree[n - 1]
      .forEach(it => {
        (follows[it] || [])
          .forEach(x => f.add(x))
        })
    for (i=0; i<n; i++) {
      // store each pubkey only in the lowest degree
      followsByDegree[i].forEach(it => f.delete(it))
    }
    followsByDegree[n] = f
  }
  return list.map(it => {
    it.degree = followsByDegree.findIndex(x => x.has(it.pubkey))
    return it
  }).filter(e => e.degree >= 0)
}

function filterByKind() {
  const kind = kindFilter.value
  if (kind === 'all') {
    return received
  } else if (kind === 'unknown') {
    const knownKinds = [0,1,2,3,4,5,6,7,30,40,41,42,43,44,60]
    return received.filter(ev => !knownKinds.includes(ev.kind))
  } else {
    return received.filter(it => it.kind == kind)
  }
}

function setPubkey(pubkey) {
  pubkeyFilter.value=pubkey
  setDirty()
}

function nameFromPubkey(pubkey) {
  const m = meta[pubkey]
  const img = (m && m.picture) || '/assets/smallNoicon.png'
  const name = (m && m.name) || pubkey || 'unknown'
  return `<span class="meta" onclick="setPubkey('${pubkey}')">
  <img src="${img}">&nbsp;${escapeHTML(name)}
</span>`
}

function setExpand(id) {
  expandedEvent = id
  setDirty()
}

function rawEventWidget(event) {
  // TODO: show copy button which copies without pretty-print
  const e = JSON.stringify(
    event,
    (key, value) => {
      if (["relays"].includes(key)) {
        return undefined
      }
      return value
    },
    2)
  const eRelays = '<table><tr><td>#</td><td>Relay</td><td>dt</td><td>event #<sup>1</sup></td></tr>' +
    event.relays.map((it,i)=>`<tr><td>${i+1}</td><td>${relays[it.id].url.slice(6)}</td><td>${
    i==0
      ? 'first'
      : `+${it.timeMs - event.relays[0].timeMs}ms`
    }</td><td>${it.count}</td></tr>`).join('') +
    '<tr><td colspan="4"><sup>1</sup>The n-th event processed from this relay.</td></tr></table>'
  
  return `<br>Received in this order from:${eRelays}<pre>${escapeHTML(e)}</pre>`
}

function getKindName(kind) {
  const kindNames = {
    0: 'Metadata',
    1: 'Text Note',
    2: 'Relay Recommendation',
    3: 'Contacts',
    4: 'Encrypted Direct Message',
    5: 'Event Deletion',
    6: 'Repost',
    7: 'Reaction',
    30: 'Chess (PGN)',
    40: 'Channel Creation',
    41: 'Channel Metadata',
    42: 'Channel Message',
    43: 'Channel Hide Message',
    44: 'Channel Mute User',
    60: 'Ride Sharing',
    1059: 'Gift Wrap',
    1984: 'Reporting',
    9734: 'Zap Request',
    9735: 'Zap',
    10000: 'Mute List',
    10001: 'Pin List',
    10002: 'Relay List Metadata',
    22820: 'WebRTC Connection',
    22955: 'WebRTC Signaling',
    30000: 'Categorized People',
    30001: 'Categorized Bookmarks',
    30023: 'Long-form Content'
  }
  return kindNames[kind] || `Kind ${kind}`
}

function formatEventContent(event, maxLength = 200) {
  const content = event.content
  
  // Truncate very long content
  if (content.length > maxLength) {
    return escapeHTML(content.substring(0, maxLength)) + '...'
  }
  
  // Try to parse JSON content
  try {
    const parsed = JSON.parse(content)
    const jsonStr = JSON.stringify(parsed, null, 2)
    if (jsonStr.length > maxLength) {
      return `<details class="json-content"><summary>View JSON content (${jsonStr.length} chars)</summary><pre>${escapeHTML(jsonStr)}</pre></details>`
    }
    return `<details class="json-content"><summary>View JSON content</summary><pre>${escapeHTML(jsonStr)}</pre></details>`
  } catch(e) {
    // Not JSON, return as-is with truncation
    if (content.length > maxLength) {
      return escapeHTML(content.substring(0, maxLength)) + '...'
    }
    return escapeHTML(content)
  }
}

function formatTags(tags) {
  if (!tags || tags.length === 0) return ''
  
  const tagSummary = tags.map(tag => {
    const [type, value, ...rest] = tag
    const truncatedValue = value && value.length > 50 ? value.substring(0, 50) + '...' : value
    switch(type) {
      case 'p': return `<span class="tag tag-p" title="Pubkey: ${value}">👤 @${value.substring(0, 8)}...</span>`
      case 'e': return `<span class="tag tag-e" title="Event: ${value}">📝 Event: ${value.substring(0, 8)}...</span>`
      case 't': return `<span class="tag tag-t">#${escapeHTML(value || '')}</span>`
      case 'r': return `<span class="tag tag-r" title="${escapeHTML(value || '')}">🔗 ${escapeHTML(truncatedValue || '')}</span>`
      case 'bolt11': return `<span class="tag tag-other" title="${escapeHTML(value || '')}">bolt11: ${escapeHTML(value ? value.substring(0, 12) : '')}...</span>`
      case 'description': return `<span class="tag tag-other">description: ${escapeHTML(value ? value.substring(0, 20) : '')}...</span>`
      case 'preimage': return `<span class="tag tag-other">preimage: ${escapeHTML(value ? value.substring(0, 12) : '')}...</span>`
      default: {
        const displayValue = value ? (value.length > 20 ? value.substring(0, 20) + '...' : value) : ''
        return `<span class="tag tag-other" title="${escapeHTML(type)}: ${escapeHTML(value || '')}">${escapeHTML(type)}: ${escapeHTML(displayValue)}</span>`
      }
    }
  }).join(' ')
  
  return `<div class="event-tags">${tagSummary}</div>`
}

function eventBadge(event) {
  const degree = pubkeyFilter.value ? `<span class="degree-badge">D=${event.degree}</span> ` : ''
  const from = nameFromPubkey(event.pubkey)
  const expandCollapse = (event.id === expandedEvent)
    ? `<span class='collapse' onclick='setExpand("")'>▼ </span>`
    : `<span class='expand' onclick='setExpand("${event.id}")'>▶ </span>`
  
  const kindBadge = `<span class="kind-badge kind-${event.kind}" title="${getKindName(event.kind)}">${event.kind}</span>`
  const timestamp = `<span class="event-time">${timeFormat(event.created_at)}</span>`
  
  var badge = `<div class="event-card kind-${event.kind}">
    <div class="event-header">
      ${expandCollapse}${kindBadge} ${timestamp} ${degree}${from}
    </div>
    <div class="event-body">`
    
  switch (event.kind) {
    case 0: {
        try {
          const metadata = JSON.parse(event.content)
          badge += `<strong>📝 Updated profile metadata:</strong><br>`
          if (metadata.name) badge += `Name: ${escapeHTML(metadata.name)}<br>`
          if (metadata.about) badge += `About: ${escapeHTML(metadata.about)}<br>`
          if (metadata.picture) badge += `Picture: <img src="${escapeHTML(metadata.picture)}" style="max-width:50px;max-height:50px;vertical-align:middle"><br>`
        } catch(e) {
          badge += `Updated metadata (invalid JSON)`
        }
        break
      }
    case 1: {
        const truncatedContent = event.content.length > 300 ? event.content.substring(0, 300) + '...' : event.content
        badge += `<div class="text-content">${escapeHTML(truncatedContent)}</div>`
        break
      }
    case 2: {
        badge += `📡 Recommends relay: <code>${escapeHTML(event.content)}</code>`
        break
      }
    case 3: {
        badge += `👥 Shared contact list with <strong>${event.tags.filter(t => t[0] === 'p').length}</strong> follows`
        break
      }
    case 4: {
        const pTag = event.tags.find(it=>it[0] === 'p')
        const recipientPubkey = pTag && pTag[1]
        const recipient = recipientPubkey ? ` to ${nameFromPubkey(recipientPubkey)}` : ''
        badge += `🔒 Encrypted Direct Message${recipient}<br><em>Length: ${event.content.length} chars (encrypted)</em>`
        break
      }
    case 5: {
        const eTag = event.tags.find(t => t[0] === 'e')
        badge += `🗑️ Deletion request${eTag ? ` for event <code>${eTag[1].substring(0, 16)}...</code>` : ''}`
        break
      }
    case 6: {
        const eTag = event.tags.find(t => t[0] === 'e')
        badge += `🔄 Reposted${eTag ? ` event <code>${eTag[1].substring(0, 16)}...</code>` : ' an event'}`
        if (event.content) badge += `<br>Comment: ${escapeHTML(event.content)}`
        break
      }
    case 7: {
        const reaction = event.content || '👍'
        const eTag = event.tags.find(t => t[0] === 'e')
        badge += `${escapeHTML(reaction)} Reacted${eTag ? ` to event <code>${eTag[1].substring(0, 16)}...</code>` : ''}`
        break
      }
    case 30: {
        badge += `♟️ Chess move (PGN):<br><code>${escapeHTML(event.content.substring(0, 200))}</code>`
        break
      }
    case 40: {
        try {
          const content = JSON.parse(event.content)
          badge += `📢 Created channel: <strong>${escapeHTML(content.name || 'Unnamed')}</strong>`
          if (content.about) badge += `<br>${escapeHTML(content.about)}`
        } catch(e) {
          badge += `📢 Created a channel`
        }
        break
    }
    case 41: {
        badge += `⚙️ Updated channel metadata`
        break
    }
    case 42: {
        const eTag = event.tags.find(tag => tag[0] === 'e')
        badge += `💬 Channel message${eTag ? ` in <code>${eTag[1].substring(0, 16)}...</code>` : ''}<br>`
        badge += `<div class="text-content">${escapeHTML(event.content.substring(0, 300))}</div>`
        break
    }
    case 43: {
        try {
          const content = JSON.parse(event.content)
          badge += `🚫 Hid message${content.reason ? `: ${escapeHTML(content.reason)}` : ''}`
        } catch(e) {
          badge += `🚫 Hid a message`
        }
        break
    }
    case 44: {
        const pTag = event.tags.find(tag => tag[0] === 'p')
        const mutedPubkey = pTag && pTag[1]
        try {
          const content = JSON.parse(event.content)
          badge += `🔇 Muted user${mutedPubkey ? ` ${nameFromPubkey(mutedPubkey)}` : ''}${content.reason ? `: ${escapeHTML(content.reason)}` : ''}`
        } catch(e) {
          badge += `🔇 Muted a user`
        }
        break
    }
    case 60: {
        badge += `🚗 Ride sharing: ${formatEventContent(event)}`
        break
      }
    case 1059: {
        const pTag = event.tags.find(t => t[0] === 'p')
        badge += `🎁 Gift Wrapped message${pTag ? ` for ${nameFromPubkey(pTag[1])}` : ''}<br>`
        badge += `<em>Encrypted payload (${event.content.length} chars)</em>`
        break
      }
    case 1984: {
        badge += `🚨 Reported content`
        break
      }
    case 9734: {
        badge += `⚡ Zap request`
        break
      }
    case 9735: {
        const bolt11Tag = event.tags.find(t => t[0] === 'bolt11')
        const descTag = event.tags.find(t => t[0] === 'description')
        const preimageTag = event.tags.find(t => t[0] === 'preimage')
        badge += `⚡ <strong>Zap Receipt</strong>`
        if (bolt11Tag) {
          const bolt11 = bolt11Tag[1]
          badge += `<br>Payment: <code>${escapeHTML(bolt11.substring(0, 20))}...</code>`
        }
        if (descTag) {
          try {
            const desc = JSON.parse(descTag[1])
            if (desc.amount) {
              const sats = desc.amount / 1000
              badge += `<br>Amount: ${sats} sats`
            }
          } catch(e) {}
        }
        if (preimageTag) {
          badge += `<br>Preimage: <code>${escapeHTML(preimageTag[1].substring(0, 16))}...</code>`
        }
        break
      }
    case 10002: {
        const relayTags = event.tags.filter(t => t[0] === 'r')
        badge += `📡 <strong>Relay List Metadata</strong> (${relayTags.length} relays)<br>`
        if (relayTags.length > 0) {
          const relayList = relayTags.slice(0, 3).map(t => `<code>${escapeHTML(t[1])}</code>`).join(', ')
          badge += relayList
          if (relayTags.length > 3) badge += ` and ${relayTags.length - 3} more...`
        }
        break
      }
    case 22820: {
        badge += `🔗 <strong>WebRTC Connection</strong><br>`
        const xTag = event.tags.find(t => t[0] === 'x')
        if (xTag) badge += `Connection ID: <code>${escapeHTML(xTag[1])}</code><br>`
        badge += `<div class="text-content">${formatEventContent(event, 100)}</div>`
        break
      }
    case 22955: {
        badge += `📞 <strong>WebRTC Signaling</strong><br>`
        try {
          const data = JSON.parse(event.content)
          if (data.peerId) badge += `Peer ID: <code>${escapeHTML(data.peerId.substring(0, 16))}...</code><br>`
          if (data.offer) badge += `Type: ${escapeHTML(data.offer.type)}<br>`
        } catch(e) {}
        const xTag = event.tags.find(t => t[0] === 'x')
        if (xTag) badge += `Connection ID: <code>${escapeHTML(xTag[1])}</code>`
        break
      }
    case 30001: {
        badge += `🔖 <strong>Categorized Bookmarks</strong><br>`
        const dTag = event.tags.find(t => t[0] === 'd')
        if (dTag && dTag[1]) badge += `Category: <strong>${escapeHTML(dTag[1])}</strong><br>`
        const bookmarkTags = event.tags.filter(t => t[0] === 'e' || t[0] === 'a')
        badge += `Bookmarks: ${bookmarkTags.length} items`
        break
      }
    case 30023: {
        badge += `📄 <strong>Long-form Content</strong><br>`
        const titleTag = event.tags.find(t => t[0] === 'title')
        if (titleTag) badge += `<strong>${escapeHTML(titleTag[1])}</strong><br>`
        const summaryTag = event.tags.find(t => t[0] === 'summary')
        if (summaryTag) {
          badge += `<em>${escapeHTML(summaryTag[1])}</em><br>`
        } else if (event.content) {
          const preview = event.content.substring(0, 200)
          badge += `<div class="text-content">${escapeHTML(preview)}${event.content.length > 200 ? '...' : ''}</div>`
        }
        break
      }
    case 22955: {
        badge += `📞 WebRTC Signaling Event<br>`
        badge += `<div class="text-content">${formatEventContent(event, 150)}</div>`
        break
      }
    default: {
        badge += `<strong>⚠️ Unhandled Event Type: ${getKindName(event.kind)}</strong><br>`
        badge += `<div class="text-content">${formatEventContent(event, 150)}</div>`
        break
      }
  }
  
  badge += `</div>` // Close event-body
  
  // Add tags display
  if (event.tags && event.tags.length > 0) {
    badge += formatTags(event.tags)
  }
  
  badge += `</div>` // Close event-card
  
  return badge + (event.id === expandedEvent ? rawEventWidget(event) : '')
}

const ts = () => (new Date()).getTime()

function testNip11(relay) {
  const httpUrl = 'https' +  relay.url.slice(3)
  fetch(httpUrl, {
    headers: {
      Accept: "application/nostr+json"
    }
  }).then(it => {
    it.json().then(it => {
      relay.nip11=it
      console.log(it)
    }).catch(console.error)
  }).catch(console.error)
}

function setupWs(relay, id) {
  // testNip11(relay)
  const ws = new WebSocket(relay.url)
  relay.ws = ws
  relay.tried = ts()
  const reqSentAt = {} // track when REQ was sent for latency calculation
  ws.onmessage = msg => {
    var arr
    setDirty()
    try {
      arr = JSON.parse(msg.data)
    } catch (e) {
      console.log(`${relay.url} sent weird msg "${msg.data}".`)
      return
    }
    if (arr[0] === 'EVENT') {
      const event = arr[2]
      const subId = arr[1]
      
      // Track latency for first event in each subscription
      if (reqSentAt[subId] && relay.latencies.length < 100) {
        relay.latencies.push(ts() - reqSentAt[subId])
        delete reqSentAt[subId]
      }
      
      // Track first event timestamp
      if (!relay.firstEventAt) {
        relay.firstEventAt = ts()
      }
      
      // Track active users
      if (event.pubkey) {
        relay.activeUsers.add(event.pubkey)
      }
      
      // Track events by kind
      if (event.kind !== undefined) {
        relay.eventsByKind[event.kind] = (relay.eventsByKind[event.kind] || 0) + 1
        // Store the actual event (limit to last 100 per relay)
        if (!relay.eventsList) relay.eventsList = []
        relay.eventsList.unshift(event)
        if (relay.eventsList.length > 100) {
          relay.eventsList = relay.eventsList.slice(0, 100)
        }
      }
      
      if (arr[1] === "main") {
        relay.events++
      }
      const prior = received.find(e=>e.id==event.id)
      if (prior) {
        if (0 > prior.relays.findIndex(i=>i.id==id)) {
          prior.relays.push({id: id,count:relay.events,timeMs:ts()})
        }
        if (arr[1] === "main") {
          return // this event was handled by main already
        }
      }
      switch (arr[1]) {
        case 'meta':
          if (event.kind === 0) {
            try {
              const m = JSON.parse(event.content)
              meta[event.pubkey] = m
            } catch(e) {
              console.log(`Should "${escapeHTML(event.content)}" be valid JSON?`)
            }
          } else {
            relay.wrongKind++
            relay.msg = msg.data
          }
          break
        case 'follows':
          if (event.kind === 3) {
            follows[event.pubkey] = event.tags.filter(it => it[0] === "p").map(it => it[1])
          } else {
            relay.wrongKind++
            relay.msg = msg.data
          }
          break
        case 'relays':
          if (event.kind === 2) {
            const ipRegExp = /[0-9]+.[0-9]+.[0-9]+.[0-9]+/g
            const relayUrl = event
              .content
              .replace(/(\n|\r|\t|\/| )+$/, '')
              .replace(/^(\n|\r|\t| )+/, '')
              .toLowerCase()
            if (relays.findIndex(it=>it.url==relayUrl)>=0 || // we have this one already.
                !relayUrl.startsWith('wss://') || // only ssl for now
                ipRegExp.test(relayUrl) || // IPs don't support ssl
                relayUrl.includes('localhost')) { // localhost?
              break
            }
            relays.push({
              url: relayUrl,
              tried: -1,
              connected: false,
              answered: false,
              events: 0,
              wrongKind: 0,
              invalid: 0,
              msg: "",
              latencies: [],
              activeUsers: new Set(),
              eventsByKind: {},
              eventsList: [],
              connectedAt: null,
              firstEventAt: null,
              nip11: null
            })
          } else {
            relay.wrongKind++
            relay.msg = msg.data
          }
          break
        case 'main':
          event.relays = [{id: id,count:relay.events,timeMs:ts()}]
          if (!event.tags) {
            relay.invalid++
            relay.msg = msg.data
            console.log(`${relay.url} sent event with no tags.`)
            event.tags = []
          }
          received.push(event)
          break
      }
    } else if (arr[0] === 'EOSE') {
      if (['meta','follows','relays'].includes(arr[1])) {
        ws.send(`["CLOSE","${arr[1]}"]`)
      }
    } else {
      console.log(`Unexpected command ${arr[0]}`)
    }
  }
  ws.onclose = () => {
    relay.connected = false
    relay.connectedAt = null
    setDirty()
    console.log(`${relay.url} disconnected.`)
  }
  ws.onerror = (e) => {
    relay.connected = false
    relay.connectedAt = null
    setDirty()
    console.log(`${relay.url} had an error: ${JSON.stringify(e)}`)
  }
  ws.onopen = event => {
    relay.connected = true
    relay.answered = true
    relay.connectedAt = ts()
    setDirty()
    reqSentAt['main'] = ts()
    ws.send(`["REQ","main",{"limit":${LIMIT},"until":${(ts() / 1000 + 60 * 60).toFixed()}}]`)
    reqSentAt['meta'] = ts()
    ws.send('["REQ","meta",{"kinds":[0]}]')
    reqSentAt['follows'] = ts()
    ws.send('["REQ","follows",{"kinds":[3]}]')
    reqSentAt['relays'] = ts()
    ws.send('["REQ","relays",{"kinds":[2]}]')
  }
}

Number.prototype.pad = function(size) {
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}

function timeFormat(ts) {
  let d = new Date(ts * 1000)
  return `${d.getYear()-100}-${(d.getMonth()+1).pad(2)}-${(d.getDate()).pad(2)} ` +
         `${d.getHours().pad(2)}:${d.getMinutes().pad(2)}:${d.getSeconds().pad(2)}`
}

function escapeHTML(str){
  var p = document.createElement("p");
  p.appendChild(document.createTextNode(str));
  return p.innerHTML;
}

function guessClient(event) {
  if (event.tags.find(i => i[0] === 'client' && i[1] === 'more-speech')) {
    return '<a href="https://github.com/unclebob/more-speech">more-speech</a>'
  }
  return null
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function showRelayDetails(idx, selectedKind = null) {
  const relay = relays[idx]
  
  if (selectedKind !== null) {
    // Show events of the selected kind
    showRelayEventsByKind(idx, selectedKind)
    return
  }
  
  const eventKinds = Object.entries(relay.eventsByKind)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => {
      const kindName = getKindName(parseInt(kind))
      return `<tr class="kind-row" onclick="event.stopPropagation(); showRelayDetails(${idx}, ${kind})">
        <td><strong>${kindName}</strong> (${kind})</td>
        <td>${count}</td>
      </tr>`
    })
    .join('')
  
  const avgLatency = relay.latencies.length > 0 
    ? (relay.latencies.reduce((sum, l) => sum + l, 0) / relay.latencies.length).toFixed(0)
    : 'N/A'
  
  const modalHtml = `
    <div id="relay-modal" onclick="closeRelayModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <span class="close" onclick="closeRelayModal()">&times;</span>
        <h2>${relay.url}</h2>
        
        <div class="relay-stats">
          <div class="stat-item">
            <div class="stat-label">Status</div>
            <div class="stat-value ${relay.connected ? 'online' : 'offline'}">
              ${relay.connected ? 'Online' : 'Offline'}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Events Seen</div>
            <div class="stat-value">${relay.events}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Active Users</div>
            <div class="stat-value">${relay.activeUsers.size}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Avg Latency</div>
            <div class="stat-value">${avgLatency}ms</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Connected Time</div>
            <div class="stat-value">${relay.connectedAt ? formatDuration(ts() - relay.connectedAt) : 'N/A'}</div>
          </div>
        </div>
        
        <h3>Event Kinds Breakdown <small style="color:#6c757d">(Click to view events)</small></h3>
        <div class="kinds-table-container">
          <table class="kinds-table">
            <thead><tr><th>Kind</th><th>Count</th></tr></thead>
            <tbody>
              ${eventKinds.length > 0 ? eventKinds : '<tr><td colspan="2">No events received yet</td></tr>'}
            </tbody>
          </table>
        </div>
        
        ${relay.nip11 ? `
          <h3>Relay Information (NIP-11)</h3>
          <div class="nip11-info">
            ${relay.nip11.name ? `<p><strong>Name:</strong> ${escapeHTML(relay.nip11.name)}</p>` : ''}
            ${relay.nip11.description ? `<p><strong>Description:</strong> ${escapeHTML(relay.nip11.description)}</p>` : ''}
            ${relay.nip11.pubkey ? `<p><strong>Contact:</strong> ${escapeHTML(relay.nip11.pubkey)}</p>` : ''}
            ${relay.nip11.contact ? `<p><strong>Contact:</strong> ${escapeHTML(relay.nip11.contact)}</p>` : ''}
            ${relay.nip11.supported_nips ? `<p><strong>Supported NIPs:</strong> ${relay.nip11.supported_nips.join(', ')}</p>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `
  
  const existingModal = document.getElementById('relay-modal')
  if (existingModal) {
    existingModal.remove()
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml)
}

function showRelayEventsByKind(idx, kind) {
  const relay = relays[idx]
  const kindInt = parseInt(kind)
  const kindName = getKindName(kindInt)
  
  // Filter events by kind
  const eventsOfKind = (relay.eventsList || []).filter(e => e.kind === kindInt)
  
  const eventsHtml = eventsOfKind.length > 0
    ? eventsOfKind.slice(0, 20).map(event => {
        const shortId = event.id ? event.id.substring(0, 8) : 'unknown'
        const timestamp = timeFormat(event.created_at)
        const pubkeyShort = event.pubkey ? event.pubkey.substring(0, 8) : 'unknown'
        const contentPreview = event.content.length > 100 
          ? escapeHTML(event.content.substring(0, 100)) + '...'
          : escapeHTML(event.content)
        
        return `
          <div class="relay-event-card">
            <div class="event-meta">
              <span class="event-id" title="${event.id}">ID: ${shortId}...</span>
              <span class="event-timestamp">${timestamp}</span>
            </div>
            <div class="event-meta">
              <span class="event-pubkey" title="${event.pubkey}">From: ${pubkeyShort}...</span>
            </div>
            ${event.content ? `<div class="event-content-preview">${contentPreview}</div>` : ''}
            ${event.tags && event.tags.length > 0 ? `<div class="event-tags-preview">${event.tags.length} tags</div>` : ''}
          </div>
        `
      }).join('')
    : '<p style="text-align:center;color:#6c757d;padding:2rem">No events of this kind found</p>'
  
  const modalHtml = `
    <div id="relay-modal" onclick="closeRelayModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <span class="close" onclick="closeRelayModal()">&times;</span>
        <button class="back-button" onclick="showRelayDetails(${idx})">← Back to Relay Overview</button>
        <h2>${relay.url}</h2>
        <h3>${kindName} Events (${eventsOfKind.length} total${eventsOfKind.length > 20 ? ', showing first 20' : ''})</h3>
        
        <div class="relay-events-container">
          ${eventsHtml}
        </div>
      </div>
    </div>
  `
  
  const existingModal = document.getElementById('relay-modal')
  if (existingModal) {
    existingModal.remove()
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml)
}

function closeRelayModal(event) {
  const modal = document.getElementById('relay-modal')
  if (modal && (!event || event.target === modal)) {
    modal.remove()
  }
}
