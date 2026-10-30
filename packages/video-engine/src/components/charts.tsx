import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp, theme } from '../theme';
import { IllustrativeBadge } from './text';

/** Round an axis maximum up to a "nice" number. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : 10;
  return nice * exp;
}

const axisText: React.CSSProperties = { fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 24 };

/** Linear interpolation of a series up to a fractional index (for progressive drawing). */
function partial<T extends { x: number; y: number }>(pts: T[], upto: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i <= upto) out.push(pts[i]!);
    else {
      const prev = pts[i - 1]!;
      const t = upto - (i - 1);
      if (t > 0) out.push({ x: prev.x + (pts[i]!.x - prev.x) * t, y: prev.y + (pts[i]!.y - prev.y) * t });
      break;
    }
  }
  return out;
}
const pathOf = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/**
 * Contributed capital vs. portfolio value over time (real calculation from props).
 * `progress` 0..1 draws the series from left to right.
 */
export const SavingsGrowthChart: React.FC<{
  series: { year: number; contributed: number; value: number }[];
  progress: number;
  width?: number;
  height?: number;
  formatAxis: (v: number) => string;
  labels: { contributed: string; value: string };
}> = ({ series, progress, width = 900, height = 640, formatAxis, labels }) => {
  const frame = useCurrentFrame();
  const padL = 150;
  const padB = 56;
  const padT = 20;
  const w = width - padL - 10;
  const h = height - padB - padT;
  const maxYear = series[series.length - 1]!.year;
  const yMax = niceMax(Math.max(...series.map((s) => s.value)));
  const X = (year: number) => padL + (year / maxYear) * w;
  const Y = (v: number) => padT + h - (v / yMax) * h;
  const upto = progress * (series.length - 1);
  const val = partial(series.map((s) => ({ x: X(s.year), y: Y(s.value) })), upto);
  const con = partial(series.map((s) => ({ x: X(s.year), y: Y(s.contributed) })), upto);
  const last = val[val.length - 1]!;
  const baseY = Y(0);
  const area = (pts: { x: number; y: number }[]) => `${pathOf(pts)} L${pts[pts.length - 1]!.x},${baseY} L${pts[0]!.x},${baseY} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);
  const yearTicks = [0, maxYear / 3, (2 * maxYear) / 3, maxYear].map(Math.round);
  const pulse = 1 + Math.sin(frame / 6) * 0.12;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="valFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={theme.colors.lime} stopOpacity={0.32} />
            <stop offset="100%" stopColor={theme.colors.lime} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - 10} y1={Y(t)} y2={Y(t)} stroke={theme.colors.hairline} strokeWidth={1.5} />
            <text x={padL - 18} y={Y(t) + 8} textAnchor="end" style={axisText} fill={theme.colors.textFaint}>
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {yearTicks.map((yr) => (
          <text key={yr} x={X(yr)} y={height - 12} textAnchor={yr === 0 ? 'start' : yr === maxYear ? 'end' : 'middle'} style={axisText} fill={theme.colors.textFaint}>
            {yr === 0 ? 'Start' : `${yr} jaar`}
          </text>
        ))}
        {val.length > 1 ? (
          <>
            <path d={area(val)} fill="url(#valFill)" />
            <path d={area(con)} fill={theme.colors.green} fillOpacity={0.9} />
            <path d={pathOf(con)} fill="none" stroke="#2F9E57" strokeWidth={3} />
            <path d={pathOf(val)} fill="none" stroke={theme.colors.lime} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 14px ${theme.colors.limeGlow})` }} />
            <circle cx={last.x} cy={last.y} r={13 * pulse} fill={theme.colors.lime} />
            <circle cx={last.x} cy={last.y} r={26 * pulse} fill={theme.colors.lime} fillOpacity={0.18} />
          </>
        ) : null}
      </svg>
      <div style={{ display: 'flex', gap: 36, paddingLeft: padL }}>
        <Legend color={theme.colors.lime} text={labels.value} />
        <Legend color={theme.colors.green} text={labels.contributed} square />
      </div>
    </div>
  );
};

const Legend: React.FC<{ color: string; text: string; square?: boolean }> = ({ color, text, square }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <span style={{ width: square ? 22 : 30, height: square ? 22 : 7, borderRadius: square ? 5 : 4, background: color, border: square ? '1.5px solid #2F9E57' : undefined }} />
    <span style={{ ...axisText, fontSize: 26, color: theme.colors.textDim }}>{text}</span>
  </div>
);

