# DECISIONS.md — 技术决策日志

## 2026-03-30: 状态管理选择 Zustand 而非 React Context

**决定**：用 Zustand 管理 project 状态和 UI 状态

**原因**：
- Undo 快照需要频繁替换整棵状态树，Context 会导致全量 re-render
- Zustand 的 `subscribeWithSelector` 可以避免 viewport 变化时的不必要渲染
- 单文件 store，API 简洁，和 hooks 模式天然兼容

**备选方案**：React Context + useReducer（太多 re-render）、Redux（太重）

---

## 2026-03-30: Canvas 渲染而非 DOM 元素

**决定**：音符和网格用 Canvas 绘制，不用 DOM 元素

**原因**：
- MIDI 文件可能有数千个音符，DOM 元素会卡
- 两层 Canvas（网格层 + 音符层）堆叠，hit-testing 用坐标计算
- 标准 piano roll 做法（FL Studio、Ableton 等都是自绘）

**代价**：需要手写 hit-testing，没有 DOM 事件的便利

---

## 2026-03-30: 选择状态存 UI Store 而非 Note 对象

**决定**：`isSelected` 不存在 Note 里，用 `Set<string>` 存在 uiStore

**原因**：
- 选择是纯 UI 状态，不应该污染数据模型
- 避免选择变化时深拷贝整个 notes 数组
- PRODUCT.md 里 Note 有 `isSelected`，但实际实现中分离更合理

---

## 2026-03-30: MIDI 导入导出用 @tonejs/midi

**决定**：用 `@tonejs/midi` 库处理 MIDI 文件解析和生成

**原因**：
- 成熟稳定，处理 MIDI 文件格式的各种边界情况
- 直接提供 tick 信息，不需要自己算
- 同时支持导入和导出

---

## 2026-03-30: 桌面/手机分离为独立 UI 层

**决定**：桌面版和手机版各有独立的组件树，共享 store/utils/hooks

**原因**：
- 触屏和键鼠的交互模型根本不同（单指滚动 vs 滚轮，捏合缩放 vs Ctrl+滚轮）
- 强行合并会导致交互冲突（单指拖拽既要滚动又要画音符）
- 分离后各端可以独立优化，不会互相牵制

**架构**：
- 共享层：`types/`, `store/`, `utils/`, `hooks/usePlayback.ts`
- 桌面：`components/PianoRoll/`, `components/Layout/` — 纯键鼠
- 手机：`components/mobile/` — 纯触屏，Option C 交互模型
- 入口：`useIsMobile()` 检测设备，渲染对应组件树

---

## 2026-03-30: 手机端采用 Option C 交互模型

**决定**：手机端默认单指滚动，工具栏切换进入编辑态

**原因**：
- 方案 A（工具模式严格分离）切工具太频繁
- 方案 B（长按延迟）不够直觉
- 方案 C 类似 GarageBand iPad 的做法，用户熟悉

**交互细节**：
- 默认态：单指 = 滚动，双指 = 捏合缩放
- 点工具按钮 → 进入编辑态（金色边框提示）
- 编辑态：单指 = 当前工具操作
- 点击激活的工具 / 点"完成" → 退出编辑态
