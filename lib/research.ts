import OpenAI from 'openai';
import { vertical } from '@/config/vertical';
import type { JobSpec } from '@/types';

const openai = new OpenAI();

export interface MarketResearch {
  jobId: string;
  typicalLow: number;
  typicalHigh: number;
  median: number;
  source: string;
}

const researchSchema = {
  type: 'object',
  properties: {
    typicalLow: { type: 'number' },
    typicalHigh: { type: 'number' },
    median: { type: 'number' },
    source: { type: 'string' },
  },
  required: ['typicalLow', 'typicalHigh', 'median', 'source'],
  additionalProperties: false,
};

// One web-search-backed call before the vendor calls: what does THIS job typically cost
// right now? Arms call #1 with anchor leverage (until then the negotiator held nothing).
// Returns null on any failure — calls run exactly as before, without it.
// ponytail: no cache/retry — one search per run; add if it flakes or gets slow.
export async function researchMarketRate(spec: JobSpec): Promise<MarketResearch | null> {
  try {
    const res = await openai.responses.create({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input: `Search the web for what this ${vertical.jobNoun} job typically costs today, then report the going market rate for it:\n${JSON.stringify(
        vertical.specForCall(spec)
      )}\nGive the typical low, typical high, and median price a customer should expect, based only on what the search returned — never invent numbers. "source" is one short plain-English phrase naming where the figures came from (site or dataset names only — no URLs, no markdown).`,
      text: {
        format: { type: 'json_schema', name: 'market_research', strict: true, schema: researchSchema },
      },
    });
    const r = JSON.parse(res.output_text) as Omit<MarketResearch, 'jobId'>;
    if (!(r.typicalLow > 0 && r.typicalHigh >= r.typicalLow && r.median > 0)) return null;
    // Search results are attacker-influenceable (SEO) and this string lands in the
    // negotiator's prompt — clamp it so it can only ever be a short citation.
    return { jobId: spec.jobId, ...r, source: r.source.slice(0, 120) };
  } catch {
    return null;
  }
}
