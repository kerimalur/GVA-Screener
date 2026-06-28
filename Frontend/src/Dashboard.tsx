import { useEffect, useState } from 'react';
import type { MarketData, ViewId } from './types';
import { fetchScreener, markPair } from './api';
import Sidebar, { VIEW_TITLES } from './components/Sidebar';
import Header from './components/Header';
import RadarView from './components/RadarView';
import HeatmapView from './components/HeatmapView';
import PowerIndexView from './components/PowerIndexView';
import StrengthMatrixView from './components/StrengthMatrixView';
import CalendarView from './components/CalendarView';
import DataCenterView from './components/DataCenterView';
import DetailsModal from './components/DetailsModal';

export default function Dashboard() {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<ViewId>('radar');
  const [selectedPair, setSelectedPair] = useState<MarketData | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const json = await fetchScreener();
      setData(json);
    } catch (error) {
      console.error('Fehler beim Laden der API-Daten:', error);
    } finally {
      setLoading(false);
    }
  };

  // Poll alle 30s (wie zuvor).
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 1000 * 30);
    return () => clearInterval(interval);
  }, []);

  // User-Aktion auf getroffenes Paar: Modal schließen + refetch.
  const handleMark = async (pair: string, action: 'pending' | 'done') => {
    try {
      await markPair(pair, action);
      setSelectedPair(null);
      loadData();
    } catch (e) {
      console.error('mark Fehler:', e);
    }
  };

  const showFeedLoader = loading && data.length === 0;

  const renderView = () => {
    switch (activeView) {
      case 'radar':
        return <RadarView data={data} onSelect={setSelectedPair} />;
      case 'heatmap':
        return <HeatmapView data={data} onSelect={setSelectedPair} />;
      case 'powerindex':
        return <PowerIndexView />;
      case 'strength':
        return <StrengthMatrixView />;
      case 'calendar':
        return <CalendarView />;
      case 'datacenter':
        return <DataCenterView />;
    }
  };

  const isScannerView = activeView === 'radar' || activeView === 'heatmap';

  return (
    <div className="text-textMain h-screen flex overflow-hidden">
      <Sidebar active={activeView} onSelect={setActiveView} />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header title={VIEW_TITLES[activeView]} loading={loading} onSync={loadData} />

        <div className="flex-1 overflow-y-auto p-8">
          {isScannerView && showFeedLoader ? (
            <div className="text-center text-textMuted py-32 text-sm tracking-widest animate-pulse">
              SYNCHRONISIERE MIT FEED...
            </div>
          ) : (
            /* key erzwingt Fade-In bei View-Wechsel */
            <div key={activeView}>{renderView()}</div>
          )}
        </div>
      </main>

      {selectedPair && (
        <DetailsModal item={selectedPair} onClose={() => setSelectedPair(null)} onMark={handleMark} />
      )}
    </div>
  );
}
