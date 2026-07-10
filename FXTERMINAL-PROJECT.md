# FX Terminal — Entscheidungs-Log (Launch-Vorbereitung)

> Laufende Notiz für Entscheidungen zwischen Kerim und Claude. Ergänzt STATUS.md/MIGRATION.md,
> ersetzt sie nicht. Bei neuer Session zusätzlich lesen, wenn es um Launch-Fragen geht.

## Stand: 2026-07-10

## 2026-07-10 — Onboarding-Tour + Fixes (umgesetzt)

- **Onboarding-Tour (neu):** `components/onboarding/OnboardingTour.tsx`, eingebunden in
  `app/(app)/layout.tsx`. Interaktive 16-Schritte-Tour (Spotlight auf Sidebar-Navigation):
  Dashboard, Weekly, COT, Makro, Sentiment, Intermarket, Saisonalität, Kalender, Vergleich,
  Markt-Scanner (als privater Beta-/Testbereich gekennzeichnet), Journal (Konto einrichten),
  Outlooks (Erstellen via Weekly-Vorbefüllung), Datengrundlage (OANDA/CFTC/FRED/Myfxbook,
  täglich 06:30 CH-Zeit), Einstellungen.
  - Startet automatisch NUR beim ersten Login neuer Accounts (nach Stripe-Kauf/Aktivierung).
    Erkennung: `user_preferences`-Key `onboarding_tour` + Account-Alter (< 14 Tage = neu).
    Bestandsaccounts werden beim ersten Check still als "completed" markiert.
  - Manuell neu startbar: Einstellungen → "Onboarding-Tour erneut ansehen".
  - Sidebar: `data-tour`/`data-tour-group`-Attribute für die Tour-Anker ergänzt.
- **Bugfix Einstellungen → Daten ("Noch keine Daten geladen"):** `/api/data/status` lieferte
  ein nacktes Array, die Seite erwartete `{ jobs, nextRun }` → Route liefert jetzt
  `{ jobs, nextRun }` inkl. berechnetem nächsten Cron-Lauf (06:30 Europe/Zurich, DST-sicher).
- **Journal — eigene Confluences im Trade-Formular:** `TradeFormModal.tsx` hat jetzt einen
  "+ Eigene"-Chip: neue Confluence anlegen → wird sofort ausgewählt und dauerhaft gespeichert
  (localStorage + `user_preferences.confluences`, gleiche Quelle wie Journal-Einstellungen;
  beim Öffnen des Modals wird aus Supabase gesynct).
- **Hinweis Session-Umgebung:** Datei-Sync in die Cowork-Sandbox war für editierte Dateien
  fehlerhaft (abgeschnitten) — Typecheck lief deshalb über ein Schattenprojekt in /tmp,
  `tsc --noEmit` fehlerfrei. Die echten Projektdateien sind korrekt.

## Kontakt & Identität

- **Support-E-Mail:** FXTerminalCH@proton.me (ProtonMail — erledigt, kein Zoho)
- **Impressum-Adresse:** Kerim Alur, Hasenmattstrasse 7, 4513 Langendorf, Schweiz (in CH gesetzlich vorgeschrieben; Wechsel auf Virtual Office erst nach Launch)
- **Domain:** fx-terminal.ch — bewusst zurückgestellt bis App stabil läuft, dann Infomaniak + Vercel
- **Virtuelle Geschäftsadresse:** Swissoffice — zurückgestellt bis erste Einnahmen laufen
- **Supabase-Account:** kerimtrades.ssg@gmail.com (Projekt: bpggwelpuvbkeudrqoiv)

## Stand: 2026-07-09

## Entschieden

