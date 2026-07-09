import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";

/**
 * POST /api/stripe/checkout
 * Erstellt eine Stripe Checkout Session und gibt die URL zurück.
 * User muss eingeloggt sein.
 */
// Preisstufen: pro Tier+Intervall eine eigene Stripe-Price-ID (in Stripe Dashboard anlegen,
// dann als Vercel-Env-Var setzen). STRIPE_PRICE_ID bleibt als Fallback fuer "pro/monthly"
// erhalten, damit bestehende Konfigurationen nicht brechen.
const PRICE_ENV_MAP: Record<string, Record<string, string | undefined>> = {
  basic: {
    monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
    yearly: process.env.STRIPE_PRICE_BASIC_YEARLY,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? process.env.STRIPE_PRICE_ID,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
};

export async function POST(request: Request) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tier: "basic" | "pro" = body?.tier === "basic" ? "basic" : "pro";
  const billing: "monthly" | "yearly" = body?.billing === "yearly" ? "yearly" : "monthly";

  // EU-Widerrufsrecht: Zugang wird sofort bereitgestellt, digitale Dienstleistung.
  // Ohne diese ausdrückliche Zustimmung (Checkbox im Frontend) kein Checkout-Start —
  // sonst würde EU-Kunden das 14-tägige Widerrufsrecht faktisch untergraben (AGB Abschnitt 6).
  if (body?.widerrufConsent !== true) {
    return NextResponse.json(
      { error: "Bitte zuerst dem Hinweis zum Widerrufsrecht zustimmen." },
      { status: 400 },
    );
  }

  const priceId = PRICE_ENV_MAP[tier][billing];
  if (!priceId) {
    return NextResponse.json(
      { error: `Kein Stripe-Preis fuer ${tier}/${billing} konfiguriert (Env-Var fehlt)` },
      { status: 500 },
    );
  }

  const origin = new URL(request.url).origin;

  try {
    // Bestehende stripe_customer_id prüfen
    const db = createServiceClient();
    const { data: existingSub } = await db
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = existingSub?.stripe_customer_id ?? null;

    // Prüfen ob die gespeicherte Customer-ID im aktiven Stripe-Konto existiert
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        // Customer existiert nicht (z.B. Sandbox-ID im Live-Modus) → neu erstellen
        customerId = null;
        await db.from("subscriptions")
          .update({ stripe_customer_id: null })
          .eq("user_id", user.id);
      }
    }

    if (!customerId) {
      // Neuen Stripe-Kunden anlegen
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Vorab in Supabase speichern (Webhook kann schneller feuern)
      await db.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        status: "inactive",
      });
    }

    // Zeitstempel der Widerrufsrecht-Zustimmung als Nachweis in Stripe-Metadata ablegen
    // (Audit-Trail, falls ein EU-Kunde die Bereitstellung später anfechtet).
    const consentMeta = {
      user_id: user.id,
      tier,
      withdrawal_consent: "true",
      withdrawal_consent_at: new Date().toISOString(),
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: consentMeta,
      subscription_data: { metadata: consentMeta },
      success_url: `${origin}/upgrade?success=1`,
      cancel_url: `${origin}/upgrade?canceled=1`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe Checkout Fehler:", err);
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Checkout Session" },
      { status: 500 },
    );
  }
}
