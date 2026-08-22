# 幻灯片布局审查 · 空白区审计 + 极简线条漫画插入计划

> 对象:`slides/ai-agent-history-dsh-mission.html`(28 页,单文件 deck)
> 目的:① 找出大面积留白/空白页;② 列出 6 张现有漫画 `<img>`;③ 给出"新增极简线条漫画"的精确插入位置。
> 审查方式:静态审阅 DOM 结构 + CSS(`.slide` / `.cols` / `.fig` / `.comic`)+ 量测漫画实际尺寸(768×1024)。未做浏览器截图渲染,结论基于结构与尺寸推算。

---

## 0. 结论摘要(先看这里)

- 现有 6 张漫画全部是 **768×1024 竖版(3:4)**,来自本机 ComfyUI(majicmixRealistic,SD1.5),风格是"写实拟人",不是线条画。
- 留白主要出现在两类页面:
  1. **单张宽 SVG 过矮**的页面(SVG viewBox 高 250~300,渲染后只占约 23~30vh,下方空出 35~40vh)——`10`、`14`、`24`。
  2. **内容偏短的结构页**(短表格 / 短列表 / 双栏一边过短)——`05`、`21`、`26`、`28`,以及卡片三栏页 `06/07/08/11` 的底部横幅。
- 新增漫画建议采用**极简线条画**(单色 + 少量 `--cyan` 点缀),与现有手绘 SVG 框架图统一;优先做成**全宽横幅**(约 940×260,`viewBox` 比例 ≈ 3.6:1),填满短页底部。
- 必插(高优先级)4 处 + 推荐 1 处 + 可选若干,详见 §3。

---

## 1. 现有 6 张漫画 `<img>` 清单

全部位于 `slides/assets/comics/`,实际尺寸均为 **768 × 1024(竖版,宽高比 0.75)**。

| # | src(相对 slides/) | 所在页 / 行号 | class | alt | 尺寸 |
|---|---|---|---|---|---|
| 1 | `assets/comics/cover.png` | 01 封面 · L244 | `comic hero` | 机器人 agent 奔向目标 | 768×1024 |
| 2 | `assets/comics/agent.png` | 03 PEAS · L304 | `comic port` | 会思考会行动的机器人 agent | 768×1024 |
| 3 | `assets/comics/lesson2023.png` | 13 2023 教训 · L617 | `comic port` | 机器人自夸完成但机器坏了 | 768×1024 |
| 4 | `assets/comics/harness.png` | 17 Harness 两层 · L740 | `comic port` | 被 harness 引导测量的机器人 | 768×1024 |
| 5 | `assets/comics/mission.png` | 19 dsh-mission 是什么 · L803 | `comic port` | 机器人 mission 调度器编排任务图 | 768×1024 |
| 6 | `assets/comics/conclusion.png` | 27 总结 · L1063 | `comic port` | 提议→反馈→提交三阶段 | 768×1024 |

CSS 现状(`<style>` L145–148):

```css
.comic { border-radius:14px; border:1px solid var(--line); box-shadow:…; display:block; }
.comic.port { width:auto; max-height:46vh; margin:0 auto; }  /* 竖版 → 约 34.5vh 宽 */
.comic.hero { max-height:62vh; width:auto; }                 /* 封面 → 约 46.5vh 宽 */
```

> 注意:`.comic.port` / `.comic.hero` 只约束了 `max-height`,**没有 max-width**。竖版 0.75 比例在 16:9 下安全,但在竖屏/窄窗口下可能横向溢出所在栏。新增漫画若做横幅,需单独加宽度约束(见 §4)。

---

## 2. 全页空白审计(28 页)

判定口径:内容区高度 ≈ `100vh − 6vh(上) − 12vh(下) ≈ 82vh`;`.cols`/`.cols-3` 为 `align-items:start`(顶部对齐),矮栏下方即留白。SVG 渲染高度 = 容器宽 × (viewBox 高 / viewBox 宽)。

