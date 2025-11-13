import React, { useState, useEffect } from 'react';

const formatNumber = (num) => num.toLocaleString();
const formatDate = (timestamp) => new Date(timestamp * 1000).toLocaleDateString();

export const ClientStats = ({ analytics }) => {
  const [clientData, setClientData] = useState([]);
  
  useEffect(() => {
    // Initial load
    const data = analytics.getClientStats(20);
    setClientData(data);
    
    // Listen for analytics updates
    const handleUpdate = (type, data) => {
      if (type === 'event' || type === 'eventBatch') {
        const updatedData = analytics.getClientStats(20);
        setClientData(updatedData);
      }
    };
    
    analytics.addListener(handleUpdate);
    
    // Fallback: also check every 2 seconds for updates
    const interval = setInterval(() => {
      const updatedData = analytics.getClientStats(20);
      setClientData(updatedData);
    }, 2000);
    
    return () => {
      analytics.removeListener(handleUpdate);
      clearInterval(interval);
    };
  }, [analytics]);
  
  if (clientData.length === 0) {
    return (
      <div className="bg-neutral-800 rounded-lg shadow-lg p-4 mb-4 border border-neutral-700">
        <div className="text-center text-neutral-300">Loading client data...</div>
      </div>
    );
  }
  
  return (
    <div className="bg-neutral-800 rounded-lg shadow-lg p-4 mb-4 border border-neutral-700">
      <div className="flex items-center justify-between border-b-2 border-neutral-600 pb-2 mb-3">
        <h2 className="text-xl font-bold text-neutral-100">Client Statistics</h2>
      </div>
      
      {/* Client Information Table - Mobile Responsive */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <table className="w-full text-sm min-w-max md:min-w-0">
          <thead className="bg-neutral-700 text-neutral-100 border-b border-neutral-600 sticky top-0">
            <tr>
              <th className="p-2 text-left whitespace-nowrap">Client</th>
              <th className="p-2 text-right whitespace-nowrap">Events</th>
              <th className="p-2 text-left whitespace-nowrap hidden sm:table-cell">Last Activity</th>
              <th className="p-2 text-left whitespace-nowrap hidden md:table-cell">Top Kinds</th>
            </tr>
          </thead>
          <tbody>
            {clientData.map((client) => {
              const kindsEntries = Object.entries(client.kinds || {}).sort((a, b) => b[1] - a[1]);
              let kindsStr;
              
              if (kindsEntries.length === 0) {
                kindsStr = 'N/A';
              } else if (kindsEntries.length <= 3) {
                kindsStr = kindsEntries.map(([kind]) => kind).join(', ');
              } else {
                const topThree = kindsEntries.slice(0, 3).map(([kind]) => kind).join(', ');
                const remaining = kindsEntries.length - 3;
                kindsStr = `${topThree} + ${remaining} more`;
              }
              
              return (
                <tr
                  key={client.name}
                  className="border-b border-neutral-700 hover:bg-neutral-700/50 text-xs md:text-sm"
                >
                  <td className="p-2 font-semibold text-neutral-200 whitespace-nowrap">{client.name}</td>
                  <td className="p-2 text-neutral-300 text-right whitespace-nowrap">{formatNumber(client.count)}</td>
                  <td className="p-2 text-neutral-400 text-xs whitespace-nowrap hidden sm:table-cell">
                    {formatDate(client.lastSeen)}
                  </td>
                  <td className="p-2 text-xs text-neutral-400 hidden md:table-cell">{kindsStr}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};