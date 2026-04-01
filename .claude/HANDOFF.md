# Agent Handoff: Implement Chord Grouping System

## 你在哪

这是一个 Web MIDI Piano Roll 编辑器（React 18 + TypeScript + Vite + Zustand + Canvas + Tone.js）。

当前分支 `cleanup/remove-auto-analysis`（基于 `main`）刚刚完成了一轮大清理：删掉了所有自动和声分析系统（3488 行），保留了干净的 piano roll 编辑器内核。**代码编译通过，基础编辑功能正常。**

## 你要做什么

实现 **Chord Grouping 系统** — 用户选中音符后可以将其组合（group）为一个和弦对象，也可以解散（ungroup）和弦还原为独立音符。

**完整设计文档在 `CHORD_SYSTEM_DESIGN.md`（项目根目录，在 `feature/chord-data-model` 分支上，需要 cherry-pick 或手动复制过来）。** 这是经过多轮讨论确定的最终设计，务必通读。

## 术语

- **Group** = 将选中的音符组合为一个和弦（创建 ChordData）
- **Ungroup** = 解散和弦，音符恢复为独立音符（删除 ChordData）
- 代码中函数名用 `groupNotesAsChord` / `ungroupChord`，不要用 promote/demote

## 最关键的设计决策（不要改）

1. **音符是真实对象，和弦是标注层。** ChordData 通过 `noteIds: string[]` 引用 `clip.notes` 中的实际 Note 对象。Group 不删除音符，Ungroup 只删 ChordData。

2. **不做实时被动检测。** 只有用户选中 ≥2 个音符时才跑一次 `detectWithFallback`，结果显示在 ChordTrack 区域（目前是空的 placeholder div）。不选中时什么都不显示。

3. **第一版范围极小。** 只做：
   - Group（选中音符 → 点击 ChordTrack 上的 group SVG 图标按钮 → 创建 ChordData）
   - Ungroup（选中和弦 → 点击 ChordTrack 上的 ungroup SVG 图标按钮 → 删除 ChordData）
   - 在 ChordTrack 区域显示已 group 的和弦名
   - 在和弦成员音符右侧显示级数标签（R, b3, 5, b7 等）
   - 选中音符时在 ChordTrack 显示检测预览 + Group 按钮

4. **不做的事（第一版）：** 和弦移调、和弦拖动、quality 变更确认 UI、和弦内单音编辑检测、一个音属于多个和弦的校验。

## 交互规范（重要）

- **不要做键盘快捷键。** 所有操作都通过可视化的按钮触发。
- **按钮用 SVG 图标，不写文字。** 例如 group 用链接/组合图标，ungroup 用断开/拆散图标，确认用对勾 SVG，取消用叉叉 SVG。
- **按钮必须放在用户能很轻松看到和点击的位置。** 不要藏在右键菜单或角落里。ChordTrack 区域是主要的交互入口。
- **项目规定所有图标必须用内联 SVG（`fill="currentColor"` 或 `stroke="currentColor"`），禁止使用 emoji。** 见 CLAUDE.md。

## 你需要的文件

| 文件 | 看什么 |
|------|--------|
| `CHORD_SYSTEM_DESIGN.md` | **必读** — 完整设计：数据模型、操作定义、标签命名、渲染规则 |
| `CLAUDE.md` | 项目约定（禁止 emoji、SVG 图标、代码规范等） |
| `src/types/model.ts` | 现有数据模型（Note, Clip, Project）。你要在这里加 Voice, ChordData |
| `src/utils/chordAnalysis.ts` | 保留的 `detectWithFallback` — group 时用来识别和弦 |
| `src/store/projectStore.ts` | Zustand store，你要加 groupNotesAsChord / ungroupChord |
| `src/store/uiStore.ts` | UI 状态，你要加 selectedChordId |
| `src/components/PianoRoll/PianoRoll.tsx` | 主编排组件。ChordTrack 区域目前是空 div（~第 800 行） |
| `src/components/PianoRoll/NoteLayer.tsx` | 音符渲染。你要在这里加和弦成员的级数标签 |

## 实现顺序建议

**严格按顺序，每步 build 验证，每步 commit。**

1. **类型** (`model.ts`) — 加 Voice, ChordData, Clip.chords
2. **工具函数** (新建 `utils/voicing.ts`) — QUALITY_MAP, classifyVoice, getChordToneLabel, notesToChordData
3. **Store** (`projectStore.ts`) — groupNotesAsChord, ungroupChord；(`uiStore.ts`) — selectedChordId
4. **ChordTrack UI** — 在 PianoRoll 的 placeholder div 里：
   - 选中 ≥2 音符时：显示检测到的和弦名 + group 图标按钮
   - 已 group 的和弦：显示和弦条 + 和弦名，选中时显示 ungroup 图标按钮
   - 不选中时 / 选中 <2 音符时：空
5. **NoteLayer 标签** — 和弦成员音符右侧显示级数标签

## 前车之鉴（我踩过的坑）

- **不要一次加太多功能。** 之前尝试一次加完所有东西（types + store + UI + keyboard + playback + quality detection + ChordTrack + NoteLayer），bug 叠 bug 完全无法调试。一步一步来。
- **NoteLayer 里 chord voices 不要单独渲染。** 和弦音符就是普通 Note，用同一个 drawNote 渲染。区别只在右侧多一个级数标签。
- **voiceToMidi 计算必须用 root pitch class（0-11），不是 rootMidi。** rootMidi 只用来记录原始音域位置。`rootAtOct0(root)` = pitchClass + 12 是计算基准。
- **groupNotesAsChord 时 noteIds 必须按 pitch 排序，跟 voices 一一对应。** `notesToChordData` 内部按 pitch 排序，所以 noteIds 也要用排序后的顺序。
- **getChordToneLabel 必须根据和弦 quality 上下文决定升降号。** 设计文档 2.1 节有完整的标签命名表。dim7 的 9 半音 = "bb7"，6th chord 的 9 半音 = "6"，dom7 上 3 半音的 tension = "#9"。不能用固定的 semitone → name 映射。
- **检测只在用户选中音符时触发一次。** 不要加 useEffect 监听 notes 变化做实时检测。
- **MIDI 导入时 Clip 要加 `chords: []`。** 看 `src/utils/midi.ts` 第 63 行。

## 构建和测试

```bash
npm run build    # TypeScript 检查 + Vite 构建，必须无错误
npm run dev      # 启动开发服务器（用户自己跑）
```

## 验证清单

完成后手动测试：
1. 画 C E G B 四个音 → 全选 → 点击 ChordTrack 上的 group 按钮 → ChordTrack 出现 "Cmaj7" → 音符右侧出现 R / 3 / 5 / 7
2. 在 ChordTrack 点击和弦条 → 所有成员音符高亮
3. 点击 ungroup 按钮 → 和弦消失，音符恢复为自由音符
4. Undo → 和弦恢复
5. 只选 1 个音 → ChordTrack 不显示 group 按钮
6. 选一些无法识别的音 → ChordTrack 显示检测失败或不显示
7. 基础编辑功能（画/选/移/删/resize/velocity/播放/MIDI 导入导出）全部正常
