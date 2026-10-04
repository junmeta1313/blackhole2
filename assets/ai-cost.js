// Standard, short-context USD / 1M tokens. Checked 2026-10-05.
// https://developers.openai.com/api/docs/pricing
export function estimateCost(model, usage) {
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return null;
  const d = usage.input_tokens_details || {};
  const cached = d.cached_tokens || 0;
  let usd;
  if (model === 'gpt-6-luna') {
    const writes = d.cache_write_tokens || 0;
    usd = ((usage.input_tokens - cached - writes) * .10 + cached * .01 + writes * .125 + usage.output_tokens * .50) / 1e6;
  } else if (model === 'gpt-image-2.5-flare') {
    // Cached modality breakdown is not exposed; do not invent a mixed rate.
    if (cached || !Number.isFinite(d.image_tokens) || !Number.isFinite(d.text_tokens)) return null;
    usd = (d.text_tokens * 5 + d.image_tokens * 8 + usage.output_tokens * 30) / 1e6;
  } else return null;
  return { usd, estimated: true, pricingDate: '2026-10-05', source: 'https://developers.openai.com/api/docs/pricing' };
}
