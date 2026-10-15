/**
 * Xiaomi MiMo's OpenAI-compatible gateway (MiFE) rejects a few fields OpenAI accepts.
 * Detection is by host or model id so a custom base URL still matches `mimo-*`.
 */
export function isXiaomiMiMoTarget(
  baseURL: string | undefined,
  modelKey: string | undefined,
): boolean {
  if (baseURL && /xiaomimimo\.com/i.test(baseURL)) return true;
  if (modelKey && /^mimo-/i.test(modelKey)) return true;
  return false;
}

/**
 * MiMo accepts none/low/medium/high. `max` and OpenAI's `xhigh` are 400.
 * Chat preset `max` is clamped to `high` (their top tier).
 */
export function clampMiMoReasoningEffort(
  modelKey: string | undefined,
  effort: unknown,
): unknown {
  if (!isXiaomiMiMoTarget(undefined, modelKey)) return effort;
  if (effort === 'max' || effort === 'xhigh') return 'high';
  return effort;
}

/** MiMo returns 400 on `stream_options` (no include_usage). */
export function allowsStreamUsageOption(
  baseURL: string | undefined,
  modelKey: string | undefined,
): boolean {
  return !isXiaomiMiMoTarget(baseURL, modelKey);
}

/**
 * Zod 4 emits draft 2020-12 (`$schema`, `const`). MiMo validates tool
 * parameters more like draft-07 and answers 400 Invalid request parameters.
 */
export function toolParametersForProvider(
  schema: Record<string, unknown>,
  mimo: boolean,
): Record<string, unknown> {
  if (!mimo) return schema;
  return sanitizeToolJsonSchema(schema) as Record<string, unknown>;
}

function sanitizeToolJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeToolJsonSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$schema') continue;
    if (key === 'const') {
      out.enum = [sanitizeToolJsonSchema(value)];
      continue;
    }
    out[key] = sanitizeToolJsonSchema(value);
  }
  return out;
}
