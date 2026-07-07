import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";

/**
 * POST /api/stripe/checkout
 * Erstellt eine Stripe Checkout Session und gibt die URL zurück.
 * User muss eingeloggt sein.
 */
export async function POST(request: Request) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
  }

  if (!process.env.STRIPE_PRICE_ID) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_ID nicht konfiguriert" },
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

    let customerId = existingSub?.stripe_customer_id;

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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { user_id: user.id },
      success_url: `${origin}/upgrade?success=1`,
      cancel_url: `${origin}/upgrade?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_update: { address: "auto" },
      automatic_tax: { enabled: true },
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
