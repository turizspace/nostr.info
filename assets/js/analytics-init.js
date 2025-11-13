---
permalink: /js/analytics-init.js
layout: none
---

/**
 * Analytics Dashboard Initialization
 * Integrates the new analytics system with existing nostr.info infrastructure
 */

// Initialize analytics dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit for statistics.js to initialize
  setTimeout(() => {
    initializeAnalyticsDashboard();
  }, 1000);
});

// Also listen for nostrStats events globally
document.addEventListener('nostrStats:eventsUpdated', function(event) {
  if (window.analytics && event.detail) {
    // Sync data periodically when nostrStats updates
    syncWithNostrStats();
  }
});

function initializeAnalyticsDashboard() {
  // Ensure required libraries are loaded
  if (typeof window.analytics === 'undefined' || 
      typeof window.TimeRangeFilter === 'undefined' ||
      typeof window.mountAnalyticsDashboard === 'undefined') {
    console.error('Analytics components not loaded');
    return;
  }

  try {
    // Initialize time filter - DISABLED: Not yet implemented for real-time sorting
    // const timeFilter = new TimeRangeFilter('analytics-time-filter', window.analytics);
    
    // Mount React dashboard
    const dashboardRoot = window.mountAnalyticsDashboard('analytics-dashboard-root', window.analytics);
    
    // Connect to existing relay system
    connectAnalyticsToRelays();
    
    // NOTE: Sample data generation disabled - we always use real network data
    // The analytics system now exclusively uses:
    // 1. Events from window.nostrStats (primary)
    // 2. Events from window.allEvents array (fallback)
    // 3. Live WebSocket relay connections (real-time)
    
    // CRITICAL: Do a comprehensive catch-up sync after everything is initialized
    // This ensures we don't miss events that arrived during initialization
    setTimeout(() => {
      if (typeof window.nostrStats !== 'undefined') {
        const allEvents = window.nostrStats.getEventsForKind('all');
        const analyticsStats = window.analytics.getSummaryStats();
        
        if (allEvents.length > analyticsStats.totalEvents) {
          console.log(`Analytics: Catch-up sync - detected ${allEvents.length - analyticsStats.totalEvents} missed events`);
          
          // Process all events again (duplicates prevented by event ID tracking)
          allEvents.forEach(event => {
            window.analytics.trackEvent(event);
          });
        }
      }
      
      // ALSO: Load metadata from legacy system's metadataByPubkey cache
      loadMetadataFromLegacySystem();
      
    }, 3000); // Wait 3 seconds for all systems to initialize
    
    console.log('Analytics dashboard initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize analytics dashboard:', error);
  }
}

