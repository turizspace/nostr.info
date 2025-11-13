import React, { useState, useEffect } from 'react';

const formatNumber = (num) => num.toLocaleString();
const formatSats = (sats) => `${formatNumber(sats)} sats`;

export const OverviewStats = ({ analytics }) => {
  const [summaryStats, setSummaryStats] = useState({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Initial calculation
    const stats = analytics.getSummaryStats();
    setSummaryStats(stats);
    setLoading(false);
    
    // Listen for analytics updates and recalculate stats
    const handleUpdate = (type, data) => {
      if (type === 'event' || type === 'eventBatch') {
        const updatedStats = analytics.getSummaryStats();
        setSummaryStats(updatedStats);
      }
    };
    
    analytics.addListener(handleUpdate);
    
    // Fallback: also check every 2 seconds for updates
    const interval = setInterval(() => {
      const updatedStats = analytics.getSummaryStats();
      setSummaryStats(updatedStats);
    }, 2000);
    
    return () => {
      analytics.removeListener(handleUpdate);
      clearInterval(interval);
    };
  }, [analytics]);
  
  if (loading) {
    return null;
  }
  
  const stats = [
    {
      label: 'Total Clients',
      value: formatNumber(summaryStats.totalClients || 0),
      highlight: false,
    },
    {
      label: 'Total Events',
      value: formatNumber(summaryStats.totalEvents || 0),
      highlight: false,
    },
    {
      label: 'Days Tracked',
      value: formatNumber(summaryStats.daysTracked || 0),
      highlight: false,
    },
    {
      label: 'Total Zaps',
      value: formatSats(summaryStats.totalZaps || 0),
      highlight: false,
    },
    {
      label: 'Total Users',
      value: formatNumber(summaryStats.totalUsers || 0),
      highlight: false,
    },
    {
      label: 'Top Client',
      value: summaryStats.topClient || 'N/A',
      highlight: false,
    },
    {
      label: 'Avg Events/Day',
      value: formatNumber(summaryStats.avgEventsPerDay || 0),
      highlight: false,
    },
  ];
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`border text-neutral-100 p-3 rounded-lg text-center ${
            stat.highlight
              ? 'bg-purple-900/20 border-purple-700'
              : 'bg-neutral-700 border-neutral-600'
          }`}
        >
          <div className="text-2xl font-bold">{stat.value}</div>
          <div className="text-xs text-neutral-400">{stat.label}</div>
        </div>
      ))}
    </div>
  );
};