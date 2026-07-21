import ModeLauncher from "@/components/layout/ModeLauncher";
import { loadLetzteEngineNacht } from "@/lib/nav/launcherServer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht — FX Terminal" };

/**
 * Startseite = Modus-Launcher. Bewusst KEIN Auto-Redirect auf den zuletzt
 * benutzten Modus: die Frage „was mache ich heute?" soll jedes Mal gestellt
 * werden, sonst landet man wieder ungefragt in derselben Ansicht.
 */
export default async function LauncherPage() {
  const { night, istNeu } = await loadLetzteEngineNacht();
  return <ModeLauncher letzteNacht={night} nachtIstNeu={istNeu} />;
}
