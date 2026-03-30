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
├── utils/          # timing.ts, music.ts, midi.ts
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

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # TypeScript 检查 + Vite 构建
```

## 部署

- GitHub Pages，通过 GitHub Actions 自动部署（`.github/workflows/deploy.yml`）
- `vite.config.ts` 中 `base: '/A-Better-MIDI-Editor/'`（大小写敏感，必须匹配仓库名）

## 分支

- 开发分支: `claude/midi-editor-product-spec-dbOah`

## 已知注意事项

- Tone.js Transport.schedule 回调的 `time` 参数必须传给 triggerAttackRelease，否则音符在错误的 AudioContext 时间触发（无声）
- MIDI 导入时 `midi.header.ppq` 需要 `as unknown as Record<string, unknown>` 类型转换
- `midi.toArray()` 返回值需要 `new Uint8Array(arr)` 包装才能用于 Blob