- **Preis:** CHF 34.95 / Monat, ein Plan (nicht zwei Stufen, keine Jahresabrechnung — siehe „Offene Frage" unten).
  - Fixe in `frontend-next/app/agb/page.tsx`: „wöchentlich" → „monatlich" (erledigt, 2026-07-09).
  - `frontend-next/app/upgrade/page.tsx` zeigte bereits korrekt CHF 34.95/Monat.
  - `docs/landingpage-prompt.md` von € 29 auf CHF 34.95 korrigiert (nur Planungsdokument).
- **Scanner-Bereich:** bleibt admin-only (nicht öffentlich verkäuflich). Ist im Code bereits so umgesetzt (`ADMIN_USER_IDS` in `proxy.ts` + PIN-Gate `/api/auth/scanner-unlock`). Betrifft nur `/admin/*` und `/scanner/*` — das reguläre Abo (Journal, Terminal-Seiten) bleibt für zahlende User zugänglich.
- **Vercel Env-Vars:** laut Kerim vollständig gesetzt (nicht durch Claude verifizierbar, da Env-Var-Werte nicht auslesbar sind — nur Vorhandensein der Keys wurde als Anforderung dokumentiert, siehe MIGRATION.md).

## Offen / braucht Entscheidung

- **Zwei-Stufen-Pricing vs. ein Plan:** `frontend-next/app/LandingPage.tsx` (Zeilen ~611–660) zeigt aktuell **Basic (CHF 24.95/Monat) + Pro (CHF 34.95/Monat)** nebeneinander, plus einen Monat/Jahr-Umschalter (Jahr: CHF 249 / CHF 349). Checkout (`/api/stripe/checkout`) und Datenbank (`subscriptions.plan`) unterstützen aber nur **eine** Stripe-Price-ID — kein Tier-Auswahl-Mechanismus. Muss vor Launch entschieden werden: Landing Page auf einen Plan vereinfachen, oder Checkout um Tier-Auswahl + zweite Stripe-Price-ID erweitern?
- **Supabase-Projekt reaktivieren:** `yahvhzywsynnsqznysfr` ist pausiert (INACTIVE). Ohne Reaktivierung funktioniert nichts (Login, Journal, Subscriptions).
- **Impressum-Adresse:** ~~Privatadresse (Hasenmattstrasse 7)~~ → entfernt (2026-07-10). Nur PLZ+Ort: 4513 Langendorf, Schweiz. E-Mail: FXTerminalCH@proton.me.
- **Stripe-Konfiguration:** `STRIPE_PRICE_ID` muss in Stripe selbst exakt auf CHF 34.95/Monat stehen (nicht durch Claude prüfbar ohne Stripe-MCP-Zugriff — Stripe-Connector ist noch nicht autorisiert).

## Verworfen / bewusst nicht mehr aktuell

- Wöchentliche Abrechnung (war in AGB, war Fehler/Altlast — korrigiert).
- € 29/Monat (aus dem ursprünglichen Landingpage-Planungsprompt, war nie live umgesetzt).
- Ein-Plan-Modell — ersetzt durch Basic/Pro Zwei-Stufen-Modell (Entscheidung 2026-07-09).

## 2026-07-09 — Antworten aus Rückfrage-Runde

- **Pricing:** Basic + Pro + Jahresabo werden echt gebaut (nicht nur Landing-Page-Deko).
- **Zielmarkt:** auch DE/AT/EU, nicht nur Schweiz → AGB um EU-Widerrufsrecht (14 Tage,
  vorzeitiges Erlöschen nur mit ausdrücklicher Zustimmung) ergänzt.
- **OANDA:** Backend (Render/Scanner) läuft auf Practice/Demo. **Wichtig:** `frontend-next`
  hat einen eigenen, unabhängigen OANDA-Key (`app/api/prices/live/route.ts`, `lib/sources/oanda.ts`)
  für die Live-Preise, die ALLE zahlenden Kunden im Terminal sehen — das ist NICHT nur der
  Scanner-Bereich. Muss geprüft werden: welchen `OANDA_URL`/`OANDA_API_KEY` hat Vercel gesetzt?
  Falls Practice — zahlende Kunden sehen ggf. nicht die echten Live-Kurse.
- **Domain:** bleibt vorerst `gva-screener.vercel.app`.

## Umgesetzt (Code-Änderungen 2026-07-09)

- `supabase/subscriptions.sql`: Spalte `tier` (`basic`/`pro`) ergänzt, idempotent per `ALTER TABLE`.
- `app/api/stripe/checkout/route.ts`: nimmt jetzt `{ tier, billing }` im Body entgegen,
  wählt die passende Stripe-Price-ID aus 4 neuen Env-Vars, schreibt `tier` in Session- und
  Subscription-Metadata.
- `app/api/stripe/webhook/route.ts`: liest `tier` aus Metadata, speichert `plan` (monthly/yearly)
  + `tier` (basic/pro) in `subscriptions`.
- `proxy.ts`: `/journal/*` (Journal, Backtest, Strategie, Outlook, Kalender, Equity) ist jetzt
  Pro-exklusiv — Basic-User werden mit `?tier=pro` zu `/upgrade` geschickt.
- `lib/constants/plans.ts` (neu): einzige Quelle für Preise/Features/Tagline pro Tier —
  von `LandingPage.tsx` und `app/upgrade/page.tsx` importiert (verhindert erneutes Auseinanderlaufen).
- `app/upgrade/page.tsx`: Tier-Umschalter (Basic/Pro) + Monat/Jahr-Umschalter, sendet Auswahl an Checkout.
- `app/LandingPage.tsx`: Pricing-CTAs übergeben jetzt `tier` + `billing` an `/upgrade`;
  „ab CHF 34.95" im Final-CTA korrigiert zu „ab CHF 24.95" (Basic ist der Einstiegspreis).
- `app/agb/page.tsx`: monatliche Abrechnung, zwei Tiers, EU-Widerrufsrecht-Absatz ergänzt.

## 2026-07-09 — Supabase-Korrektur (wichtig!)

Claude hatte zunächst das FALSCHE/alte Supabase-Projekt geprüft (`yahvhzywsynnsqznysfr`,
„kerim.alur@gmail.com's Project" — das ist pausiert, >90 Tage, **nicht mehr automatisch
reaktivierbar**, aber offenbar auch gar nicht das produktiv genutzte Projekt).

**Das tatsächlich aktive Projekt ist:** `bpggwelpuvbkeudrqoiv` — Konto/Org
„kerimtrades.ssg@gmail.com", Status **ACTIVE_HEALTHY**, erstellt 2026-06-18, eu-west-1.
Enthält alle echten Daten: 41 Trades, 5 Subscriptions (davon 1 aktiv, Rest inactive/canceled —
Reste vom alten Wochen-Preismodell, `plan="weekly"` bei einem Datensatz), komplettes
Terminal-Schema (168k Kurse, 117k FRED-Serien, COT-Reports etc.). Kein Datenverlust, kein
Restore nötig — das alte Projekt war schlicht eine Altlast/Verwechslung.

Migration `add_subscriptions_tier_column` wurde direkt auf diesem Projekt ausgeführt
(`alter table subscriptions add column if not exists tier text not null default 'pro'`) —
erfolgreich, alle 5 Bestands-Zeilen jetzt mit `tier='pro'` (korrekt, da sie aus der Zeit vor
dem Zwei-Stufen-Modell stammen und vollen Zugriff hatten).

Security-Advisor-Befund (nicht kritisch, INFO/WARN): mehrere Terminal-Tabellen haben RLS
aktiv ohne Policy — das ist **beabsichtigt** (nur Service-Role-Zugriff, siehe Architektur in
MIGRATION.md). Zwei Punkte, die trotzdem beachtenswert sind:
- `public.account_configs` ist eine **SECURITY DEFINER View** — sollte geprüft werden, ob das
  gewollt ist (kann RLS umgehen).
- „Leaked Password Protection" ist in Supabase Auth deaktiviert — einfacher Klick zum Aktivieren,
  empfehlenswert vor Launch.

## 2026-07-09 — Login: E-Mail/Passwort ergänzt

`app/login/page.tsx`: Registrierung/Login per E-Mail+Passwort hinzugefügt (zusätzlich zu
Google/GitHub OAuth), via `supabase.auth.signUp` / `signInWithPassword`. Behandelt automatisch
den Fall „Confirm email" aktiv (zeigt Hinweis „Bestätigungs-E-Mail geschickt" statt Redirect).
Nutzt den bestehenden generischen `/auth/callback`-Handler (PKCE-Code-Exchange), keine Änderung
dort nötig.

