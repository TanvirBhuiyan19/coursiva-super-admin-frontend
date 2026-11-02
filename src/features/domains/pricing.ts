// The resale price rule (docs/api/domains.md → DomainSettings): the registrar cost plus the markup, never less than
// the minimum margin, then rounded. The API is authoritative — its `example` is the saved settings' price; this
// mirror only previews unsaved edits on the settings form. The mock uses it too, so both sides agree.
import type { DomainRounding } from './types';

/** Price in USD for a registrar `cost` (USD) under the given settings. */
export function resalePrice(cost: number, markupPercent: number, markupMin: number, rounding: DomainRounding): number {
  const costCents = Math.round(cost * 100);
  // Percent in hundredths (2 decimals) keeps the arithmetic in integers: cost × (10000 + pct×100) / 10000, rounded up.
  const pctHundredths = Math.round(markupPercent * 100);
  const byPercent = Math.ceil((costCents * (10000 + pctHundredths)) / 10000);
  const marked = Math.max(byPercent, costCents + Math.round(markupMin * 100));
  // x99: the smallest n.99 at or above the price.
  const cents = rounding === 'x99' ? Math.ceil((marked + 1) / 100) * 100 - 1 : marked;
  return cents / 100;
}
