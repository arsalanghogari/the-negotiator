export type HomeSize = 'studio' | '1br' | '2br' | '3br+';
export type Persona = 'tough' | 'lowballer' | 'upseller' | 'stonewaller' | 'live';
export type CallOutcome = 'quoted' | 'callback' | 'declined';

export interface JobSpec {
  jobId: string;
  vertical: string;
  vehicle?: string; // autobody vertical
  damageDescription?: string; // autobody vertical
  origin: { city: string; zip: string; floor: number; hasElevator: boolean };
  destination: { city: string; zip: string; floor: number; hasElevator: boolean };
  distanceMiles: number;
  homeSize: HomeSize;
  largeItems: string[];
  boxCountEst: number;
  stairsFlights: number;
  longCarry: boolean;
  packingService: boolean;
  preferredDate: string; // YYYY-MM-DD
  specialNotes: string;
  customerName: string; // spoken only at booking time, never during shopping calls
  contactEmail: string; // where the winning seller should send the invoice
  confirmedByUser: boolean;
}

export interface InvoiceRequest {
  jobId: string;
  quoteId: string;
  providerName: string;
  email: string;
  turns: TranscriptTurn[]; // the follow-up call
  status: 'requested';
}

export interface LineItem {
  label: string;
  amount: number | null;
}

export interface Quote {
  quoteId: string;
  providerName: string;
  persona: Persona;
  basePrice: number;
  lineItems: LineItem[];
  totalPrice: number;
  binding: boolean;
  redFlag: boolean; // true if totalPrice >= 30% below market median
  redFlagReason: string | null;
  itemizationMismatch: boolean; // base + fees don't sum to the stated total
  negotiated: boolean; // true if price moved during the call
  priceBefore: number | null;
  priceAfter: number | null;
  transcriptRef: string; // id into stored transcript
  callOutcome: CallOutcome;
}

export interface Report {
  jobId: string;
  ranked: Quote[]; // sorted by true total cost
  recommendedQuoteId: string;
  rationale: string; // plain-language, cites fees + transcript moments
  redFlags: string[];
}

export interface TranscriptTurn {
  speaker: 'negotiator' | 'seller';
  text: string;
}

export interface Transcript {
  transcriptId: string;
  jobId: string;
  persona: Persona;
  providerName: string;
  turns: TranscriptTurn[];
  conversationId?: string; // ElevenLabs conversation id (voice calls only) — powers the recording player
}
