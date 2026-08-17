# dsh-mission — 设计

```yaml
project: dsh-mission
type: architecture_design
status: draft (v0.4)  # 重构定位:长程自主 mission 运行时,DAG 是手段;重规划保留 DONE
```

## 定位

dsh-mission 是 DeepSeek Harness 的**纯 TypeScript cordis 插件**,提供 dsh 缺失的
**长程自主 mission 运行时**:一个跨会话、可验证、崩溃可恢复的自主控制循环,让 agent
能多日推进一个长期目标。**DAG(依赖任务图)是它的驱动/执行手段之一,不是运行时本身。**

核心是"**agent 提议,环境裁决,运行时提交**":每个工作项都要独立地对齐真实环境反馈才能判定完成。

> 不是独立系统、不是 Rust 移植。它骑在 dsh 原生范式上:会话日志事件溯源 +
> `GoalRef` 式 CAS + `ctx.invariants` 伴生。复用与去重的完整依据见 `docs/research.md`。

## 一句话差异

dsh 已有:单目标记账(goal)、软计划开关(plan-mode)、一次性扇出脚本(workflow)、
纯时间提醒(schedule)、可续跑子代理(subagent)。**没有任何一个模块提供"跨会话、
可独立验证、可失败重规划的自主控制循环"。这就是 dsh-mission;DAG 是它的一种驱动手段。**

## 命名(已定稿)

```yaml
npm 包:    @deepseek-ai/dsh-mission   # packages/mission/mission/
会话事件:  mission/*                    # mission/created、mission/task-verified …
服务 key:  ctx.mission                 # inject: ['mission']
bundle id: mission                     # cordis.patch.yml 的 insert id
```

对照 dsh 惯例:`@deepseek-ai/dsh-goal` → `ctx.goals` → `goal/*`。

## 核心原则

**agent 提议,环境裁决,运行时提交。** agent 的产出(计划、执行、声明)永远非权威;
只有通过 invariant 校验、以单个事件原子入日志的状态变更才是权威。每个工作项:
`task/report` = agent 对环境的**声明**(非权威);`task/verify` = 独立地把声明与环境反馈
**对齐**(权威)。执行者不能自证完成。

## 环境与反馈(术语)

"环境"取**本意**——真实运行环境与它的反馈,不是任何"世界模型"概念:

- 开发任务:环境 = 工作树 / 已完成的代码 / 测试计划 / 依赖系统 / 运行时;反馈 = 编译、测试结果。
- 通关任务:环境 = 游戏环境与存档;反馈 = 关卡是否通关、成就/进度变化。

两条真相线,严格分离:

| | 控制面(mission 日志) | 环境(数据面) |
|---|---|---|
| 存什么 | 决策、lease 所有权、裁决(声明 vs 对齐) | 代码 / 存档 / 运行时状态 |
| 谁写 | 运行时单事件原子提交 | subagent 执行写;验证读 |
| 可恢复 | 事件溯源,崩溃可续跑 | 依赖环境自身(工作树 / 存档) |

mission 日志**不存环境**:`verify` 的 `evidence` 是对环境状态的引用或有界摘要
(commit hash、测试摘要、存档位置),不是环境本身。

## 驱动循环(运行时核心)

DAG 是手段,这个循环才是 dsh-mission 的中心:

```
每轮:
  1. 读       = fold(mission 日志) + 读环境状态(工作树 / 存档)
  2. 决策     = 候选工作项里选下一步:默认确定性(优先级);可注入 decider(模型选,
               见 `src/llm.ts` 的 `llmDecider`,失败回退确定性)   ← 阶段 D
  3. claim    = lease 认领(令牌 + 过期);过期 CLAIMED 且无 report 的任务可 reclaim(惰性回收)   ← 阶段 D
  4. 执行     = subagent 作用于环境
  5. report   = agent 对环境的声明(非权威,不产生 DONE)
  6. verify   = 独立地把声明与环境反馈对齐 → DONE/FAILED
  7. 提交裁决 = 单事件入日志
  8. 卡死时   = status FAILED → replanner 产出新 revision(保留 DONE,重做失败支线),
               可选审批闸(默认自动放行),`maxReplans` 封顶后回退   ← 阶段 D
  9. 回到 1,直到终态
```

候选工作项的来源(第 2 步)是开放策略:

- **DAG 派生**:`plan-committed` 带 `dependencies` 时,`READY` = 上游全 `DONE`;
- **环境派生**:读外部状态(存档里已解锁未通关的关卡、工作树里未通过的测试);
- **依赖为空时 plan 退化为扁平 agenda**,决策完全由环境 + 模型驱动。

任务 1(开发)与任务 2(通关)是同一个循环作用于两种环境。

## 领域模型

