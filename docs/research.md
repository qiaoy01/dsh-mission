# dsh-mission — dsh 机制调研与去重结论

> 本文是 dsh-mission 设计前的事实基座:通读 deepseek-harness 源码与生成的子系统文档,
> 精确记录 dsh 已有的机制与模块,并给出"复用 / 不重复 / 独特增量"的结论。
> 命名与设计落点见 `docs/design.md`。

## 1. 持久化机制(事件溯源)——结论:dsh-mission 完全复用,不重建

会话日志是唯一真相源。机制分四层,全部可直接复用:

### 1.1 SessionEventMap 声明合并

`SessionEventMap` 是 merge-extensible 的 map,插件用 declaration merging 扩展:

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'mission/created': MissionCreatedMeta   // 示例:新增一个持久事件
  }
}
```

- 事件信封 `SessionEvent` = `{ type, seq, time, data, ignorable?, surfaceOp?, sourceEventSeqs? }`。
- `type` 是判别联合,`switch (event.type)` 自动窄化 `event.data`,无 cast。
- 非 surface 事件(`user/message`/`assistant/message`/`tool/result` 之外)是 log-only,
  不进入模型历史,是领域状态的正确落点(goal/schedule 都如此)。
- `ignorable: true` 表示"未知类型可安全跳过";缺省 = required,未知必需类型会拒绝重建日志。
- 当前事件词汇全集见 `docs/persistence-catalog.md`(44 个事件:`goal/change`、`schedule/change`、
  `plan/mode`、`subagent/descriptor`、`tool-workflow/*` 等)。**`mission/*` 命名空间空闲,无冲突。**

### 1.2 追加 API 与原子性

- 内存层:`Session.append(type, data)` 在编译期强制 JSON-serializable + surface 元数据规则。
- 持久层:`ctx.sessionPersistence.append(id, events)` 是 append-only + 连续 seq 契约,
  **resolve 即已落盘**;后端 JSONL / SQLite 互换,同一抽象。
- **持久层没有条件追加 / CAS 原语**。原子提交 = "单事件携带完整快照",
  "乐观并发 / 版本守卫"是**领域服务层**用 revision ref 实现的(见 1.3)。
- 崩溃恢复:中断的 turn 用合成 `turn/end { reason: {kind:'interrupted'} }` 闭合,从不截断。

### 1.3 版本守卫 / CAS —— 是 `GoalRef` 服务层模式,不是持久化原语

goal 的权威实现(`packages/goal/goal/src/index.ts`、`types.ts`):

```ts
interface GoalRef { id: GoalId; revision: number }   // CAS 身份:每次持久变更 revision+1
```

- 每个 mutation 方法都带 `ref`(期望 revision),服务先 `expectCurrent` 校验,
  不匹配抛 `GOAL_STALE_REVISION`,之后才 `session.append('goal/change', 完整快照)`。
- **CAS 边界**:`Session.append` 是同步、原子的(校验 + push 同一同步块,throw 即不入日志),
  单线程 JS 无交错 → "check revision 后同步 append" 就是**单进程事实 CAS**。
  持久化后端没有跨进程条件写(`append` 无 expected-version;SQLite 可加
  `Wdsh-mission revision=expected`,JSONL 无此能力)。dsh-mission 单进程部署下,**照搬 goal 的
  `revision + expectCurrent` 即足够**,无需自建持久化 CAS。
- **dsh-mission 照搬此模式**:mission 的 `revision` 单调递增 + 变更带期望 revision 即完成乐观并发守卫。

### 1.4 invariant 伴生 —— 通用审计机制,`ctx.invariants` 注册

`@deepseek-ai/dsh-invariants` 提供通用 invariant 注册表。每个包写一个伴生插件:

- 插件 `name: '<pkg>-invariant'`, `inject: ['invariants']`, `apply` 调 `ctx.invariants.register(PACKAGE_NAME, install)`。
- `InvariantInstaller` 持一个独立增量 fold(每 session 一个 WeakMap 状态),
  监听 `session/created` 播种、`internal/dispatch` 在 `session/event` **发布前**折叠候选事件、
  非法即 `fail(...)`;`session/event` 发布后提交 staged 状态。
- 参考:`packages/goal/goal/src/invariant.ts`(规则见 `fold.ts` 的严格解码器)。
- **dsh-mission 照搬此模式**:`mission-invariant` 伴生插件,独立重放 `mission/*` 事件流,非法迁移 `fail`。

> 双层防线:(a) 服务在 append 前校验(CAS + 迁移合法);(b) invariant 伴生独立审计日志,
> 捕获任何漏网或伪造的 `mission/*` 事件(goal 明确:trusted producer 可伪造,replay 只能检测)。

## 2. 现有长任务 / 编排模块盘点(去重依据)

| 模块 | 权威事实 | 与 dsh-mission 的关系 |
|---|---|---|
| **dsh-goal** | 单会话**单一目标**、事件溯源、`GoalPhase = active\|paused\|blocked\|complete`、`GoalRef{id,revision}` CAS、`goal-round-driver` 按 `maxGoalRounds` 轮次计数续跑。**无多目标、无依赖/DAG、无独立验证(worker 可自证 complete)、无 lease**。 | 复用其 CAS + invariant + 快照提交范式;dsh-mission 补齐 DAG/验证/lease |
| **dsh-plan-mode** | `plan/mode: {active: boolean}` 落库开关 + `plan:policy` 部署文案软引导 + `exit_plan_mode` 审查出口。计划正文只是工具参数里的一段 markdown,**非结构化、无版本、无依赖图、无执行对账**。 | 不冲突。dsh-mission 的 plan 是**结构化持久 DAG**,与 plan-mode 的软开关正交 |
| **dsh-workflow** | 模型写的编排**脚本**(worker thread 执行),`agent()/pipeline()/parallel()/phase()` 钩子,一次性 `WorkflowRun` → `WorkflowResult`(completed\|cancelled\|error)。`workflow/*` 事件 observe-only;`tool-workflow/*` 是展示投影。**一次性运行,无持久可恢复 DAG**。 | 互补。dsh-mission 是持久 DAG 状态机,workflow 是一次性扇出脚本 |
| **dsh-ralph** | fixed fresh-agent 循环:每轮新 child、workspace 作长期记忆、结构化报告跨轮。 | 执行单元之一,不冲突 |
| **dsh-schedule** | `schedule/change` versioned 事件,`after\|at\|every` **纯时间触发**、session-local 投递(at-least-once)。**无依赖触发**。 | 可选复用 `ctx.schedule` 做 lease 过期定时;依赖触发是 dsh-mission 增量 |
| **dsh-subagent** | `ctx.subagents`:命名 provider 注册表;one-shot `start()` + 可续跑 `startContinuable()/followup()/interrupt()`;持久 child Session + 进程本地 Activation、冷恢复、所有权图;`SubagentResult{output, structured?, stopReason}`。 | **任务执行单元**,dsh-mission 直接驱动它 |
| **dsh-jobs** | 通用后台任务运行时 + `job_list/kill/output` 工具。 | 不冲突 |
| **dsh-todo** | `todo_write` 工具。 | 不冲突(清单 vs 依赖 DAG) |
| **dsh-session-query** | 会话检索:语料/世系/事件关系/语义过滤/SQLite FTS。 | 可复用做 mission 审计查询 |
| **dsh-compaction** | 上下文压缩,会话级。 | 不冲突 |
| **dsh-approval / user-questions** | 人工审批/提问缝。 | 可选:验证器/重规划前的人工确认 |

## 3. 去重结论

**复用(不重建)**:会话日志事件溯源、`SessionEventMap` 合并、`GoalRef` 式 CAS、
`ctx.invariants` 伴生、快照单事件原子提交、`ctx.subagents` 执行、`ctx.llm` 规划/验证、
`ctx.schedule`(可选 lease 定时)、`session/event` + session-projection 做 UI。

**dsh-mission 的独特增量(全 dsh 唯一)**:

1. **依赖 DAG + 依赖触发执行** —— goal 单目标无 DAG,workflow 一次性脚本,schedule 纯时间。
   只有 dsh-mission 提供"任务 B 因上游 DONE 而 READY"的持久派生。
2. **独立验证(执行者不能自证)** —— 全 dsh 无任何"执行声明"与"验证权威"的分离;
   subagent 结果被直接信任,goal 完成是调用方自证。dsh-mission 强制 `task/report`(声明)≠ `task/verify`(对齐)。
3. **失败→重规划→唯一赢家提交** —— goal 有 edit 但无重规划语义,无分支/收敛机制。
   dsh-mission 用"新 revision 的 plan 事件"原子提交,且保留已 DONE 的任务。
4. **lease 所有权 + 过期回收 + 崩溃恢复** —— 无 lease/reclaim 概念(goal 所有权 = 精确 live Agent 单实例,
   `activation` 是进程本地标志,非持久 lease)。dsh-mission 持久化 claim/lease,过期可 reclaim。
5. **跨 turn/跨会话的持久 mission** —— 以上组合成 dsh 缺失的"长期任务状态机"。

> 这五条增量统一服务于一个核心:**长程自主 mission 运行时**;DAG 只是"决策候选"的一种来源
> (依赖为空时 plan 退化为扁平 agenda)。详见 `docs/design.md` 的「驱动循环」与「环境与反馈」。

## 4. 关键坑(沿用原调研,已核对)

- `required: false` 会被 dsh-tools 拒绝,可选参数省略 `required` 键。
- 插件包声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`,否则 `dsh plugin add` 不把它当 profile 层。
- ESM 插件 import CommonJS 包用默认导入解构。
- pnpm hardlink 装的插件,改源文件后要重新 copy 到 profile 副本。
- 每个包必须带 `./invariant` 伴生(空实现需给 package-specific 理由),否则 `verify-package-invariants` 失败。
- 事件 JSDoc 需 `@mode` + payload `@param`;非 surface 事件不写 `@dshScopeScan unsupported` 之外的东西。
