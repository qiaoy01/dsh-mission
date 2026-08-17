# [Plugin] dsh-mission — a long-horizon autonomous mission runtime for DeepSeek Harness

**TL;DR**: a persistent, cross-session, independently verifiable mission runtime for dsh.
The model proposes (`mission_create` / `mission_plan`), the runtime drives
(claim → real subagent → report → verify → commit), and **workers cannot self-certify**.
Install in one line: `dsh plugin --profile web add @qiaoy01/mission`

---

## Why

dsh handles single-session work brilliantly, but a goal that takes days — build a
whole game, migrate a codebase, ship a feature end to end — has no first-class
runtime. goal tracks one objective, workflow is one-shot, schedule is pure time,
subagent is just the execution unit. Nothing ties them together with **independent
verification** and **crash recovery**.

## What it adds

- **Dependency DAG** — tasks become READY only when upstream tasks are DONE;
- **Independent verification** — `task/report` is a declaration; `task/verify`
  aligns it with real environment feedback. Executors cannot mark their own work done;
- **Replan on failure** — a stuck mission gets a new revision while DONE tasks
  with unchanged specs carry over (days of work are never wasted);
- **Lease ownership + crash recovery** — claims carry tokens and expiries; expired
  unreported claims are reclaimed and redone, with an in-flight guard that prevents
  duplicate dispatch.

## Evidence from a real run

I drove a 7-task DAG (a browser RPG demo: data structures → battle engine + UI +
state/save → integration → self-test → polish) end to end:

- **~80 minutes**, one real subagent per task;
- every task went `claimed → reported → verified(passed=true)` — no self-certification;
- **zero failures, zero duplicate dispatch** (we even caught and fixed a duplicate-
  dispatch bug live, see the README story).

## Links

- Repo (topic `dsh-plugin`): https://github.com/qiaoy01/dsh-mission
- npm: https://www.npmjs.com/package/@qiaoy01/mission
- Design: https://github.com/qiaoy01/dsh-mission/blob/main/docs/design.md
- Mechanism survey (why it doesn't duplicate goal/workflow/schedule):
  https://github.com/qiaoy01/dsh-mission/blob/main/docs/research.md

## Ask

Feedback is very welcome — especially on the driver-host design, the verification
semantics, and whether this direction fits the ecosystem. And if the project opens
up to external PRs later, I'd be glad to contribute it officially.

---

**中文简介**: 为 DeepSeek Harness 写的长程自主 mission 运行时插件。模型提议(创建/规划),
运行时驱动(认领 → 真实子代理 → 声明 → 独立验证 → 提交),执行者不能自证完成。
实测一个 7 任务依赖图约 80 分钟自主跑完,零失败零重复派发。欢迎反馈与讨论:
`dsh plugin --profile web add @qiaoy01/mission`