```ts
type MissionStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

// 存储态(事件直接写入);READY/BLOCKED 是派生量,不落盘
type TaskStored = 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED'
type TaskStatus = TaskStored | 'READY' | 'BLOCKED'   // READY/BLOCKED 由依赖派生

interface TaskSpec   { taskId: string; name: string; workerType: string; priority: number }
interface Dependency { taskId: string; dependsOn: string }
interface Lease      { owner: string; token: string; expiresAt: number; attempt: number }

interface MissionState {
  id: string
  objective: string
  status: MissionStatus          // 派生:CREATED/RUNNING/COMPLETED/FAILED;CANCELLED 显式
  revision: number               // 每次 plan-committed +1,是 CAS 身份
  cancelled: boolean             // mission/cancelled 置位
  tasks: Map<string, TaskState>
  dependencies: Dependency[]
}
```

**派生规则**(纯函数,fold 末端统一计算):

- `READY`:所有依赖 `DONE` 且自身 `PENDING`。
- `BLOCKED`:某上游依赖 `FAILED`。
- `DONE` 只能由 `task/verify(passed)` 写入;`report` 不改变状态(执行者不能自证)。
- mission `COMPLETED` = 全部任务 `DONE`;`FAILED` = 有 `FAILED` 且无 READY/CLAIMED/PENDING(卡死);
  `CANCELLED` = 显式事件。

**重规划(revision N+1 的 plan-committed)不抹掉多日成果**:同 `taskId` 且 spec 未变
且已 `DONE` 的任务跨 revision 延续;其余任务重置为 `PENDING`。已完成的成果是持久资产,
失败只重判它自己那条支线(改已完成工作用新 `taskId`,见 invariant)。

## 事件词汇(`mission/*`,SessionEventMap 合并)

| 事件 | 语义 | 关键 payload |
|---|---|---|
| `mission/created` | 建 mission(CREATED) | `{ missionId, objective }` |
| `mission/plan-committed` | 整次计划提交,携带完整快照(单事件 = 原子提交;DONE 且 spec 未变的任务延续) | `{ missionId, revision, tasks, dependencies }` |
| `mission/task-claimed` | lease 认领 | `{ missionId, taskId, lease: { owner, token, expiresAt, attempt } }` |
| `mission/task-reported` | agent 对环境的**声明**,不产生 DONE | `{ missionId, taskId, token, exitCode, output? }` |
| `mission/task-verified` | 独立地把声明与环境反馈**对齐** → DONE/FAILED | `{ missionId, taskId, verifierType, passed, evidence? }` |
| `mission/cancelled` | 显式终止 | `{ missionId }` |

## invariant(确定性校验,纯函数;伴生 `mission-invariant` 独立审计)

- DAG 无环(plan 提交时拒绝环与悬空引用)。
- `revision` 严格 `+1` 单调(非 create 变更)。
- 合法迁移:`claim` 要求 `READY`;`DONE` 永不重执行;`verify` 要求先有 `report` 且非终态。
- lease 令牌校验:只有当前有效持有者可 `report`。
- **执行者不能自证**:`report` 单独不产生 `DONE`,必须 `verify`。
- **已 DONE 任务的 spec 跨 revision 不可变**(改已完成工作用新 `taskId`)。
- 事件引用完整性(task/dep 引用存在)。

## 服务与工具

- **服务 `ctx.mission`(`MissionService`)**:`create` / `plan`(CAS,带期望 revision)/
  `claim` / `report` / `verify` / `status` / `cancel`。所有 mutation 先校验后
  `session.append('mission/*', 快照)`,与 `GoalService` 同构。
- **模型工具(阶段 B)**:`mission_create` / `mission_plan` / `mission_status`。
  执行、决策与重规划都是**驱动侧**动作,不由模型直接调,避免模型既是执行者又是验证者。
- **驱动侧策略(阶段 D,`src/driver.ts` + `src/llm.ts`)**:`driveMission` 接受
  `decider`(选下一任务,默认确定性,`llmDecider` 模型选)、`replanner`(FAILED 时产出
  新 revision,`llmReplanner` 模型重规划)、`approval`(重规划审批闸,`userApprovalGate`
  走 `ctx.approval`)、`maxReplans` 封顶;`isClaimable` 派生"READY ∪ 过期可回收"候选,
  reclaim 换令牌 + attempt+1。

## 组件映射

