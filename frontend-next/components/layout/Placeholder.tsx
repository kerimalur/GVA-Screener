import Panel from "./Panel";

export default function Placeholder({ modul }: { modul: string }) {
  return (
    <Panel title={modul} subtitle="Modul im Aufbau — Daten folgen nach Backfill">
      <div className="h-40 flex items-center justify-center text-muted text-sm font-mono">
        {modul} · coming online …
      </div>
    </Panel>
  );
}
