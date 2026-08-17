# AGENTS.md — dsh-mission

Guidance for AI coding agents working on dsh-mission.

## 项目定位

dsh-mission 是 DeepSeek Harness 的**纯 TypeScript cordis 插件**,提供 dsh 缺失的
**长程自主 mission 运行时**(DAG 是驱动/执行手段之一)。
不是独立系统,不是 Rust 项目——是 dsh 原生范式上的域模型。

核心原则:**agent 提议,环境裁决,运行时提交**。所有权威状态变更走"确定性校验(invariant)→
单事件原子提交 → 会话日志持久化",agent 产出永远非权威。执行者不能自证完成:
`task/report`(声明)与 `task/verify`(对齐)是两个独立事件。

## 命名

`@deepseek-ai/dsh-mission` + `mission/*` 事件 + `ctx.mission` 服务 + bundle id `mission`。

## 文档权威

1. `docs/research.md` — dsh 机制调研 + 去重结论(SessionEventMap 合并 / GoalRef 式 CAS /
   ctx.invariants 伴生 / 现有模块盘点 / dsh-mission 的独特增量)
2. `docs/design.md` — dsh-mission 架构设计(驱动循环 + 环境与反馈 + `mission/*` 事件词汇 + invariant + 阶段)

## 技术要点

- **语言**:TypeScript(Node 22+),cordis 插件范式(`inject` + `apply(ctx)`)
- **持久化**:会话日志事件溯源——用 declaration merging 扩展 `SessionEventMap['mission/*']`,
  单事件 = 原子提交,不另建数据库;mission 日志不存环境(环境通过 fs/workspace/subagent 缝读写)
- **版本守卫**:照搬 goal 的 `GoalRef{id,revision}` + `expectCurrent`(单进程事实 CAS;
  同步 append + 单线程无交错,无需自建持久化 CAS)
- **校验**:`./invariant` 伴生注册进 `ctx.invariants`(独立重放 `mission/*` 流,非法 `fail`)
- **执行**:`ctx.subagents`(one-shot + `outputSchema` 结构化结果)
- **规划/验证**:`ctx.llm`
- **重规划**:保留"同 taskId 且 spec 未变且已 DONE"的任务,其余重置为 PENDING;
  已 DONE 任务 spec 跨 revision 不可变(改已完成工作用新 taskId)

## 硬规则(沿用已核对的 dsh 约定)

- 插件包声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`(否则 `dsh plugin add` 不把它当 profile 层)
- 工具可选参数省略 `required` 键(`required: false` 会被 dsh-tools 拒绝)
- ESM 插件 import CommonJS 包用默认导入解构
- pnpm 装成 hardlink 的插件,改源文件后要重新 copy 到 profile 副本
- 每个包必须带 `./invariant` 伴生(空实现需给 package-specific 理由),否则 `verify-package-invariants` 失败
- 事件 JSDoc 需 `@mode` + payload `@param`

## 工作协议

- 阶段驱动(见 `docs/design.md` 阶段表),每阶段完成后跑测试并汇报
- 阶段 A 是纯函数域模型(零运行时依赖):`cd packages/mission/mission && node --experimental-strip-types tests/domain.test.mjs`
- 接入 dsh 前,先确认 peer 依赖解析目标与运行中 harness 版本一致
