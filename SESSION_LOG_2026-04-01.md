# Session Log — 2026-04-01

## Branch: `feature/melody-chord-role`

---

## 一、今天做了什么

### 1. Melody/Chord Role 系统（核心功能）
- `Note` 类型新增 `role?: 'melody' | 'chord'` 字段
- 新建 `noteRole.ts`：基于 anchor 的近邻算法
  - 多音符 tick 用 top-note 启发式（最高音 = melody）
  - 单音符 tick 用加权距离评分：`score = pitchDist + tickDist/480 * TIME_WEIGHT`
  - 导出 `computeRoleMap`、`anchorScore`、`predictRole`
- Auto-legato 改为 role-aware：melody 只看 melody 的下一个音，chord 只看 chord 的
- hitTest 改为两遍扫描：melody 优先于 chord

### 2. 视觉重设计
- **颜色编码 role**：melody = 蓝 `hsl(210, 80%, 60%)`，chord = 橙 `hsl(30, 75%, 58%)`
- **粗细编码 velocity**：`tailH = pps * (0.3 + vel/127 * 0.5)`
- **透明度编码 velocity**：`alpha = 0.70 + vel/127 * 0.30`，head 永远不透明
- 删除了旧的 `velocityToHue`/`noteColor`/`noteColorRgba` 彩虹色系统

### 3. Heatmap 预览系统
- 预计算 Int8Array 网格，240 tick 分辨率
- 包含 top-note 启发式（同 tick 有音符时，上方 = melody，下方 = chord）
- 无音符时也显示（全蓝 = 任何位置都是 melody）
- 超出预算范围的 cell 用 `defaultValue` 填充
- Ghost preview 直接查表 O(1)，和 heatmap 100% 一致
- Settings 面板新增 "Role heatmap" 开关

### 4. 性能优化（大量工作）
- `useShallow` 改造 PianoRoll 的 store 订阅，排除 `playheadTick`
- `PlayheadLine` 独立组件，Ruler/PlayheadHandle 各自读 `playheadTick`
- Heatmap 从每帧重算 → 预计算 + 每帧只查表 fillRect
- `canvas.width` 赋值优化：只在尺寸变化时重新分配
- `shadowBlur` 替换为 `stroke` 描边 glow
- 播放期间抑制 hover 重绘
- DotPreview 独立到 overlay canvas
- 播放调度优化：`computeNullDurations` 一次性预算，`audioLatency` 0.05→0.1

### 5. 交互改进
- Role 操作从 canvas 浮动按钮 → 右键上下文菜单
- Press-drag-release 模式：右键按下选中音符 + 弹菜单 → 拖到选项 → 松开执行
- 移除了 auto-baking（`addNote` 不再强制写入 role），改为动态计算

---

## 二、思维过程和设计决策演变

### 决策 1：Flex/Fixed 音符的视觉区分

**初始想法**：用透明度区分（flex = 30% 透明，fixed = 85%）——这是之前已有的设计。

**第一次转向**：四角色讨论后全票认为"透明度应该编码 velocity 而非 duration type"。决定用几何尾部来区分：
- Flex 音符：尖头 ▷（"继续流向下一个音"）
- Fixed 音符：喇叭形 ╱│╲（"到此为止"）

**实现过程中的坑**：
- End cap 方向画反了（▷ 而非 ◁）
- End cap 高度用固定值 `headH * 0.6`，在高 velocity 时比 body 还小，被 body 盖住
- 两个独立 shape（body + tail）有透明度叠加导致颜色不一致
- 改成单个 path 后，body 和 tail 的拐角处有硬角
- 加圆角后，高 velocity 时 flare 太小放不下圆角，出现裂缝
- 改成自适应圆角后，又出现"某个 velocity 阈值处圆角突然跳变"的问题
- 改成"角度自适应"（60° → 90°）但右侧竖线角落的圆角又在跳变

**第二次转向（Steve Jobs 时刻）**：开发者自己越看越觉得别扭——"如果这个东西不美，就算再好用我也不能接受"。召集五角色讨论（加入 Steve Jobs 视角）。

**Jobs 的核心观点**："那些箭头和喇叭形状是从几何课本里跑出来的东西，不是从乐谱里长出来的。最好的设计是你根本注意不到它，直到你需要它的那一刻。"

**最终决定**：删除所有尾部几何装饰。Extension line 就是一个干净的 `roundRect`。Flex 和 fixed 的区别通过交互发现（拖拽行为不同），不通过视觉强塞。回到安静。

**教训**：功能性正确 ≠ 设计正确。有时候"语义更精确"的方案反而破坏了整体美感。应该更早信任直觉。

---

### 决策 2：颜色通道的分配

