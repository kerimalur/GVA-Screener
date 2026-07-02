"use client";

import Link from "next/link";
import { CFTC_CONTRACTS } from "@/lib/constants/cftcContracts";

export default function ContractSelector({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CFTC_CONTRACTS.map((c) => (
        <Link
          key={c.code}
          href={`/cot?code=${c.code}`}
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            active === c.code
              ? "bg-accent/15 text-accent border-accent"
              : "bg-surface text-muted border-border hover:text-text hover:border-border2"
          }`}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}
