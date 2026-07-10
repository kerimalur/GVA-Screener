import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { name, email, message } = body as { name?: string; email?: string; message?: string };

  if (!message || message.trim().length < 5) {
    return NextResponse.json({ error: "Nachricht zu kurz" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from("feedback").insert({
    name: name?.trim() || null,
    email: email?.trim() || null,
    message: message.trim(),
  });

  if (error) {
    console.error("Feedback insert error:", error);
    return NextResponse.json({ error: "Fehler beim Speichern" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
