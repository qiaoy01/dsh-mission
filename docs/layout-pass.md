# Layout Pass — 28 页幻灯片排版校正总结

文件:`slides/ai-agent-history-dsh-mission.html`
范围:仅调整 CSS / 布局,28 页、全部内联 SVG 图、图片引用与文字内容保持不变。

## 全局 CSS 变更

- `.cols` / `.cols-3`:由 `align-items: start` 改为 `align-items: stretch`。
  列高自动对齐(等高),消除"一列高、一列矮 + 底部大片空白"的问题;列分数保持显式等分
  (`grid-template-columns: 1fr 1fr` 与 `repeat(3, 1fr)`),间距 `gap` 不变(2.2vw / 1.6vw)。
- 新增卡片等高规则:`.cols > .card` / `.cols-3 > .card` 设为 `height: 100%` + 纵向 flex,
  并将末段 `margin-top: auto` 沉底,使多卡片底边(通常是 "→" 结论句)对齐。
- 新增 `.imgcol` 图片栏容器:栏内漫画改为 `width: 100%; height: auto; max-height: 100%;
  object-fit: contain`,在所在列内**撑满列宽、按比例限高、居中不裁切**。
- `.comic.port` 的 `max-height` 46vh → 50vh;合并原先重复的 `.comic.port/.hero { max-width:100% }`。

## 逐页变更

| # | 页面 | 变更 |
|---|------|------|
| 01 | 封面 | hero 文本/图片两栏由 `flex:1.2 / 1` 改为等分 `1 / 1`;封面图保持居中自适应。 |
| 02 | 目录 | 无改动(SVG 路线图 + lead + 居中 agenda 漫画,填充合理)。 |
| 03 | 什么是 Agent | 移除 `1.1fr .9fr` → 等分 `1fr 1fr`;右栏 agent 漫画改用 `.imgcol` 撑满列。 |
| 04 | 起源① | 受益全局 stretch:左右两列等高对齐(图+说明 vs 列表+卡片)。 |
| 05 | 起源② | 同上:两列等高对齐。 |
| 06 | 起源③ | 3 张卡片等高 + 末段沉底对齐;eliza 漫画保持居中。 |
| 07 | 起源④ | 同上:3 卡片等高、结论句底边对齐。 |
| 08 | 起源⑤ | 同上:3 卡片等高、结论句底边对齐。 |
| 09 | 谱系总表 | 无改动(整页 lineage SVG,按设计纵向滚动)。 |
| 10 | LLM 工具 | 无改动(SVG + lead + 横幅条,填充合理)。 |
| 11 | 推理方法 | 3 卡片等高(含卡片内迷你 SVG 不变);reasoning 漫画不变。 |
| 12 | ReAct | 受益全局 stretch:左图列与右文列等高对齐。 |
| 13 | 2023 教训 | 移除 `.9fr 1.1fr` → 等分 `1fr 1fr`;左栏 lesson2023 漫画改用 `.imgcol` 撑满列。 |
| 14 | 框架与标准 | 无改动(SVG 时间轴 + 横幅条)。 |
| 15 | Coding 演化 | 无改动(整页 SVG)。 |
| 16 | 能力栈 | 受益全局 stretch:左金字塔 SVG 列与右列表列等高对齐。 |
| 17 | Harness 两层 | 移除 `1.1fr .9fr` → 等分 `1fr 1fr`;右栏 harness 漫画改用 `.imgcol`;内层 2 卡片等高。 |
| 18 | dsh | 受益全局 stretch:左图列与右文列等高对齐。 |
| 19 | dsh-mission | 移除 `1.1fr .9fr` → 等分 `1fr 1fr`;右栏 mission 漫画改用 `.imgcol` 撑满列。 |
| 20 | report ≠ verify | 无改动(整页 SVG)。 |
| 21 | dsh 已有 vs 增量 | 无改动(对照表 + 横幅条)。 |
| 22 | 架构 | 受益全局 stretch:左代码列与右驱动循环 SVG 列等高对齐。 |
| 23 | 领域模型 | 受益全局 stretch:左状态机 SVG 列与右 invariant 列表列等高对齐。 |
| 24 | lease/恢复 | 无改动(SVG + 横幅条)。 |
| 25 | 7 任务 DAG | 受益全局 stretch:左 DAG SVG 列与右要点列等高对齐。 |
| 26 | 上手 + 策略 | 受益全局 stretch:左右两段代码块等高对齐。 |
| 27 | 总结 | 移除 `1.1fr .9fr` → 等分 `1fr 1fr`;右栏 conclusion 漫画改用 `.imgcol` 撑满列。 |
| 28 | 参考 | 无改动(列表 + 横幅条)。 |

## 说明

- 只有 6 页做了逐页结构改动(01、03、13、17、19、27),其余 22 页通过全局 `.cols/.cols-3`
  的 `align-items: stretch` 与卡片等高规则自动获益。
- 竖版漫画(3:4)在等宽列内按"撑满列宽、限高保持比例、居中"处理,消除原先顶对齐 + 侧边/底部
  的大面积空白;横版 line-* 横幅与 cyber/react/reasoning 漫画保持原作者"按高度自适应、居中"的
  设计,避免位图放大发虚与纵向溢出。
- 内容零改动:28 页、所有 `<svg>` 图、`assets/comics/*.png` 引用与正文文字均未增删。
