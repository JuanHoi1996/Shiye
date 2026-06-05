import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Loader from '@/components/ui/Loader';
import { cn } from '@/lib/utils';

type UsageSummary = {
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

const DAY_OPTIONS = [7, 30, 90] as const;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function phaseBadgeClass(phase: string): string {
  switch (phase) {
    case 'writer_draft':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
    case 'verifier':
      return 'bg-violet-500/15 text-violet-800 dark:text-violet-200';
    case 'classifier':
      return 'bg-sky-500/15 text-sky-800 dark:text-sky-200';
    case 'researcher':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200';
    case 'writer':
      return 'bg-shiye-ink/10 text-shiye-ink dark:text-shiye-paper';
    default:
      return 'bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70';
  }
}

function AggTable({
  title,
  rows,
  nameLabel,
  renderName,
  t,
}: {
  title: string;
  rows: {
    name: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }[];
  nameLabel: string;
  renderName?: (name: string) => ReactNode;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-medium text-black/80 dark:text-white/80">
        {title}
      </h5>
      <div className="overflow-x-auto rounded-lg border border-light-200 dark:border-dark-200">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-light-200 dark:border-dark-200 text-black/50 dark:text-white/50">
              <th className="px-2 py-1.5 font-medium">{nameLabel}</th>
              <th className="px-2 py-1.5 font-medium text-right">
                {t('settings.usage.count')}
              </th>
              <th className="px-2 py-1.5 font-medium text-right">
                {t('settings.usage.input')}
              </th>
              <th className="px-2 py-1.5 font-medium text-right">
                {t('settings.usage.output')}
              </th>
              <th className="px-2 py-1.5 font-medium text-right">
                {t('settings.usage.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-3 text-center text-black/40 dark:text-white/40"
                >
                  {t('settings.usage.noData')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-light-200/60 last:border-0 dark:border-dark-200/60"
                >
                  <td className="px-2 py-1.5 font-mono">
                    {renderName ? renderName(row.name) : row.name}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {row.count}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatTokens(row.inputTokens)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatTokens(row.outputTokens)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatTokens(row.totalTokens)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Usage = () => {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (rangeDays: number) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/usage/summary?days=${rangeDays}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as UsageSummary;
      setData(json);
    } catch (e) {
      console.error('Usage summary fetch failed:', e);
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const cachePct =
    data?.cacheCoverage.estimatedCacheHitRate != null
      ? (data.cacheCoverage.estimatedCacheHitRate * 100).toFixed(1)
      : null;

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-black/70 dark:text-white/70">
          {t('settings.usage.loadError')}
        </p>
        <button
          type="button"
          onClick={() => void load(days)}
          className="rounded-lg bg-light-200 px-3 py-1.5 text-xs text-black/80 hover:bg-light-200/80 dark:bg-dark-200 dark:text-white/80"
        >
          {t('settings.usage.retry')}
        </button>
      </div>
    );
  }

  const phaseRows = data.byPhase.map((p) => ({
    name: p.phase,
    count: p.count,
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
    totalTokens: p.totalTokens,
  }));

  const modeRows = data.byOptimizationMode.map((m) => ({
    name: m.mode,
    count: m.count,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    totalTokens: m.totalTokens,
  }));

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-black/50 dark:text-white/50">
          {data.range.startDate} — {data.range.endDate}
        </p>
        <div className="flex gap-1 rounded-lg border border-light-200 p-0.5 dark:border-dark-200">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] transition',
                days === d
                  ? 'bg-light-200 text-black/90 dark:bg-dark-200 dark:text-white/90'
                  : 'text-black/50 hover:text-black/70 dark:text-white/50 dark:hover:text-white/70',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          {
            label: t('settings.usage.calls'),
            value: String(data.totals.count),
          },
          {
            label: t('settings.usage.inputTokens'),
            value: formatTokens(data.totals.inputTokens),
          },
          {
            label: t('settings.usage.outputTokens'),
            value: formatTokens(data.totals.outputTokens),
          },
          {
            label: t('settings.usage.cachedTokens'),
            value: formatTokens(data.totals.cachedTokens),
            sub:
              cachePct != null
                ? t('settings.usage.cacheHit', {
                    pct: cachePct,
                    withField: data.cacheCoverage.rowsWithCachedField,
                    total: data.cacheCoverage.rowsTotal,
                  })
                : data.cacheCoverage.rowsTotal > 0
                  ? t('settings.usage.noCacheField')
                  : undefined,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-light-200 bg-light-primary/50 px-3 py-2 dark:border-dark-200 dark:bg-dark-primary/50"
          >
            <p className="text-[10px] text-black/50 dark:text-white/50">
              {kpi.label}
            </p>
            <p className="text-sm font-medium tabular-nums text-black dark:text-white">
              {kpi.value}
            </p>
            {kpi.sub && (
              <p className="mt-0.5 text-[10px] text-black/45 dark:text-white/45">
                {kpi.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h5 className="text-xs font-medium text-black/80 dark:text-white/80">
          {t('settings.usage.byDay')}
        </h5>
        {data.byDay.length === 0 ? (
          <p className="text-[11px] text-black/40 dark:text-white/40">
            {t('settings.usage.noUsageInRange')}
          </p>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.byDay}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-black/10 dark:stroke-white/10"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => formatTokens(v)}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [
                    formatTokens(Number(value ?? 0)),
                    'Total tokens',
                  ]}
                  labelFormatter={(label) => String(label ?? '')}
                />
                <Bar
                  dataKey="totalTokens"
                  fill="currentColor"
                  className="text-shiye-ink dark:text-shiye-paper"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AggTable
          title={t('settings.usage.byPhase')}
          nameLabel={t('settings.usage.phase')}
          rows={phaseRows}
          t={t}
          renderName={(name) => (
            <span
              className={cn(
                'inline-block rounded px-1.5 py-0.5 font-sans text-[10px]',
                phaseBadgeClass(name),
              )}
            >
              {name}
            </span>
          )}
        />
        <AggTable
          title={t('settings.usage.byMode')}
          nameLabel={t('settings.usage.mode')}
          rows={modeRows}
          t={t}
        />
      </div>

      <div className="space-y-2">
        <h5 className="text-xs font-medium text-black/80 dark:text-white/80">
          {t('settings.usage.byModel')}
        </h5>
        <div className="overflow-x-auto rounded-lg border border-light-200 dark:border-dark-200">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-light-200 dark:border-dark-200 text-black/50 dark:text-white/50">
                <th className="px-2 py-1.5 font-medium">
                  {t('settings.usage.provider')}
                </th>
                <th className="px-2 py-1.5 font-medium">
                  {t('settings.usage.model')}
                </th>
                <th className="px-2 py-1.5 font-medium text-right">
                  {t('settings.usage.count')}
                </th>
                <th className="px-2 py-1.5 font-medium text-right">
                  {t('settings.usage.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.byModel.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-3 text-center text-black/40 dark:text-white/40"
                  >
                    {t('settings.usage.noData')}
                  </td>
                </tr>
              ) : (
                data.byModel.map((row) => (
                  <tr
                    key={`${row.providerId}-${row.modelKey}`}
                    className="border-b border-light-200/60 last:border-0 dark:border-dark-200/60"
                  >
                    <td className="px-2 py-1.5 font-mono">{row.providerId}</td>
                    <td className="px-2 py-1.5 font-mono">{row.modelKey}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.count}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatTokens(row.totalTokens)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Usage;