**初始状态**：颜色 = velocity（紫→红彩虹），chord = 白色三角 + 75% 透明度

**四角色讨论共识**：
| 视觉通道 | 编码信息 |
|----------|---------|
| 色相     | Role（melody=蓝, chord=橙）|
| 粗细     | Velocity（主通道）|
| 透明度   | Velocity（辅助通道，0.70-1.00）|

**关键子决策**：
- Flex body 不加额外透明度（之前 PM+设计师的 spec 里有 `×0.5`，被开发者自己否决——和"透明度只编码 velocity"的原则矛盾）
- Head 三角永远不透明（保证角色颜色清晰可辨）
- 高光渐变从"仅 melody"改为"melody + chord 都有"

---

### 决策 3：Role Baking 的取舍

**初始设计**：`addNote` 时 bake 所有音符的 role，防止后续添加/删除音符时已有音符的 role 变化。

**发现的问题**：
- 在 melody 音符正上方放新音符 → heatmap 显示蓝色（melody）→ 实际变成 chord（因为旧音符 baked role 优先）
- Heatmap "说一套做一套"，破坏用户信任

**五角色讨论（含 Jobs）**：全票方案 A — 移除 auto-baking。
- `note.role` 只用于用户手动标记（右键菜单 Set as Melody/Chord）
- 动态 `computeRoleMap` 在渲染时计算，尊重手动标记
- 新的 top-note 自然成为 melody，heatmap 承诺兑现

**实现**：删除 `addNote` 里的 4 行 baking 代码。极简改动，最大收益。

---

### 决策 4：Role 操作按钮的位置

**初始设计**：Canvas 绘制的浮动按钮，跟随选区。

**问题**：按钮经常挡住用户想操作的区域。选中音符后想画下一个音符，结果点到按钮上。

**经历了多次位置调整**：
1. 左对齐音符左侧 → 挡住前面的音符
2. 右对齐音符左侧 + padding → 还是挡住
3. 位置不对称问题 → 多次微调

**五角色讨论最终方案**：全票移到右键上下文菜单。理由：
- 使用频率极低（自动检测覆盖大多数场景）
- 低频功能不应该占据常驻 UI
- 画布 100% 还给音符编辑
- Press-drag-release 模式比浮动按钮更快（不用移鼠标找按钮）

---

### 决策 5：性能优化的层层深入

**问题演进**：
1. 音符多时丢音 → `audioLatency` 从 0.05 提到 0.1 + 预算 null durations
2. 播放时鼠标移动卡顿 → 发现 heatmap 每帧重算 → 改为预计算 + 查表
3. 还是卡 → 发现 `PianoRoll` 用 `useUiStore()` 无 selector，`playheadTick` 60fps 更新导致整个组件树重渲染 → `useShallow` 改造
4. 还是卡 → 发现 `shadowBlur` 是 Canvas 中最昂贵的操作 → 替换为 stroke 描边
5. flex tool 移动鼠标卡 → `dotPreview` 每次变化触发 NoteLayer 全量重绘 → 抽出到独立 overlay canvas
6. hover 也触发全量重绘 → 播放期间抑制 hover

**教训**：性能问题往往是多个小问题叠加。每一层优化都有效果，但真正的瓶颈可能藏在意想不到的地方（比如 `useUiStore()` 不带 selector 这种一行代码的问题）。

---

## 三、当前状态和待办

### 已完成 ✅
- [x] Role 数据模型和算法
- [x] Role-aware auto-legato
- [x] 颜色系统（role-based blue/orange）
- [x] 粗细+透明度编码 velocity
- [x] Heatmap 预览（含 top-note 逻辑）
- [x] Ghost preview 与 heatmap 一致
- [x] 右键 press-drag-release 菜单
- [x] 性能优化全套
- [x] 移除 auto-baking

### 待完成 🔲
- [ ] 测试 role 系统在各种场景下的准确性（琶音、voice leading、upper structure voicing）
- [ ] Heatmap 在有 same-tick 音符时的 240-tick 采样精度可能不够
- [ ] 右键菜单的视觉打磨（当前是最简 DOM 实现）
- [ ] velocity lane 是否需要适配新的颜色系统
- [ ] 移动端（mobile/）组件尚未适配任何改动
- [ ] CLAUDE.md 需要更新（新增 noteRole.ts、颜色系统、性能架构等）
- [ ] 回归测试：MIDI 导入导出、播放、undo/redo 是否被影响

### 已知问题 ⚠️
- Heatmap 竖条纹：有音符的 tick 处 top-note 规则产生锐利的蓝/橙分界线，与相邻空 tick 的 proximity 过渡不连续
- 高 velocity 的 fixed 音符退化为纯 roundRect 时 flare 消失（设计上可以接受，但视觉过渡需要验证）
