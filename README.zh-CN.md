# dsh-mission

> **DeepSeek Harness 的长程自主 mission 运行时** —— 让 agent 能多日推进一个长期目标:
> 跨会话、可独立验证、失败可重规划、崩溃可恢复的自主控制循环。
> DAG(依赖任务图)是它的驱动/执行手段之一,不是运行时本身。

[English](https://github.com/qiaoy01/dsh-mission/blob/main/README.md) | 中文

[![npm version](https://img.shields.io/npm/v/@qiaoy01/mission)](https://www.npmjs.com/package/@qiaoy01/mission)
[![license](https://img.shields.io/github/license/qiaoy01/dsh-mission)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/qiaoy01/dsh-mission/test.yml)](https://github.com/qiaoy01/dsh-mission/actions)

## 是什么

`dsh-mission` 是 DeepSeek Harness 的**纯 TypeScript cordis 插件**,提供 dsh 缺失的
**长程自主 mission 运行时**:一个持久、可验证、崩溃可恢复的自主控制循环,把"一个长期目标"
拆成带依赖的任务 DAG,由运行时自主推进,而不是靠单次对话一次性完成。

核心原则:**agent 提议,环境裁决,运行时提交**。

- agent 的计划、执行、声明永远**非权威**;
- 每个工作项:`task/report` = 对环境的**声明**(非权威),`task/verify` = 独立地把声明与
  **环境反馈**对齐(权威);
- **执行者不能自证完成**——只有通过确定性校验、以单个事件原子写入会话日志的状态变更才是权威。

## 为什么是 dsh 需要它

| dsh 已有 | dsh-mission 的独特增量 |
|---|---|
| goal(单目标记账,可自证完成) | **依赖 DAG + 派生就绪/阻塞**,失败支线可重规划(保留 DONE 成果) |
| workflow(一次性扇出脚本) | **持久、可恢复、跨会话的任务状态机** |
| schedule(纯时间触发) | **依赖触发**(上游 DONE → 下游 READY) |
| subagent(执行单元) | **独立验证**——执行者不能自证,`report` ≠ `verify` |
| — | **lease 所有权 + 惰性回收 + 崩溃恢复** |

## 特性

- **事件溯源持久化**:`mission/*` 会话事件,单事件 = 原子提交,无独立数据库;
- **版本守卫**:`revision` CAS(照搬 dsh-goal 的 `GoalRef` 模式);
- **自主驱动宿主**(`mission-driver`):监听 `mission/changed`,自动执行
  认领 → 子代理执行 → 声明 → 独立验证 → 提交 的循环;
- **惰性 lease 回收**:过期且无声明的任务可被回收重做;**在飞任务守卫**杜绝重复派发;
- **失败重规划**:mission 卡死时产出新 revision,已 DONE 且 spec 未变的任务跨 revision 保留;
- **模型策略可选**:`llmDecider`(选下一任务)/ `llmReplanner`(重规划)/ `userApprovalGate`(审批闸);
- **UI 数据面**:`mission` session projection 单元;
- **容错伴生**:`mission-invariant` 在 `invariants` 服务存在时自动注册审计,不存在时静默跳过
  (生产 profile 无需额外配置即可加载)。

## 事件词汇(`mission/*`)

| 事件 | 语义 |
|---|---|
| `mission/created` | 创建 mission |
| `mission/plan-committed` | 提交整次计划快照(revision +1,DONE 且 spec 不变的任务延续) |
| `mission/task-claimed` | lease 认领 |
| `mission/task-reported` | agent 对环境的**声明**(不产生 DONE) |
| `mission/task-verified` | 独立对齐环境反馈 → DONE/FAILED |
| `mission/cancelled` | 显式终止 |

状态:mission `CREATED / RUNNING / COMPLETED / FAILED / CANCELLED`;
任务 `PENDING / CLAIMED / DONE / FAILED` + 派生 `READY / BLOCKED`。

## 安装与使用

```bash
# 从 npm 安装(已发布;会把 5 行 bundle patch 插入组合)
dsh plugin --profile <name> add @qiaoy01/mission

# 或从源码安装
dsh plugin --profile <name> add file:path/to/dsh-mission

# 在会话中,agent 通过三个模型工具使用 mission:
#   mission_create   —— 创建 mission
#   mission_plan     —— 提交任务 DAG(revision 必须 = 当前 + 1)
#   mission_status   —— 读取当前状态
```

模型提交计划后,**执行由运行时接管**(`mission-driver` 自动认领任务、派发真实子代理、
独立验证)。模型不需要也不应该自己执行任务。

## 快速上手(30 秒)

```bash
# 1. 把插件装进一个 dsh profile
dsh plugin --profile web add @qiaoy01/mission

# 2. 在会话中对 agent 说:
#    "mission: 构建一个小型网页游戏。用 mission_create 创建,再用 mission_plan 提交计划,
#     然后停止——任务由运行时执行。"
#
# 模型创建并规划;mission-driver 自动认领任务、派发真实子代理、独立验证每个任务,
# 直到 mission COMPLETED。
```

默认策略保守(确定性选任务、不自动重规划,零模型开销);需要模型决策时在 profile 里配置:

```yaml
- id: mission-driver
  config:
    decider: llm     # 模型选择下一任务
    replan: true     # 卡死时模型重规划
```

## 构建与测试

```bash
cd packages/mission/mission
npm run build          # 自动发现本机 tsc;typecheck + emit 到 lib/
# 五套测试,全部隔离运行:
node --experimental-strip-types tests/domain.test.mjs    # 纯函数域模型
node tests/service.test.mjs                               # 运行时(真实 cordis/session/agent)
node tests/driver.test.mjs                                # driver 循环(mock 执行器)
node tests/driver-host.test.mjs                           # 驱动宿主(stub subagents)
node --experimental-strip-types tests/projection.test.mjs # 会话投影单元
```

## 验证状态

- 阶段 A(域模型)✅ · 阶段 B(服务 + 工具 + 伴生)✅ · 阶段 C(driver 循环)✅ ·
  阶段 D(重规划 / lease 回收 / 模型决策 / 审批闸)✅ · 阶段 E(投影 ✅,浏览器 UI 待做);
- **真实组合验证**:7 任务 DAG 由真实子代理自主推进至 COMPLETED,
  每个任务独立验证通过,全程零失败、零重复派发;
- 更多设计细节见 [docs/design.md](https://github.com/qiaoy01/dsh-mission/blob/main/docs/design.md),
  dsh 机制调研与去重依据见 [docs/research.md](https://github.com/qiaoy01/dsh-mission/blob/main/docs/research.md)。

## 许可

MIT —— 详见 [LICENSE](https://github.com/qiaoy01/dsh-mission/blob/main/LICENSE)。
