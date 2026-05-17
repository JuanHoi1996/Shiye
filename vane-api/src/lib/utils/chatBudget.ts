import type {
  AssistantMessage,
  ChatTurnMessage,
  Message,
  ToolMessage,
} from '@/lib/types';

const MAX_HISTORY_MESSAGES = 32;
const RECENT_UNCOMPRESSED = 4;

function lightCompressAssistantText(content: string): string {
  let s = content.replace(/\[\d+\]/g, '');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const max = 8000;
  if (s.length <= max) return s;
  const head = 4000;
  const tail = 2000;
  return `${s.slice(0, head)}\n\n[…]\n\n${s.slice(-tail)}`;
}

/**
 * Trims and lightly compresses prior turns so classifier and writer do not see unbounded history.
 * Recent pairs stay mostly intact aside from inline citation marker stripping.
 */
export function applyChatHistoryBudget(
  messages: ChatTurnMessage[],
): ChatTurnMessage[] {
  if (messages.length === 0) return messages;
  const sliced =
    messages.length > MAX_HISTORY_MESSAGES
      ? messages.slice(-MAX_HISTORY_MESSAGES)
      : messages;

  return sliced.map((m, i) => {
    if (m.role !== 'assistant' || typeof m.content !== 'string') {
      return m;
    }
    const isRecent = i >= sliced.length - RECENT_UNCOMPRESSED;
    if (isRecent) {
      return { ...m, content: m.content.replace(/\[\d+\]/g, '') };
    }
    return { ...m, content: lightCompressAssistantText(m.content) };
  });
}

export const MAX_RESEARCHER_TOOL_STRING = 12_000;
/** Max total messages in researcher rolling context (incl. initial user blob). */
const MAX_AGENT_MSG_HISTORY = 28;

/**
 * After arbitrary `slice()` on JSON.stringify output, the tail may split a `\uXXXX`
 * escape into a fragment. Embedding that in `messages[].content` makes outbound
 * request JSON invalid (`unexpected end of hex escape` on providers).
 *
 * Peel trailing incomplete escapes until the slice is JSON-string-safe again.
 */
export function sanitizeTruncatedSerializedJson(slice: string): string {
  let t = slice;
  for (;;) {
    if (t.length === 0) return t;

    const uIncomplete = t.match(/\\u[\da-fA-F]{0,3}$/i)?.[0];
    if (uIncomplete) {
      t = t.slice(0, -uIncomplete.length);
      continue;
    }

    let backslashesFromEnd = 0;
    for (let j = t.length - 1; j >= 0 && t[j] === '\\'; j--) {
      backslashesFromEnd++;
    }
    if (backslashesFromEnd % 2 === 1) {
      t = t.slice(0, -1);
      continue;
    }

    return t;
  }
}

/**
 * Truncate a single tool result blob for the researcher’s rolling context.
 */
export function truncateToolContentJson(json: string): string {
  if (json.length <= MAX_RESEARCHER_TOOL_STRING) {
    return sanitizeTruncatedSerializedJson(json);
  }
  return (
    sanitizeTruncatedSerializedJson(json.slice(0, MAX_RESEARCHER_TOOL_STRING)) +
    '…[truncated for context budget]'
  );
}

type ToolCallGroup = { assistant: AssistantMessage; tools: ToolMessage[] };

/**
 * Parse messages after the initial user blob into complete assistant+tool call groups.
 * Leading orphan `tool` rows are dropped.
 */
