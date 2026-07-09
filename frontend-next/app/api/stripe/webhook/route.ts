import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 * Stripe sendet Events hierhin. Signatur wird verifiziert.
 * Raw body nötig — kein JSON-Parsing durch Next.js.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Fehlende Signatur" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook-Signatur ungültig:", err);
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 400 });
  }

  const db = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;
        const tier = session.metadata?.tier === "basic" ? "basic" : "pro";

        if (!userId || !subscriptionId) break;

        // Subscription-Details holen
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const interval = sub.items.data[0]?.price.recurring?.interval ?? "month";

        await db.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: sub.status,
          plan: interval === "year" ? "yearly" : "monthly",
          tier,
          current_period_end: new Date(
            (sub as unknown as { current_period_end: number }).current_period_end * 1000
          ).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const tier = sub.metadata?.tier === "basic" ? "basic" : "pro";
        const interval = sub.items.data[0]?.price.recurring?.interval ?? "month";

        const { data: existing } = await db
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!existing) break;

        await db.from("subscriptions").update({
          stripe_subscription_id: sub.id,
          status: sub.status,
          plan: interval === "year" ? "yearly" : "monthly",
          tier,
          current_period_end: new Date(
            (sub as unknown as { current_period_end: number }).current_period_end * 1000
          ).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        }).eq("user_id", existing.user_id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await db
          .from("subscriptions")
          .update({ status: "canceled", cancel_at_period_end: false })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await db
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Bei erfolgreichem Zahlungseingang sicherstellen, dass Status "active" ist
        await db
          .from("subscriptions")
          .update({ status: "active" })
          .eq("stripe_customer_id", customerId)
          .in("status", ["past_due", "inactive"]);
        break;
      }
    }
  } catch (err) {
    console.error("Webhook-Verarbeitung fehlgeschlagen:", event.type, err);
    return NextResponse.json(
      { error: "Verarbeitungsfehler" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