| 能力 | dsh 资源 |
|---|---|
| 规划 / 重规划 / 语义验证 | `ctx.llm`(结构化输出;`llmReplanner` 经单工具 schema 调用,`llmDecider` 同) |
| 任务执行 | `ctx.subagents`(one-shot + `outputSchema` 结构化结果) |
| 自主驱动宿主 | `mission-driver`(`src/driver-host.ts`):监听 `mission/changed` + 周期 tick,agent 存活即驱动(claim→subagent→report→verify);默认确定性策略零模型开销,`decider: llm` / `replan: true` 按行配置开启 |
| 验证(把声明与环境反馈对齐) | 确定性(重跑编译/测试/读存档)在插件内(`deterministicVerifier`);语义验证走 `ctx.llm`;人工走 `ctx.approval`(`TaskVerifier` 注入缝) |
| lease 过期回收 | ✅ 惰性回收(`isClaimable`:READY ∪ 过期 CLAIMED 无 report;驱动发现过期才 reclaim;驱动宿主 tick 兜底唤醒) |
| 持久化 | 会话日志(`SessionEventMap['mission/*']` 住在拥有者会话;JSONL/SQLite 后端透明) |
| 读环境状态 | 现有 fs/workspace/subagent/shell 缝(不进 mission 领域) |
| UI 数据面 | `mission` session projection 单元(`src/projection.ts`;`mission/changed` 驱动) |
| 人工确认(可选) | `ctx.approval` / `ctx.userQuestions`(`userApprovalGate` 重规划闸,仅 `allowed-once` 授权) |

## 阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| A | 域模型:`mission/*` 事件词汇 + fold + invariant(纯函数,零运行时依赖) | ✅ 完成,测试全绿 |
| B | `MissionService`(CAS + 快照提交)+ 模型工具 + `mission-invariant` 伴生 | ✅ 完成(构建 + typecheck + 测试全绿;待安装验证) |
| C | driver 循环:读(日志 fold + 环境)→ 决策候选 → claim → subagent → report → verify 闭环 + E2E | ✅ 完成:driver 循环源码 + 三层测试;真实组合 load 级验证(隔离 home,web/headless 均 exit 0)+ 模型驱动 E2E(mission 三件套真实调用、事件入日志) |
| D | 失败重规划(保留 DONE 的新 revision)、lease 回收、决策策略(DAG/环境)、审批闸 | ✅ 完成:`llmDecider` / `llmReplanner` / `userApprovalGate` + 驱动集成;lease 惰性回收(reclaim 过期 CLAIMED);domain/service/driver 三层测试全绿;invariants 伴生改容错形态(生产 profile 无审计服务也能 boot,真实组合双形态验证) |
| E | UI 投影 + 发布 | 投影(数据面)✅:`mission` session projection 单元(纯 JSON、同引用门、view 复用权威 fold)+ `mission/changed` 事件;浏览器卡片 = "UI 形态"待定(需要 harness client 构建管线,见决策点);发布:exports/peer deps 就绪,`private` 标志未动(发布是部署决策) |

## 决策点(按"阻塞哪个阶段"分组)

### 域形状 —— 已拍板(阶段 A 落地)

1. **mission 归属**:状态住**拥有者会话**(同 goal/schedule);任务 subagent child 会话只承载执行。
2. **单/多 mission**:先**单活跃 mission/会话**;fold 写成 `Map<missionId, MissionState>`,多 mission 留后路。

### 运行时策略 —— 阶段 B/C/D 落地

3. **验证权威**:`verifierType` 三种"把声明与环境反馈对齐"的方式——确定性(重跑编译/测试/读存档)默认(`deterministicVerifier`)= 已落地;LLM 语义 / 人工审批 = `TaskVerifier` 注入缝已留,工厂待写。
4. **执行单元**:one-shot subagent + `outputSchema`(`subagentExecutor`);单任务需跨轮时再上 continuable child + `followup`。
5. **lease 回收**:✅ 惰性回收——claim 候选 = READY ∪ (CLAIMED 且 lease 过期且无 report);reclaim 换新令牌 + attempt+1;驱动发现过期才 reclaim,无定时器。崩溃恢复语义:executor 抛错 → 无 report → lease 过期 → 下轮 reclaim。
6. **决策与重规划**(阶段 D 落地):`DriveOptions.decider`(默认确定性;`llmDecider` 用 ctx.llm 单工具结构化调用选任务,任何失败回退确定性)、`replanner`(`llmReplanner` 产出新 revision,提示词硬编码"保留 DONE 同 spec、失败重做新 taskId",service 校验兜底)、`approval`(策略缝;`userApprovalGate` 走 ctx.approval,仅 `allowed-once` 授权,不可用/无应答时自动放行——mission 已卡死,不因无人应答而静默停摆)、`maxReplans` 封顶。

### invariants 生产组合决策(阶段 D 拍板)

`dsh-agent-presets` 明说 "dsh-invariants is a development composition — a shipped host never
loads it"。因此 `mission-invariant` 伴生**不硬注入** `invariants`(否则生产 profile 装 mission
即 fail-loud 拒载),改为:作用域内有服务即注册,并监听 `internal/service`(cordis 类型化事件)
在服务后出现时补注册;无服务时静默跳过,由服务层 append 前校验独自兜底。想要第二道防线
(独立重放审计)的组合,在 profile patch 层 `insert` `{ id: invariants, name: '@deepseek-ai/dsh-invariants' }`
即可。真实组合双形态验证:有/无该行均 exit 0。

### 政策 —— 阶段 D 已定,阶段 E 再定

6. 重规划触发条件、审批闸粒度、记忆保留、UI 形态——核心闭环跑通后再定。
