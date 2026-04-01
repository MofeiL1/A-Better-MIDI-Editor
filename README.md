# A Better MIDI Editor / 一个更好的 MIDI 编辑器

A web-based MIDI editor focused on getting the interaction details right.

一个专注于把交互细节做好的网页版 MIDI 编辑器。

[![Try it / 试试看](https://img.shields.io/badge/Open_in_Browser_%2F_%E5%9C%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E4%B8%AD%E6%89%93%E5%BC%80-e67e22?style=for-the-badge&logo=googlechrome&logoColor=white)](https://mofeil1.github.io/A-Better-MIDI-Editor/)

> `https://mofeil1.github.io/A-Better-MIDI-Editor/`

---

As a musician, I always felt like the tools in mainstream DAWs weren't quite there yet. I wanted to try building a better MIDI editor, so I started this project. Dark theme, editing interactions modeled after professional DAWs, and a few ideas of my own. Still a work in progress.

作为一名音乐人，我总觉得主流软件提供的编辑工具还不够完美。想试着做一个更好的 MIDI 编辑器，于是开了这个项目。深色主题、参考专业 DAW 设计的编辑交互，以及一些自己的想法。还在持续开发中。

## Features / 主要功能

### Also included / 其他功能

- Smart Snap — Zoom-adaptive grid, auto-adjusts resolution as you zoom (1/32 to whole bar).
- 智能吸附 — 缩放自适应网格，放大时自动变细、缩小时自动变粗。
- Alt+drag duplication — Copy notes Logic Pro style, ghost notes show move vs copy in real time.
- Alt+拖动复制音符 — Logic Pro 风格，原位 ghost 实时切换移动/复制样式。
- Velocity-colored notes with bidirectional hover highlight between note layer and velocity lane.
- 力度色谱音符，音符层和力度柱双向悬停联动高亮。
- Gesture-based undo — Every drag gesture is one undo step, selection state included in history.
- 手势级撤销 — 每个拖拽手势一步撤销，选区状态纳入历史。
- Precise velocity editing — Top-grab only, relative drag, draw-order-aware hit testing, batch editing.
- 精确力度编辑 — 柱顶抓取，相对拖拽无跳变，绘制顺序感知碰撞检测，批量编辑。
- MIDI import/export with multi-track picker.
- 带轨道选择的 MIDI 导入导出。
- Interactive piano keyboard — Hold to audition, drag for glissando, click to select by pitch.
- 可交互钢琴键盘 — 按住试听，拖动刮奏，点击选中同音高音符。
- Modifier tool switching — Shift for temporary Pointer, Ctrl/Cmd for temporary Pencil.
- 修饰键临时工具切换。

## Shortcuts / 快捷键

| Key / 按键 | Action / 功能 |
|-----|--------|
| 空格 Space | Play / Stop 播放/停止 |
| 1 / 2 / 3 | Pointer / Pencil / Eraser 指针/画笔/橡皮 |
| Ctrl/Cmd+Z | Undo 撤销 |
| Ctrl/Cmd+Shift+Z 或 Ctrl+Y | Redo 重做 |
| Ctrl/Cmd+C / V | Copy / Paste at playhead 复制/粘贴 |
| Ctrl/Cmd+A | Select all 全选 |
| Delete / Backspace | Delete selected 删除选中 |
| Escape | Clear selection 清除选区 |
| Shift+单击 Click | Add to selection 加选 |
| Arrow keys 方向键 | Move selected notes (left/right by snap, up/down by semitone) 移动选中音符 |
| Shift+Up/Down 上/下 | Move selected notes by octave 移动选中音符一个八度 |
| Alt+Drag 拖动 | Duplicate notes (release Alt before mouseup to cancel) 复制音符 |
| Shift (Pencil mode) | Temporary Pointer tool 临时切换为指针工具 |
| Ctrl/Cmd (Pointer mode) | Temporary Pencil tool 临时切换为画笔工具 |
| 鼠标中键按住拖动 Hold Middle Mouse | Joystick pan — speed follows distance from origin 摇杆式平移，速度随离原点距离变化 |
| Ctrl+滚轮 Scroll | Zoom (centered on playhead) 缩放（以播放头为中心） |
| Shift+滚轮 Scroll | Horizontal scroll 水平滚动 |
| 滚轮 Scroll | Vertical scroll 垂直滚动 |
| 触控板两指滑动 Trackpad | Pan in any direction 任意方向平移 |

## Tech / 技术栈

React 18, TypeScript, Vite, Zustand, Tone.js, Canvas. No backend.

## Planned / 计划中

- Chord grouping — select notes and group them into a named chord object with degree labels / 和弦编组 — 选中音符后组合为带级数标签的和弦对象
- Voicing transforms — apply drop-2, rootless, voice leading to grouped chords / Voicing 变换 — 对和弦编组应用 drop-2、rootless、声部进行等操作
- Chord velocity visualization / 和弦内力度分布可视化

## Future Outlook / 未来展望

- **Rule-Based Arpeggio & Accompaniment / 基于规则的琶音与伴奏生成** — Define rhythm patterns and pitch rules to automatically expand chords into arpeggios and accompaniment figures. Built-in presets (Alberti bass, broken chords, etc.) with full custom rule support. Deterministic and fully controllable — no black boxes.
- **基于规则的琶音与伴奏生成** — 定义节奏型和音高规则，自动将和弦展开为琶音和伴奏织体。内置常见模式（阿尔贝蒂低音、分解和弦等），支持自定义规则。确定性，完全可控，没有黑箱。

- **Melody Analysis & Variation Management / 旋律分析与变奏管理** — Automatic motif and phrase structure recognition. A variation tree that lets you save multiple versions of the same passage and switch between them for comparison. Built-in transformation helpers: inversion, retrograde, rhythmic augmentation/diminution, and more.
- **旋律分析与变奏管理** — 自动识别旋律动机与乐句结构。变奏版本树，对同一段旋律保存多个变奏，随时切换对比。内置变奏手法辅助：倒影、逆行、节奏扩大/缩小等。

> **No Generative AI / 不包含生成式 AI 功能** — This project does not include and will never incorporate generative AI features. We will never use unauthorized music from others in development. This is a tool that empowers creators — not one that replaces them.
>
> 本项目不包含、未来也不会加入生成式人工智能功能。制作过程中绝不使用未经授权的他人音乐。这是一个赋能创作者的工具，而不是替代创作者的工具。

## Run locally / 本地运行

```bash
npm install
npm run dev
```

## License

Copyright (c) 2026 Mofei Li (MofeiL1). All rights reserved.

You may use this software freely to create music — any music you make is entirely yours. However, the source code, software design, and UI/UX concepts may not be used, copied, modified, or distributed for any commercial purpose without explicit permission from the author.

你可以自由使用本软件创作音乐——你做的音乐完全属于你。但本项目的源代码、软件设计和交互设计不得以任何形式用于商业目的，除非获得作者的明确许可。
