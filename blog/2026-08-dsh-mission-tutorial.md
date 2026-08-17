# DeepSeek Harness 长程任务新范式:让 agent 用 mission 插件自主跑完一个 7 任务项目

> 一次对话做不完"一个游戏"这样的长期目标。这篇文章讲我在 DeepSeek Harness 里用
> 开源插件 **dsh-mission** 让 agent **自主**跑完一个 7 任务依赖图——80 分钟、真实子代理、
> 每个任务独立验证、全程零失败零重复派发。核心只有一句话:
> **agent 提议,环境裁决,运行时提交。**

## 痛点:一次对话的边界

在 DeepSeek Harness(dsh)里,"做一个小游戏"这种任务,常规做法是让 agent 在一个会话里
一口气写完。但一旦目标横跨多日——设计数据结构、写战斗引擎、做界面、自测、打磨——单次
对话会:上下文爆炸、中途失败没有恢复机制、**agent 说自己做完了,但它说了算**(没有独立验证)。

dsh 已有的模块各解决一块:

| 模块 | 解决什么 | 缺什么 |
|---|---|---|
| goal | 单目标记账 | 无任务依赖、无独立验证、可自证完成 |
| workflow | 一次性扇出脚本 | 不持久、不可恢复 |
| schedule | 纯时间触发 | 无依赖触发 |
| subagent | 任务执行单元 | 谁来验证? |

**缺的是一整个"长程自主 mission 运行时"**:跨会话、可验证、失败可重规划、崩溃可恢复。
这就是 dsh-mission。

## 核心原则:agent 提议,环境裁决,运行时提交

- **agent 提议**:用 `mission_create` / `mission_plan` 建 mission、提交带依赖的任务 DAG;
- **环境裁决**:每个任务由**真实子代理**在环境(工作区)里执行,产出留给环境(代码/存档);
- **运行时提交**:`task/report` 是 agent 对环境的**声明**(非权威);`task/verify` 独立地把
  声明与环境反馈**对齐**(权威)。**执行者不能自证完成**——只有通过确定性校验、以单个事件
  原子写入会话日志的状态变更才是权威。

## 30 秒上手

```bash
# 1. 安装(已发布到 npm)
dsh plugin --profile web add @qiaoy01/mission

# 2. 在会话里说一句:
#    "mission: 构建一个网页版小游戏。用 mission_create 创建,再用 mission_plan 提交计划,
#     然后停止——任务由运行时执行。"
```

模型负责创建和规划;`mission-driver` 随即接管:自动认领任务 → 派发真实子代理 → 声明 →
独立验证 → 提交。**模型不需要(也不应该)自己执行任务。**

## 原理:事件溯源 + 驱动循环

**持久化**:mission 状态就是 `mission/*` 会话事件流(创建/计划/认领/声明/验证/取消),
单事件 = 原子提交,没有独立数据库。崩溃后从事件流重放即可恢复。

**驱动循环**:
```
读(fold 事件流)→ 决策(选 READY 任务)→ claim(lease 认领)→ 子代理执行
→ report(声明)→ verify(独立对齐)→ 提交 → 下一轮
```

几个关键设计:

- **依赖 DAG**:`plan-committed` 带依赖,上游 DONE 才派生 READY;上游 FAILED 派生 BLOCKED;
- **lease 所有权**:认领带令牌+过期;过期且无声明的任务可被回收重做(崩溃恢复);
  并用**在飞任务守卫**保证同一个任务绝不被重复派发;
- **失败重规划**:mission 卡死时生成新 revision,**已 DONE 且规格不变的任务跨 revision 保留**
  ——多日成果不白费,失败只重判自己那条支线;
- **可插拔策略**:确定性(默认,零模型开销)或模型决策(`decider: llm`)、模型重规划
  (`replan: true`)、人工审批闸。

## 实测:7 任务 DAG 自主跑完

我让模型提交了一个"网页版 Raid 类 RPG demo"的计划,7 个任务、8 条依赖:

```
data-structures(数据结构)
  ├─ battle-engine(回合制战斗引擎)
  ├─ html-css-shell(界面外壳)
  └─ state-save(状态/存档)
       └─ ui-integration(整合)
            └─ self-test(自测)
                 └─ polish-report(打磨+报告)
```

结果(全部来自真实会话日志):

- **总耗时约 80 分钟**(11:48 → 13:08),7 个任务各由一个真实子代理执行;
- 每个任务都走了 `claimed → reported → verified(passed=true)`——**独立验证,无自证**;
- DAG 严格依序:依赖未完成的任务不会提前 READY;
- **零失败、零重复派发**;
- 产出真实可运行:一个含英雄/技能/装备/关卡/召唤池数据、战斗引擎、界面、本地存档的
  网页游戏 demo。

过程中还真实抓出并修掉了两个 bug(这正是真机测试的价值):长任务执行期间 lease 过期导致
**重复派发**(修复:在飞任务守卫);以及"用户没提 mission: 前缀时模型不会主动用 mission 工具"
(工具可发现性,需要在提示里显式点名工具)。

## 进阶玩法

```yaml
# profile 里配置 mission-driver 行即可开启模型策略
- id: mission-driver
  config:
    decider: llm     # 模型选择下一任务
    replan: true     # 卡死时模型重规划
```

还有:`userApprovalGate`(重规划前人工确认)、`mission` session projection(UI 数据面)、
容错 invariants 伴生(生产 profile 零额外配置)。

## 资源

- 仓库:[github.com/qiaoy01/dsh-mission](https://github.com/qiaoy01/dsh-mission)(dsh-plugin topic)
- npm:[@qiaoy01/mission](https://www.npmjs.com/package/@qiaoy01/mission)
- 安装:`dsh plugin add @qiaoy01/mission`
- 设计文档:[docs/design.md](https://github.com/qiaoy01/dsh-mission/blob/main/docs/design.md)
- 机制调研:[docs/research.md](https://github.com/qiaoy01/dsh-mission/blob/main/docs/research.md)

---

*如果你也在 DeepSeek Harness 里跑长任务,欢迎去 GitHub Discussions 交流,或直接给仓库提 issue。*
