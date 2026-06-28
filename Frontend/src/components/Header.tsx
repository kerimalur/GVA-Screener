interface HeaderProps {
  title: string;
  loading: boolean;
  onSync: () => void;
}

export default function Header({ title, loading, onSync }: HeaderProps) {
  return (
    <header className="h-16 bg-bgSurface border-b border-borderLight flex items-center justify-between px-8 shrink-0 z-10 shadow-sm">
      <h2 className="text-xl font-bold text-textMain tracking-tight">{title}</h2>

      <div className="flex items-center gap-4">
        <button className="w-10 h-10 rounded-full bg-bgBase border border-borderLight flex items-center justify-center text-textMuted hover:text-accent hover:border-accent/30 transition-colors">
          <i className="ph-bold ph-funnel text-lg"></i>
        </button>
        <button
          onClick={onSync}
          className="bg-textMain hover:bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-hover transition-all flex items-center gap-2 disabled:opacity-60"
          disabled={loading}
        >
          <i className={`ph-bold ph-arrows-clockwise text-lg ${loading ? 'animate-spin' : ''}`}></i>
          {loading ? 'Sync…' : 'Live Sync'}
        </button>
      </div>
    </header>
  );
}
