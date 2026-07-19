import type { JobSpec } from '@/types';

// The exact demo job: shared by `npm run seed` and the Run-demo button.
export const demoJobSpec: JobSpec = {
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
