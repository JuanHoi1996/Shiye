# Optional live provider sanity (consumes API tokens)

This is **not** part of `npm test`. Use when validating real endpoints after changing policy code.

Suggested manual checks per provider:

1. **Classifier JSON**: send a chat that triggers `/api/chat` classification (or call `generateObject` equivalent on the provider).
2. **Plain completion**: short non-tool user message.

Set provider keys in the environment or server config. Prefer low `max_tokens` to minimize cost.

For **DeepSeek** in OpenAI-compatible mode, the documented base URL is `https://api.deepseek.com` (not `.../v1`); the SDK will call `https://api.deepseek.com/chat/completions`.

You can also use `curl` against `https://api.openai.com/v1/chat/completions` (or the provider’s chat URL) with the same `model` and body shape that `OpenAILLM` produces (see `openaiCompatPolicy.ts`).

Debug flags (UI):

- `localStorage.setItem('forceSearchDebug', '1')` — forces search path (skips classifier LLM).
- URL `?forceSearch=1` — same as above.
