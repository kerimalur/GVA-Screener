"""Was ausser dem nackten Text in einen Alert gehoert: Chartbild und Fundamentals.

Bewusst ein eigenes Modul und bewusst ohne harte Abhaengigkeit: faellt Pillow
aus oder fehlen die Kerzen, liefert `baue_chart` schlicht None und der Alert
geht als Text raus. Ein Bild ist Komfort — ein verpasster Alert ist ein
verpasstes Setup. Diese Reihenfolge steht hier fest verdrahtet, damit sie
spaeter niemand aus Versehen umdreht.

Kein matplotlib: das waeren rund 50 MB im Render-Free-Image fuer ein Bild,
das aus vierzig Rechtecken und zwei Linien besteht.
"""
from __future__ import annotations

import io
from datetime import datetime

try:
    from PIL import Image, ImageDraw, ImageFont
    PILLOW_DA = True
except Exception:                                    # pragma: no cover
    PILLOW_DA = False

# Farben wie im Cockpit — ein Alert, der anders aussieht als die Oberflaeche,
# kostet beim Draufschauen eine halbe Sekunde Zuordnung.
BG = (26, 21, 17)
GITTER = (46, 37, 25)
TEXT = (232, 222, 206)
BLASS = (122, 110, 92)
GRUEN = (95, 194, 166)
ROT = (226, 139, 114)
AKZENT = (231, 169, 107)

BREITE, HOEHE = 900, 500
RAND_L, RAND_R, RAND_O, RAND_U = 14, 84, 36, 24
MAX_KERZEN = 40


