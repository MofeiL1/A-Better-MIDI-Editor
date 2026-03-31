# A Better MIDI Editor / 一个更好的 MIDI 编辑器

A web-based MIDI editor focused on getting the interaction details right.

一个专注于把交互细节做好的网页版 MIDI 编辑器。

[![Try it / 试试看](https://img.shields.io/badge/Open_in_Browser_%2F_%E5%9C%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E4%B8%AD%E6%89%93%E5%BC%80-e67e22?style=for-the-badge&logo=googlechrome&logoColor=white)](https://mofeil1.github.io/A-Better-MIDI-Editor/)

> `https://mofeil1.github.io/A-Better-MIDI-Editor/`

---

As a musician, I always felt like the tools in mainstream DAWs weren't quite there yet. I wanted to try building a better MIDI editor, so I started this project. Dark theme, editing interactions modeled after professional DAWs, and a few ideas of my own. Still a work in progress.

作为一名音乐人，我总觉得主流软件提供的编辑工具还不够完美。想试着做一个更好的 MIDI 编辑器，于是开了这个项目。深色主题、参考专业 DAW 设计的编辑交互，以及一些自己的想法。还在持续开发中。

## What's in it / 目前有什么

- **Chord Track with overlap-based detection** — Automatic chord detection based on note temporal overlap and beat-weight analysis (not fixed per-measure). Dedicated chord lane with draggable boundaries that move member notes. Click a chord to select all its notes.
- **和弦轨道（基于重叠检测）** — 根据音符时间重叠和强弱拍权重自动检测和弦（非固定按小节）。独立和弦条，可拖动边界联动内部音符。点击和弦即选中所有和弦内音。

- **Smart Snap** — Zoom-adaptive grid that automatically adjusts snap resolution as you zoom in/out (1/32 to whole bar). Like Logic Pro's Smart snap mode.
- **智能吸附** — 缩放自适应网格，放大时自动变细、缩小时自动变粗（1/32 到整小节），类似 Logic Pro 的 Smart 吸附模式。

- **Jazz chord symbols** — Optional display mode (Settings) that converts standard chord notation to jazz symbols: maj7 to triangle-7, dim to degree sign, m7b5 to slashed-circle-7.
- **Jazz 和弦符号** — 可选显示模式（设置面板），将标准和弦名转为 Jazz 符号：maj7 变 triangle-7，dim 变度数符号，m7b5 变斜线圆圈-7。

- **Alt+drag note duplication** — Hold Alt while dragging to copy notes (Logic Pro style). Ghost notes at the original position show move vs copy mode in real time.
- **Alt+拖动复制音符** — 拖动时按住 Alt 复制音符（Logic Pro 风格）。原位 ghost 实时切换移动/复制样式。

- **Chord analysis & resolution detection** — Overlap-based chord detection with on-beat/off-beat weighting, chord-tone badges (R, 3, 5, 7...), Roman numeral analysis, and resolution arrows (V-I, ii-V-I, tritone substitution with correct target quality).
- **和弦分析与解决关系检测** — 基于重叠的和弦检测（强弱拍权重），和弦内音标签（R, 3, 5, 7...），Roman numeral 分析，解决关系箭头（V-I、ii-V-I、三全音替代，根据目标和弦性质显示大小写）。

- **Auto key detection** — Detects the most likely key from your notes. Scores 72 candidates (12 roots x 6 modes) by note coverage and tonic chord presence. One-click confirm to lock.
- **自动调性检测** — 根据已有音符自动检测最可能的调性。对 72 个候选调（12 个根音 x 6 种调式）打分，参考音符覆盖率和主和弦存在性。一键确认锁定。

- **Scale degree notation** — Standard caret (^) notation showing degrees relative to the major scale with accidentals. Bass notes always display their degree below the note.
- **音阶级数标注** — 标准 ^ 记号，相对大调音阶显示级数及升降号。最低音始终在音符下方显示级数。

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

- **Modifier tool switching** — Hold Shift in Pencil mode for temporary Pointer; hold Ctrl/Cmd in Pointer mode for temporary Pencil. Cursor updates in real time.
- **修饰键临时工具切换** — Pencil 模式按住 Shift 临时切为 Pointer；Pointer 模式按住 Ctrl/Cmd 临时切为 Pencil。光标实时跟随。

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

- Voicing system (assign voicings to chord regions) / Voicing 系统（给和弦区域分配排列）
- Chord velocity visualization / 和弦内力度分布可视化
- User-created chord events / 用户手动创建和弦

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
