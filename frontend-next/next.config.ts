import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Alte Routen wurden ins Macro Terminal bzw. Dashboard konsolidiert —
  // gespeicherte Links sollen nicht brechen. /cot (exakt) redirectet,
  // /cot/intelligence bleibt unberührt.
  async redirects() {
    return [
      { source: "/cot", destination: "/makro/terminal", permanent: false },
      { source: "/makro", destination: "/makro/terminal", permanent: false },
      { source: "/sentiment", destination: "/makro/terminal", permanent: false },
      { source: "/saisonalitaet", destination: "/makro/terminal", permanent: false },
      { source: "/intermarket", destination: "/makro/terminal", permanent: false },
      { source: "/vergleich", destination: "/makro/terminal", permanent: false },
      { source: "/kalender", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
