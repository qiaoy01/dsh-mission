# [Plugin] dsh-mission — DeepSeek Harness 长程自主 mission 运行时 / a long-horizon autonomous mission runtime

---

## English

**TL;DR**: a persistent, cross-session, independently verifiable mission runtime for dsh.
The model proposes (`mission_create` / `mission_plan`), the runtime drives
(claim → real subagent → report → verify → commit), and **workers cannot self-certify**.
Install in one line: `dsh plugin --profile web add @qiaoy01/mission`

### Why

dsh handles single-session work brilliantly, but a goal that takes days — build a
whole game, migrate a codebase, ship a feature end to end — has no first-class
runtime. goal tracks one objective, workflow is one-shot, schedule is pure time,
subagent is just the execution unit. Nothing ties them together with **independent
verification** and **crash recovery**.

### What it adds

- **Dependency DAG** — tasks become READY only when upstream tasks are DONE;
- **Independent verification** — `task/report` is a declaration; `task/verify`
  aligns it with real environment feedback. Executors cannot mark their own work done;
- **Replan on failure** — a stuck mission gets a new revision while DONE tasks
  with unchanged specs carry over (days of work are never wasted);
- **Lease ownership + crash recovery** — claims carry tokens and expiries; expired
  unreported claims are reclaimed and redone, with an in-flight guard that prevents
  duplicate dispatch.

### Evidence from a real run

A 7-task DAG (a browser RPG demo: data structures → battle engine + UI + state/save →
integration → self-test → polish) ran end to end:

- **~80 minutes**, one real subagent per task;
- every task went `claimed → reported → verified(passed=true)` — no self-certification;
- **zero failures, zero duplicate dispatch** (we even caught and fixed a duplicate-
  dispatch bug live — see the README story).

### Links

- Repo (topic `dsh-plugin`): https://github.com/qiaoy01/dsh-mission
- npm: https://www.npmjs.com/package/@qiaoy01/mission
- Design: https://github.com/qiaoy01/dsh-mission/blob/main/docs/design.md
- Mechanism survey (why it doesn't duplicate goal/workflow/schedule):
  https://github.com/qiaoy01/dsh-mission/blob/main/docs/research.md

### Ask

Feedback is very welcome — especially on the driver-host design, the verification
semantics, and whether this direction fits the ecosystem. If the project opens up
to external PRs later, I'd be glad to contribute it officially.

---

## 中文

**一句话**:为 DeepSeek Harness 写的**长程自主 mission 运行时**插件——持久、跨会话、可独立验证。
模型提议(`mission_create` / `mission_plan`),运行时驱动(认领 → 真实子代理 → 声明 → 验证 → 提交),
**执行者不能自证完成**。一条命令安装:`dsh plugin --profile web add @qiaoy01/mission`

### 为什么

dsh 处理单次会话的工作很出色,但**需要多日完成的目标**(做一个完整游戏、迁移整个代码库、端到端
交付一个功能)缺少一等公民的运行时:goal 只记单一目标,workflow 是一次性脚本,schedule 只是纯时间
触发,subagent 只是执行单元——没有东西把它们和**独立验证**、**崩溃恢复**串起来。

### 它提供了什么

- **依赖 DAG** —— 上游任务 DONE 后,下游任务才派生 READY;
- **独立验证** —— `task/report` 是对环境的**声明**;`task/verify` 独立地把声明与真实环境反馈
  **对齐**。执行者不能给自己的任务打"完成";
- **失败重规划** —— mission 卡死时产出新 revision,**已 DONE 且规格不变的任务跨 revision 保留**
  (多日成果不白费);
- **lease 所有权 + 崩溃恢复** —— 认领带令牌与过期时间;过期且无声明的任务可回收重做,并有
  **在飞任务守卫**杜绝重复派发。

### 真实运行的证据

一个 7 任务依赖图(浏览器 RPG demo:数据结构 → 战斗引擎 + 界面 + 存档 → 整合 → 自测 → 打磨)
端到端跑完:

- **约 80 分钟**,每个任务一个真实子代理;
- 每个任务都走 `claimed → reported → verified(passed=true)`——无自证;
- **零失败、零重复派发**(过程中还现场抓到并修复了一个重复派发 bug,详见 README 故事)。

### 链接

- 仓库(topic `dsh-plugin`):https://github.com/qiaoy01/dsh-mission
- npm:https://www.npmjs.com/package/@qiaoy01/mission
- 设计文档:https://github.com/qiaoy01/dsh-mission/blob/main/docs/design.md
- 机制调研(为什么不重复造 goal/workflow/schedule 的轮子):
  https://github.com/qiaoy01/dsh-mission/blob/main/docs/research.md

### 请求反馈

非常欢迎任何反馈——特别是 driver-host 的设计、验证语义,以及这个方向是否符合生态。
如果官方以后开放外部 PR,我很乐意把它正式贡献进去。

---

*安装体验、使用问题、改进建议,都欢迎在评论里讨论。*
