interface CotChartProps {
  data: number[]; // 52 Wochen Commercials-Netto (Tausend Kontrakte)
  color?: string; // Linienfarbe (Hex)
}

// SVG-Liniendiagramm: Commercials-Netto über 52 Wochen, mit Fläche, Null-Linie, Grid und End-Punkt.
export default function CotChart({ data, color = '#2563EB' }: CotChartProps) {
  const n = data.length;
  const W = 680, H = 228, L = 52, R = 16, T = 20, B = 34;
  const lo = Math.min(...data, 0);
  const hi = Math.max(...data, 0);
  const span = hi - lo || 1;
  const X = (i: number) => L + i * ((W - L - R) / (n - 1));
  const Y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);

  const pts = data.map((v, i) => [X(i), Y(v)] as const);
  const lineD = 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const areaD = `${lineD} L${X(n - 1).toFixed(1)},${(H - B).toFixed(1)} L${X(0).toFixed(1)},${(H - B).toFixed(1)} Z`;
  const zeroY = Y(0);
  const last = pts[n - 1];

  const fmt = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)) + 'K';
  const gridVals = [hi, (hi + lo) / 2, lo];
  const ticks = [
    { i: 0, t: '−52 W' },
    { i: 13, t: '−39 W' },
    { i: 26, t: '−26 W' },
    { i: 39, t: '−13 W' },
    { i: n - 1, t: 'Aktuell' },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="cotGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {gridVals.map((gv, gi) => (
        <g key={`g${gi}`}>
          <line x1={L} y1={Y(gv)} x2={W - R} y2={Y(gv)} stroke="#E2E8F0" strokeWidth={1} />
          <text x={L - 10} y={Y(gv) + 4} textAnchor="end" fontSize={11} fill="#94A3B8" fontFamily="JetBrains Mono, monospace">
            {fmt(gv)}
          </text>
        </g>
      ))}

      <line x1={L} y1={zeroY} x2={W - R} y2={zeroY} stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 5" />
      <path d={areaD} fill="url(#cotGrad)" />
      <path d={lineD} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={5} fill="#fff" stroke={color} strokeWidth={3} />

      {ticks.map((tk, ti) => (
        <text
          key={`t${ti}`}
          x={X(tk.i)}
          y={H - 12}
          textAnchor={tk.i === 0 ? 'start' : tk.i === n - 1 ? 'end' : 'middle'}
          fontSize={10.5}
          fill={tk.i === n - 1 ? '#0F172A' : '#94A3B8'}
          fontWeight={tk.i === n - 1 ? 700 : 500}
          fontFamily="Inter, sans-serif"
        >
          {tk.t}
        </text>
      ))}
    </svg>
  );
}