function connectAnalyticsToRelays() {
  let lastProcessedEventCount = 0;
  
  // Hook into existing nostrStats system from statistics.js
  if (typeof window.nostrStats !== 'undefined') {
    console.log('Analytics: Connecting to existing nostrStats system');
    
    // Get all existing events first
    const existingEvents = window.nostrStats.getEventsForKind('all');
    console.log(`Analytics: Processing ${existingEvents.length} existing events from nostrStats`);
    
    // Process ALL existing events initially
    existingEvents.forEach(event => {
      window.analytics.trackEvent(event);
    });
    
    lastProcessedEventCount = existingEvents.length;
    
    // Subscribe to new event updates (event-driven)
    window.nostrStats.subscribeEvents((payload) => {
      syncAnalyticsWithNostrStats();
    });
    
    // ALSO: Sync periodically to ensure we don't miss events
    // This acts as a fallback in case subscription callbacks are delayed
    setInterval(syncAnalyticsWithNostrStats, 2000);
    
    function syncAnalyticsWithNostrStats() {
      const allEvents = window.nostrStats.getEventsForKind('all');
      
      if (allEvents.length > lastProcessedEventCount) {
        const newEventsCount = allEvents.length - lastProcessedEventCount;
        console.log(`Analytics: Syncing ${newEventsCount} new events from nostrStats (total: ${allEvents.length})`);
        
        // Get the newly added events (they're appended to the end of the array)
        const newEvents = allEvents.slice(lastProcessedEventCount);
        newEvents.forEach(event => {
          window.analytics.trackEvent(event);
        });
        
        lastProcessedEventCount = allEvents.length;
      }
    }
    
    // Don't continue to fallback if we successfully connected
    if (existingEvents.length > 0) {
      console.log('Analytics: Successfully connected to nostrStats with real events');
      return;
    }
  } else {
    console.log('Analytics: nostrStats not found, checking for direct access...');
    
    // Try to hook into global allEvents array directly
    if (typeof window.allEvents !== 'undefined' && Array.isArray(window.allEvents)) {
      console.log(`Analytics: Found global allEvents array with ${window.allEvents.length} events`);
      
      // Process ALL existing events
      window.allEvents.forEach(event => {
        window.analytics.trackEvent(event);
      });
      
      lastProcessedEventCount = window.allEvents.length;
      
      // Monitor for new events by checking periodically
      setInterval(() => {
        if (window.allEvents.length > lastProcessedEventCount) {
          // Get only new events (appended to end)
          const newEvents = window.allEvents.slice(lastProcessedEventCount);
          console.log(`Analytics: Processing ${newEvents.length} new events from allEvents`);
          
          newEvents.forEach(event => {
            window.analytics.trackEvent(event);
          });
          
          lastProcessedEventCount = window.allEvents.length;
        }
      }, 1000);
      
      // Don't continue to fallback if we have real events
      if (window.allEvents.length > 0) {
        console.log('Analytics: Successfully connected to allEvents with real data');
        return;
      }
    }
  }
  
  // Hook into any existing WebSocket connections for live updates
  if (typeof window.relays !== 'undefined') {
    Object.values(window.relays).forEach(relay => {
      if (relay.ws && relay.ws.readyState === WebSocket.OPEN) {
        hookIntoRelay(relay);
      }
    });
  }
}

function hookIntoRelay(relay) {
  // Store original onmessage handler
  const originalOnMessage = relay.ws.onmessage;
  
  relay.ws.onmessage = function(event) {
    // Call original handler first
    if (originalOnMessage) {
      originalOnMessage.call(this, event);
    }
    
    // Parse and track the event
    try {
      const message = JSON.parse(event.data);
      if (Array.isArray(message) && message[0] === 'EVENT' && message[2]) {
        window.analytics.trackEvent(message[2]);
      }
    } catch (e) {
      // Ignore parsing errors
    }
  };
}

// DEPRECATED: Sample data generation removed
// The analytics system now exclusively uses real network data from relays
// This function is kept for reference but should never be called
/*
function generateSampleData() {
  // Generate sample data for demonstration
  const now = Math.floor(Date.now() / 1000);
  const daysBack = 30;
  
  const clients = ['damus', 'iris', 'amethyst', 'snort', 'nostrdotcom', 'nos2x', 'alby'];
  const eventKinds = [0, 1, 3, 5, 7, 9735, 10002, 30023];
  
  console.log('Generating sample analytics data...');
  
  for (let i = 0; i < daysBack; i++) {
    const dayStart = now - (i * 86400);
    const eventsPerDay = Math.floor(Math.random() * 1000) + 500;
    
    for (let j = 0; j < eventsPerDay; j++) {
      const event = generateSampleEvent(dayStart, clients, eventKinds);
      window.analytics.trackEvent(event);
    }
  }
  
  console.log(`Generated ${daysBack * 500} sample events for analytics`);
}

function generateSampleEvent(baseTime, clients, kinds) {
  const client = clients[Math.floor(Math.random() * clients.length)];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const pubkey = generateRandomHex(64);
  
  const event = {
    id: generateRandomHex(64),
    pubkey: pubkey,
    created_at: baseTime + Math.floor(Math.random() * 86400),
    kind: kind,
    tags: [
      ['client', client]
    ],
    content: `Sample event from ${client}`,
    sig: generateRandomHex(128)
  };
  
  // Add zap amount for zap events
  if (kind === 9735) {
    const amount = Math.floor(Math.random() * 10000) + 100;
    event.tags.push(['bolt11', `lnbc${amount}m...`]);
  }
  
  // Add follow relationships for kind 3
  if (kind === 3) {
    const followCount = Math.floor(Math.random() * 50);
    for (let i = 0; i < followCount; i++) {
      event.tags.push(['p', generateRandomHex(64)]);
    }
  }
  
  return event;
}

function generateRandomHex(length) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
*/

