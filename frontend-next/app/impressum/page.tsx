export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Impressum</h1>
        <p className="text-muted text-sm mb-12">Angaben gemäss Art. 3 UWG (Schweiz)</p>

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
            E-Mail: kerim.alur@gmail.com
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Haftungsausschluss</h2>
          <p className="text-sm text-muted leading-relaxed">
            Die Inhalte dieser Website dienen ausschliesslich zu Informationszwecken und stellen keine Anlageberatung dar. Der Anbieter übernimmt keine Haftung für die Richtigkeit, Vollständigkeit oder Aktualität der bereitgestellten Informationen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Urheberrecht</h2>
          <p className="text-sm text-muted leading-relaxed">
            Alle Inhalte, Grafiken und Texte dieser Website sind urheberrechtlich geschützt. Eine Vervielfältigung oder Verwendung ohne ausdrückliche Genehmigung des Anbieters ist untersagt.
          </p>
        </section>
      </div>
    </div>
  );
}
