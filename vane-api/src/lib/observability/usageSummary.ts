import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
export type UsageSummaryResponse = {
  range: { startDate: string; endDate: string; days: number };
  totals: {
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
  };
  byDay: {
    date: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }[];
  byPhase: {
    phase: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }[];
  byOptimizationMode: {
    mode: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }[];
  byModel: {
    providerId: string;
    modelKey: string;
    count: number;
    totalTokens: number;
  }[];
  cacheCoverage: {
    rowsWithCachedField: number;
    rowsTotal: number;
    estimatedCacheHitRate: number | null;
  };
};

type TokenAgg = {
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
};

function tokenUsageDir(): string {
  return path.join(process.cwd(), 'data', 'token-usage');
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function addDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

export function clampUsageDays(raw: unknown): number {
  const n = raw === undefined || raw === '' ? 30 : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(90, Math.floor(n));
}

function emptyAgg(): TokenAgg {
  return {
    count: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
  };
}

function numField(r: Record<string, unknown>, key: string): number {
  const v = r[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function addRecordToAgg(agg: TokenAgg, r: Record<string, unknown>): void {
  agg.count += 1;
  agg.inputTokens += numField(r, 'inputTokens');
  agg.outputTokens += numField(r, 'outputTokens');
  agg.totalTokens += numField(r, 'totalTokens');
  if ('cachedTokens' in r) {
    agg.cachedTokens += numField(r, 'cachedTokens');
  }
}

function optimizationModeLabel(r: Record<string, unknown>): string {
  const mode = String(r.optimizationMode ?? 'unknown');
  if (mode === 'quality') return 'quality';
  return mode;
}

function emptySummary(days: number): UsageSummaryResponse {
  const end = new Date();
  const start = addDays(end, -(days - 1));
  return {
    range: {
      startDate: formatDate(start),
      endDate: formatDate(end),
      days,
    },
    totals: {
      count: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
    },
    byDay: [],
    byPhase: [],
    byOptimizationMode: [],
    byModel: [],
    cacheCoverage: {
      rowsWithCachedField: 0,
      rowsTotal: 0,
      estimatedCacheHitRate: null,
    },
  };
}

function parseJsonlFilenameDate(name: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
  return m ? m[1] : null;
}

/**
 * Aggregate token-usage JSONL for the last `days` (max 90). Missing dir/files → empty summary.
 */
export async function buildUsageSummary(
  days: number,
): Promise<UsageSummaryResponse> {
  const end = new Date();
  const start = addDays(end, -(days - 1));
  const startDate = formatDate(start);
  const endDate = formatDate(end);

  const dir = tokenUsageDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return emptySummary(days);
  }

  const jsonlFiles = names
    .filter((n) => n.endsWith('.jsonl'))
    .filter((n) => {
      const fileDate = parseJsonlFilenameDate(n);
      if (!fileDate) return true;
      return fileDate >= startDate && fileDate <= endDate;
    });

  if (jsonlFiles.length === 0) {
    return emptySummary(days);
  }

  const totals = emptyAgg();
  const byDayMap = new Map<string, TokenAgg>();
  const byPhaseMap = new Map<string, TokenAgg>();
  const byModeMap = new Map<string, TokenAgg>();
  const byModelMap = new Map<
    string,
    { providerId: string; modelKey: string; count: number; totalTokens: number }
  >();

  let rowsWithCachedField = 0;
  let rowsTotal = 0;
  let cachedSum = 0;
  let inputWhenCachedReported = 0;

  for (const fileName of jsonlFiles) {
    let text: string;
    try {
      text = await readFile(path.join(dir, fileName), 'utf8');
    } catch {
      continue;
    }

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== 'object') continue;
      const r = parsed as Record<string, unknown>;

      const ts = String(r.timestamp ?? '');
      const day = ts.slice(0, 10);
      if (!day || day.length < 10) continue;
      if (day < startDate || day > endDate) continue;

      rowsTotal += 1;
      addRecordToAgg(totals, r);

      let dayAgg = byDayMap.get(day);
      if (!dayAgg) {
        dayAgg = emptyAgg();
        byDayMap.set(day, dayAgg);
      }
      addRecordToAgg(dayAgg, r);

      const phase = String(r.phase ?? 'unknown');
      let phaseAgg = byPhaseMap.get(phase);
      if (!phaseAgg) {
        phaseAgg = emptyAgg();
        byPhaseMap.set(phase, phaseAgg);
      }
      addRecordToAgg(phaseAgg, r);

      const mode = optimizationModeLabel(r);
      let modeAgg = byModeMap.get(mode);
      if (!modeAgg) {
        modeAgg = emptyAgg();
        byModeMap.set(mode, modeAgg);
      }
      addRecordToAgg(modeAgg, r);

      const providerId = String(r.providerId ?? 'unknown');
      const modelKey = String(r.modelKey ?? 'unknown');
      const modelKeyMap = `${providerId}\0${modelKey}`;
      let modelAgg = byModelMap.get(modelKeyMap);
      if (!modelAgg) {
        modelAgg = { providerId, modelKey, count: 0, totalTokens: 0 };
        byModelMap.set(modelKeyMap, modelAgg);
      }
      modelAgg.count += 1;
      modelAgg.totalTokens += numField(r, 'totalTokens');

      if ('cachedTokens' in r) {
        rowsWithCachedField += 1;
        const c = numField(r, 'cachedTokens');
        const inp = numField(r, 'inputTokens');
        cachedSum += c;
        if (inp > 0) inputWhenCachedReported += inp;
      }
    }
  }

  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({
      date,
      count: a.count,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      totalTokens: a.totalTokens,
    }));

  const byPhase = [...byPhaseMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phase, a]) => ({
      phase,
      count: a.count,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      totalTokens: a.totalTokens,
    }));

  const byOptimizationMode = [...byModeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mode, a]) => ({
      mode,
      count: a.count,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      totalTokens: a.totalTokens,
    }));

  const byModel = [...byModelMap.values()].sort((a, b) => {
    if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
    return b.count - a.count;
  });

  const estimatedCacheHitRate =
    rowsTotal === 0
      ? null
      : inputWhenCachedReported > 0
        ? cachedSum / inputWhenCachedReported
        : null;

  return {
    range: { startDate, endDate, days },
    totals: {
      count: totals.count,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      totalTokens: totals.totalTokens,
      cachedTokens: totals.cachedTokens,
    },
    byDay,
    byPhase,
    byOptimizationMode,
    byModel,
    cacheCoverage: {
      rowsWithCachedField,
      rowsTotal,
      estimatedCacheHitRate,
    },
  };
}
