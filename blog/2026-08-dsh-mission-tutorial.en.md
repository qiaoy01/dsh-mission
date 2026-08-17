# Long-Horizon Missions in DeepSeek Harness: How dsh-mission Drove a 7-Task Build Autonomously

> One conversation can't finish a goal that takes days. This post shows how the
> open-source plugin **dsh-mission** made an agent autonomously complete a
> 7-task dependency DAG in DeepSeek Harness — 80 minutes, real subagents, every
> task independently verified, zero failures and zero duplicate dispatch.
> The core idea fits in one sentence:
> **agents propose, the environment adjudicates, the runtime commits.**

## The problem: the boundary of a single conversation

In DeepSeek Harness, "build a small game" usually means the agent writes the whole
thing inside one session. Once the goal spans days — design data structures, write
a battle engine, build UI, self-test, polish — a single conversation hits a wall:
context blows up, failures have no recovery, and **the agent claims it's done,
but nothing independently verifies that claim**.

The existing dsh modules each cover one slice:

| Module | Covers | Missing |
|---|---|---|
| goal | single-objective ledger | no task dependencies, no independent verification, self-certified |
| workflow | one-shot fan-out scripts | not durable, not resumable |
| schedule | pure time triggers | no dependency triggers |
| subagent | task execution unit | who verifies the result? |

What's missing is a whole **long-horizon autonomous mission runtime**: cross-session,
verifiable, replan-on-failure, crash-recoverable. That's dsh-mission.

## Core principle: agents propose, the environment adjudicates, the runtime commits

- **Agents propose**: use `mission_create` / `mission_plan` to create a mission and
  commit a dependency DAG of tasks;
- **The environment adjudicates**: each task runs as a **real subagent** acting on
  the environment (working tree / saves), leaving its output there;
- **The runtime commits**: `task/report` is the agent's **declaration** about the
  environment (not authoritative); `task/verify` independently **aligns** that
  declaration with environment feedback (authoritative). **Workers cannot
  self-certify** — only state changes that pass deterministic validation and
  commit atomically as a single session event are authoritative.

## 30-second quick start

```bash
# 1. Install (published on npm)
dsh plugin --profile web add @qiaoy01/mission

# 2. In a session, tell the agent:
#    "mission: build a small web game. Use mission_create, then mission_plan,
#     then stop — the runtime will execute the tasks."
```

The model creates and plans; `mission-driver` takes over from there: it claims
tasks, dispatches real subagents, collects declarations, verifies independently,
and commits. **The model should not execute tasks itself.**

## How it works: event sourcing + a driver loop

**Persistence**: mission state *is* the `mission/*` session event stream
(created / plan-committed / task-claimed / task-reported / task-verified /
cancelled) — one event per atomic commit, no separate database. A crash is
recovered by replaying the event stream.

**The driver loop**:
```
read (fold the event stream) → decide (pick a READY task) → claim (lease)
→ subagent executes → report (declaration) → verify (independent alignment)
→ commit → repeat
```

A few key designs:

- **Dependency DAG**: `plan-committed` carries dependencies; a task becomes
  READY only when its upstream tasks are DONE, and BLOCKED when an upstream FAILED;
- **Lease ownership**: claiming takes a token + expiry; an expired, unreported
  claim can be reclaimed and redone (crash recovery) — while an **in-flight task
  guard** guarantees a task is never dispatched twice;
- **Replan on failure**: a stuck mission gets a new revision while **DONE tasks
  with unchanged specs carry over** — days of work are never wasted, only the
  failed branch is reworked;
- **Pluggable strategies**: deterministic by default (zero model cost), or
  model-driven (`decider: llm`), model replan (`replan: true`), and a human
  approval gate.

## The proof: a 7-task DAG driven to completion

I asked the model to plan a "Raid-like web RPG demo" — 7 tasks, 8 dependencies:

```
data-structures
  ├─ battle-engine (turn-based combat)
  ├─ html-css-shell (UI shell)
  └─ state-save (state & local save)
       └─ ui-integration
            └─ self-test
                 └─ polish-report
```

The results (all from real session logs):

- **~80 minutes total** (11:48 → 13:08), one real subagent per task;
- Every task went through `claimed → reported → verified(passed=true)` —
  **independently verified, no self-certification**;
- The DAG advanced strictly in order — no downstream task ever became READY
  before its dependencies finished;
- **Zero failures, zero duplicate dispatch**;
- A real, runnable deliverable: a web game with hero/skill/equipment/level/
  gacha data, combat engine, UI, and local saves.

The real run also surfaced two genuine bugs worth sharing: an expired lease
during a long subagent run caused **duplicate dispatch** (fixed with the
in-flight guard), and models don't proactively reach for the mission tools
without an explicit `mission:` prefix — **tool discoverability matters**, name
the tools in your prompt.

## Going further

```yaml
# Enable model strategies via the mission-driver row config
- id: mission-driver
  config:
    decider: llm     # the model picks the next task
    replan: true     # the model replans when the mission is stuck
```

Also available: `userApprovalGate` (human approval before a replan), a `mission`
session-projection unit (UI data plane), and a tolerant invariant companion
(production profiles load with zero extra configuration).

## Resources

- Repo: [github.com/qiaoy01/dsh-mission](https://github.com/qiaoy01/dsh-mission) (topic: dsh-plugin)
- npm: [@qiaoy01/mission](https://www.npmjs.com/package/@qiaoy01/mission)
- Install: `dsh plugin add @qiaoy01/mission`
- Design: [docs/design.md](https://github.com/qiaoy01/dsh-mission/blob/main/docs/design.md)
- Mechanism survey: [docs/research.md](https://github.com/qiaoy01/dsh-mission/blob/main/docs/research.md)

---

*If you're running long tasks in DeepSeek Harness too, come discuss it in the
GitHub Discussions, or open an issue on the repo.*