**Wichtig:** Jetzt, wo Passwort-Login existiert, wird „Leaked Password Protection" (Schritt 1
unten) tatsächlich relevant — vorher hat es nur OAuth gegeben, wo das Feature wirkungslos war.
Zusätzlich prüfen: Supabase Dashboard → Authentication → Sign In / Providers → **Email** muss
aktiviert sein (ist bei den meisten Projekten Standard, aber nicht durch Claude verifizierbar).

## 2026-07-09 — Leaked Password Protection: blockiert durch Free-Tier

Supabase meldet: „Configuring leaked password protection via HaveIBeenPwned.org is available
on Pro Plans and up." Das aktive Projekt (`bpggwelpuvbkeudrqoiv`) läuft auf **Free-Tier**.
Nicht fixbar ohne Plan-Upgrade. Entscheidung: vorerst zurückgestellt, kein Launch-Blocker
(Google/GitHub-OAuth bleibt Hauptlogin, E-Mail+Passwort nur Zusatzoption).

**Hinweis:** Free-Tier war auch der Grund, warum das alte Projekt nach 90 Tagen Inaktivität
unrettbar pausiert wurde (siehe oben). Ein Pro-Upgrade (25$/Monat) würde beides lösen:
Leaked-Password-Check + kein automatisches Pausieren mehr. Noch keine Entscheidung getroffen.

