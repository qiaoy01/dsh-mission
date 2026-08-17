# dsh-mission

DeepSeek Harness 的**长程自主 mission 运行时**插件(DAG 是它的驱动/执行手段之一)。

- **dsh 平台**提供:LLM 网关、subagent 执行、会话日志事件溯源、沙箱、审批、定时、UI。
- **dsh-mission 提供**(全 dsh 唯一):跨会话的自主控制循环——独立验证(执行者不能自证)、
  依赖 DAG 派生就绪、失败重规划(保留 DONE 的新 revision)、lease 所有权 + 崩溃恢复。

核心原则:**agent 提议,环境裁决,运行时提交**——每个工作项都要独立地对齐真实环境反馈
才能判定完成,所有权威状态变更走"确定性校验(invariant)→ 单事件原子提交"。

## 命名

`@deepseek-ai/dsh-mission` + `mission/*` 事件 + `ctx.mission` 服务(详见 `docs/design.md`)。

## 构建与测试(隔离原则)

测试与 dsh 的运行完全隔离:纯函数层零依赖;运行时层只把 dsh 包链接进本包
`node_modules`,在**手工构造的 cordis Context** 里跑——不 boot dsh app、不碰任何
profile,插件再坏也影响不到 `dsh web` 的启动。

```bash
cd packages/mission/mission

# 1) 运行时依赖:把运行中 harness 的包链接进 node_modules
#    (等价于 README 原方案里源码 checkout 的 junction;任选其一)
New-Item -ItemType Junction -Path node_modules -Target "$env:LOCALAPPDATA\npm-cache\_npx\<harness>\node_modules"

# 2) 构建:typecheck + emit 到 lib/
npm run build   # scripts/build.mjs:自动发现本机 tsc(本地 devDependency → npx 缓存 → npx 下载)

# 3) 三层测试,全隔离
node --experimental-strip-types tests/domain.test.mjs   # 纯函数层(零 dsh 依赖)
node tests/service.test.mjs                              # 运行时(真实 cordis/session/agent)
node tests/driver.test.mjs                               # driver 循环(mock 执行器)
```

> ⚠️ `node_modules` 是 junction(指向共享 npm 缓存/源码 checkout)时,**不要**在本包内
> 直接 `npm i`/`pnpm i` 装 devDependency——安装会顺着 junction 写进共享目录。
> 编译器由 `scripts/build.mjs` 从 npx 缓存解析,无需安装。

