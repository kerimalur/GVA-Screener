export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Datenschutzerklärung</h1>
        <p className="text-muted text-sm mb-12">
          Stand: Juli 2026 · Gemäss Schweizer DSG und EU-DSGVO (Art. 13/14)
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">1. Verantwortliche Person</h2>
          <p className="text-sm text-muted leading-relaxed">
            Kerim Alur<br />
            Hasenmattstrasse 7<br />
            4513 Langendorf<br />
            Schweiz<br />
            E-Mail:{" "}
            <a href="mailto:FXTerminalCH@proton.me" className="text-accent hover:underline">
              FXTerminalCH@proton.me
            </a>
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">2. Erhobene Daten</h2>
          <p className="text-sm text-muted leading-relaxed">
            Bei der Nutzung von FX Terminal werden folgende Daten erhoben:
          </p>
          <ul className="text-sm text-muted mt-3 space-y-2 list-disc list-inside">
            <li>
              <strong className="text-text">Kontodaten:</strong> E-Mail-Adresse
              und Name bei Registrierung via Google OAuth
            </li>
            <li>
              <strong className="text-text">Zahlungsdaten:</strong>{" "}
              Abonnementstatus und Stripe-Kunden-ID (keine Kreditkartendaten —
              diese verarbeitet Stripe direkt und verschlüsselt)
            </li>
            <li>
              <strong className="text-text">Technische Logs:</strong> IP-Adresse,
              Browsertyp, Zugriffszeiten (durch Vercel, nicht dauerhaft gespeichert)
            </li>
            <li>
              <strong className="text-text">Journal-Daten:</strong> Vom Nutzer
              selbst erfasste Handelsdaten, gespeichert in Supabase (EU-Server,
              Irland)
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">3. Zweck der Datenverarbeitung</h2>
          <p className="text-sm text-muted leading-relaxed">
            Die erhobenen Daten werden ausschliesslich verwendet für:
          </p>
          <ul className="text-sm text-muted mt-3 space-y-2 list-disc list-inside">
            <li>Bereitstellung und Betrieb der Plattform</li>
            <li>Verwaltung von Benutzerkonten und Abonnements</li>
            <li>Abrechnung via Stripe</li>
            <li>Technischen Support und Fehlerbehebung</li>
            <li>Information über wesentliche Änderungen des Dienstes</li>
          </ul>
          <p className="text-sm text-muted leading-relaxed mt-3">
            Es findet keine Weitergabe an Dritte zu Werbezwecken statt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">4. Rechtsgrundlage (EU-DSGVO)</h2>
          <p className="text-sm text-muted leading-relaxed">
            Für Nutzer mit Wohnsitz in der EU stützt sich die Datenverarbeitung auf
            folgende Rechtsgrundlagen gemäss DSGVO:
          </p>
          <ul className="text-sm text-muted mt-3 space-y-2 list-disc list-inside">
            <li>
              <strong className="text-text">Art. 6 Abs. 1 lit. b DSGVO</strong>{" "}
              (Vertragserfüllung): Kontodaten, Zahlungsdaten
            </li>
            <li>
              <strong className="text-text">Art. 6 Abs. 1 lit. f DSGVO</strong>{" "}
              (berechtigtes Interesse): technische Logs zur Sicherstellung des Betriebs
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">5. Drittanbieter</h2>
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">
                Supabase (Datenbank &amp; Authentifizierung)
              </p>
              <p className="text-xs text-muted">
                Speicherung von Benutzerdaten und Journal-Einträgen auf EU-Servern
                (Irland, aws-eu-west-1). DSGVO-konform.{" "}
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  supabase.com/privacy
                </a>
              </p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Stripe (Zahlungsabwicklung)</p>
              <p className="text-xs text-muted">
                Verarbeitung von Abonnementzahlungen. Kreditkartendaten werden
                ausschliesslich von Stripe verarbeitet und nie an uns übermittelt.
                Stripe ist PCI-DSS-zertifiziert.{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  stripe.com/privacy
                </a>
              </p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Vercel (Hosting)</p>
              <p className="text-xs text-muted">
                Bereitstellung der Webapplikation. Technische Zugriffslogs werden
                von Vercel kurzfristig verarbeitet.{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  vercel.com/legal/privacy-policy
                </a>
              </p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Google (OAuth-Anmeldung)</p>
              <p className="text-xs text-muted">
                Authentifizierung via Google-Konto. Übermittelt werden nur
                E-Mail-Adresse und Name.{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  policies.google.com/privacy
                </a>
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">6. Datensicherheit</h2>
          <p className="text-sm text-muted leading-relaxed">
            Alle Daten werden verschlüsselt gespeichert und übertragen (SSL/TLS).
            Der Datenbankzugriff ist durch Row Level Security (RLS) geschützt —
            jeder Nutzer kann ausschliesslich seine eigenen Daten einsehen.
            Passwörter werden nicht gespeichert (Authentifizierung via OAuth).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">7. Aufbewahrungsdauer</h2>
          <p className="text-sm text-muted leading-relaxed">
            Benutzerdaten werden so lange gespeichert, wie ein aktives Konto
            besteht. Nach Kündigung und Löschung des Kontos werden
            personenbezogene Daten innerhalb von 30 Tagen gelöscht, sofern keine
            gesetzliche Aufbewahrungspflicht besteht.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">
            8. Rechte der betroffenen Personen
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            Gemäss DSG (Schweiz) und DSGVO (EU) haben Sie folgende Rechte:
          </p>
          <ul className="text-sm text-muted space-y-2 list-disc list-inside">
            <li>
              <strong className="text-text">Auskunftsrecht (Art. 15 DSGVO):</strong>{" "}
              Auskunft über gespeicherte Daten
            </li>
            <li>
              <strong className="text-text">Berichtigungsrecht (Art. 16 DSGVO):</strong>{" "}
              Korrektur unrichtiger Daten
            </li>
            <li>
              <strong className="text-text">Löschungsrecht (Art. 17 DSGVO):</strong>{" "}
              Löschung Ihrer Daten («Recht auf Vergessenwerden»)
            </li>
            <li>
              <strong className="text-text">
                Einschränkung der Verarbeitung (Art. 18 DSGVO)
              </strong>
            </li>
            <li>
              <strong className="text-text">
                Datenportabilität (Art. 20 DSGVO):
              </strong>{" "}
              Herausgabe in maschinenlesbarem Format
            </li>
            <li>
              <strong className="text-text">
                Widerspruchsrecht (Art. 21 DSGVO)
              </strong>
            </li>
          </ul>
          <p className="text-sm text-muted mt-3">
            Zur Ausübung dieser Rechte:{" "}
            <a
              href="mailto:FXTerminalCH@proton.me"
              className="text-accent hover:underline"
            >
              FXTerminalCH@proton.me
            </a>
          </p>
          <p className="text-sm text-muted mt-2">
            EU-Nutzer haben zudem das Recht, eine Beschwerde bei der zuständigen
            Datenschutzbehörde ihres Herkunftslandes einzureichen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">9. Cookies</h2>
          <p className="text-sm text-muted leading-relaxed">
            FX Terminal verwendet ausschliesslich technisch notwendige Cookies
            für die Authentifizierung (Session-Cookie von Supabase). Es werden
            keine Tracking-, Analyse- oder Werbe-Cookies eingesetzt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">
            10. Änderungen dieser Datenschutzerklärung
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Diese Datenschutzerklärung kann bei Bedarf angepasst werden. Bei
            wesentlichen Änderungen werden Nutzer per E-Mail informiert.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">11. Kontakt &amp; Beschwerden</h2>
          <p className="text-sm text-muted leading-relaxed">
            Kerim Alur ·{" "}
            <a
              href="mailto:FXTerminalCH@proton.me"
              className="text-accent hover:underline"
            >
              FXTerminalCH@proton.me
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
