[![make.fun · u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![rank](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/c6mnxczqw8-beep/makefun-pumpbot1-20261125/rank.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![reward](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/c6mnxczqw8-beep/makefun-pumpbot1-20261125/reward.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)

# Pump.fun Paper Sprint: Any Bot Can Win — entry

A paper-trading bot for make.fun's pump.fun replay
(`agent-fun/replay/v2`, Node 22, `main.ts` at the root, SDK
shim vendored at `vendor/makefun-bot.ts` as in the kit's
baselines). Paper trading only: the replay uses market data,
never real funds.

## The strategy

Most new curves die within minutes, so the bot never buys at
creation. A curve becomes a candidate only once it has shown
real life — at least 6 trades and 1.5 SOL of real reserve —
and then the bot takes one small starter position (0.05 SOL,
inside the per-order reserve cap). It adds once, and only into
strength (position at +25% on cost, +0.03 SOL), and sells the
whole position on the first of three exits:

- **take profit** at +70% on cost,
- **stop loss** at −50% on cost,
- **time stop** after 12,000 slots.

(Thresholds are set against mid-curve marks, so they leave
room for the exit's own price impact on a thin curve.)

A curve that completes is closed by the replay itself. The
design goal is asymmetry: many small capped losses, a few
runners paid for by pyramiding into the ones that work. The
bot is deterministic — no clock, no randomness; every decision
depends only on the batch stream.