> **真实组合验证(real-composition)在完全隔离的测试 home 里做**——dsh 是同一个二进制,
> 状态全在 `$DSH_HOME`,把它指到工作区内的目录就是独立实例(不同端口、不碰真实
> `C:\Users\david\.dsh`,连权限升级都不需要):
>
> ```powershell
> $env:DSH_HOME = 'C:\Users\david\dsh-mission\.dsh-test'   # 测试 home(工作区内)
> dsh plugin --profile web add file:C:\Users\david\dsh-mission\packages\mission\mission
> # 在测试 profile 的 cordis.patch.yml 里 insert 一行(见下方 invariants 发现):
> #   - insert: [ { id: invariants, name: '@deepseek-ai/dsh-invariants' } ]
> dsh --profile web --dump-config        # 只组合、不启动,校验 mission 三行在树里
> dsh --profile web --help               # 完整加载冒烟:树全部激活则 exit 0,否则 fail-loud
> dsh --profile web --port 3180          # 独立端口侦听(远离真实 GUI 的 3080)
> # 用完删除整个 .dsh-test 即彻底清理
> ```
>
> **已验证**:`--dump-config` 组合正确;`--help` 冒烟 exit 0(mission / mission-tool /
> mission-invariant 全部激活);`--port 3180` 启动后 `dsh web: http://127.0.0.1:3180`
> 且 HTTP 200;真实 home 与运行中 GUI 全程未触碰。
>
> ⚠️ **invariants 服务是开发组合专属**:`dsh-agent-presets` 源码明说 "dsh-invariants is a
> development composition — a shipped host never loads it"。`mission-invariant` 伴生因此是
> **容错形态**(阶段 D 决策):不硬注入 `invariants`,服务在作用域内即注册、出现后经
> `internal/service` 补注册;shipped host 无此服务时静默跳过——**生产 profile 无需任何
> 额外配置即可加载 mission,绝不会因缺审计服务而 boot 失败**(真实组合已验证:有/无
> invariants 行都 exit 0)。想要第二道防线(独立重放审计)的组合,在 profile 的
> `cordis.patch.yml` 里 `insert` 一行 `{ id: invariants, name: '@deepseek-ai/dsh-invariants' }` 即可。
>
> ⚠️ **会话事件类型注册桥**(真实测试抓到的集成级问题):mission/* 是**仓库外插件事件**,
> 不在 harness 编译期 `KNOWN_SESSION_EVENT_TYPES` 里;`dsh-session-persistence` 读取器对
> 未知必需类型拒绝重建会话(且当前 `Session.append` 无法写 `ignorable`),导致含 mission
> 事件的会话无法加载。修复:包启动时经 `registerMissionEventTypes()` 把六个 mission 事件
> 类型注册进进程级 KNOWN 集合(导出为 ReadonlySet、运行时是可变 Set——这是文档化的
> 桥接,直到 harness 提供正式注册面)。已在真实读取器上验证:注册后 48k 事件会话完全可读。
>
> dsh 启动是**刻意 fail-loud** 的(`dsh-app-boot` 的 `assertEntriesActivated`/`assertEntriesLoaded`):
> 插件 import 失败或 `apply()` 抛错会让**该 profile** 的 boot 失败,没有"容忍失败继续跑"的开关。
> 紧急关断:在 profile 的 `cordis.patch.yml` 里按 id 禁用 mission 三行
> (`- id: mission / mission-tool / mission-invariant`, `disabled: true`)即可正常启动。

## 状态

- 阶段 A(域模型:`mission/*` 事件 + fold + invariant)✅ 完成。
- 阶段 B(`MissionService` + 模型工具 + `mission-invariant` 伴生)✅ 完成。
- 阶段 C(driver 循环)✅ 完成:`driveMission` + 确定性验证器 + subagent 执行器;纯函数/运行时/driver 三层测试全绿。
- 真实组合验证(load 级)✅ 完成:隔离测试 home(`.dsh-test`)里装进 web profile,
  `--dump-config` 组合正确、`--help` 冒烟 exit 0、`--port 3180` 独立端口 HTTP 200;
  模型驱动 E2E 也让模型真实调用了 mission 三件套并持久化到会话日志。
- 阶段 D(重规划驱动 / lease 回收 / 模型决策 / 审批闸)✅ 完成:`llmDecider` / `llmReplanner` /
  `userApprovalGate` + 驱动循环集成,domain/service/driver 三层测试全绿;真实组合验证
  有/无 invariants 行均 exit 0。
- 驱动宿主 ✅ 完成:`mission-driver` 插件(`mission/changed` + tick 触发,agent 存活即驱动,
  真实 subagent 执行)。真实组合全闭环 E2E 已验证:模型 create+plan → 驱动自动
  claim → 真实子代理执行 → report → verify(passed)→ DONE,全部事件入会话日志。
- 阶段 E(投影 + 发布准备)✅ 部分:`mission` session projection 单元(UI 数据面)+
  `mission/changed` 事件 + exports/peer deps 就绪;浏览器卡片待"UI 形态"决策。
- 待做:浏览器 UI 卡片(需 harness client 构建管线);发布(`private` 标志决策)。

## 目录

```
docs/
  research.md   # dsh 机制调研 + 去重结论(会话日志/CAS/invariant + 模块盘点)
  design.md     # dsh-mission 架构设计(驱动循环 + 环境与反馈 + 事件词汇 + invariant)
packages/mission/mission/
  index.ts              # 入口:默认导出 MissionService + re-export 纯函数
  cordis.patch.yml      # bundle patch(插入 mission / mission-tool / mission-invariant 三行)
  tsconfig.json         # 构建/typecheck 配置(extends 本地 dsh 类型)
  package.json          # peer deps(*) + dsh.bundle.patch + exports
  lib/                  # 构建产物(tbc emit)
  src/
    types.ts            # 事件词汇 + 类型(纯类型)
    fold.ts             # foldMission + 派生 READY/BLOCKED + 重规划保留 DONE(纯函数)
    validate.ts         # validateEvent(含 lease 回收规则)+ isAcyclic(纯函数)
    domain.ts           # SessionEventMap 合并 + mission/changed + 错误边界 + 请求类型
    service.ts          # MissionService(CAS + 快照提交)
    invariant.ts        # mission-invariant 伴生(容错:服务在即注册,internal/service 补注册)
    tools.ts            # mission_create / mission_plan / mission_status
    driver.ts           # driveMission 循环 + isClaimable/回收 + decider/replanner/审批闸注入
    llm.ts              # llmDecider / llmReplanner / userApprovalGate(ctx.llm 单工具结构化调用)
    driver-host.ts      # mission-driver 宿主:mission/changed + tick 自主驱动(真实 subagent)
    projection.ts       # mission session projection 单元(UI 数据面,纯 JSON 折叠)
    executor.ts         # subagentExecutor(one-shot 派发到子代理)
  scripts/
    build.mjs           # 构建脚本(自动发现本机 tsc,不依赖源码 checkout)
  tests/
    domain.test.mjs     # 纯函数层测试(含回收校验)
    service.test.mjs    # 运行时测试(真实 cordis/session/agent;mission/changed)
    driver.test.mjs     # driver 循环测试(mock 执行器;回收/decider/重规划/审批/maxReplans)
    driver-host.test.mjs  # 驱动宿主测试(stub subagents,自主驱动到 COMPLETED)
    projection.test.mjs   # 投影单元测试(纯函数)
```

## 下一步

- 浏览器 UI 卡片(`mission` 投影已有,client 插件需 harness client 构建管线);
- 发布决策(`package.json` 的 `private` 标志);真实环境驱动的任务(把 subagent 执行接到真实工作树/测试)。
