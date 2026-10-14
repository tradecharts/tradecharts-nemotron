// wavecount live demo: the same engine as the CLI, behind a small page.
// Measure (code) → Nemotron 3 Nano on Nebius Token Factory (model) → 35-rule gate (code).
// The Token Factory key is a Worker secret; runs are rate-limited and capped per day.

import { DurableObject } from "cloudflare:workers";
import { parseCsv, measure, type MeasurePacket } from "../../src/engine/measure.js";
import { runPipeline } from "../../src/engine/pipeline.js";
import { nebiusProvider } from "../../src/provider/nebius.js";
import btc from "../../examples/btc-usd-1w.csv";
import eth from "../../examples/eth-usd-1w.csv";
import bnb from "../../examples/bnb-usd-1w.csv";
import sol from "../../examples/sol-usd-1w.csv";
import doge from "../../examples/doge-usd-1w.csv";

interface Env {
  NEBIUS_API_KEY: string;
  MAX_RUNS_PER_DAY: string;
  ASSETS: Fetcher;
  RUN_LIMIT: RateLimit;
  GLOBAL_LIMIT: RateLimit;
  BUDGET: DurableObjectNamespace<RunBudget>;
}

/** One global counter: live runs per UTC day, so the Token Factory spend has a hard ceiling. */
export class RunBudget extends DurableObject<Env> {
  async take(day: string, max: number): Promise<boolean> {
    const key = `runs:${day}`;
    const used = (await this.ctx.storage.get<number>(key)) ?? 0;
    if (used >= max) return false;
    await this.ctx.storage.put(key, used + 1);
    return true;
  }
}

const TAPES: Record<string, { symbol: string; csv: string }> = {
  btc: { symbol: "BTC-USD", csv: btc },
  eth: { symbol: "ETH-USD", csv: eth },
  bnb: { symbol: "BNB-USD", csv: bnb },
  sol: { symbol: "SOL-USD", csv: sol },
  doge: { symbol: "DOGE-USD", csv: doge },
};

const packets = new Map<string, MeasurePacket>();
function packet(id: string): MeasurePacket {
  let p = packets.get(id);
  if (!p) {
    const t = TAPES[id];
    p = measure(parseCsv(t.csv), undefined, t.symbol, "1W");
    packets.set(id, p);
  }
  return p;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/tapes" && request.method === "GET") {
      const tapes = Object.keys(TAPES).map((id) => {
        const p = packet(id);
        return {
          id, symbol: p.symbol, timeframe: p.timeframe,
          bars: p.bars.map((b) => [b.time, b.c]),
          swings: p.swings.map((s) => ({ n: s.n, time: s.time, price: s.price, anchor: s.anchor })),
          range: p.range,
        };
      });
      return new Response(JSON.stringify({ tapes }), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
      });
    }

    if (url.pathname === "/api/run" && request.method === "POST") {
      const id = url.searchParams.get("tape") ?? "";
      if (!TAPES[id]) return json({ error: "unknown tape" }, 400);
      if (!env.NEBIUS_API_KEY) return json({ error: "demo is not configured" }, 503);

      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (!(await env.RUN_LIMIT.limit({ key: `ip:${ip}` })).success) {
        return json({ error: "Two live runs a minute per visitor. Try again in a minute." }, 429);
      }
      if (!(await env.GLOBAL_LIMIT.limit({ key: "all" })).success) {
        return json({ error: "The demo is busy right now. Try again in a minute." }, 429);
      }
      const day = new Date().toISOString().slice(0, 10);
      const max = Number(env.MAX_RUNS_PER_DAY) || 150;
      if (!(await env.BUDGET.get(env.BUDGET.idFromName("global")).take(day, max))) {
        return json({ error: "Today's live-run budget is used up. Watch the video, or run the CLI with your own key." }, 429);
      }

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
      const ping = setInterval(() => writer.write(enc.encode(": ping\n\n")).catch(() => {}), 15_000);

      const work = (async () => {
        const p = packet(id);
        const started = Date.now();
        try {
          await send("trace", { line: `measured ${p.bars.length} bars → ${p.swings.length} swings (deterministic, no model)` });
          const provider = nebiusProvider(env.NEBIUS_API_KEY);
          const v = await runPipeline(provider, p, { samples: 2, trace: (line) => void send("trace", { line }) });
          const pr = v.proposal;
          await send("verdict", {
            severity: pr?.status === "unresolved" ? "abstain" : v.severity,
            reasonClass: v.reasonClass,
            violations: v.violations,
            model: v.model,
            provider: v.provider,
            seconds: Math.round((Date.now() - started) / 1000),
            proposal: pr ? {
              pattern: pr.pattern, degree: pr.degree, reason: pr.reason, status: pr.status,
              origin: pr.origin, pivots: pr.pivots,
            } : null,
          });
          console.log(JSON.stringify({ event: "run", tape: id, severity: v.severity, seconds: Math.round((Date.now() - started) / 1000) }));
        } catch (e) {
          await send("error", { message: `Token Factory unavailable: ${String((e as Error).message).slice(0, 120)}` });
          console.log(JSON.stringify({ event: "run_error", tape: id, message: String((e as Error).message).slice(0, 200) }));
        } finally {
          clearInterval(ping);
          await writer.close().catch(() => {});
        }
      })();
      ctx.waitUntil(work);

      return new Response(readable, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
      });
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
