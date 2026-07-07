import pandas as pd

def analyze_gva_zones(df: pd.DataFrame, instrument: str, tol_pips: float = 2.5, size_mult: float = 1.3):
    if df.empty or len(df) < 2:
        return None, None, None, None, None, None, [], []

    pip_size = 0.01 if "JPY" in instrument else 0.0001
    tol = tol_pips * pip_size

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

        valid_size = curr_body >= (prev_body * size_mult)
        valid_gap = abs(prev['close'] - curr['open']) <= tol

        for x in active_shorts:
            if curr['high'] >= x['level']:
                last_touched = {
                    "type": "SHORT",
                    "level": x['level'],
                    "date": x['date'].strftime('%d.%m.%Y'),
                    "touched_date": curr_time.strftime('%d.%m.%Y')
                }

        for x in active_longs:
            if curr['low'] <= x['level']:
                last_touched = {
                    "type": "LONG",
                    "level": x['level'],
                    "date": x['date'].strftime('%d.%m.%Y'),
                    "touched_date": curr_time.strftime('%d.%m.%Y')
                }

        active_shorts = [x for x in active_shorts if curr['high'] < x['level']]
        active_longs = [x for x in active_longs if curr['low'] > x['level']]

        # Die Zone wird EXAKT auf dem Open der Signal-Kerze gebildet
        if prev_bull and curr_bear and valid_gap and valid_size:
            active_shorts.append({'level': curr['open'], 'date': curr_time})
        
        if prev_bear and curr_bull and valid_gap and valid_size:
            active_longs.append({'level': curr['open'], 'date': curr_time})

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
    all_shorts = sorted(
        [{"level": x['level'], "date": x['date'].strftime('%d.%m.%Y')} for x in active_shorts],
        key=lambda x: x['level']
    )
    all_longs = sorted(
        [{"level": x['level'], "date": x['date'].strftime('%d.%m.%Y')} for x in active_longs],
        key=lambda x: -x['level']
    )

    return closest_short, short_date, closest_long, long_date, current_price, last_touched, all_shorts, all_longs