/**
 * Kimi (Moonshot) fixes several sampling fields. Passing any other value is a 400
 * ("only 0.6 is allowed" / "only 1.0 is allowed" depending on model and thinking).
 * Official guidance is to omit them and let the server apply its fixed default.
 * https://platform.kimi.com/docs/api/models-overview
 */
export function isKimiModel(modelKey: string | undefined): boolean {
  return !!modelKey && /^kimi-/i.test(modelKey);
}

/** Drop client sampling fields that Kimi rejects when they are not the fixed value. */
export function omitKimiSamplingParams(
  modelKey: string | undefined,
  params: Record<string, unknown>,
): void {
  if (!isKimiModel(modelKey)) return;
  delete params.temperature;
  delete params.top_p;
  delete params.frequency_penalty;
  delete params.presence_penalty;
}

/**
 * OpenAI-compat `reasoning_effort` is not one enum across Kimi families.
 * k3: low/high/max, thinking cannot be turned off.
 * k2.6: thinking on/off only; reasoning_effort is rejected.
 * k2.7-code: thinking always on; disabled is rejected.
 */
export function applyKimiReasoningExtras(
  modelKey: string,
  out: Record<string, unknown>,
): void {
  if (!isKimiModel(modelKey)) return;
  const key = modelKey.toLowerCase();
  const effort = out.reasoning_effort;
  delete out.reasoning_effort;

  if (key.startsWith('kimi-k3')) {
    if (effort === 'max' || effort === 'xhigh') out.reasoning_effort = 'max';
    else if (effort === 'high' || effort === 'medium') out.reasoning_effort = 'high';
    else if (effort === 'low' || effort === 'none') out.reasoning_effort = 'low';
    return;
  }

  if (key.includes('k2.7')) {
    return;
  }

  if (effort === 'none') {
    out.thinking = { type: 'disabled' };
    return;
  }
  if (typeof effort === 'string' && effort.length > 0) {
    out.thinking = { type: 'enabled' };
  }
}