## 2026-07-09 — EU-Widerrufsrecht-Checkbox umgesetzt

`app/upgrade/page.tsx`: Checkbox „Mir ist bewusst, dass der Zugang sofort... " ergänzt,
Button „Jetzt abonnieren" ist deaktiviert, bis die Checkbox angehakt ist. Automatischer
Checkout beim `autostart=1`-Redirect wurde entfernt — das darf nicht automatisiert laufen,
da die Zustimmung eine bewusste Nutzerhandlung sein muss. `autostart` prüft jetzt nur noch
Login-Status/aktives Abo, löst aber keinen automatischen Checkout mehr aus.

`app/api/stripe/checkout/route.ts`: verlangt jetzt `widerrufConsent: true` im Request-Body,
sonst 400-Fehler. Schreibt bei Erfolg `withdrawal_consent` + `withdrawal_consent_at`
(Zeitstempel) in die Stripe-Session- und Subscription-Metadata — dient als Nachweis, falls
ein EU-Kunde die sofortige Bereitstellung später anficht.

## 2026-07-09 — Stripe: 4 Preise live angelegt

Zwei Stripe-Konten im Spiel: „TerminalFX Sandbox" (Test, `acct_1TqcpPRFKs8thVm4`) und
„TerminalFX" (**Live**, `acct_1TqcpARQiPsunEeX`). Beide haben jetzt Produkte „FX Terminal
Basic" + „FX Terminal Pro" mit je 2 Preisen (Monat/Jahr).

**Live-Price-IDs (`acct_1TqcpARQiPsunEeX`) — in Vercel als Env-Vars setzen:**
- `STRIPE_PRICE_BASIC_MONTHLY=price_1TrPUkRQiPsunEeXEycxOgMy` (CHF 24.95/Monat)
- `STRIPE_PRICE_BASIC_YEARLY=price_1TrPUlRQiPsunEeXPdPFqScM` (CHF 249/Jahr)
- `STRIPE_PRICE_PRO_MONTHLY=price_1TrPUmRQiPsunEeXjdxTeWJs` (CHF 34.95/Monat)
- `STRIPE_PRICE_PRO_YEARLY=price_1TrPUoRQiPsunEeXhYxERh2D` (CHF 349/Jahr)

