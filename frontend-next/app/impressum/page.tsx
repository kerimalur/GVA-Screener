export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Impressum</h1>
        <p className="text-muted text-sm mb-12">
          Angaben gemäss Art. 3 UWG (Schweiz) und § 5 TMG (Deutschland)
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Anbieter</h2>
          <p className="text-sm text-muted leading-relaxed">
            Kerim Alur<br />
            Hasenmattstrasse 7<br />
            4513 Langendorf<br />
            Schweiz
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Kontakt</h2>
          <p className="text-sm text-muted leading-relaxed">
            E-Mail:{" "}
            <a
              href="mailto:FXTerminalCH@proton.me"
              className="text-accent hover:underline"
            >
              FXTerminalCH@proton.me
            </a>
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">
            Online-Streitbeilegung (EU)
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Die Europäische Kommission stellt eine Plattform zur
            Online-Streitbeilegung (OS) bereit:{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              ec.europa.eu/consumers/odr
            </a>
            <br />
            Wir sind nicht verpflichtet und nicht bereit, an einem
            Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
            teilzunehmen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Haftungsausschluss</h2>
          <p className="text-sm text-muted leading-relaxed">
            Die Inhalte dieser Website dienen ausschliesslich zu
            Informationszwecken und stellen keine Anlageberatung oder
            Finanzdienstleistung dar. Der Anbieter übernimmt keine Haftung für
            die Richtigkeit, Vollständigkeit oder Aktualität der
            bereitgestellten Informationen sowie für Handelsentscheide, die auf
            deren Basis getroffen werden.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Urheberrecht</h2>
          <p className="text-sm text-muted leading-relaxed">
            Alle Inhalte, Grafiken und Texte dieser Website sind
            urheberrechtlich geschützt. Eine Vervielfältigung oder Verwendung
            ohne ausdrückliche Genehmigung des Anbieters ist untersagt.
          </p>
        </section>
      </div>
    </div>
  );
}
