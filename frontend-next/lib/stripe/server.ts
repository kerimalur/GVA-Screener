import "server-only";
import Stripe from "stripe";

// Lazy-Init: Stripe wird erst beim ersten echten API-Aufruf initialisiert,
// nicht beim Build. So schlägt der Build nicht fehl wenn der Key fehlt.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

// Abwärtskompatibel: checkout + webhook nutzen getStripe()
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return getStripe()[prop as keyof Stripe];
  },
});
