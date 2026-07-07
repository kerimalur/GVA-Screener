export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Datenschutzerklärung</h1>
        <p className="text-muted text-sm mb-12">Stand: Juli 2026 · Gemäss Schweizer Datenschutzgesetz (DSG)</p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">1. Verantwortliche Person</h2>
          <p className="text-sm text-muted leading-relaxed">
            Kerim Alur<br />
            Hasenmattstrasse 7<br />
            4513 Langendorf<br />
            Schweiz<br />
            E-Mail: kerim.alur@gmail.com
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">2. Erhobene Daten</h2>
          <p className="text-sm text-muted leading-relaxed">
            Bei der Nutzung von FX Terminal werden folgende Daten erhoben:
          </p>
          <ul className="text-sm text-muted mt-3 space-y-2 list-disc list-inside">
            <li><strong className="text-text">Kontodaten:</strong> E-Mail-Adresse bei Registrierung via Google OAuth</li>
            <li><strong className="text-text">Zahlungsdaten:</strong> Abonnementstatus, Stripe-Kunden-ID (keine Kreditkartendaten — diese verarbeitet Stripe direkt)</li>
            <li><strong className="text-text">Nutzungsdaten:</strong> Technische Logs (IP-Adresse, Browsertyp, Zugriffszeiten) durch Vercel</li>
            <li><strong className="text-text">Trading-Journal-Daten:</strong> Vom Nutzer selbst erfasste Handelsdaten, gespeichert in Supabase</li>
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
          <h2 className="text-lg font-semibold mb-3">4. Drittanbieter und Datenübermittlung</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            Für den Betrieb der Plattform werden folgende Drittanbieter eingesetzt:
          </p>
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Supabase (Datenbank & Authentifizierung)</p>
              <p className="text-xs text-muted">Speicherung von Benutzerdaten und Trading-Journal-Einträgen. Datenschutzrichtlinie: supabase.com/privacy</p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Stripe (Zahlungsabwicklung)</p>
              <p className="text-xs text-muted">Verarbeitung von Abonnementzahlungen. Kreditkartendaten werden ausschliesslich von Stripe verarbeitet und nie an uns übermittelt. Datenschutzrichtlinie: stripe.com/privacy</p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Vercel (Hosting)</p>
              <p className="text-xs text-muted">Bereitstellung der Webapplikation. Technische Zugriffslogs werden von Vercel verarbeitet. Datenschutzrichtlinie: vercel.com/legal/privacy-policy</p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Google (OAuth-Anmeldung)</p>
              <p className="text-xs text-muted">Authentifizierung via Google-Konto. Es werden nur E-Mail-Adresse und Name übermittelt. Datenschutzrichtlinie: policies.google.com/privacy</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">5. Datenspeicherung und Sicherheit</h2>
          <p className="text-sm text-muted leading-relaxed">
            Alle Daten werden verschlüsselt gespeichert und übertragen (SSL/TLS). Der Zugriff auf die Datenbank ist durch Row Level Security (RLS) geschützt — jeder Nutzer kann ausschliesslich seine eigenen Daten einsehen. Passwörter werden nicht gespeichert (Authentifizierung erfolgt via Google OAuth).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">6. Aufbewahrungsdauer</h2>
          <p className="text-sm text-muted leading-relaxed">
            Benutzerdaten werden so lange gespeichert, wie ein aktives Konto besteht. Nach Kündigung des Abonnements und Löschung des Kontos werden personenbezogene Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzliche Aufbewahrungspflicht besteht.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">7. Rechte der betroffenen Personen</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            Gemäss Schweizer Datenschutzgesetz (DSG) haben Sie folgende Rechte:
          </p>
          <ul className="text-sm text-muted space-y-2 list-disc list-inside">
            <li><strong className="text-text">Auskunftsrecht:</strong> Auskunft über gespeicherte Daten</li>
            <li><strong className="text-text">Berichtigungsrecht:</strong> Korrektur unrichtiger Daten</li>
            <li><strong className="text-text">Löschungsrecht:</strong> Löschung Ihrer Daten</li>
            <li><strong className="text-text">Datenportabilität:</strong> Herausgabe Ihrer Daten in maschinenlesbarem Format</li>
            <li><strong className="text-text">Widerspruchsrecht:</strong> Widerspruch gegen die Datenverarbeitung</li>
          </ul>
          <p className="text-sm text-muted mt-3">
            Zur Ausübung dieser Rechte wenden Sie sich an: kerim.alur@gmail.com
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">8. Cookies</h2>
          <p className="text-sm text-muted leading-relaxed">
            FX Terminal verwendet technisch notwendige Cookies für die Authentifizierung (Session-Cookie von Supabase). Es werden keine Tracking- oder Werbe-Cookies eingesetzt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">9. Änderungen dieser Datenschutzerklärung</h2>
          <p className="text-sm text-muted leading-relaxed">
            Diese Datenschutzerklärung kann bei Bedarf angepasst werden. Bei wesentlichen Änderungen werden Nutzer per E-Mail informiert. Die aktuelle Version ist stets unter gva-screener.vercel.app/datenschutz abrufbar.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">10. Kontakt</h2>
          <p className="text-sm text-muted leading-relaxed">
            Bei Fragen zum Datenschutz wenden Sie sich an:<br />
            Kerim Alur · kerim.alur@gmail.com
          </p>
        </section>
      </div>
    </div>
  );
}