/** Generic line chart from props. Illustrative data is always badged "Illustratief". */
export const FinancialLineChart: React.FC<{
  points: { label: string; value: number }[];
  progress: number;
  illustrative: boolean;
  title?: string;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
  showAxis?: boolean;
  tone?: 'lime' | 'surface';
}> = ({ points, progress, illustrative, title, width = 900, height = 460, formatValue, showAxis = true, tone = 'lime' }) => {
  const padL = showAxis ? 120 : 10;
  const padB = showAxis ? 50 : 10;
  const w = width - padL - 10;
  const h = height - padB - 20;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = max - min || 1;
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;
  const X = (i: number) => padL + (i / (points.length - 1)) * w;
  const Y = (v: number) => 20 + h - ((v - lo) / (hi - lo)) * h;
  const pts = partial(points.map((p, i) => ({ x: X(i), y: Y(p.value) })), progress * (points.length - 1));
  const color = tone === 'lime' ? theme.colors.lime : theme.colors.surface;
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {title || illustrative ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {title ? <span style={{ fontFamily: theme.fonts.heading, fontWeight: 700, fontSize: 34, color: theme.colors.surface }}>{title}</span> : <span />}
          {illustrative ? <IllustrativeBadge /> : null}
        </div>
      ) : null}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {showAxis
          ? [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((t, i) => (
              <g key={i}>
                <line x1={padL} x2={width - 10} y1={Y(t)} y2={Y(t)} stroke={theme.colors.hairline} strokeWidth={1.5} />
                {formatValue ? (
                  <text x={padL - 16} y={Y(t) + 8} textAnchor="end" style={axisText} fill={theme.colors.textFaint}>
                    {formatValue(t)}
                  </text>
                ) : null}
              </g>
            ))
          : null}
        {showAxis
          ? points.map((p, i) =>
              i % labelEvery === 0 || i === points.length - 1 ? (
                <text key={i} x={X(i)} y={height - 10} textAnchor="middle" style={axisText} fill={theme.colors.textFaint}>
                  {p.label}
                </text>
              ) : null,
            )
          : null}
        {pts.length > 1 ? (
          <path d={pathOf(pts)} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </svg>
    </div>
  );
};

/** Candlesticks from props, staggered growth. Up = positive green, down = red. */
export const CandlestickChart: React.FC<{
  data: { label: string; open: number; high: number; low: number; close: number }[];
  illustrative: boolean;
  title?: string;
  delay?: number;
  width?: number;
  height?: number;
}> = ({ data, illustrative, title, delay = 0, width = 900, height = 520 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lo = Math.min(...data.map((d) => d.low));
  const hi = Math.max(...data.map((d) => d.high));
  const pad = (hi - lo) * 0.08 || 1;
  const Y = (v: number) => 10 + (height - 60) * (1 - (v - (lo - pad)) / (hi - lo + 2 * pad));
  const slot = width / data.length;
  const bodyW = Math.min(46, slot * 0.56);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        {title ? <span style={{ fontFamily: theme.fonts.heading, fontWeight: 700, fontSize: 34, color: theme.colors.surface }}>{title}</span> : <span />}
        {illustrative ? <IllustrativeBadge /> : null}
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={width} y1={10 + (height - 60) * t} y2={10 + (height - 60) * t} stroke={theme.colors.hairline} strokeWidth={1.5} />
        ))}
        {data.map((d, i) => {
          const p = spring({ frame: frame - delay - i * 3, fps, config: theme.spring.snappy });
          const up = d.close >= d.open;
          const color = up ? theme.colors.positive : theme.colors.red;
          const cx = slot * i + slot / 2;
          const mid = (Y(d.open) + Y(d.close)) / 2;
          const s = (y: number) => mid + (y - mid) * p;
          const top = Math.min(Y(d.open), Y(d.close));
          const bh = Math.max(4, Math.abs(Y(d.open) - Y(d.close)));
          return (
            <g key={i} opacity={interpolate(p, [0, 0.3], [0, 1], clamp)}>
              <line x1={cx} x2={cx} y1={s(Y(d.high))} y2={s(Y(d.low))} stroke={color} strokeWidth={4} strokeLinecap="round" />
              <rect x={cx - bodyW / 2} y={s(top)} width={bodyW} height={bh * p} rx={5} fill={color} />
              {i % Math.max(1, Math.ceil(data.length / 6)) === 0 ? (
                <text x={cx} y={height - 12} textAnchor="middle" style={axisText} fill={theme.colors.textFaint}>
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/** Vertical bar comparison; values count up with the bars. */
export const BarComparison: React.FC<{
  items: { label: string; value: number; tone: 'green' | 'lime' | 'surface' | 'red'; sublabel?: string }[];
  format: (v: number) => string;
  delay?: number;
  height?: number;
}> = ({ items, format, delay = 0, height = 600 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = Math.max(...items.map((i) => i.value));
  const toneColor = { green: theme.colors.green, lime: theme.colors.lime, surface: theme.colors.surface, red: theme.colors.red };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 40, height }}>
      {items.map((it, i) => {
        const p = spring({ frame: frame - delay - i * 10, fps, config: { damping: 22, stiffness: 70, mass: 1 } });
        const barH = Math.max(6, (it.value / max) * (height - 170) * p);
        const hero = it.tone === 'lime';
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: 380 }}>
            <span
              style={{
                fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: hero ? 66 : 54, letterSpacing: '-0.03em',
                color: hero ? theme.colors.lime : theme.colors.surface, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                opacity: interpolate(p, [0, 0.2], [0, 1], clamp), textShadow: hero ? `0 0 40px ${theme.colors.limeGlow}` : undefined,
              }}
            >
              {format(it.value * p)}
            </span>
            <div
              style={{
                width: 220, height: barH, borderRadius: '22px 22px 6px 6px', background: toneColor[it.tone],
                border: it.tone === 'green' ? '2px solid #2F9E57' : undefined,
                boxShadow: hero ? `0 0 70px ${theme.colors.limeGlow}` : '0 20px 40px -20px rgba(0,0,0,0.6)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: 96, opacity: interpolate(p, [0, 0.3], [0, 1], clamp) }}>
              <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 32, color: theme.colors.surface }}>{it.label}</span>
              {it.sublabel ? <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 26, color: theme.colors.textDim, whiteSpace: 'nowrap' }}>{it.sublabel}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface PlainSeries {
  label: string;
  points: { x: number; y: number }[];
}

/** Line colours of the plain multi-line chart: hero lime, white, green dashed. Index = series order. */
export const PLAIN_SERIES_STYLE = [
  { color: theme.colors.lime, width: 8, dash: undefined as string | undefined },
  { color: theme.colors.surface, width: 6, dash: undefined as string | undefined },
  { color: theme.colors.positive, width: 6, dash: '16 10' as string | undefined },
] as const;

/** Estimated number of legend lines for the plain chart (greedy wrap), so the caller can reserve space. */
export function plainLegendLines(labels: string[], width = 860): number {
  let lines = 1;
  let used = 0;
  for (const l of labels) {
    const w = 62 + l.length * 15.5 + 34;
    if (used > 0 && used + w > width) {
      lines++;
      used = 0;
    }
    used += w;
  }
  return lines;
}
export const PLAIN_LEGEND_LINE_H = 40;

/**
 * Simple multi-line chart (1 to 3 series, one shared x axis) for the plain 10 s Reels. Three y ticks, three x ticks,
 * min 26 px text, legend below with a line sample per series. All values come from props (finance-engine output).
 * `progress` 0..1 draws the lines from left to right.
 */
export const PlainLineChart: React.FC<{
  series: PlainSeries[];
  progress: number;
  width: number;
  height: number;
  formatY: (v: number) => string;
  xSuffix: string;
}> = ({ series, progress, width, height, formatY, xSuffix }) => {
  const frame = useCurrentFrame();
  const padL = 150;
  const padB = 52;
  const padT = 16;
  const padR = 24;
  const w = width - padL - padR;
  const h = height - padB - padT;
  const xMax = Math.max(...series.flatMap((s) => s.points.map((p) => p.x)));
  const yMax = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.y))));
  const X = (x: number) => padL + (x / xMax) * w;
  const Y = (v: number) => padT + h - (v / yMax) * h;
  const yTicks = [0, yMax / 2, yMax];
  const xTicks = [0, Math.round(xMax / 2), xMax];
  const upto = progress * xMax;
  const drawn = series.map((s) => {
    const pts = s.points.map((p) => ({ x: X(p.x), y: Y(p.y), raw: p.x }));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (pts[i]!.raw <= upto) out.push(pts[i]!);
      else {
        const prev = pts[i - 1];
        if (prev) {
          const t = (upto - prev.raw) / (pts[i]!.raw - prev.raw);
          if (t > 0) out.push({ x: prev.x + (pts[i]!.x - prev.x) * t, y: prev.y + (pts[i]!.y - prev.y) * t });
        }
        break;
      }
    }
    return out;
  });
  const head = drawn[0]![drawn[0]!.length - 1];
  const pulse = 1 + Math.sin(frame / 6) * 0.12;
  const legendLines = plainLegendLines(series.map((s) => s.label), width);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', display: 'block' }}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={Y(t)} y2={Y(t)} stroke={theme.colors.hairline} strokeWidth={1.5} />
            <text x={padL - 16} y={Y(t) + 9} textAnchor="end" style={{ ...axisText, fontSize: 26 }} fill={theme.colors.textDim}>
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={X(t)} y={height - 14} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} style={{ ...axisText, fontSize: 26 }} fill={theme.colors.textDim}>
            {i === xTicks.length - 1 ? `${t} ${xSuffix}` : t}
          </text>
        ))}
        {[...drawn].map((pts, i) => ({ pts, i })).reverse().map(({ pts, i }) => {
          const st = PLAIN_SERIES_STYLE[i]!;
          return pts.length > 1 ? <path key={i} d={pathOf(pts)} fill="none" stroke={st.color} strokeWidth={st.width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={st.dash} style={i === 0 ? { filter: `drop-shadow(0 0 14px ${theme.colors.limeGlow})` } : undefined} /> : null;
        })}
        {head ? <circle cx={head.x} cy={head.y} r={13 * pulse} fill={theme.colors.lime} /> : null}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 34, rowGap: 2, minHeight: legendLines * PLAIN_LEGEND_LINE_H, paddingLeft: 10 }}>
        {series.map((s, i) => {
          const st = PLAIN_SERIES_STYLE[i]!;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, height: PLAIN_LEGEND_LINE_H }}>
              <svg width={48} height={14}>
                <line x1={2} x2={46} y1={7} y2={7} stroke={st.color} strokeWidth={st.width - 1} strokeLinecap="round" strokeDasharray={st.dash} />
              </svg>
              <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 28, color: theme.colors.surface, whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
