import pandas as pd

# GVA-Muster — 1:1 nach Kerims Pine Script
# "Waagerechte Szenarien Pro v5.9 — GVA State Machine":
#   Kerze A (prev) und Kerze B (curr) auf 3D:
#   - LONG:  A bearisch, B bullisch, Body B >= Body A * SIZE_FACTOR,
#            |Body-Boden A - Body-Boden B| <= TOLERANZ  -> Level = Body-Boden B
#   - SHORT: A bullisch, B bearisch, gleiche Groessen-Bedingung,
#            |Body-Top A - Body-Top B| <= TOLERANZ      -> Level = Body-Top B
#   Touch: Docht zaehlt (abschaltbar), Toleranz optional. Linie nach Touch weg.
#
# Nicht portiert (bewusst): die State Machine des Pine (BoS, Fib-Entry-Box,
# Doppel-Hit-Regel, Konsolidierungs-/Trend-Filter). Der Screener meldet
# weiterhin die ERSTE Beruehrung.
#
# Nachbar-Filter (2026-08-17, Kerims Regel): Ein Treffer zaehlt erst, wenn
# zwischen der bildenden Kerze und der Treffer-Kerze mindestens GVA_MIN_GAP
# ganze Kerzen des Timeframes KOMPLETT liegen. Kommt der ERSTE Treffer
# frueher, gehoert er noch zur selben Bewegung: dann wird die GVA komplett
# VERWORFEN und bekommt keine zweite Chance — genau wie im Pine
# (GVA-Linien-Pur.pine, f_zuFrueh/f_dropLine). Ohne diese Regel meldete der
# Screener Linien, die schon von der Folgekerze eingesammelt wurden.
GVA_TOL_PCT = 0.30      # Pine: tol_pct = 30.0  (Boden/Top-Toleranz)
GVA_SIZE_FACTOR = 1.25  # Body B min. 25% groesser (Pine: k2_pct = 25)
GVA_MIN_GAP = 1         # Pine: flt_gap = 1 (Kerzen komplett dazwischen)

# Pine: tol_basis — "body" = % vom Body der 1. Kerze, "atr" = % vom HTF-ATR
GVA_TOL_BASIS = "body"
GVA_ATR_LENGTH = 14     # Pine: atr_length
GVA_TOUCH_TOL_ATR = 0.0  # Pine: touch_tol_atr (0 = exakter Punkt)
GVA_TOUCH_WICK = True    # Pine: touch_wick (False = nur Body zaehlt)


def wilder_atr(df: pd.DataFrame, length: int = GVA_ATR_LENGTH) -> pd.Series:
    """ATR wie Pine ta.atr(length): True Range, geglaettet mit Wilders RMA
    (SMA-Seed ueber die ersten `length` Werte, danach rekursiv)."""
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    # Wilders RMA == EWM mit alpha = 1/length; SMA-Seed wie in Pine
    atr = tr.ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean()
    return atr


def _touch_bounds(row, touch_wick: bool) -> tuple[float, float]:
    """Pine: touch_hi/touch_lo — Docht oder nur Body."""
    if touch_wick:
        return row["high"], row["low"]
    return max(row["open"], row["close"]), min(row["open"], row["close"])