// Sync analytics with nostrStats data
function syncWithNostrStats() {
  if (typeof window.nostrStats === 'undefined' || !window.analytics) return;
  
  try {
    // Get the latest events that might not be in analytics yet
    const allEvents = window.nostrStats.getEventsForKind('all');
    const currentAnalyticsCount = window.analytics.getSummaryStats().totalEvents;
    
    // If nostrStats has more events than analytics, sync the difference
    if (allEvents.length > currentAnalyticsCount) {
      const newEventsCount = allEvents.length - currentAnalyticsCount;
      console.log(`Analytics: Syncing ${newEventsCount} new events (${currentAnalyticsCount} -> ${allEvents.length})`);
      
      // Get NEW events from the current count onwards (not backwards!)
      // Events are appended to the array, so new events are at the end
      const newEvents = allEvents.slice(currentAnalyticsCount);
      
      // Process the new events (analytics tracks by event ID to avoid duplicates)
      newEvents.forEach(event => {
        window.analytics.trackEvent(event);
      });
    }
  } catch (error) {
    console.error('Analytics sync error:', error);
  }
}

// Load metadata from the legacy statistics system's metadataByPubkey cache
function loadMetadataFromLegacySystem() {
  if (typeof window.nostrStats === 'undefined' || typeof window.nostrStats.getMetadataForPubkey === 'undefined') {
    console.log('Analytics: Legacy metadata system not available');
    return;
  }
  
  if (!window.analytics) {
    console.error('Analytics: Analytics system not initialized');
    return;
  }
  
  try {
    // Get all users that analytics is tracking
    const pageRankData = window.analytics.getPageRankData(10000); // Get all users
    let metadataLoaded = 0;
    
    pageRankData.forEach(user => {
      // Skip if already has metadata from kind 0 events
      if (user.metadata && user.metadata.name) {
        return;
      }
      
      // Try to get metadata from legacy system
      const metadata = window.nostrStats.getMetadataForPubkey(user.pubkey);
      if (metadata) {
        // Update analytics with this metadata
        window.analytics.setUserMetadata(user.pubkey, {
          name: metadata.displayName || metadata.name || '',
          picture: metadata.picture || '',
          about: metadata.about || '',
          nip05: metadata.nip05 || ''
        });
        metadataLoaded++;
      }
    });
    
    console.log(`Analytics: Loaded ${metadataLoaded} user profiles from legacy metadata cache`);
    
    // Also listen for future metadata updates
    if (typeof window.nostrStats.subscribeEvents === 'function') {
      window.nostrStats.subscribeEvents((payload) => {
        if (payload.reason === 'metadata') {
          // Check if we can get metadata for newly discovered users
          const pageRankData = window.analytics.getPageRankData(10000);
          pageRankData.forEach(user => {
            if (!user.metadata || !user.metadata.name) {
              const metadata = window.nostrStats.getMetadataForPubkey(user.pubkey);
              if (metadata) {
                window.analytics.setUserMetadata(user.pubkey, {
                  name: metadata.displayName || metadata.name || '',
                  picture: metadata.picture || '',
                  about: metadata.about || '',
                  nip05: metadata.nip05 || ''
                });
              }
            }
          });
        }
      });
    }
  } catch (error) {
    console.error('Analytics: Failed to load legacy metadata:', error);
  }
}

// Export for global access
window.initializeAnalyticsDashboard = initializeAnalyticsDashboard;
window.connectAnalyticsToRelays = connectAnalyticsToRelays;
window.syncWithNostrStats = syncWithNostrStats;