| 页 | 标题 | 结构 | 空白评估 | 说明 |
|---|---|---|---|---|
| 01 | 封面 | hero 双栏(文字+漫画 62vh) | 轻微 | 已满,平衡良好 |
| 02 | 目录 | kicker+title+SVG(940×300)+lead | 中等 | 下方约 20vh 空白,但作为 agenda 可接受 |
| 03 | PEAS | 双栏:左 lead+SVG / 右漫画 46vh | 中等 | **左栏比右漫画矮约 15–20vh**,左栏下方留白 |
| 04 | 控制论→图灵→PEAS | 双栏:左 SVG(420×250)/右 2 条+卡 | 中等 | 整体偏短,双栏底部约 30vh 空白 |
| 05 | GPS/Shakey/STRIPS | 双栏:左 SVG(440×210)/右 3 条 | **严重** | 内容仅约 25vh,底部空约 35–40vh |
| 06 | ELIZA/SHRDLU/PARRY | 三栏卡片 | 中等 | 卡片中等高度,底部横幅约 25vh 空白 |
| 07 | 专家系统/Brooks/BDI | 三栏卡片 | 中等 | 同上 |
| 08 | MAS/认知架构/RL | 三栏卡片 | 中等 | RL 卡文字多,底部横幅约 20vh 空白 |
| 09 | 谱系总表 | SVG(940×1150) | 轻微(溢出) | 高度≈105vw,纵向滚动,无留白,反有溢出 |
| 10 | LLM 工具使用 | SVG(940×250)+lead 1 行 | **严重** | 渲染仅约 23vh,底部空约 40vh |
| 11 | 推理方法 | 三栏卡片(各带小 SVG) | 中等 | 底部横幅约 25vh 空白 |
| 12 | ReAct/Reflexion | 双栏:左 SVG(420×300)/右 2 条+卡 | 中等 | 底部约 25vh 空白 |
| 13 | 2023 教训 | 双栏:左漫画 46vh / 右 lead+5 条+小字 | 轻微 | 已平衡 |
| 14 | 框架 LangChain→MCP | SVG(940×260) 无 lead | **严重** | 渲染仅约 24vh,底部空约 40vh |
| 15 | Coding Agent 演化 | SVG(940×360)+lead | 中等 | 底部约 25vh 空白 |
| 16 | 能力栈 | 双栏:左 SVG 塔(460×320)/右 5 条 | 中等 | 底部约 25vh 空白 |
| 17 | Harness 两层 | 双栏:左卡×2+lead / 右漫画 46vh | 轻微 | 已平衡 |
| 18 | dsh | 双栏:左 lead+SVG(460×300)/右 4 条+卡 | 中等 | 底部约 20vh 空白 |
| 19 | dsh-mission 是什么 | 双栏:左文字+卡 / 右漫画 46vh | 轻微 | 已平衡 |
| 20 | report≠verify | SVG(940×340) | 中等 | 渲染约 31vh,底部约 25vh 空白 |
| 21 | dsh 已有 vs 增量 | 表格(6 行) | **严重** | 表格仅约 25vh,底部空约 40vh |
| 22 | 事件溯源+驱动循环 | 双栏:左 code / 右 SVG(460×330) | 中等 | 底部约 20vh 空白 |
| 23 | 领域模型+invariant | 双栏:左 SVG(460×300)/右 6 条 | 中等 | 底部约 20vh 空白 |
| 24 | lease/恢复/重规划 | SVG(940×300) | 中等 | 渲染约 27vh,底部约 30vh 空白 |
| 25 | 实测 7 DAG | 双栏:左 SVG(420×400)/右 5 条 | 轻微 | 较满 |
| 26 | 上手+策略 | 双栏:两个 code 块 | 中等 | 内容短,底部约 25vh 空白 |
| 27 | 总结 | 双栏:左文字+code / 右漫画 46vh | 轻微 | 已平衡 |
| 28 | 参考 | 5 条列表 + 小字 | 中等 | 底部约 30vh 空白 |

**"严重"页 = 建议优先插漫画:05、10、14、21。**

---

## 3. 新增极简线条漫画的精确插入位置

风格约定:新漫画用**极简线条画**——细黑线 + 单个强调色 `#22d3ee`(cyan)或透明底,避免写实阴影;与现有 `.fig` 手绘 SVG 视觉一致。建议做**全宽横幅**(约 3.6:1,`viewBox≈940×260`),PNG 可直接放 `assets/comics/` 下,也可用内联 SVG(零新资产、清晰可缩放,推荐)。

### 3.1 高优先级(必插,填"严重"留白)

**① 页 05 · GPS / Shakey / STRIPS**
- 位置:`<div class="cols">…</div>` 结束后、`<div class="slide-meta">` 之前,即 **L373 与 L374 之间**,作为全宽底部横幅。
- 内容:Shakey 机器人(简单盒状 + 天线)在房间内把一个方块推向门口,箭头标注「perceive → plan → act」。
- 建议文件:`assets/comics/line-shakey.png`(或内联 SVG),比例 3.6:1。