def analyze_gva_zones(df: pd.DataFrame, instrument: str,
                      tol_pct: float = GVA_TOL_PCT, size_factor: float = GVA_SIZE_FACTOR,
                      tol_basis: str = GVA_TOL_BASIS,
                      touch_tol_atr: float = GVA_TOUCH_TOL_ATR,
                      touch_wick: bool = GVA_TOUCH_WICK,
                      atr_length: int = GVA_ATR_LENGTH,
                      min_gap: int = GVA_MIN_GAP,
                      tf: str = "3D"):
    if df.empty or len(df) < 2:
        return None, None, None, None, None, None, [], []

    atr_series = wilder_atr(df, atr_length)

    active_shorts = []
    active_longs = []
    last_touched = None

    for i in range(1, len(df)):
        prev = df.iloc[i-1]
        curr = df.iloc[i]

        curr_time = df.index[i]

        prev_bull = prev['close'] > prev['open']
        prev_bear = prev['close'] < prev['open']

        curr_bull = curr['close'] > curr['open']
        curr_bear = curr['close'] < curr['open']

        prev_body = abs(prev['close'] - prev['open'])
        curr_body = abs(curr['close'] - curr['open'])

        valid_size = prev_body > 0 and curr_body >= (prev_body * size_factor)

        # Pine: body_match_tolerance — Basis wahlweise Body A oder HTF-ATR.
        # nz(htf_atr): fehlender ATR (Warmup) zaehlt wie 0, exakt wie im Pine.
        atr_now = atr_series.iloc[i]
        atr_now = 0.0 if pd.isna(atr_now) else float(atr_now)
        tol = (atr_now if tol_basis == "atr" else prev_body) * tol_pct
        touch_tol = atr_now * touch_tol_atr

        bot_match = abs(min(prev['open'], prev['close']) - min(curr['open'], curr['close'])) <= tol
        top_match = abs(max(prev['open'], prev['close']) - max(curr['open'], curr['close'])) <= tol

        touch_hi, touch_lo = _touch_bounds(curr, touch_wick)

        # Nachbar-Filter: `i - idx` ist der Kerzen-Abstand zwischen Entstehung
        # und Treffer. Bei min_gap = 1 muss er mindestens 2 betragen, damit
        # eine ganze Kerze KOMPLETT dazwischen liegt.
        for x in active_shorts:
            if touch_hi >= x['level'] - touch_tol:
                if i - x['idx'] >= min_gap + 1:
                    last_touched = {
                        "type": "SHORT",
                        "level": x['level'],
                        "date": x['date'].strftime('%d.%m.%Y'),
                        "touched_date": curr_time.strftime('%d.%m.%Y'),
                        "tf": tf,
                    }
                # sonst: zu frueh -> die GVA wird verworfen, KEIN Treffer.
                # Sie verschwindet unten trotzdem aus active_shorts: eine
                # verworfene Linie darf nicht spaeter noch einmal antreten.

        for x in active_longs:
            if touch_lo <= x['level'] + touch_tol:
                if i - x['idx'] >= min_gap + 1:
                    last_touched = {
                        "type": "LONG",
                        "level": x['level'],
                        "date": x['date'].strftime('%d.%m.%Y'),
                        "touched_date": curr_time.strftime('%d.%m.%Y'),
                        "tf": tf,
                    }

        active_shorts = [x for x in active_shorts if touch_hi < x['level'] - touch_tol]
        active_longs = [x for x in active_longs if touch_lo > x['level'] + touch_tol]

        # Level = Body-Top/Boden der Signal-Kerze B (bei Bull/Bear = deren Open)
        if prev_bull and curr_bear and valid_size and top_match:
            active_shorts.append({'level': max(curr['open'], curr['close']),
                                  'date': curr_time, 'idx': i})

        if prev_bear and curr_bull and valid_size and bot_match:
            active_longs.append({'level': min(curr['open'], curr['close']),
                                 'date': curr_time, 'idx': i})

    current_price = df.iloc[-1]['close']

    closest_short, short_date = None, None
    closest_long, long_date = None, None

    if active_shorts:
        obj = min(active_shorts, key=lambda x: x['level'])
        closest_short = obj['level']
        short_date = obj['date'].strftime('%d.%m.%Y')

    if active_longs:
        obj = max(active_longs, key=lambda x: x['level'])
        closest_long = obj['level']
        long_date = obj['date'].strftime('%d.%m.%Y')

    # ALLE noch nicht getroffenen Lines, sortiert nach Naehe:
    # Shorts aufsteigend (niedrigste = naechste ueber Preis),
    # Longs absteigend (hoechste = naechste unter Preis).
    #
    # Jede Linie traegt ihre REIFE mit — und das ist der Grund, warum es dieses
    # Feld ueberhaupt gibt:
    #
    # Der Nachbar-Filter oben prueft den Abstand nur INNERHALB der Historie.
    # Der Live-Alert dagegen haelt den Kurs direkt gegen das Level und weiss
    # gar nicht, wie alt die Linie ist. Eine GVA, die sich auf der zuletzt
    # geschlossenen Kerze gebildet hat, konnte deshalb sofort im naechsten
    # Moment "getroffen" werden — ohne dass eine ganze Kerze dazwischen lag.
    # Genau so kam am 20.08.2026 der Monats-Alert auf GBPJPY zustande, obwohl
    # der August noch laeuft.
    #
    # `letzter` ist der Index der letzten GESCHLOSSENEN Kerze (df ist bereits
    # ueber data_pipeline.nur_geschlossene gekuerzt). Die laufende Kerze traegt
    # also die Nummer letzter + 1. Ein Treffer in ihr zaehlt nach derselben
    # Regel wie oben (Abstand >= min_gap + 1) genau dann, wenn seit der
    # bildenden Kerze mindestens `min_gap` geschlossene Kerzen vergangen sind.
    letzter = len(df) - 1

    def _linie(x):
        vergangen = letzter - x['idx']
        return {
            "level": x['level'],
            "date": x['date'].strftime('%d.%m.%Y'),
            "tf": tf,
            # Wie viele geschlossene Kerzen seit der bildenden vergangen sind.
            "bars_seit": vergangen,
            # Darf diese Linie einen Live-Alert ausloesen?
            "reif": vergangen >= min_gap,
        }

    all_shorts = sorted([_linie(x) for x in active_shorts], key=lambda x: x['level'])
    all_longs = sorted([_linie(x) for x in active_longs], key=lambda x: -x['level'])

    return closest_short, short_date, closest_long, long_date, current_price, last_touched, all_shorts, all_longs