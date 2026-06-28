import type { ViewId } from '../types';

interface NavItem {
  id: ViewId;
  label: string;
  icon: string; // Phosphor icon class suffix, z.B. "ph-crosshair"
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Markt-Scanner',
    items: [
      { id: 'radar', label: 'Visuelles Radar', icon: 'ph-crosshair' },
      { id: 'heatmap', label: 'Heatmap 28', icon: 'ph-squares-four' },
    ],
  },
  {
    title: 'Makro & Stärke',
    items: [
      { id: 'powerindex', label: 'G8 Power Index', icon: 'ph-chart-bar' },
      { id: 'strength', label: 'Stärke Matrix', icon: 'ph-faders' },
      { id: 'calendar', label: 'Macro Kalender', icon: 'ph-calendar-blank' },
      { id: 'datacenter', label: 'Datenzentrum', icon: 'ph-globe-hemisphere-west' },
    ],
  },
];

// Titel je View (für den Header).
export const VIEW_TITLES: Record<ViewId, string> = {
  radar: 'Visuelles Radar',
  heatmap: 'Heatmap 28',
  powerindex: 'G8 Power Index',
  strength: 'Stärke Matrix',
  calendar: 'Macro Kalender',
  datacenter: 'Datenzentrum',
};

interface SidebarProps {
  active: ViewId;
  onSelect: (id: ViewId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="w-64 bg-bgSurface border-r border-borderLight flex flex-col h-full z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)] shrink-0">
      <div className="p-6 border-b border-borderLight flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shadow-glow">
          <i className="ph-bold ph-radar text-lg"></i>
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none tracking-tight">GVA</h1>
          <span className="text-[10px] uppercase tracking-widest font-bold text-accent">Screener Pro</span>
        </div>
      </div>

      <nav className="p-4 flex-1 overflow-y-auto space-y-8">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-3 px-3">{group.title}</h3>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.id === active;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onSelect(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        isActive
                          ? 'font-semibold bg-bgBase text-accent'
                          : 'font-medium text-textMuted hover:text-textMain hover:bg-bgBase/50'
                      }`}
                    >
                      <i className={`ph-bold ${item.icon} text-lg`}></i> {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-borderLight text-xs text-center text-textMuted font-medium">
        System Online • v3.1
      </div>
    </aside>
  );
}
