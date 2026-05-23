/**
 * Token usage accumulator for LLM calls across the intelligence pipeline.
 *
 * All synthesis modules import recordTokens() and call it after every successful
 * LLM response. buildIntelligenceBase.js calls printTokenSummary() at the end.
 *
 * Pricing constants (USD per 1M tokens, as of May 2026):
 *   OpenAI gpt-4o-mini: $0.15 input / $0.60 output
 *   Groq llama-3.3-70b: $0.59 input / $0.79 output (per GroqCloud pricing)
 *   Gemini 2.0 Flash:   $0.075 input / $0.30 output
 *   Gemini 2.5 Flash:   $0.075 input / $0.30 output (preview pricing)
 */

const PRICE_PER_M = {
  OpenAI:       { input: 0.15,  output: 0.60  },
  "OpenAI-2":   { input: 0.15,  output: 0.60  },
  Groq:         { input: 0.59,  output: 0.79  },
  "Gemini Flash":  { input: 0.075, output: 0.30  },
  "Gemini 2.5":    { input: 0.075, output: 0.30  },
  "Gemini-B":      { input: 0.075, output: 0.30  },
  "Gemini-Pro":    { input: 0.075, output: 0.30  },
  "Gemini":        { input: 0.075, output: 0.30  },
};

const calls = [];

export function recordTokens({ step, provider, prompt_tokens = 0, completion_tokens = 0 }) {
  calls.push({ step, provider, prompt_tokens, completion_tokens });
}

export function getTokenSummary() {
  const totals = { prompt: 0, completion: 0, total: 0, cost_usd: 0, calls: calls.length };
  const byStep = {};
  const byProvider = {};

  for (const c of calls) {
    totals.prompt     += c.prompt_tokens;
    totals.completion += c.completion_tokens;
    totals.total      += c.prompt_tokens + c.completion_tokens;

    const price = PRICE_PER_M[c.provider] || { input: 0, output: 0 };
    const callCost = (c.prompt_tokens * price.input + c.completion_tokens * price.output) / 1_000_000;
    totals.cost_usd += callCost;

    if (!byStep[c.step]) byStep[c.step] = { prompt: 0, completion: 0, calls: 0 };
    byStep[c.step].prompt     += c.prompt_tokens;
    byStep[c.step].completion += c.completion_tokens;
    byStep[c.step].calls++;

    if (!byProvider[c.provider]) byProvider[c.provider] = { prompt: 0, completion: 0, calls: 0, cost_usd: 0 };
    byProvider[c.provider].prompt     += c.prompt_tokens;
    byProvider[c.provider].completion += c.completion_tokens;
    byProvider[c.provider].calls++;
    byProvider[c.provider].cost_usd  += callCost;
  }

  return { totals, byStep, byProvider };
}

export function printTokenSummary(sourceCount) {
  if (calls.length === 0) {
    console.log("\n  Token usage: no LLM calls made (all deterministic fallbacks)");
    return;
  }

  const { totals, byStep, byProvider } = getTokenSummary();

  console.log("\n── Token Usage ─────────────────────────────────────────────────────");
  console.log(`  LLM calls:        ${totals.calls}`);
  console.log(`  Prompt tokens:    ${totals.prompt.toLocaleString()}`);
  console.log(`  Completion tokens:${totals.completion.toLocaleString()}`);
  console.log(`  Total tokens:     ${totals.total.toLocaleString()}`);
  console.log(`  Est. cost:        $${totals.cost_usd.toFixed(4)} USD`);
  if (sourceCount > 0) {
    console.log(`  Tokens/source:    ${Math.round(totals.total / sourceCount).toLocaleString()} (${sourceCount} sources)`);
  }

  console.log("\n  By step:");
  for (const [step, s] of Object.entries(byStep)) {
    const t = s.prompt + s.completion;
    console.log(`    ${step.padEnd(22)} ${String(s.calls).padStart(3)} calls  ${t.toLocaleString().padStart(9)} tokens  (${s.prompt.toLocaleString()} in / ${s.completion.toLocaleString()} out)`);
  }

  console.log("\n  By provider:");
  for (const [provider, p] of Object.entries(byProvider)) {
    const t = p.prompt + p.completion;
    console.log(`    ${provider.padEnd(16)} ${String(p.calls).padStart(3)} calls  ${t.toLocaleString().padStart(9)} tokens  ~$${p.cost_usd.toFixed(4)}`);
  }

  console.log("────────────────────────────────────────────────────────────────────");
}