**② 页 10 · LLM 工具使用**
- 位置:lead 段(`<p class="lead">` L551)之后、`slide-meta` L552 之前。
- 内容:一个大语言模型"方脑袋"伸出多只线条手臂,分别点按「浏览器 / 计算器 / 日历 / API」四个小图标,呼应 function calling。
- 建议文件:`assets/comics/line-tools.png`,比例 3.6:1。

**③ 页 14 · 框架 LangChain→MCP**
- 位置:`<div class="fig">` 结束(L653 `</div>`)之后、`slide-meta` L654 之前。
- 内容:一条"流水线"从左到右:链条(LangChain)→ 团队(AutoGen/CrewAI)→ 图(LangGraph)→ 一个 USB-C 插头(MCP)插进工具插座。
- 建议文件:`assets/comics/line-frameworks.png`,比例 3.6:1。

**④ 页 21 · dsh 已有 vs 增量**
- 位置:`</table>`(L855)之后、`slide-meta` L856 之前。
- 内容:一幅拼图:已拼好的几块(dsh 已有:goal/workflow/schedule/subagent),一块 cyan 高亮的缺口块正在被补上(dsh-mission:DAG/verify/lease/replan)。
- 建议文件:`assets/comics/line-increment.png`,比例 3.6:1。

### 3.2 推荐(填"中等"且位置明确的留白)

**⑤ 页 03 · PEAS(左栏偏矮)**
- 位置:左栏内 `.fig` 结束(`</div>` L302)之后、左栏闭合 `</div>` L303 之前,即加在左侧列底部。
- 内容:一个小的"观察 → 推理 → 行动 → 再观察"回环线条示意,与左栏 SVG 呼应。
- 建议文件:`assets/comics/line-peas-loop.png`,比例约 2.2:1(560×250)。

### 3.3 可选(次要)

- **页 26 · 上手+策略**:`<div class="cols">` 结束(L1042)后加一条极简"终端输入 → 机器人接管"横幅,`line-install.png`。
- **页 24 · lease/恢复/重规划**:SVG 下加"崩溃后重启续跑"极简横幅,`line-recovery.png`。
- **页 28 · 参考**:底部加一张"书架/链接"极简小图,`line-references.png`(可选,参考文献页非必须)。
- **页 04/06/07/08/11/12/16/18/20/22/23**:若追求统一,可各加一条细横幅,但优先级低,建议先做 ①②③④⑤ 再回看。

> 命名建议统一 `line-*.png`,与现有写实 `*.png` 区分;或新建 `assets/comics/line/` 子目录避免混淆。

---

## 4. 配套 CSS 建议(新漫画所需)

在 `<style>` 的 comics 段(L145–148)后追加:

```css
/* 极简线条漫画:全宽横幅 */
.comic.wide { width:100%; max-height:34vh; object-fit:contain; }
/* 极简线条漫画:栏内小图 */
.comic.inline { width:100%; max-height:20vh; object-fit:contain; }
/* 修护现有竖版溢出隐患(可选) */
.comic.port { max-width:100%; }
.comic.hero { max-width:100%; }
```

- 横幅插页用 `<img class="comic wide" src="assets/comics/line-*.png" alt="…">`。
- 若改用内联 SVG,可直接复用 `.fig` 的 `.node/.edge` 样式,无需 `.comic` 类。

---

## 5. 顺带可做的非漫画留白修正(备选)

- 短页(05/10/14/21/26)若不想加图,可给 `.slide` 增加垂直居中:`justify-content:center;`,让内容居中而非顶对齐,视觉上留白更均匀。
- 谱系总表(09)viewBox 高 1150 导致纵向滚动,可在打印/横屏时 `max-height` 收紧。
- 三栏卡片页(06/07/08/11)可把 `.cols-3` 卡片 `min-height` 拉高,让底部横幅留白更小。

---

## 6. 变更清单(待执行,本次仅出计划)

| 动作 | 页 | 文件 / 位置 |
|---|---|---|
| 新增 `line-shakey.png` + `<img class="comic wide">` | 05 | L373–374 之间 |
| 新增 `line-tools.png` + `<img class="comic wide">` | 10 | L551–552 之间 |
| 新增 `line-frameworks.png` + `<img class="comic wide">` | 14 | L653–654 之间 |
| 新增 `line-increment.png` + `<img class="comic wide">` | 21 | L855–856 之间 |
| 新增 `line-peas-loop.png` + `<img class="comic inline">` | 03 | L302–303 之间 |
| CSS:追加 `.comic.wide` / `.comic.inline` + `.comic.*{max-width:100%}` | — | `<style>` L148 后 |
