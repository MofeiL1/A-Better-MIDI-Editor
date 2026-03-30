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
