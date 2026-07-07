export interface BankDef {
  bank: string;   // Schlüssel in cb_stance / cb_meetings
  name: string;
  ccy: string;
  meetingsPerYear: number;
}

export const BANKS: BankDef[] = [
  { bank: "FED", name: "Federal Reserve", ccy: "USD", meetingsPerYear: 8 },
  { bank: "EZB", name: "Europäische Zentralbank", ccy: "EUR", meetingsPerYear: 8 },
  { bank: "BOE", name: "Bank of England", ccy: "GBP", meetingsPerYear: 8 },
  { bank: "BOJ", name: "Bank of Japan", ccy: "JPY", meetingsPerYear: 8 },
  { bank: "SNB", name: "Schweizerische Nationalbank", ccy: "CHF", meetingsPerYear: 4 },
  { bank: "RBA", name: "Reserve Bank of Australia", ccy: "AUD", meetingsPerYear: 8 },
  { bank: "RBNZ", name: "Reserve Bank of New Zealand", ccy: "NZD", meetingsPerYear: 7 },
  { bank: "BOC", name: "Bank of Canada", ccy: "CAD", meetingsPerYear: 8 },
];

export const BANK_BY_CCY = new Map(BANKS.map((b) => [b.ccy, b]));
