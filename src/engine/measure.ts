// Deterministic measure stage — "tools measure, the model classifies".
// Simplified port of the desk's measureTape: zigzag swings on an ATR band,
// working range, Fib of the range. No vision, no model calls — same law.

export type Bar = { t: string; time: number; o: number; h: number; l: number; c: number };

export type Swing = { n: number; t: string; time: number; price: number; anchor: "high" | "low" };

export type MeasurePacket = {
  symbol: string;
  timeframe: string;
  bars: Bar[];
  swings: Swing[];
  range: { high: number; low: number; highT: string; lowT: string };
  last: { t: string; c: number };
};

export function parseCsv(text: string): Bar[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows = lines.filter(l => !/^t(ime)?,/i.test(l.trim()));
  const bars: Bar[] = [];
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(",");
    if (!t || o === undefined) continue;
    const time = Date.parse(t);
    if (Number.isNaN(time)) continue;
    const bar = { t, time, o: +o, h: +h, l: +l, c: +c };
    if ([bar.o, bar.h, bar.l, bar.c].some(v => !Number.isFinite(v))) continue;
    bars.push(bar);
  }
  return bars.sort((a, b) => a.time - b.time);
}

function atr(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 1;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1], b = bars[i];
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c)));
  }
  // Wilder smoothing
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / Math.min(period, trs.length);
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a > 0 ? a : 1;
}

/** Zigzag: a pivot confirms when price reverses from the running extreme by k × ATR. */
export function measure(bars: Bar[], k = 3.5, symbol = "", timeframe = ""): MeasurePacket {
  if (bars.length < 20) throw new Error("need ≥ 20 bars");
  const band = k * atr(bars);

  const swings: Swing[] = [];
  let dir: 1 | -1 = bars[1].c >= bars[0].c ? 1 : -1;
  let ext = bars[0]; // running extreme bar
  for (const b of bars.slice(1)) {
    if (dir === 1) {
      if (b.h > ext.h) ext = b;
      else if (ext.h - b.l >= band) {
        swings.push({ n: 0, t: ext.t, time: ext.time, price: ext.h, anchor: "high" });
        dir = -1; ext = b;
      }
    } else {
      if (b.l < ext.l) ext = b;
      else if (b.h - ext.l >= band) {
        swings.push({ n: 0, t: ext.t, time: ext.time, price: ext.l, anchor: "low" });
        dir = 1; ext = b;
      }
    }
  }
  // the in-progress extreme is the provisional last swing
  swings.push(dir === 1
    ? { n: 0, t: ext.t, time: ext.time, price: ext.h, anchor: "high" }
    : { n: 0, t: ext.t, time: ext.time, price: ext.l, anchor: "low" });
  swings.forEach((s, i) => (s.n = i + 1));

  let hi = bars[0], lo = bars[0];
  for (const b of bars) { if (b.h > hi.h) hi = b; if (b.l < lo.l) lo = b; }
  const lastBar = bars[bars.length - 1];

  return {
    symbol, timeframe, bars, swings,
    range: { high: hi.h, low: lo.l, highT: hi.t, lowT: lo.t },
    last: { t: lastBar.t, c: lastBar.c },
  };
}

/** Numbered swings + range Fib — the deterministic facts the model classifies from. */
export function renderFacts(p: MeasurePacket, maxSwings = 15): string {
  const span = p.range.high - p.range.low || 1;
  const lines: string[] = [];
  const shown = p.swings.slice(-maxSwings);
  const omitted = p.swings.length - shown.length;
  lines.push(`${p.symbol} ${p.timeframe} — ${p.bars.length} bars. Deterministic zigzag swings (showing last ${shown.length}${omitted ? `, ${omitted} earlier omitted` : ""}):`);
  for (const s of shown) {
    const retrace = ((p.range.high - s.price) / span * 100).toFixed(0);
    lines.push(`[${s.n}] ${s.t} ${s.anchor} ${trim(s.price)} (range retrace ${retrace}%)`);
  }
  lines.push(`Working range: high ${trim(p.range.high)} (${p.range.highT}) · low ${trim(p.range.low)} (${p.range.lowT}).`);
  lines.push(`Fib of range: 0.236 ${trim(p.range.high - span * 0.236)} · 0.382 ${trim(p.range.high - span * 0.382)} · 0.5 ${trim(p.range.high - span * 0.5)} · 0.618 ${trim(p.range.high - span * 0.618)} · 0.786 ${trim(p.range.high - span * 0.786)}.`);
  lines.push(`Last bar ${p.last.t} close ${trim(p.last.c)}.`);
  return lines.join("\n");
}

function trim(n: number): string {
  return Math.abs(n) >= 100 ? n.toFixed(1) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toPrecision(4);
}
