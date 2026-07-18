// Vertical-specific values for "moving". Swap this file to generalize to another vertical.
export const vertical = {
  name: 'moving' as const,
  // Real range for a 45-mi 2BR move.
  marketRange: { low: 1158, high: 6506 },
  marketMedian: 2400,
  // Red-flag any total >= 30% below median.
  redFlagBelowMedianPct: 0.3,
  personas: ['tough', 'lowballer', 'upseller'] as const,
};
