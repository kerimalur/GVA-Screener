"use client";

import { useRouter } from "next/navigation";

export interface OutlookPrefill {
  symbol: string; // Journal-Notation, z.B. 'EURUSD'
  direction: "long" | "short" | null;
  fundamental: string;
}

/**
 * Übergibt das Dossier per sessionStorage an den Outlook-Wizard
 * (OutlookView liest den Key beim Mount und öffnet den Wizard vorbefüllt).
 */
export default function OutlookPrefillButton({ prefill }: { prefill: OutlookPrefill }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        sessionStorage.setItem("outlook-prefill", JSON.stringify(prefill));
        router.push("/journal/outlook");
      }}
      className="px-2.5 py-1 rounded text-[11px] font-bold border border-accent text-accent hover:bg-accent/15 transition-colors"
    >
      <i className="ph-bold ph-crosshair mr-1" />
      Outlook erstellen
    </button>
  );
}
