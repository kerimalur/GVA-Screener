import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";

/**
 * POST /api/stripe/portal
 * Erstellt eine Stripe Billing Portal Session und gibt die URL zurück.
 * User muss eingeloggt sein und eine stripe_customer_id haben.
 */
export async function POST(request: Request) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;

  try {
    const db = createServiceClient();
    const { data: sub } = await db
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Kein Stripe-Konto gefunden" },
        { status: 404 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/einstellungen`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe Portal Fehler:", err);
    return NextResponse.json(
      { error: "Fehler beim Öffnen des Kundenportals" },
      { status: 500 },
    );
  }
}
