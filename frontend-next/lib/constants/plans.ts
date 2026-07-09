// Zentrale Preis-/Feature-Definition fuer Basic + Pro.
// Wird von der Landing Page (app/LandingPage.tsx) und der Upgrade-Seite
// (app/upgrade/page.tsx) genutzt, damit Preise/Features nicht auseinanderlaufen.
//
// WICHTIG: Die tatsächliche Abrechnung passiert über Stripe-Price-IDs (Env-Vars
// STRIPE_PRICE_BASIC_MONTHLY / _YEARLY / STRIPE_PRICE_PRO_MONTHLY / _YEARLY).
// Die Beträge hier sind nur für die Anzeige — sie müssen manuell mit den in
// Stripe hinterlegten Preisen übereinstimmen.

export type Tier = "basic" | "pro";
export type Billing = "monthly" | "yearly";

export const PLANS: Record<
  Tier,
  {
    name: string;
    tagline: string;
    priceMonthly: number;
    priceYearly: number;
    features: string[];
  }
> = {
  basic: {
    name: "Basic",
    tagline: "Für den fundamentalen Marktüberblick.",
    priceMonthly: 24.95,
    priceYearly: 249,
    features: [
      "28 FX-Paare — Screener & Stärke",
      "COT-Analyse & Perzentile",
      "Makro-Fundamentals (FRED, Zinsen)",
      "Währungs-Kompass (4-Faktoren-Bias)",
      "Retail-Sentiment (Myfxbook)",
      "Saisonalität & Intermarket-Korrelationen",
      "Risk-Regime & Weekly Outlook",
      "Täglich automatisch aktualisiert",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "Das komplette Terminal für aktive Swing-Trader.",
    priceMonthly: 34.95,
    priceYearly: 349,
    features: [
      "Alle fundamentalen Module aus Basic",
      "Integriertes Trading Journal (R-Multiple)",
      "COT-Backtest & historischer Edge-Test",
      "Strategie-Builder & Backtest-Lab",
      "Outlook-Wizard & Trade-Kalender",
      "Equity-Kurve & Performance-Auswertung",
    ],
  },
};
