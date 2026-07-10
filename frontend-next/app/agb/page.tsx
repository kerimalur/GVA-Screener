export default function AgbPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Allgemeine Geschäftsbedingungen</h1>
        <p className="text-muted text-sm mb-12">Stand: Juli 2026</p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">1. Vertragsparteien &amp; Gegenstand</h2>
          <p className="text-sm text-muted leading-relaxed">
            Anbieter der Plattform «FX Terminal» ist Kerim Alur, Hasenmattstrasse 7, 4513 Langendorf, Schweiz (nachfolgend «Anbieter»). FX Terminal ist ein webbasiertes Analyse- und
            Journal-Tool für aktive Forex-Trader. Es stellt fundamentale Marktdaten,
            Währungsanalysen und ein Trading-Journal bereit.{" "}
            <strong className="text-text">
              FX Terminal stellt keine Anlageberatung dar und gibt keine Kauf- oder
              Verkaufsempfehlungen ab.
            </strong>
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">2. Registrierung &amp; Zugang</h2>
          <p className="text-sm text-muted leading-relaxed">
            Für die Nutzung von FX Terminal ist eine Registrierung erforderlich
            (Mindestalter 18 Jahre). Der Nutzer ist verpflichtet, seine Login-Daten
            vertraulich zu behandeln und haftet für alle Aktivitäten, die unter seinem
            Konto stattfinden. Ein gewerblicher Weiterverkauf oder die Weitergabe von
            Zugangsdaten an Dritte ist nicht gestattet.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">3. Abonnement und Zahlung</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            FX Terminal bietet zwei Abonnement-Stufen an:
          </p>
          <ul className="text-sm text-muted space-y-2 list-disc list-inside mb-3">
            <li>
              <strong className="text-text">Basic:</strong> CHF 24.95 pro Monat bzw.
              CHF 249 pro Jahr — Zugang zu Analyse-Modulen (COT, Makro, Sentiment,
              Intermarket, Saisonalität, Kalender)
            </li>
            <li>
              <strong className="text-text">Pro:</strong> CHF 34.95 pro Monat bzw.
              CHF 349 pro Jahr — zusätzlich Trading Journal, Equity-Analyse,
              Backtest-Lab und Strategie-Builder
            </li>
          </ul>
          <p className="text-sm text-muted leading-relaxed">
            Die Zahlung erfolgt über den Zahlungsdienstleister Stripe. Alle Preise
            verstehen sich in Schweizer Franken (CHF) inklusive allfälliger Steuern.
            Das Abonnement verlängert sich automatisch um die gewählte Laufzeit
            (Monat bzw. Jahr), sofern es nicht vor Ablauf der laufenden Periode
            über das Kundenportal gekündigt wird.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">4. Laufzeit &amp; Kündigung</h2>
          <p className="text-sm text-muted leading-relaxed">
            Es besteht keine Mindestlaufzeit. Der Nutzer kann das Abonnement
            jederzeit über das Stripe-Kundenportal kündigen. Die Kündigung wird zum
            Ende der laufenden Abrechnungsperiode wirksam; der Zugang bleibt bis
            dahin aktiv. Nach Ablauf werden personenbezogene Daten innerhalb von
            30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten
            bestehen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">5. Widerrufsrecht (EU-Kunden)</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            <strong className="text-text">Nutzer mit Wohnsitz in der Schweiz:</strong>{" "}
            Für digitale Dienstleistungen, die sofort nach Zahlung vollständig
            bereitgestellt werden, besteht nach schweizerischem Recht kein
            Widerrufsrecht. Der Nutzer stimmt der sofortigen Bereitstellung
            ausdrücklich zu.
          </p>
          <p className="text-sm text-muted leading-relaxed">
            <strong className="text-text">
              Nutzer mit Wohnsitz in der EU (z.B. Deutschland, Österreich):
            </strong>{" "}
            Verbrauchern steht grundsätzlich ein 14-tägiges Widerrufsrecht ab
            Vertragsschluss zu. Da FX Terminal ein digitales Produkt ist, das sofort
            nach Zahlung freigeschaltet wird, erlischt dieses Widerrufsrecht
            vorzeitig, sobald der Nutzer beim Checkout ausdrücklich bestätigt, dass
            (a) mit der Ausführung des Vertrags vor Ablauf der Widerrufsfrist
            begonnen wird und (b) er dadurch sein Widerrufsrecht verliert. Ohne
            diese Bestätigung gilt das 14-tägige Widerrufsrecht unverändert.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">
            6. Nutzungsrechte &amp; geistiges Eigentum
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Mit dem Abonnement erhält der Nutzer ein nicht übertragbares,
            nicht exklusives Nutzungsrecht an FX Terminal für den persönlichen
            Gebrauch. Jegliche Vervielfältigung, Weitergabe, Weiterverkauf oder
            öffentliche Zugänglichmachung der Plattform oder ihrer Inhalte ist
            untersagt. Alle Rechte verbleiben beim Anbieter.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">7. Haftungsausschluss</h2>
          <p className="text-sm text-muted leading-relaxed">
            FX Terminal dient ausschliesslich zu Informationszwecken. Die
            bereitgestellten Daten und Analysen stellen keine Anlageberatung dar.
            Der Anbieter übernimmt keine Haftung für Handelsentscheide, die auf
            Basis der Plattformdaten getroffen werden, sowie für daraus entstandene
            Verluste. Der Anbieter haftet nicht für Schäden infolge von
            Datenverzögerungen, technischen Unterbrüchen oder Fehlern von
            Drittdatenanbietern (FRED, CFTC, Myfxbook, OANDA). Die Haftung ist
            in jedem Fall auf den vom Nutzer bezahlten Abonnementbetrag begrenzt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">8. Verfügbarkeit</h2>
          <p className="text-sm text-muted leading-relaxed">
            Der Anbieter bemüht sich um eine hohe Verfügbarkeit der Plattform,
            übernimmt jedoch keine Garantie für ununterbrochenen Betrieb.
            Planmässige Wartungsarbeiten werden wenn möglich ausserhalb der
            Haupthandelszeiten durchgeführt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">9. Datenschutz</h2>
          <p className="text-sm text-muted leading-relaxed">
            Die Verarbeitung personenbezogener Daten erfolgt gemäss der separaten
            Datenschutzerklärung unter{" "}
            <a href="/datenschutz" className="text-accent hover:underline">
              /datenschutz
            </a>
            . Zahlungsdaten werden ausschliesslich von Stripe verarbeitet und nie
            an den Anbieter übermittelt. Daten werden auf EU-Servern von Supabase
            (Ireland) gespeichert.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">10. Änderungen der AGB</h2>
          <p className="text-sm text-muted leading-relaxed">
            Der Anbieter behält sich vor, diese AGB zu ändern. Über wesentliche
            Änderungen werden Nutzer mindestens 14 Tage im Voraus per E-Mail
            informiert. Die weitere Nutzung der Plattform nach Inkrafttreten gilt
            als Zustimmung.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">
            11. Anwendbares Recht &amp; Gerichtsstand
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Es gilt schweizerisches Recht (OR/ZGB). Gerichtsstand ist Solothurn,
            Schweiz. Für Nutzer mit Wohnsitz in der EU gelten zusätzlich die
            zwingenden Verbraucherschutzgesetze ihres Herkunftslandes.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">12. Kontakt</h2>
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