function parseToolCallGroups(rest: Message[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = [];
  let i = 0;
  while (i < rest.length) {
    const m = rest[i];
    if (m.role === 'tool') {
      i += 1;
      continue;
    }
    if (m.role !== 'assistant') {
      i += 1;
      continue;
    }
    const assistant = m as AssistantMessage;
    const tc = assistant.tool_calls;
    if (!tc || tc.length === 0) {
      i += 1;
      continue;
    }
    const tools: ToolMessage[] = [];
    let valid = true;
    for (let j = 0; j < tc.length; j++) {
      const next = rest[i + 1 + j] as Message | undefined;
      if (!next || next.role !== 'tool' || (next as ToolMessage).id !== tc[j]!.id) {
        valid = false;
        break;
      }
      tools.push(next as ToolMessage);
    }
    if (valid) {
      groups.push({ assistant, tools });
      i += 1 + tc.length;
    } else {
      break;
    }
  }
  return groups;
}

const MAX_REST_MESSAGES = MAX_AGENT_MSG_HISTORY - 1;

/**
 * After each researcher iteration, keep the initial "conversation" user blob plus
 * a sliding tail of complete (assistant+tool) groups only, so we never cut inside a tool round.
 */
export function capResearcherAgentHistory<T extends { role: string; content: string }>(
  history: T[],
): T[] {
  if (history.length <= MAX_AGENT_MSG_HISTORY) {
    return history;
  }
  if (!history.length) {
    return history;
  }
  const first = history[0]! as Message;
  if (first.role !== 'user') {
    // Unexpected; fall back to slice by count without splitting tool pairs.
    return history.slice(-MAX_AGENT_MSG_HISTORY) as T[];
  }
  const rest = history.slice(1) as Message[];
  const groups = parseToolCallGroups(rest);
  if (groups.length === 0) {
    return [first, ...rest.slice(-MAX_REST_MESSAGES)] as T[];
  }

  const selected: ToolCallGroup[] = [];
  let size = 0;
  for (let g = groups.length - 1; g >= 0; g--) {
    const gsize = 1 + groups[g]!.tools.length;
    if (size + gsize > MAX_REST_MESSAGES) {
      continue;
    }
    selected.unshift(groups[g]!);
    size += gsize;
  }
  const newRest: Message[] = trimToolContentsToTotalCharBudget(
    selected.flatMap((g) => [g.assistant, ...g.tools]),
    MAX_RESEARCHER_ROLLING_TOOL_TOTAL_CHARS,
  );
  return [first, ...newRest] as T[];
}

const MAX_RESEARCHER_ROLLING_TOOL_TOTAL_CHARS = 180_000;

/**
 * If combined tool message JSON strings still exceed a budget, trim from oldest first.
 */
function trimToolContentsToTotalCharBudget(
  rest: Message[],
  maxTotal: number,
): Message[] {
  const toolIndices: number[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i]!.role === 'tool') {
      toolIndices.push(i);
    }
  }
  const total = toolIndices.reduce(
    (s, j) => s + (rest[j] as ToolMessage).content.length,
    0,
  );
  if (total <= maxTotal) {
    return rest;
  }
  const out: Message[] = rest.map((m) =>
    m.role === 'tool' ? { ...m, content: (m as ToolMessage).content } : m,
  ) as Message[];
  let toTrim = total - maxTotal;
  for (const j of toolIndices) {
    if (toTrim <= 0) {
      break;
    }
    const t = out[j] as ToolMessage;
    if (t.content.length <= 80) {
      continue;
    }
    const targetLen = Math.max(80, t.content.length - toTrim);
    const newLen = t.content.length - targetLen;
    toTrim -= newLen;
    t.content =
      sanitizeTruncatedSerializedJson(t.content.slice(0, targetLen)) +
      '…[rolling budget trim]';
    out[j] = t;
  }
  return out;
}

/** Max total character budget for the writer `search_results` + widgets XML block. */
export const MAX_WRITER_SEARCH_CONTEXT_CHARS = 100_000;

const MAX_CHUNK_IN_LIST_CHARS = 12_000;

type ChunkLike = { content: string; metadata: { title?: string; url?: string } };

/**
 * Truncate a single result chunk for writer context; keeps head + small tail.
 */
function truncateChunkForWriter(content: string, max: number = MAX_CHUNK_IN_LIST_CHARS): string {
  if (content.length <= max) return content;
  const head = Math.floor(max * 0.65);
  const tail = Math.max(0, max - head - 40);
  return `${content.slice(0, head)}\n[…]\n${content.slice(-tail)}`.slice(0, max) + '…[trunc]';
}

const MAX_WIDGET_CONTEXT_CHARS = 20_000;

/**
 * Join search findings for the writer, enforcing a hard total char budget and per-chunk caps.
 */
export function buildWriterSearchContextXml(
  searchFindings: ChunkLike[],
): { xml: string; wasTruncated: boolean } {
  if (searchFindings.length === 0) {
    return { xml: '', wasTruncated: false };
  }

  let wasTruncated = false;
  const findings = [...searchFindings];

  const toPart = (f: ChunkLike, index: number, perChunk: number) => {
    const raw = (f.metadata?.title ?? 'untitled').toString();
    const t = raw.replace(/[<>"]/g, ' ').slice(0, 200);
    return `<result index=${index + 1} title=${t}>${truncateChunkForWriter(
      f.content,
      perChunk,
    )}</result>`;
  };

  let per = MAX_CHUNK_IN_LIST_CHARS;
  let parts = findings.map((f, i) => toPart(f, i, per));
  let body = parts.join('\n');

  while (body.length > MAX_WRITER_SEARCH_CONTEXT_CHARS && per > 500) {
    wasTruncated = true;
    per = Math.max(500, Math.floor(per * 0.7));
    parts = findings.map((f, i) => toPart(f, i, per));
    body = parts.join('\n');
  }
  while (body.length > MAX_WRITER_SEARCH_CONTEXT_CHARS && findings.length > 1) {
    wasTruncated = true;
    findings.pop();
    parts = findings.map((f, i) => toPart(f, i, per));
    body = parts.join('\n');
  }
  if (body.length > MAX_WRITER_SEARCH_CONTEXT_CHARS) {
    wasTruncated = true;
    body = body.slice(0, MAX_WRITER_SEARCH_CONTEXT_CHARS) + '…[truncated]';
  }
  return { xml: body, wasTruncated };
}

/**
 * Truncate total widget/auxiliary context for the writer prompt.
 */
export function capWidgetLlmContext(raw: string): string {
  if (raw.length <= MAX_WIDGET_CONTEXT_CHARS) return raw;
  return (
    raw.slice(0, MAX_WIDGET_CONTEXT_CHARS) + '…[widget context truncated]'
  );
}
