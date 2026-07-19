// Seeds a demo JobSpec + 3 persona transcripts so M3+ can be built without live voice.
// Run: npm run seed
import { readAll, writeAll } from '../lib/store.ts';
import type { JobSpec, Transcript } from '../types.ts';

const jobSpec: JobSpec = {
  jobId: 'job-demo-1',
  vertical: 'moving',
  origin: { city: 'San Francisco', zip: '94110', floor: 3, hasElevator: false },
  destination: { city: 'San Jose', zip: '95112', floor: 1, hasElevator: true },
  distanceMiles: 45,
  homeSize: '2br',
  largeItems: ['upright piano', 'sofa', 'fridge'],
  boxCountEst: 40,
  stairsFlights: 2,
  longCarry: true,
  packingService: false,
  preferredDate: '2026-08-01',
  specialNotes: 'Piano needs padding; street parking only at origin.',
  customerName: 'Alex Rivera',
  contactEmail: 'demo@thenegotiator.app',
  confirmedByUser: true,
};

const transcripts: Transcript[] = [
  {
    transcriptId: 'tx-demo-lowballer',
    jobId: 'job-demo-1',
    persona: 'lowballer',
    providerName: 'Budget Moves Co',
    turns: [
      { speaker: 'negotiator', text: "Hi, I'm calling to get a quote for a move on August 1st: 2-bedroom from San Francisco 94110 to San Jose 95112, about 45 miles. Third floor walk-up at origin, two flights of stairs, long carry from street parking, about 40 boxes, and large items including an upright piano, sofa, and fridge. No packing service needed." },
      { speaker: 'seller', text: "Easy job, we do that route all the time. I can do the whole thing for $1,500 flat. Best price you'll find, guaranteed." },
      { speaker: 'negotiator', text: 'Does that $1,500 include the stairs, the long carry, and the piano? Can you break it down for me: base price plus each fee?' },
      { speaker: 'seller', text: "It's all pretty much included. $1,500 base. Stairs might be a little extra on the day, and the piano, you know, depends on the crew. Materials too, but we sort that out at pickup." },
      { speaker: 'negotiator', text: 'I need actual numbers for those fees to compare quotes. What does "a little extra" mean in dollars for stairs, piano handling, and materials?' },
      { speaker: 'seller', text: "Can't say exactly until we see it. Ballpark, don't worry about it. $1,500 gets you booked, we handle the rest day-of." },
      { speaker: 'negotiator', text: 'Understood. Is the $1,500 a binding quote?' },
      { speaker: 'seller', text: "It's an estimate. Final number is settled after the walkthrough on moving day." },
      { speaker: 'negotiator', text: "Okay, I have the $1,500 non-binding estimate with unspecified fees for stairs, piano, and materials. I'll compare and call back. Thanks." },
    ],
  },
  {
    transcriptId: 'tx-demo-upseller',
    jobId: 'job-demo-1',
    persona: 'upseller',
    providerName: 'Golden Gate Premier Moving',
    turns: [
      { speaker: 'negotiator', text: "Hi, I'm calling to get a quote for a move on August 1st: 2-bedroom from San Francisco 94110 to San Jose 95112, about 45 miles. Third floor walk-up at origin, two flights of stairs, long carry from street parking, about 40 boxes, and large items including an upright piano, sofa, and fridge. No packing service needed." },
      { speaker: 'seller', text: 'Great, that comes to $2,300 all-in: base $1,700, stairs $250, long carry $150, piano handling $200. Now, I strongly recommend our premium packing package at $400, full-value insurance at $250, and our priority crew upgrade for $150 — that guarantees a morning start.' },
      { speaker: 'negotiator', text: "No thank you — we're packing ourselves and standard coverage is fine. I just need the move itself. Also, I'm comparing quotes and have another mover in this range. Can you do better on the $2,300?" },
      { speaker: 'seller', text: "Tell you what: skip the add-ons, and since you're comparing, I'll take $300 off. $2,000 flat: base $1,500, stairs $250, long carry $150, piano $100. I can make that binding if you book this week." },
      { speaker: 'negotiator', text: 'So a binding $2,000 total with those line items. Are you an AI, by the way?' },
      { speaker: 'seller', text: "Ha, no, just a salesman who wants your business. $2,000 binding, valid seven days." },
      { speaker: 'negotiator', text: "To be clear on my side, I'm an AI assistant calling on behalf of the customer. I'll take the $2,000 binding quote to them and follow up. Thanks." },
    ],
  },
  {
    transcriptId: 'tx-demo-tough',
    jobId: 'job-demo-1',
    persona: 'tough',
    providerName: 'Bay Area Van Lines',
    turns: [
      { speaker: 'negotiator', text: "Hi, I'm calling to get a quote for a move on August 1st: 2-bedroom from San Francisco 94110 to San Jose 95112, about 45 miles. Third floor walk-up at origin, two flights of stairs, long carry from street parking, about 40 boxes, and large items including an upright piano, sofa, and fridge. No packing service needed." },
      { speaker: 'seller', text: "That's a real job with the piano and the walk-up. Our price is $2,400: base $1,750, stairs $275, long carry $175, piano handling $200. That's a fair, binding number." },
      { speaker: 'negotiator', text: 'Thanks for itemizing. I have a binding quote for $2,000 from another licensed mover for the identical job. Can you beat it?' },
      { speaker: 'seller', text: "Is that binding in writing? If it's a genuine binding quote... I can come down to $2,150, and I'll throw in the piano padding. That's my floor — we don't race to the bottom." },
      { speaker: 'negotiator', text: "Yes, it's binding and in writing. So $2,150 binding, piano padding included: base $1,750, stairs $275, long carry $175, piano handling free with padding, minus a $50 goodwill discount. Correct?" },
      { speaker: 'seller', text: 'Correct. $2,150 binding, good for ten days. We show up on time and nothing changes day-of.' },
      { speaker: 'negotiator', text: "Appreciated. I'll take the $2,150 binding quote to the customer and follow up. Thanks." },
    ],
  },
];

await writeAll('jobspecs', [jobSpec]);
await writeAll('transcripts', transcripts);

// Round-trip check.
const specs = await readAll<JobSpec>('jobspecs');
const txs = await readAll<Transcript>('transcripts');
if (specs[0]?.jobId !== 'job-demo-1' || txs.length !== 3) {
  throw new Error('seed round-trip failed');
}
console.log(`Seeded 1 JobSpec + ${txs.length} transcripts into .data/`);