def _schrift(groesse: int):
    """DejaVu, wenn vorhanden — sonst der eingebaute Bitmap-Font.

    Der Fallback ist winzig und ignoriert `groesse`. Das ist Absicht: lieber
    ein haessliches lesbares Bild als eine Exception im Alert-Pfad.
    """
    for name in ("DejaVuSans.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, groesse)
        except Exception:
            continue
    return ImageFont.load_default()


def _stellen(pair: str) -> int:
    return 3 if "JPY" in pair.upper() else 5


def baue_chart(pair: str, bars, level: float, side: str,
               tf: str = "3D", formed_date: str | None = None,
               preis: float | None = None) -> bytes | None:
    """PNG der letzten Kerzen mit der getroffenen Linie. None, wenn es nicht geht.

    `bars` ist ein DataFrame mit open/high/low/close und einem Datumsindex —
    genau das, was `resample_3d_bars` & Co. liefern. `formed_date` markiert die
    Kerze, auf der die GVA entstanden ist; passt kein Datum, wird nichts
    markiert statt geraten.
    """
    if not PILLOW_DA or bars is None or len(bars) < 2 or level is None:
        return None
    try:
        df = bars.tail(MAX_KERZEN)
        hoch = float(df["high"].max())
        tief = float(df["low"].min())
        # Die Linie MUSS mit ins Bild, auch wenn der Kurs weit weg steht —
        # sonst zeigt der Chart eine Linie, die man nicht sieht.
        hoch = max(hoch, float(level))
        tief = min(tief, float(level))
        if preis is not None:
            hoch, tief = max(hoch, float(preis)), min(tief, float(preis))
        spanne = hoch - tief
        if spanne <= 0:
            return None
        puffer = spanne * 0.08
        hoch, tief = hoch + puffer, tief - puffer
        spanne = hoch - tief

        bild = Image.new("RGB", (BREITE, HOEHE), BG)
        d = ImageDraw.Draw(bild)
        f_klein = _schrift(12)
        f_kopf = _schrift(17)

        plot_o, plot_u = RAND_O, HOEHE - RAND_U
        plot_l, plot_r = RAND_L, BREITE - RAND_R
        hoehe_px = plot_u - plot_o

        def y(wert: float) -> float:
            return plot_o + (hoch - float(wert)) / spanne * hoehe_px

        # Gitter: fuenf Linien, beschriftet. Mehr wuerde vom Kurs ablenken.
        for i in range(5):
            wert = hoch - spanne * i / 4
            yy = y(wert)
            d.line([(plot_l, yy), (plot_r, yy)], fill=GITTER, width=1)
            d.text((plot_r + 6, yy - 7), f"{wert:.{_stellen(pair)}f}",
                   font=f_klein, fill=BLASS)

        n = len(df)
        schritt = (plot_r - plot_l) / n
        koerper = max(3, int(schritt * 0.62))

        for i, (stempel, k) in enumerate(df.iterrows()):
            mitte = plot_l + schritt * (i + 0.5)
            o, h, t, c = float(k["open"]), float(k["high"]), float(k["low"]), float(k["close"])
            farbe = GRUEN if c >= o else ROT
            d.line([(mitte, y(h)), (mitte, y(t))], fill=farbe, width=1)
            oben, unten = y(max(o, c)), y(min(o, c))
            if unten - oben < 1:
                unten = oben + 1
            d.rectangle([mitte - koerper / 2, oben, mitte + koerper / 2, unten], fill=farbe)

            # Die bildende Kerze markieren — nur wenn das Datum wirklich passt.
            if formed_date and _passt(stempel, formed_date):
                d.rectangle(
                    [mitte - schritt / 2 + 1, plot_o, mitte + schritt / 2 - 1, plot_u],
                    outline=AKZENT, width=1)

        # Die Linie selbst, gestrichelt: sie ist keine Kerze und soll auch
        # nicht wie eine aussehen.
        linien_farbe = ROT if str(side).upper() == "SHORT" else GRUEN
        yl = y(level)
        x = plot_l
        while x < plot_r:
            d.line([(x, yl), (min(x + 9, plot_r), yl)], fill=linien_farbe, width=2)
            x += 16
        d.rectangle([plot_r + 2, yl - 9, BREITE - 2, yl + 9], fill=linien_farbe)
        d.text((plot_r + 6, yl - 7), f"{level:.{_stellen(pair)}f}", font=f_klein, fill=BG)

        # Der Live-Kurs, aber nur wenn er sichtbar neben der Linie steht. Im
        # Moment des Treffers liegen beide uebereinander — dann waere ein
        # zweites Label nur ein Fleck auf dem ersten.
        if preis is not None and abs(y(preis) - yl) >= 12:
            yp = y(preis)
            x = plot_l
            while x < plot_r:
                d.line([(x, yp), (min(x + 3, plot_r), yp)], fill=BLASS, width=1)
                x += 8
            d.text((plot_r + 6, yp - 7), f"{preis:.{_stellen(pair)}f}",
                   font=f_klein, fill=TEXT)

        kopf = f"{pair} · {str(side).upper()} LINE ({tf})"
        d.text((RAND_L, 9), kopf, font=f_kopf, fill=TEXT)
        rechts = f"{n} Kerzen"
        if formed_date:
            rechts = f"formiert {formed_date} · {rechts}"
        d.text((plot_r - 220, 13), rechts, font=f_klein, fill=BLASS)

        puffer_io = io.BytesIO()
        bild.save(puffer_io, format="PNG", optimize=True)
        return puffer_io.getvalue()
    except Exception as e:                            # pragma: no cover
        print(f"Chartbild-Fehler bei {pair}: {e}")
        return None


def _passt(stempel, datum: str) -> bool:
    """Kerzenindex gegen ein Datum, egal in welcher Schreibweise es ankommt.

    Die Linien tragen mal '2026-07-06', mal '06.07.2026' — je nachdem, wer sie
    erzeugt hat. Beides wird akzeptiert; alles andere gilt als "passt nicht"
    und markiert lieber gar nichts.
    """
    try:
        iso = stempel.date().isoformat()
    except Exception:
        iso = str(stempel)[:10]
    if datum[:10] == iso:
        return True
    try:
        return datetime.strptime(datum, "%d.%m.%Y").date().isoformat() == iso
    except Exception:
        return False


def fundamental_block(pair: str, waehrungen: list) -> str:
    """Die Fundamentallage beider Waehrungen als Markdown-Block.

    Leerer String, wenn der Makro-Cache noch nicht gefuellt ist — der Alert
    laeuft dann ohne diesen Absatz weiter. Ein Alert, der auf Fundamentaldaten
    wartet, kommt zu spaet.
    """
    if not waehrungen:
        return ""
    nach_code = {c.get("code"): c for c in waehrungen}
    b, q = nach_code.get(pair[:3].upper()), nach_code.get(pair[3:6].upper())
    if not b or not q:
        return ""

    def zeile(c):
        return (f"`{c['code']}`  Zins {c.get('rate', 0):.2f} · "
                f"Real {c.get('realRate', 0):+.2f} · "
                f"CPI {c.get('cpi', 0):.1f} · Score {c.get('score', 0):+.1f}")

    d_zins = float(b.get("rate", 0)) - float(q.get("rate", 0))
    d_real = float(b.get("realRate", 0)) - float(q.get("realRate", 0))
    return ("\n\n*Fundamental*\n" + zeile(b) + "\n" + zeile(q)
            + f"\nΔ Zins {d_zins:+.2f} · Δ Real {d_real:+.2f}")
