import { redirect } from "next/navigation";

// Einstellungen sind jetzt app-weit — alte Journal-URL weiterleiten.
export default function LegacySettingsPage() {
  redirect("/einstellungen");
}
