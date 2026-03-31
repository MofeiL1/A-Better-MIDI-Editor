# CLAUDE.md — 项目上下文（供 Claude Code 自动读取）

## 项目概况

Web MIDI 编辑器（Piano Roll），专注音乐创作而非完整 DAW。Apple 深色美学风格，部署在 GitHub Pages。

## 技术栈

- **框架**: React 18 + TypeScript + Vite
- **状态管理**: Zustand（projectStore + uiStore），快照式 undo/redo（最多50层）
- **渲染**: Canvas 绘制网格和音符（性能考虑，可能数千音符）
- **播放**: Tone.js（PolySynth + Transport 调度）
- **MIDI 文件**: @tonejs/midi（导入导出）
- **时间单位**: Tick（480 ticks/beat，DAW 标准）

## 项目结构

```
src/
├── types/          # model.ts（数据模型）, ui.ts（UI 状态类型）
├── store/          # projectStore.ts（项目数据+undo）, uiStore.ts（视口/工具/选择）
├── utils/          # timing.ts, music.ts, midi.ts, tonalSegmentation.ts
├── hooks/          # usePlayback.ts, useIsMobile.ts, useKeyboard.ts
├── components/
│   ├── PianoRoll/  # 桌面版（纯鼠标交互）
│   ├── mobile/     # 手机版（纯触屏，Option C 交互）
│   └── Layout/     # 桌面版布局和工具栏
└── App.tsx         # useIsMobile() 自动选择桌面/手机版
```

## 架构决策

- **桌面/手机分离**: 独立组件树，共享 store/utils/hooks。触屏和键鼠交互模型不同，不强行合并。
- **手机 Option C 交互**: 默认单指=滚动，工具栏切换进入编辑态后单指=工具操作。双指永远=缩放。
- **Canvas 中的 scrollY 必须用 Math.floor()**: 触摸滚动产生小数 scrollY，直接用于 pitchClass() 会导致不匹配。网格/音符的 pitch 迭代必须用 `Math.floor(scrollY)`，小数部分作为 y 偏移。参见 MobileNoteCanvas.tsx 和 MobilePianoKeys.tsx。
- **手机钢琴键用 DOM 而非 Canvas**: Canvas 的 `canvas.width = ...` 赋值会清空画布导致闪烁，窄条高对比文字特别明显。改用绝对定位 div。
- **选择状态存 uiStore**: `selectedNoteIds: Set<string>` 在 uiStore 而非 Note 对象上。
- **调性分段系统 (tonalSegmentation.ts)**: Grouped HMM 算法检测逐小节调性。72 个候选调（12 root x 6 mode）按音级集合（PC-set）分组为 ~36 组，HMM 在组级别运行避免同组调式浮动，滑动窗口 tonic 消歧（bass 频率 + V→I + 全局先验 + 大调偏好）将组后验展开到候选调。区域级别用二元概率（fitScore x tonicConfidence）独立评估每个调。
- **KeyStrip 组件**: Canvas 渲染，位于 ChordTrack 上方。稳定区域用纯色硬边界，transition/ambiguous 区域用渐变。悬浮显示详细调性分析（Top 5 候选 + fit/tonic/score 分项）。
- **Scale degrees 跟随区域调性**: NoteLayer 接收 tonalRegions，每个音符查找所属区域的 bestKey 计算音级。transition/ambiguous 区域内不显示 scale degree。
- **和弦分析跟随区域调性**: buildChordLabels 接收 regions，Roman numeral 根据每个和弦所在区域的调性计算。

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # TypeScript 检查 + Vite 构建
```

## 部署

- GitHub Pages，通过 GitHub Actions 自动部署（`.github/workflows/deploy.yml`）
- `vite.config.ts` 中 `base: '/A-Better-MIDI-Editor/'`（大小写敏感，必须匹配仓库名）

## 分支

- 默认/开发分支: `main`

## 代码规范

- **禁止在代码和 UI 中使用 emoji**：所有图标必须用 SVG。Emoji 只允许出现在文档（README、TASKS.md 等）的文字说明中。
- 按钮图标一律用内联 SVG（`fill="currentColor"` 或 `stroke="currentColor"`），跟随文字颜色变化。

## 已知注意事项

- Tone.js Transport.schedule 回调的 `time` 参数必须传给 triggerAttackRelease，否则音符在错误的 AudioContext 时间触发（无声）
- MIDI 导入时 `midi.header.ppq` 需要 `Object.defineProperty` 覆盖（getter-only 属性）
- `midi.toArray()` 返回值需要 `new Uint8Array(arr)` 包装才能用于 Blob
- 播放停止时用 `triggerAttack` + 单独调度 `triggerRelease`（不用 `triggerAttackRelease`），停止时 `sampler.releaseAll()` 才能正确发送 Note Off
- 空格键必须用 capture phase 拦截（`addEventListener(..., true)`），防止浏览器默认激活聚焦按钮导致 togglePlayback 被调用两次
- `play()` 是 async（等待 Tone.start() + sampler 加载），必须在入口立即设置 `isPlayingRef.current = true` 并加 re-entry guard，否则快速按两次空格会因竞态条件启动两个播放实例
- 调性分段的 transitionSharpness 默认值为 12（过低会产生假转调，过高会阻止真正的转调）
- 短区域（< 2 小节）会被合并到相邻较长区域，合并后相邻同调区域会再次合并

## 已知问题（待修复）

- **ii-V 与 I 被分到不同调性区域**: 同一个 ii-V-I 进行在某些调上（手动移调后）会被检测为 ii-V 属于一个调、I 属于另一个调。这说明 HMM 的转换概率或 tonic 消歧对某些 PC-set group 之间的边界不够稳定，转调位置会因绝对音高变化而浮动。
- **爵士乐中小调应合并为一类**: 目前 natural minor、harmonic minor、melodic minor 作为独立候选调参与检测（共 3 x 12 = 36 个小调候选）。但在爵士和声实践中，这三种小调是同一个调的不同形态（取决于旋律方向和和声语境），不应视为不同的调。应考虑将三种小调合并为一个 "minor" 类，PC-set group 中统一处理，减少同一小调内的无意义浮动。
