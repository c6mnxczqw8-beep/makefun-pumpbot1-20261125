// Kinako paper-trading bot for the pump.fun replay (agent-fun/replay/v2).
//
// Strategy in one paragraph: most new curves die within minutes, so this bot
// never buys at creation. A curve becomes a candidate only once it has shown
// real life -- several trades and a real SOL reserve worth trading against --
// and then the bot takes one small starter position. It adds once, and only
// into strength (position up 25% on cost), and it sells the whole position on
// the first of three exits: take profit at +80% on cost, stop loss at -45%,
// or a time stop after 12,000 slots. A curve that completes is closed by the
// replay itself. The point is asymmetry: many small, capped losses; a few
// runners paid for by pyramiding into the ones that work.
//
// Deterministic: no clock, no randomness; decisions depend only on the batch
// stream. Layout follows the kit's baselines: main.ts at the root, the SDK
// shim vendored beside it (vendor/makefun-bot.ts, a copy of sdk/ts).

import { LAMPORTS_PER_SOL, runBot, type OrderInput } from './vendor/makefun-bot.ts';

const MIN_TRADES = 6;
const MIN_REAL_LAMPORTS = (LAMPORTS_PER_SOL * 3n) / 2n; // 1.5 SOL of real reserve
const MIN_BUY_LAMPORTS = LAMPORTS_PER_SOL / 200n; // 0.005 SOL
const STAKE_LAMPORTS = LAMPORTS_PER_SOL / 20n; // 0.05 SOL starter
const ADD_LAMPORTS = (LAMPORTS_PER_SOL * 3n) / 100n; // 0.03 SOL pyramid add
const MAX_SLIPPAGE_BPS = 10_000;
// Exits, as multiples of cost in percent: sell at >= 170% (take profit),
// <= 50% (stop loss), or after TIMEOUT_SLOTS whatever the price. The marks
// are mid-curve values, so the thresholds leave room for the price impact
// of the exit itself on a thin curve.
const TAKE_PROFIT_PCT = 170n;
const STOP_LOSS_PCT = 50n;
const PYRAMID_AT_PCT = 125n;
const TIMEOUT_SLOTS = 12_000;

/** Mints created and not yet given a starter decision. */
const watch = new Set<string>();
/** Slot at which each held mint was first bought. */
const boughtSlot = new Map<string, number>();
/** Mints that already used their one pyramid add. */
const pyramided = new Set<string>();

/** Current mark-to-market value of a holding, in lamports (0 when unknown). */
function valueOf(state: any, mint: string): bigint {
  const h = state.positions.get(mint);
  const c = state.curves.get(mint);
  if (h === undefined || c === undefined || c.virtual_token_reserves === 0n) return 0n;
  return (h.token_amount * c.virtual_quote_reserves) / c.virtual_token_reserves;
}

await runBot({
  onBatch(state, batch) {
    const { caps } = state.hello;
    const tx = state.txFeeLamports();
    let free = state.freeCashLamports();
    const orders: OrderInput[] = [];

    for (const e of batch.events) {
      if (e.event === 'CreateEvent') watch.add(e.mint);
    }

    // --- exits and pyramid adds on held positions -------------------------
    for (const [mint, h] of state.positions) {
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      const value = valueOf(state, mint);
      const cost = h.cost_lamports;
      if (cost === 0n) continue;
      const pct = (value * 100n) / cost;
      const age = boughtSlot.has(mint) ? state.slot - boughtSlot.get(mint)! : 0;
      if (pct >= TAKE_PROFIT_PCT || pct <= STOP_LOSS_PCT || age > TIMEOUT_SLOTS) {
        orders.push({ side: 'sell', mint, token_amount: h.token_amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
        boughtSlot.delete(mint);
        pyramided.delete(mint);
        continue;
      }
      if (pct >= PYRAMID_AT_PCT && !pyramided.has(mint)) {
        const cap = state.maxBuyLamports(mint);
        const amount = cap < ADD_LAMPORTS ? cap : ADD_LAMPORTS;
        if (amount >= MIN_BUY_LAMPORTS && free >= amount + tx && orders.length < caps.max_orders_per_batch) {
          orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
          free -= amount + tx;
          pyramided.add(mint);
        }
      }
    }

    // --- starter buys on watched curves that have shown life --------------
    let slots = caps.max_open_positions - state.committedPositionCount();
    for (const mint of watch) {
      if (orders.length >= caps.max_orders_per_batch || slots <= 0) break;
      if (state.positions.has(mint)) { watch.delete(mint); continue; }
      const curve = state.curves.get(mint);
      if (curve === undefined) continue;
      if (curve.complete) { watch.delete(mint); continue; }
      if (curve.trades < MIN_TRADES || curve.real_quote_reserves < MIN_REAL_LAMPORTS) continue;
      const cap = state.maxBuyLamports(mint);
      if (cap < MIN_BUY_LAMPORTS) continue;
      watch.delete(mint); // decided: one starter per mint, win or lose
      const amount = cap < STAKE_LAMPORTS ? cap : STAKE_LAMPORTS;
      if (free < amount + tx) continue;
      orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
      free -= amount + tx;
      slots -= 1;
      boughtSlot.set(mint, state.slot);
    }

    return orders;
  },
});
