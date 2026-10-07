//+------------------------------------------------------------------+
//| KerimosKalender.mq5                                  29.09.2026  |
//|                                                                  |
//| MQL5-Dienst: schreibt den Wirtschaftskalender des MetaTrader     |
//| (Ist, Prognose, Vorwert) der acht Hauptwaehrungen ab 2021 in     |
//| eine Datei. Die MT5-Bruecke (kalender.py) laedt sie nach         |
//| Supabase, trading.mt5_kalender. KerimOS braucht das fuer das     |
//| Makro-Terminal: Forex Factory liefert gratis nur die Erwartung,  |
//| nicht das Ist.                                                   |
//|                                                                  |
//| Warum ein MQL5-Programm und nicht Python: das Paket MetaTrader5  |
//| hat keine Kalender-Funktionen. Nur MQL5 kommt an                 |
//| CalendarValueHistory heran.                                      |
//|                                                                  |
//| Warum ein Dienst (Service) und kein Expert Advisor: ein Dienst   |
//| braucht keinen Chart, laeuft im Hintergrund und startet mit dem  |
//| Terminal wieder, wenn er beim Beenden lief.                      |
//|                                                                  |
//| Datei: <Terminal-Common>/Files/kerimos_kalender.csv, also        |
//|   %APPDATA%\MetaQuotes\Terminal\Common\Files\                    |
//| Erst in eine .tmp-Datei, dann umbenannt: die Bruecke liest nie   |
//| eine halb geschriebene Datei.                                    |
//+------------------------------------------------------------------+
#property service
#property copyright "Kerim"
#property version   "1.00"
#property description "Wirtschaftskalender der 8 Hauptwaehrungen fuer KerimOS"

input int    TaktSekunden = 300;                    // alle 5 Minuten
input string DateiName    = "kerimos_kalender.csv";
input string AbDatum      = "2021.06.01";           // Historie ab (05.10.2026: vorher 2024.01.01)

string WAEHRUNGEN[] = {"USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"};

//--- Zahl oder leer, wenn MT5 keinen Wert hat. Leer ist nicht 0.
string Zahl(const bool da, const double wert)
  {
   return da ? DoubleToString(wert, 6) : "";
  }

//--- Semikolon ist das Trennzeichen, Zeilenumbrueche beenden die Zeile.
string Sauber(string s)
  {
   StringReplace(s, ";", ",");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return s;
  }

//--- Ein Durchgang: ganze Datei neu schreiben. Rueckgabe: Anzahl Zeilen, -1 bei Fehler.
int Schreibe()
  {
   datetime von = StringToTime(AbDatum);
   datetime jetzt_server = TimeTradeServer();
   datetime bis = jetzt_server + 14 * 86400;
   // Serverzeit minus UTC. Gilt fuer heute; in der Vergangenheit kann die
   // Sommerzeit eine Stunde verschieben - KerimOS ordnet mit +-90 Minuten zu.
   long versatz = (long)jetzt_server - (long)TimeGMT();

   string tmp = DateiName + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      PrintFormat("KerimosKalender: %s nicht geoeffnet, Fehler %d", tmp, GetLastError());
      return -1;
     }
   FileWriteString(h, "value_id;event_id;ccy;name;importance;time_utc;actual;forecast;previous;revised;multiplier;unit\n");

   int anzahl = 0;
   for(int c = 0; c < ArraySize(WAEHRUNGEN); c++)
     {
      MqlCalendarValue werte[];
      ResetLastError();
      int n = CalendarValueHistory(werte, von, bis, NULL, WAEHRUNGEN[c]);
      if(n < 0)
        {
         PrintFormat("KerimosKalender: %s - CalendarValueHistory Fehler %d", WAEHRUNGEN[c], GetLastError());
         continue;
        }
      for(int i = 0; i < n; i++)
        {
         MqlCalendarEvent ev;
         if(!CalendarEventById(werte[i].event_id, ev))
            continue;
         if(ev.type == CALENDAR_TYPE_HOLIDAY)
            continue;
         bool a = werte[i].HasActualValue();
         bool f = werte[i].HasForecastValue();
         bool p = werte[i].HasPreviousValue();
         bool r = werte[i].HasRevisedValue();
         if(!a && !f && !p)
            continue; // Reden, Pressekonferenzen: keine Zahl, kein Nutzen
         datetime utc = (datetime)((long)werte[i].time - versatz);

         string zeile = IntegerToString((long)werte[i].id) + ";"
                        + IntegerToString((long)werte[i].event_id) + ";"
                        + WAEHRUNGEN[c] + ";"
                        + Sauber(ev.name) + ";"
                        + EnumToString(ev.importance) + ";"
                        + TimeToString(utc, TIME_DATE | TIME_MINUTES) + ";"
                        + Zahl(a, a ? werte[i].GetActualValue() : 0) + ";"
                        + Zahl(f, f ? werte[i].GetForecastValue() : 0) + ";"
                        + Zahl(p, p ? werte[i].GetPreviousValue() : 0) + ";"
                        + Zahl(r, r ? werte[i].GetRevisedValue() : 0) + ";"
                        + EnumToString(ev.multiplier) + ";"
                        + EnumToString(ev.unit) + "\n";
         FileWriteString(h, zeile);
         anzahl++;
        }
     }
   FileClose(h);

   if(!FileMove(tmp, FILE_COMMON, DateiName, FILE_COMMON | FILE_REWRITE))
     {
      PrintFormat("KerimosKalender: Umbenennen nach %s fehlgeschlagen, Fehler %d", DateiName, GetLastError());
      return -1;
     }
   return anzahl;
  }

//+------------------------------------------------------------------+
void OnStart()
  {
   PrintFormat("KerimosKalender gestartet: alle %d s, Historie ab %s, Datei Common\\Files\\%s",
               TaktSekunden, AbDatum, DateiName);
   int zuletzt = -2;
   datetime lebenszeichen = 0;
   while(!IsStopped())
     {
      int n = Schreibe();
      // Nur melden, wenn sich etwas aendert, plus einmal pro Stunde -
      // sonst steht das Journal voller identischer Zeilen.
      if(n != zuletzt || TimeLocal() - lebenszeichen > 3600)
        {
         if(n >= 0)
            PrintFormat("KerimosKalender: %d Termine geschrieben", n);
         zuletzt = n;
         lebenszeichen = TimeLocal();
        }
      for(int s = 0; s < TaktSekunden && !IsStopped(); s++)
         Sleep(1000);
     }
   Print("KerimosKalender beendet");
  }
//+------------------------------------------------------------------+
