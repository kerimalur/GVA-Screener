import { useEffect, useState } from 'react';

interface LastTouched {
  type: 'SHORT' | 'LONG';
  level: number;
  date: string;
  touched_date: string;
}

interface MarketData {
  pair: string;
  price: number;
  short: number | null;
  short_date: string | null;
  long: number | null;
  long_date: string | null;
  status: 'HIT' | 'PREPARE' | 'NEUTRAL';
  distance: number | null;
  last_touched: LastTouched | null;
}

const CATEGORIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF'];

export default function Dashboard() {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [view, setView] = useState<'SORTED' | 'WATCHLIST' | 'TABLE'>('SORTED');
  const [selectedPair, setSelectedPair] = useState<MarketData | null>(null);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    'EUR': true, 'GBP': false, 'AUD': false, 'NZD': false, 'USD': false, 'CAD': false, 'CHF': false
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      // Dynamische API-URL für lokales Testing vs. Vercel Production
      const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      const response = await fetch(`${apiUrl}/api/screener`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.error("Fehler beim Laden der API-Daten:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000 * 60 * 15);
    return () => clearInterval(interval);
  }, []);

  const toggleCategory = (cat: string) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const sortedData = [...data].sort((a, b) => {
    const distA = a.distance !== null ? a.distance : Infinity;
    const distB = b.distance !== null ? b.distance : Infinity;
    return distA - distB;
  });

  // --- RENDERING METHODEN ---

  const renderDetailedCard = (item: MarketData) => {
    let cardStyle = "bg-[#111318] border-[#222631] hover:border-[#3a4154]";
    let statusDot = "bg-[#3a4154]";
    let badgeText = item.distance ? `${item.distance.toFixed(1)} Pips` : '-';

    if (item.status === 'HIT') {
      cardStyle = "bg-[#1a1414] border-[#4a2424] hover:border-[#ff4d4d]";
      statusDot = "bg-[#ff4d4d] animate-pulse";
      badgeText = "ACTION REQUIRED";
    } else if (item.status === 'PREPARE') {
      cardStyle = "bg-[#181611] border-[#4a3e24] hover:border-[#eab308]";
      statusDot = "bg-[#eab308]";
    }

    return (
      <div key={item.pair} onClick={() => setSelectedPair(item)} className={`border rounded-lg p-5 transition-all duration-300 cursor-pointer ${cardStyle}`}>
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${statusDot}`}></div>
            <h2 className="text-lg font-semibold tracking-wider text-[#e2e8f0]">{item.pair}</h2>
          </div>
          <span className="text-[#94a3b8] text-xs font-mono bg-[#1e2330] px-2 py-1 rounded">
            {badgeText}
          </span>
        </div>
        
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-[#222631] pb-2">
            <span className="text-[#64748b]">Market</span>
            <span className="font-mono text-[#f8fafc]">{item.price.toFixed(5)}</span>
          </div>
          <div className="flex justify-between border-b border-[#222631] pb-2">
            <span className="text-[#ef4444]/80">Short Line</span>
            <span className="font-mono text-[#cbd5e1]">{item.short ? item.short.toFixed(5) : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#22c55e]/80">Long Line</span>
            <span className="font-mono text-[#cbd5e1]">{item.long ? item.long.toFixed(5) : '-'}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    return (
      <div className="overflow-x-auto bg-[#111318] rounded-lg border border-[#222631]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#171a21] border-b border-[#222631] text-[#64748b] text-xs uppercase tracking-widest">
              <th className="p-4 font-semibold">Pair</th>
              <th className="p-4 font-semibold">Market Price</th>
              <th className="p-4 font-semibold">Short Line</th>
              <th className="p-4 font-semibold">Long Line</th>
              <th className="p-4 font-semibold">Distance</th>
              <th className="p-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222631] text-sm">
            {sortedData.map((item) => {
              let dotColor = "bg-[#3a4154]";
              if (item.status === 'HIT') dotColor = "bg-[#ff4d4d] animate-pulse";
              if (item.status === 'PREPARE') dotColor = "bg-[#eab308]";

              return (
                <tr key={item.pair} onClick={() => setSelectedPair(item)} className="hover:bg-[#1a1d24] cursor-pointer transition-colors">
                  <td className="p-4 font-semibold text-[#e2e8f0] tracking-wide">{item.pair}</td>
                  <td className="p-4 font-mono text-[#f8fafc]">{item.price.toFixed(5)}</td>
                  <td className="p-4 font-mono text-[#ef4444]/80">{item.short ? item.short.toFixed(5) : '-'}</td>
                  <td className="p-4 font-mono text-[#22c55e]/80">{item.long ? item.long.toFixed(5) : '-'}</td>
                  <td className="p-4 font-mono text-[#cbd5e1]">{item.distance ? `${item.distance.toFixed(1)}` : '-'}</td>
                  <td className="p-4 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                    <span className="text-[#94a3b8] text-xs">{item.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#cbd5e1] p-4 md:p-8 font-sans selection:bg-[#2563eb] selection:text-white">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 pb-6 border-b border-[#222631]">
          <h1 className="text-2xl font-light tracking-widest text-[#f8fafc]">
            GVA <span className="font-bold text-[#3b82f6]">DSS</span>
          </h1>
          
          <div className="flex items-center gap-4 mt-6 md:mt-0">
            <div className="flex bg-[#111318] rounded border border-[#222631] p-0.5">
              <button onClick={() => setView('SORTED')} className={`px-4 py-1.5 rounded-sm text-xs font-semibold tracking-wider transition-all ${view === 'SORTED' ? 'bg-[#1e2330] text-white' : 'text-[#64748b] hover:text-[#cbd5e1]'}`}>GRID</button>
              <button onClick={() => setView('WATCHLIST')} className={`px-4 py-1.5 rounded-sm text-xs font-semibold tracking-wider transition-all ${view === 'WATCHLIST' ? 'bg-[#1e2330] text-white' : 'text-[#64748b] hover:text-[#cbd5e1]'}`}>GROUPS</button>
              <button onClick={() => setView('TABLE')} className={`px-4 py-1.5 rounded-sm text-xs font-semibold tracking-wider transition-all ${view === 'TABLE' ? 'bg-[#1e2330] text-white' : 'text-[#64748b] hover:text-[#cbd5e1]'}`}>TABLE</button>
            </div>
            
            <button onClick={fetchData} className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-1.5 rounded text-xs font-semibold tracking-wider transition-all">
              {loading ? 'SYNCING...' : 'SYNC DATA'}
            </button>
          </div>
        </div>

        {loading && data.length === 0 ? (
          <div className="text-center text-[#64748b] py-32 text-sm tracking-widest animate-pulse">SYNCHRONIZING WITH FEED...</div>
        ) : (
          <>
            {view === 'SORTED' && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sortedData.map(renderDetailedCard)}
              </div>
            )}

            {view === 'WATCHLIST' && (
              <div className="space-y-3 max-w-5xl mx-auto">
                {CATEGORIES.map(cat => {
                  const categoryPairs = data.filter(item => item.pair.startsWith(cat));
                  if (categoryPairs.length === 0) return null;
                  const isExpanded = expandedCats[cat];

                  return (
                    <div key={cat} className="bg-[#111318] rounded-lg border border-[#222631] overflow-hidden">
                      <button onClick={() => toggleCategory(cat)} className="w-full flex items-center justify-between p-4 hover:bg-[#171a21] transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-semibold tracking-widest text-[#e2e8f0]">{cat}</span>
                          <span className="bg-[#1e2330] text-[#64748b] text-xs py-0.5 px-2 rounded font-mono">{categoryPairs.length}</span>
                        </div>
                        <span className="text-[#64748b] text-xs">{isExpanded ? 'CLOSE' : 'OPEN'}</span>
                      </button>
                      
                      {isExpanded && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-[#222631] bg-[#0b0c10]/50">
                          {categoryPairs.sort((a, b) => (a.distance || 9999) - (b.distance || 9999)).map(renderDetailedCard)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {view === 'TABLE' && renderTable()}
          </>
        )}

        {/* DETAILS MODAL */}
        {selectedPair && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/80 backdrop-blur-sm" onClick={() => setSelectedPair(null)}>
            <div className="bg-[#111318] border border-[#222631] rounded-lg w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              
              <div className="flex justify-between items-center p-6 border-b border-[#222631]">
                <h2 className="text-2xl font-light tracking-widest text-[#f8fafc]">{selectedPair.pair}</h2>
                <button onClick={() => setSelectedPair(null)} className="text-[#64748b] hover:text-white text-sm tracking-widest transition-colors">
                  CLOSE
                </button>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-end mb-8 pb-4 border-b border-[#222631]">
                  <span className="text-xs font-semibold text-[#64748b] uppercase tracking-widest">Market Feed</span>
                  <span className="text-3xl font-mono text-[#3b82f6]">{selectedPair.price.toFixed(5)}</span>
                </div>
                
                <div className="space-y-3">
                  <div className="bg-[#171a21] p-4 rounded border border-[#222631]">
                    <div className="text-[#ef4444] text-[10px] font-bold tracking-widest mb-2 uppercase">Short Target</div>
                    {selectedPair.short ? (
                      <div className="flex justify-between items-end">
                        <span className="text-xl font-mono text-[#e2e8f0]">{selectedPair.short.toFixed(5)}</span>
                        <span className="text-[#64748b] text-xs font-mono">{selectedPair.short_date}</span>
                      </div>
                    ) : <div className="text-[#64748b] text-xs italic">Awaiting Setup</div>}
                  </div>

                  <div className="bg-[#171a21] p-4 rounded border border-[#222631]">
                    <div className="text-[#22c55e] text-[10px] font-bold tracking-widest mb-2 uppercase">Long Target</div>
                    {selectedPair.long ? (
                      <div className="flex justify-between items-end">
                        <span className="text-xl font-mono text-[#e2e8f0]">{selectedPair.long.toFixed(5)}</span>
                        <span className="text-[#64748b] text-xs font-mono">{selectedPair.long_date}</span>
                      </div>
                    ) : <div className="text-[#64748b] text-xs italic">Awaiting Setup</div>}
                  </div>

                  {selectedPair.last_touched && (
                    <div className="mt-8 pt-4 border-t border-[#222631]">
                      <div className="text-[#64748b] text-[10px] font-bold tracking-widest mb-3 uppercase">Historical Mitigation</div>
                      <div className="flex justify-between items-center bg-[#1a1d24] p-3 rounded">
                        <span className={`text-xs font-bold tracking-widest ${selectedPair.last_touched.type === 'SHORT' ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
                          {selectedPair.last_touched.type}
                        </span>
                        <span className="font-mono text-sm text-[#cbd5e1]">{selectedPair.last_touched.level.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between mt-2 text-[10px] font-mono text-[#64748b]">
                        <span>Est: {selectedPair.last_touched.date}</span>
                        <span>Hit: {selectedPair.last_touched.touched_date}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}