Test-Price-IDs (`acct_1TqcpPRFKs8thVm4`, nur zum lokalen Durchtesten mit `sk_test_...`):
- Basic Monatlich: `price_1TrPMzRFKs8thVm4iXXtQOqX`
- Basic Jährlich: `price_1TrPN1RFKs8thVm4twmj57QS`
- Pro Monatlich: `price_1TrPN2RFKs8thVm42QB2N6N4`
- Pro Jährlich: `price_1TrPN3RFKs8thVm42T7FWSXu`

Altes Einzelprodukt „FX Terminal" (`prod_UqLP91qubdk2OL`, Live) existiert noch im Live-Konto —
wird vom Code nicht mehr referenziert, kann optional archiviert werden.

## 2026-07-09 — TODO für morgen: ADMIN_USER_IDS bereinigen (Bug-Verdacht)

Kerim meldet: mit dem Test-Account `rondososa20418@gmail.com`
(user_id `17160ea7-83c9-4609-8776-36f90a22150e`, Status in DB: **inactive**, kein aktives
Abo) kommt man trotzdem direkt ins Terminal UND sieht sogar den Scanner (eigentlich
admin-only). Code (`proxy.ts`) und DB-Status wurden geprüft und sehen korrekt aus —
einzige plausible Erklärung: diese User-ID steht bereits in der Vercel-Env-Var
`ADMIN_USER_IDS` (vermutlich Altlast aus früheren Tests des Admin-Rollensystems).

**Zu prüfen/fixen:**
1. Vercel → Projekt `gva-screener` → Settings → Environment Variables → `ADMIN_USER_IDS` öffnen.
2. Prüfen, ob `17160ea7-83c9-4609-8776-36f90a22150e` (und ggf. weitere Test-IDs) dort drinstehen.
3. Nur die eigene(n) echte(n) Admin-ID(s) behalten, Rest entfernen.
4. Redeploy anstoßen, danach mit dem Test-Account erneut verifizieren, dass Scanner +
   Journal jetzt korrekt gesperrt sind (sollte auf `/upgrade` bzw. `/dashboard` umleiten).
5. Danach sicherheitshalber auch bei den anderen Test-Accounts (`pam.alur@gmail.com`,
   `elinebiene@icloud.com`, `kerimtrades.ssg@gmail.com`) gegenprüfen, ob sie versehentlich
   ebenfalls in `ADMIN_USER_IDS` stehen.

## Manuelle Schritte — noch offen (kann Claude nicht selbst ausführen)

1. ~~Supabase reaktivieren~~ — erledigt, siehe oben. Stattdessen: alte Projekt-Referenz
   `yahvhzywsynnsqznysfr` überall in Doku/Vercel/lokalen Configs auf `bpggwelpuvbkeudrqoiv`
   prüfen, falls irgendwo noch die alte URL/Keys hinterlegt sind.
2. **Stripe:** 4 Preise anlegen — Basic monatlich (CHF 24.95), Basic jährlich (CHF 249),
   Pro monatlich (CHF 34.95), Pro jährlich (CHF 349).
3. **Vercel Env-Vars ergänzen:** `STRIPE_PRICE_BASIC_MONTHLY`, `STRIPE_PRICE_BASIC_YEARLY`,
   `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY` (`STRIPE_PRICE_ID` bleibt als
   Fallback für Pro-Monatlich aktiv, falls die neuen Vars fehlen — aber sauberer ist,
   alle vier zu setzen).
4. **EU-Widerrufsrecht-Checkbox:** Die AGB setzen jetzt eine „ausdrückliche Zustimmung zum
   vorzeitigen Erlöschen des Widerrufsrechts" voraus — dafür fehlt noch eine echte Checkbox
   im Checkout-Flow (`/upgrade`) für EU-Nutzer. Ohne diese Checkbox greift aktuell technisch
   das volle 14-Tage-Widerrufsrecht für EU-Kunden, auch wenn sie sofort Zugriff bekommen.
5. **OANDA-Env für `frontend-next` in Vercel prüfen** (siehe oben) — Live vs. Practice.
6. **Impressum-Adresse:** weiterhin offen (Privatadresse vs. eigene Entity).
