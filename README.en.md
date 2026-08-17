# dsh-mission

> **A long-horizon autonomous mission runtime for DeepSeek Harness** — lets an
> agent drive a long-term objective over days: a cross-session, independently
> verifiable, replan-on-failure, crash-recoverable autonomous control loop.
> The dependency DAG is one of its driving mechanisms, not the runtime itself.

English | [中文](README.md)

## What it is

`dsh-mission` is a **pure-TypeScript cordis plugin** for DeepSeek Harness that
provides the long-horizon autonomous mission runtime dsh lacks: a durable,
verifiable, crash-recoverable control loop that breaks a long-term objective
into a dependency DAG of tasks and advances it autonomously — instead of
finishing everything in one conversation.

Core principle: **agents propose, the environment adjudicates, the runtime commits.**

- Agent plans, executions, and claims are **never authoritative**;
- For every work item: `task/report` is a **declaration** about the environment
  (not authoritative); `task/verify` independently **aligns** the declaration
  with environment feedback (authoritative);
- **Workers cannot self-certify** — only state changes that pass deterministic
  validation and commit atomically as a single session event are authoritative.

## Why dsh needs it

| What dsh already has | What dsh-mission adds |
|---|---|
| goal (single-objective ledger, caller self-certifies) | **Dependency DAG + derived readiness/blocked**, failed branches replan while **DONE work is preserved** |
| workflow (one-shot fan-out scripts) | **Durable, resumable, cross-session task state machine** |
| schedule (pure time triggers) | **Dependency triggers** (upstream DONE → downstream READY) |
| subagent (execution unit) | **Independent verification** — workers cannot self-certify, `report` ≠ `verify` |
| — | **Lease ownership + lazy reclamation + crash recovery** |

## Features

- **Event-sourced persistence**: `mission/*` session events; one event = one
  atomic commit; no separate database;
- **Version guard**: `revision` CAS (mirrors dsh-goal's `GoalRef` pattern);
- **Autonomous driver host** (`mission-driver`): listens to `mission/changed`
  and runs claim → subagent execute → report → verify → commit automatically;
- **Lazy lease reclamation**: an expired, unreported claim can be reclaimed and
  redone; an **in-flight task guard** prevents duplicate dispatch;
- **Replan on failure**: a stuck mission gets a new revision while DONE tasks
  with unchanged specs carry over;
- **Optional model strategies**: `llmDecider` (pick the next task) /
  `llmReplanner` (replan) / `userApprovalGate` (approval gate);
- **UI data plane**: a `mission` session-projection unit;
- **Tolerant companion**: `mission-invariant` registers its audit whenever the
  `invariants` service exists, and is a no-op otherwise (production profiles
  load without extra configuration).

## Event vocabulary (`mission/*`)

| Event | Meaning |
|---|---|
| `mission/created` | Create a mission |
| `mission/plan-committed` | Commit a full plan snapshot (revision +1; DONE tasks with unchanged specs carry over) |
| `mission/task-claimed` | Claim a task with a lease |
| `mission/task-reported` | The agent's **declaration** about the environment (never DONE by itself) |
| `mission/task-verified` | Independently align the declaration with environment feedback → DONE/FAILED |
| `mission/cancelled` | Explicit cancellation |

States: mission `CREATED / RUNNING / COMPLETED / FAILED / CANCELLED`;
tasks `PENDING / CLAIMED / DONE / FAILED` + derived `READY / BLOCKED`.

## Install & use

```bash
# Install from npm (published; inserts a 5-row bundle patch into the composition)
dsh plugin --profile <name> add @qiaoy01/mission

# Or install from source
dsh plugin --profile <name> add file:path/to/dsh-mission

# In a session, the agent drives the mission through three model tools:
#   mission_create   — create a mission
#   mission_plan     — commit a task DAG (revision must equal current + 1)
#   mission_status   — read the current state
```

After the model commits a plan, **the runtime takes over**: `mission-driver`
claims tasks, dispatches real subagents, and verifies independently. The model
should not execute tasks itself.

Defaults are conservative (deterministic task selection, no automatic replan —
zero model cost). Enable model strategies via the profile row config:

```yaml
- id: mission-driver
  config:
    decider: llm     # the model picks the next task
    replan: true     # the model replans when the mission is stuck
```

## Build & test

```bash
cd packages/mission/mission
npm run build          # auto-discovers a local tsc; typecheck + emit to lib/
# Five test suites, all run in isolation:
node --experimental-strip-types tests/domain.test.mjs    # pure domain model
node tests/service.test.mjs                               # runtime (real cordis/session/agent)
node tests/driver.test.mjs                                # driver loop (mock executor)
node tests/driver-host.test.mjs                           # driver host (stubbed subagents)
node --experimental-strip-types tests/projection.test.mjs # session-projection unit
```

## Status

- Stage A (domain model) ✅ · Stage B (service + tools + companion) ✅ ·
  Stage C (driver loop) ✅ · Stage D (replan / lease reclamation / model
  decisions / approval gate) ✅ · Stage E (projection ✅, browser UI pending);
- **Verified in a real composition**: a 7-task DAG driven end-to-end by real
  subagents to COMPLETED, every task independently verified, zero failures and
  zero duplicate dispatches;
- Design details: [`docs/design.md`](docs/design.md); dsh mechanism survey and
  deduplication rationale: [`docs/research.md`](docs/research.md).

## License

MIT — see [LICENSE](LICENSE).
