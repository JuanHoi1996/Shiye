import type { StudioSpec } from './types';
import { lengthPreferencePromptLine } from './spec';

function specSection(spec: StudioSpec): string {
  return `
### Writing brief
- **Instruction** (what to write and how to angle it): ${spec.instruction}
- **Length**: ${lengthPreferencePromptLine(spec.lengthPreference)}
- **Audience**: ${spec.audience}
- **Genre / format**: ${spec.genre}
`.trim();
}

function sourceConversationBlock(
  sourceContext: string,
  sourceChatTitle?: string,
): string {
  const title = sourceChatTitle?.trim() || 'source chat';
  return `
### Source conversation (primary material — the article MUST grow from this)
The user opened Studio from an existing chat. Base your article on the discussion below; do not invent an unrelated topic.

<source_chat title="${title.replace(/"/g, "'")}">
${sourceContext.trim()}
</source_chat>
`.trim();
}

export const getStudioWriterPrompt = (
  spec: StudioSpec,
  sourcesXml?: string,
  draft?: string,
  sourceContext?: string,
  sourceChatTitle?: string,
): string => {
  const sourcesBlock = sourcesXml?.trim()
    ? `
### Reference material (cite with inline markdown links when used)
<sources>
${sourcesXml}
</sources>
`
    : '';

  const draftBlock = draft?.trim()
    ? `
### Internal draft (revise into the final article; do not mention this section)
<draft>
${draft}
</draft>
`
    : '';

  const sourceBlock =
    sourceContext?.trim() ?
      `\n${sourceConversationBlock(sourceContext, sourceChatTitle)}\n`
    : '';

  return `
You are a professional long-form writer. Produce a polished article as **pure markdown** — no JSON, no XML wrappers, no preamble outside the article.

${specSection(spec)}
${sourceBlock}

### Output rules
1. Start with a single \`# Title\` line (compelling, specific to the instruction and source conversation).
2. Use \`##\` section headings, bullet lists, blockquotes where appropriate for the genre.
3. Match tone and depth to the audience and genre in the brief.
4. Synthesize ideas, arguments, and facts from the source conversation; extend them — do not ignore the chat.
5. Hit the target length preference; prefer substance over filler.
6. Do not include meta-commentary ("In this article…", "As an AI…").
7. If reference sources are provided, ground factual claims in them; use markdown links \`[text](url)\` for citations.
8. Output **only** the markdown article.

${sourcesBlock}
${draftBlock}

Current date (UTC): ${new Date().toISOString()}.
`.trim();
};

export const getStudioReviserPrompt = (
  spec: StudioSpec,
  currentDraft: string,
  userInstruction: string,
  sourcesXml?: string,
  sourceContext?: string,
  sourceChatTitle?: string,
): string => {
  const sourcesBlock = sourcesXml?.trim()
    ? `
### Reference material
<sources>
${sourcesXml}
</sources>
`
    : '';

  const sourceBlock =
    sourceContext?.trim() ?
      `\n${sourceConversationBlock(sourceContext, sourceChatTitle)}\n`
    : '';

  return `
You are revising an existing markdown article per the editor's instruction. Output **pure markdown only** (full revised article, not a diff).

${specSection(spec)}
${sourceBlock}

### Editor instruction
${userInstruction.trim()}

### Current article
<current_draft>
${currentDraft}
</current_draft>

${sourcesBlock}

### Rules
- Apply the instruction while preserving genre, audience, length preference, and fidelity to the source conversation.
- Return the complete revised article in markdown.
- Do not explain your edits outside the article.

Current date (UTC): ${new Date().toISOString()}.
`.trim();
};

export const getStudioVerifierPrompt = (
  draft: string,
  spec: StudioSpec,
  sourcesXml?: string,
  sourceContext?: string,
): string => {
  const sourcesSection = sourcesXml?.trim()
    ? `
### Source evidence
<sources>
${sourcesXml}
</sources>
`
    : `
### Source evidence
(none — check internal consistency and flag unsupported factual claims)
`;

  const sourceBlock =
    sourceContext?.trim() ?
      `
### Original conversation (claims should align when derived from chat)
<source_chat>
${sourceContext.trim()}
</source_chat>
`
    : '';

  return `
You are an editorial verifier for long-form writing. Audit the draft for factual support (when sources exist), fit to the writing brief, and fidelity to the source conversation when provided.

### Writing brief
- Instruction: ${spec.instruction}
- Audience: ${spec.audience}
- Genre: ${spec.genre}
- Length: ${lengthPreferencePromptLine(spec.lengthPreference)}

### Task
1. Extract each **key factual claim** from the draft (atomic, one fact per entry). Skip pure opinion or generic transitions.
2. For each claim, compare to sources (if any) and label support:
   - **yes**: clearly supported
   - **partial**: related but overstated or weakly supported
   - **no**: unsupported, contradicts sources, or speculation as fact
3. Also note **style/brief mismatches** (wrong tone, wrong genre, far off target length) in claim notes when relevant.
4. Flag claims that **ignore or contradict** the source conversation when source_chat is provided.
5. Write a one-sentence \`overallNote\`.

### Output
Return **only** valid JSON (no markdown fences):
\`\`\`json
{
  "claims": [
    {
      "claim": "atomic statement",
      "support": "yes",
      "note": "brief reason"
    }
  ],
  "overallNote": "one sentence summary"
}
\`\`\`

Rules:
- \`claims\` must be an array (use \`[]\` if none).
- Every claim needs \`claim\`, \`support\` (\`"yes"\` | \`"partial"\` | \`"no"\`), and \`note\` (string, \`""\` if none).

### Draft
<draft>
${draft}
</draft>

${sourcesSection}
${sourceBlock}

Current date (UTC): ${new Date().toISOString()}.
`.trim();
};

export function appendStudioVerifierRevisionInstructions(
  basePrompt: string,
  verifierReport: string,
  draft: string,
): string {
  return `${basePrompt}

### Verification review (mandatory final pass)
Revise the draft using the verifier report below.
- **no**: remove or soften with explicit uncertainty.
- **partial**: keep with qualifiers.
- **yes**: keep; preserve citations.

<verification_report>
${verifierReport}
</verification_report>

<draft_to_revise note="internal reference only">
${draft}
</draft_to_revise>`;
}
