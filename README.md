# A Better MIDI Editor / 一个更好的 MIDI 编辑器

A web-based MIDI editor focused on getting the interaction details right.

一个专注于把交互细节做好的网页版 MIDI 编辑器。

[![Try it / 试试看](https://img.shields.io/badge/Open_in_Browser_%2F_%E5%9C%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E4%B8%AD%E6%89%93%E5%BC%80-e67e22?style=for-the-badge&logo=googlechrome&logoColor=white)](https://mofeil1.github.io/A-Better-MIDI-Editor/)

> `https://mofeil1.github.io/A-Better-MIDI-Editor/`

---

As a musician, I always felt like the tools in mainstream DAWs weren't quite there yet. I wanted to try building a better MIDI editor, so I started this project. Dark theme, editing interactions modeled after professional DAWs, and a few ideas of my own. Still a work in progress.

作为一名音乐人，我总觉得主流软件提供的编辑工具还不够完美。想试着做一个更好的 MIDI 编辑器，于是开了这个项目。深色主题、参考专业 DAW 设计的编辑交互，以及一些自己的想法。还在持续开发中。

## What's in it / 目前有什么

- **Velocity-colored notes** — Note and velocity bar colors both reflect velocity (purple → red), with bidirectional hover highlight between the two.
- **力度色谱音符** — 音符和力度柱颜色都映射力度值（紫→红），上下悬停联动高亮。

- **Gesture-based undo** — Every drag gesture is a single undo step. Selection state is included in history.
- **手势级撤销** — 每个拖拽手势是一步撤销。选区状态也纳入历史。

- **Precise velocity editing** — Grab zone at bar top only. Relative drag with no jump on grab. Draw-order-aware hit testing so hidden bars can't be accidentally selected. Multi-note batch editing.
- **精确的力度编辑** — 只有柱顶可抓取，相对拖拽无跳变，绘制顺序感知的碰撞检测防止误选被遮挡的柱，多音符批量编辑。

- **MIDI import with track picker** — Multi-track files show a selection dialog. Empty conductor tracks are filtered automatically.
- **带轨道选择的 MIDI 导入** — 多轨文件弹出选择对话框，空的指挥轨自动过滤。

- **Interactive piano keyboard** — Hold to audition, drag for glissando, click to select all notes at a pitch. Labels follow the selected key.
- **可交互的钢琴键盘** — 按住试听，拖动刮奏，点击选中同音高音符，标签跟随所选调式。

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
| 鼠标中键按住拖动 Hold Middle Mouse | Joystick pan — speed follows distance from origin 摇杆式平移，速度随离原点距离变化 |
| Ctrl+滚轮 Scroll | Zoom (centered on playhead) 缩放（以播放头为中心） |
| Shift+滚轮 Scroll | Horizontal scroll 水平滚动 |
| 滚轮 Scroll | Vertical scroll 垂直滚动 |
| 触控板两指滑动 Trackpad | Pan in any direction 任意方向平移 |

## Tech / 技术栈

React 18, TypeScript, Vite, Zustand, Tone.js, Canvas. No backend.

## Planned / 计划中

- **Smart Snap / 智能吸附** — Snap resolution adapts to mouse drag speed. [Design doc / 设计文档](TASKS.md)
- **智能吸附** — Snap 粒度随鼠标拖拽速度自适应。
- Chord velocity visualization / 和弦内力度分布可视化
- Editable BPM & key signature / 可编辑 BPM 和调号

## Run locally / 本地运行

```bash
npm install
npm run dev
```

## License

Copyright (c) 2026 Mofei Li (MofeiL1). All rights reserved.

You may use this software freely to create music — any music you make is entirely yours. However, the source code, software design, and UI/UX concepts may not be used, copied, modified, or distributed for any commercial purpose without explicit permission from the author.

你可以自由使用本软件创作音乐——你做的音乐完全属于你。但本项目的源代码、软件设计和交互设计不得以任何形式用于商业目的，除非获得作者的明确许可。
