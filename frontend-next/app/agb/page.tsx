export default function AgbPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Allgemeine Geschäftsbedingungen</h1>
        <p className="text-muted text-sm mb-12">Stand: Juli 2026</p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">1. Anbieter</h2>
          <p className="text-sm text-muted leading-relaxed">
            Kerim Alur<br />
            Hasenmattstrasse 7<br />
            4513 Langendorf<br />
            Schweiz<br />
            E-Mail: kerim.alur@gmail.com
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">2. Geltungsbereich</h2>
          <p className="text-sm text-muted leading-relaxed">
            Diese Allgemeinen Geschäftsbedingungen gelten für alle Abonnements und die Nutzung des webbasierten Analyse-Tools «FX Terminal» unter gva-screener.vercel.app. Mit der Registrierung und dem Abschluss eines Abonnements akzeptiert der Nutzer diese AGB vollumfänglich.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">3. Leistungsbeschreibung</h2>
          <p className="text-sm text-muted leading-relaxed">
            FX Terminal ist ein webbasiertes Analyse-Tool für aktive Forex-Trader. Es stellt fundamentale Marktdaten (COT-Daten, Währungsstärke, Zinsdifferenzen, Makrodaten, Retail-Sentiment, Saisonalität) für 28 Währungspaare bereit. Die Daten werden täglich automatisch aktualisiert. FX Terminal stellt keine Anlageberatung dar und gibt keine Kauf- oder Verkaufsempfehlungen ab.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">4. Abonnement und Zahlung</h2>
          <p className="text-sm text-muted leading-relaxed">
            FX Terminal bietet zwei Abonnement-Stufen an: <strong className="text-text">Basic</strong> (CHF 24.95 pro Monat bzw. CHF 249 pro Jahr) und <strong className="text-text">Pro</strong> (CHF 34.95 pro Monat bzw. CHF 349 pro Jahr, inkl. Trading Journal, Backtest-Lab und Strategie-Builder). Die Zahlung erfolgt über den Zahlungsdienstleister Stripe. Das Abonnement verlängert sich automatisch um die gewählte Laufzeit (ein Monat bzw. ein Jahr), sofern es nicht vor Ablauf der laufenden Periode gekündigt wird. Eine Mindestlaufzeit besteht nicht.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">5. Kündigung</h2>
          <p className="text-sm text-muted leading-relaxed">
            Der Nutzer kann das Abonnement jederzeit über das Stripe-Kundenportal kündigen. Die Kündigung wird zum Ende der laufenden Abrechnungsperiode wirksam. Eine Rückerstattung bereits bezahlter Beträge erfolgt nicht, ausser bei technisch bedingten Ausfällen oder gesetzlichem Widerrufsrecht.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">6. Widerrufsrecht</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            <strong className="text-text">Nutzer mit Wohnsitz in der Schweiz:</strong> Für digitale Dienstleistungen, die auf ausdrücklichen Wunsch des Nutzers vor Ablauf der Widerrufsfrist vollständig erbracht wurden, besteht kein Widerrufsrecht gemäss schweizerischem Recht. Der Nutzer stimmt der sofortigen Bereitstellung des Zugangs mit Abschluss des Abonnements ausdrücklich zu.
          </p>
          <p className="text-sm text-muted leading-relaxed">
            <strong className="text-text">Nutzer mit Wohnsitz in der EU (z.B. Deutschland, Österreich):</strong> Verbrauchern steht grundsätzlich ein 14-tägiges Widerrufsrecht ab Vertragsschluss zu. Da FX Terminal ein digitaler Dienst ist, der sofort nach Zahlung bereitgestellt wird, erlischt dieses Widerrufsrecht vorzeitig, sobald der Nutzer beim Checkout ausdrücklich zustimmt, dass (a) die Ausführung vor Ablauf der Widerrufsfrist beginnt und (b) er hierdurch sein Widerrufsrecht verliert. Ohne diese ausdrückliche Zustimmung besteht das 14-tägige Widerrufsrecht unverändert.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">7. Nutzungsrechte und geistiges Eigentum</h2>
          <p className="text-sm text-muted leading-relaxed">
            Mit dem Abonnement erhält der Nutzer ein nicht übertragbares, nicht exklusives Nutzungsrecht an FX Terminal für den persönlichen Gebrauch. Jegliche Vervielfältigung, Weitergabe, Weiterverkauf oder öffentliche Zugänglichmachung der Plattform oder ihrer Inhalte ist untersagt. Alle Rechte an der Software, den Datenaufbereitungen und dem Design verbleiben bei Kerim Alur.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">8. Haftungsausschluss</h2>
          <p className="text-sm text-muted leading-relaxed">
            FX Terminal dient ausschliesslich zu Informationszwecken. Die bereitgestellten Daten und Analysen stellen keine Anlageberatung dar. Der Anbieter übernimmt keine Haftung für Handelsentscheide, die auf Basis der Plattformdaten getroffen werden, und für daraus entstandene Verluste. Der Anbieter haftet nicht für Schäden infolge von Datenverzögerungen, technischen Unterbrüchen oder Datenfehlern von Drittanbietern (FRED, CFTC, Myfxbook, OANDA).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">9. Verfügbarkeit</h2>
          <p className="text-sm text-muted leading-relaxed">
            Der Anbieter bemüht sich um eine hohe Verfügbarkeit der Plattform, übernimmt jedoch keine Garantie für ununterbrochenen Betrieb. Wartungsarbeiten werden wenn möglich ausserhalb der Haupthandelszeiten durchgeführt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">10. Änderungen der AGB</h2>
          <p className="text-sm text-muted leading-relaxed">
            Der Anbieter behält sich vor, diese AGB jederzeit zu ändern. Nutzer werden per E-Mail über wesentliche Änderungen informiert. Die weitere Nutzung der Plattform nach Inkrafttreten der geänderten AGB gilt als Zustimmung.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">11. Anwendbares Recht und Gerichtsstand</h2>
          <p className="text-sm text-muted leading-relaxed">
            Es gilt ausschliesslich schweizerisches Recht. Gerichtsstand ist Solothurn, Schweiz.
          </p>
        </section>
      </div>
    </div>
  );
}
