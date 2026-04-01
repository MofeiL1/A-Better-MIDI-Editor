# Chord System Design — Feature-Based Modeling

## 核心理念

用户凭直觉画音符 → 选中一组音符时系统按需分析并在 ChordTrack 显示结果 → 用户确认 group → 音符被标注为和弦对象。

**关键原则：**
- **音符是真实存在的对象，和弦是标注层。** Group 不删除音符，只建立关联。
- **不做实时被动检测。** 不选中任何音符时 ChordTrack 为空。只有用户选中音符时才按需运行一次检测。
- **不考虑旋律和复杂的同一和声内变化。** 第一版只处理"一组同时发声的音 = 一个和弦"。
- **先删后建。** 删掉现有自动分析系统，在干净的 piano roll 内核上构建新系统。

---

## 1. 数据模型

### 1.1 Voice

和弦内的每个声部。分两类记录方式：

- **Structural (1/3/5/7)**：四个基础槽位，degree + octave
- **Tension**：其余所有音，用距根音的半音数记录

```typescript
type Voice = {
  type: 'structural' | 'tension';
  degree?: 1 | 3 | 5 | 7;      // structural only
  octave?: number;               // structural only, 0 = close position from C0-B0
  interval?: number;             // tension only, semitones from deg1 oct0
};
```

**Octave 定义**：以该和弦原位、根音在 C0-B0 之间的最紧排列为 octave 0。例如 Cmaj7 close position = C0 E0 G0 B0，全是 octave 0。如果 E 在 E1，就是 octave 1。

**Slot 规则**：
- Slot 3：sus2 时 interval=2，sus4 时 interval=5，minor 时 interval=3，major 时 interval=4
- Slot 7：6th chord 时 interval=9，dim7 时 interval=9，m7 时 interval=10，maj7 时 interval=11
- 当 2 和 4 同时存在：4 占 slot 3（sus4），2 归 tension

### 1.2 ChordData

```typescript
type ChordData = {
  id: string;
  root: number;          // pitch class 0-11 (C=0, D=2...)
  quality: string;       // "m7", "maj7", "sus4", "7", "dim7"...
  rootMidi: number;      // root reference MIDI note (定位绝对音域)
  voices: Voice[];       // ordered bottom to top, 1:1 with noteIds
  noteIds: string[];     // 引用 clip.notes 中的实际 Note 对象
};
```

**关键设计决策**：
- `noteIds` 和 `voices` 严格 1:1 对应，按 pitch 从低到高排列
- **不包含 startTick / durationTicks / velocity** — 这些信息在被引用的 Note 对象上
- Group 不删除音符，只创建引用关系
- Ungroup 只删除 ChordData，音符保持不变

### 1.3 Clip 扩展

```typescript
type Clip = {
  id: string;
  startTick: number;
  notes: Note[];         // 所有音符（包括属于和弦的）
  chords: ChordData[];   // 用户创建的和弦标注，默认 []
};
```

### 1.4 QUALITY_MAP

Quality string → { degree slot → semitones from root } 的查找表：

```typescript
const QUALITY_MAP: Record<string, Record<number, number>> = {
  'maj':      { 1: 0, 3: 4, 5: 7 },
  'min':      { 1: 0, 3: 3, 5: 7 },
  'dim':      { 1: 0, 3: 3, 5: 6 },
  'aug':      { 1: 0, 3: 4, 5: 8 },
  'sus2':     { 1: 0, 3: 2, 5: 7 },
  'sus4':     { 1: 0, 3: 5, 5: 7 },
  'maj7':     { 1: 0, 3: 4, 5: 7, 7: 11 },
  '7':        { 1: 0, 3: 4, 5: 7, 7: 10 },
  'm7':       { 1: 0, 3: 3, 5: 7, 7: 10 },
  'mMaj7':    { 1: 0, 3: 3, 5: 7, 7: 11 },
  'dim7':     { 1: 0, 3: 3, 5: 6, 7: 9 },
  'm7b5':     { 1: 0, 3: 3, 5: 6, 7: 10 },
  'aug7':     { 1: 0, 3: 4, 5: 8, 7: 10 },
  'augMaj7':  { 1: 0, 3: 4, 5: 8, 7: 11 },
  '7sus4':    { 1: 0, 3: 5, 5: 7, 7: 10 },
  '6':        { 1: 0, 3: 4, 5: 7, 7: 9 },
  'm6':       { 1: 0, 3: 3, 5: 7, 7: 9 },
  '5':        { 1: 0, 5: 7 },
};
```

---

## 2. Chord Tone 级数标签

### 2.1 标签命名规则

标签由**音符实际 pitch** 和**和弦的 root + quality** 共同决定：

1. 计算 `semitones = (notePitchClass - chordRoot) mod 12`
2. 查 QUALITY_MAP：如果 semitones 匹配某个 structural slot → 用 structural 标签
3. 不匹配 → 用 tension 标签（根据和弦上下文选择升降号）

**Structural 标签**（由 degree slot + interval 决定）：

| Slot | Interval | Label |
|------|----------|-------|
| 1 | 0 | R |
| 3 | 2 | 2 (sus2) |
| 3 | 3 | b3 |
| 3 | 4 | 3 |
| 3 | 5 | 4 (sus4) |
| 5 | 6 | b5 |
| 5 | 7 | 5 |
| 5 | 8 | #5 |
| 7 | 9 | bb7 (dim7) / 6 (6th chord) |
| 7 | 10 | b7 |
| 7 | 11 | 7 |

**Tension 标签**（非 chord tone，根据和弦上下文）：

| Semitones | 有 major 3rd 时 | 有 natural 5th 时 | 默认 |
|-----------|----------------|-------------------|------|
| 1 | b9 | — | b9 |
| 2 | 9 | — | 9 |
| 3 | #9 | — | b3 |
| 4 | — | — | 3 |
| 5 | 11 | — | 4 |
| 6 | — | #11 | b5 |
| 7 | — | — | 5 |
| 8 | — | b13 | #5 |
| 9 | — | — | 13 |
| 10 | — | — | b7 |
| 11 | — | — | 7 |

### 2.2 标签显示逻辑

- **只有属于 ChordData 的音符显示级数标签**。标签从 ChordData 的 root + quality + 音符实际 pitch 实时计算。
- **自由音符（不属于任何和弦的）不显示任何 chord tone 标签。** 没有实时被动检测。
- 标签的视觉层级系统（颜色/大小根据 R > 3 > 7 > 5 > tension 分级）保留。

### 2.3 Quality 变更时的标签预览（第二版再做）

暂不实现。第一版中移动和弦内音符不触发 quality 变更检测。

---

## 3. 检测时机：按需分析

### 3.1 触发条件

- 用户选中 ≥2 个音符时，系统运行一次 `detectWithFallback`
- 结果显示在 ChordTrack 上：和弦名 + group 按钮
- 用户不选中音符 / 选中 <2 个音符时，ChordTrack 不显示任何检测结果

### 3.2 不做的事

- ~~实时被动检测所有音符~~ → 删除
- ~~自动 chord tone map~~ → 删除
- ~~Roman numeral~~ → 删除
- ~~Resolution detection (V→I 等)~~ → 删除
- ~~KeyStrip / tonal segmentation~~ → 删除
- ~~Scale degree 标注~~ → 删除

---

## 4. 操作定义（第一版）

### 4.1 Group (音符 → 和弦)

**触发**：选中 ≥2 个音符 → 按 P 键 / 点击 ChordTrack 上的 group 按钮

**逻辑**：
1. 按 pitch 排序选中音符
2. 提取 pitch class → 调用 `detectWithFallback` 检测 root + quality
3. 失败 → 不操作
4. 成功 → 对每个音符 `classifyVoice(pitch, root, quality)` 生成 Voice
5. 创建 ChordData，noteIds = 音符 ID 数组（pitch 排序后的顺序）
6. **不删除原始音符** — 只在 `clip.chords` 中添加 ChordData
7. 记入 undo

### 4.2 Ungroup (和弦 → 音符)

**触发**：选中和弦 → 按 D 键

**逻辑**：仅删除 ChordData，音符保持不变。记入 undo。

### 4.3 删除和弦

**触发**：选中和弦 → Delete 键

**逻辑**：与 ungroup 相同 — 删除 ChordData，音符保持不变。

### 4.4 暂不实现（第二版再做）

- 和弦移调（方向键上下移动整个和弦）
- 时间移动和弦（方向键左右）
- Quality 变更确认 UI
- 和弦内单音编辑时的 quality 自动检测
- 一个音符属于多个和弦的校验

---

## 5. 选择模型

- 点击和弦内音符 → **选中该音符**（不自动选中整个和弦）
- 在 ChordTrack 上点击和弦条 → 选中该和弦（高亮所有成员音符）
- `selectedChordId` 和 `selectedNoteIds` 互斥

---

## 6. 渲染规则

### 6.1 音符在 NoteLayer 中的渲染

- 和弦内音符和自由音符使用**完全相同**的 drawNote 渲染
- 和弦内音符额外在右侧显示级数标签（从 ChordData 驱动）
- 自由音符没有 chord tone 标签

### 6.2 ChordTrack

删除现有所有自动检测渲染后，ChordTrack 只显示两种东西：

1. **按需检测预览**：用户选中音符时，显示检测结果 + group 按钮
2. **已 group 的用户和弦**：青色条，位置从成员音符计算

### 6.3 已删除的显示

- ~~自动检测的蓝色半透明和弦条~~ → 删除
- ~~KeyStrip~~ → 删除
- ~~Roman numeral~~ → 删除
- ~~Scale degree~~ → 删除
- ~~Resolution arrows~~ → 删除

---

## 7. 播放

和弦内的音符已经在 `clip.notes` 中，正常调度播放。不需要额外的和弦播放逻辑。

---

## 8. MIDI 兼容

`Clip` 新增 `chords: ChordData[]` 字段，默认 `[]`。MIDI 导入时 clip 初始化为 `chords: []`。MIDI 导出时和弦数据不影响导出（音符本身就在 notes 中）。

---

## 9. Undo/Redo

group 和 ungroup 通过 `pushUndo` 纳入快照系统。与音符操作使用相同的 undo 机制。

---

## 10. 清理计划

在实现新功能前，先从 main 删除以下模块：

### 10.1 删除的文件/函数

| 目标 | 动作 |
|------|------|
| `src/utils/chordAnalysis.ts` 中的自动检测函数 | 删除 `detectChordsFromNotes`, `buildOverlapChordToneMap`, `pickBestChord` 等。保留 `detectWithFallback`（group 用） |
| `src/utils/chordDetection.ts` | 检查是否整个删除或保留部分 |
| `src/utils/tonalSegmentation.ts` | 整个删除 |
| `src/components/PianoRoll/KeyStrip.tsx` | 整个删除 |
| ChordTrack 中自动检测渲染 | 删除蓝色半透明条、N.C. 显示等 |
| NoteLayer 中 chord tone 标签 | 删除 `chordToneMap` 渲染逻辑 |
| NoteLayer 中 scale degree | 删除 |
| NoteLayer 中 Roman numeral | 删除 |
| NoteLayer 中 resolution labels | 删除 |
| PianoRoll 中自动检测调用 | 删除所有 `detectChordsFromNotes` / `buildOverlapChordToneMap` / `tonalResult` / `chordLabels` / `resolutions` |
| projectStore 中 `chordEvents` 相关 | 检查是否还需要 |
| uiStore 中 `scaleRoot` / `scaleMode` / `scaleAutoDetect` | 如果只被删除的功能引用则删除 |

### 10.2 保留的功能

| 功能 | 状态 |
|------|------|
| 画/选/移动/删除/resize 音符 | 保留 |
| Grid / Snap / Smart Snap | 保留 |
| Velocity Lane | 保留 |
| 播放 (Tone.js) | 保留 |
| MIDI 导入/导出 | 保留 |
| Undo/Redo | 保留 |
| PianoKeys | 保留 |
| Ruler / PlayheadHandle | 保留 |
| 方向键移动音符 | 保留 |
| Alt+拖动复制 / Ghost notes | 保留 |
| `detectWithFallback` | 保留（group 用） |
| `tonal.js` 依赖 | 保留（`detectWithFallback` 用到 `Chord.detect`） |

### 10.3 执行顺序

每步删完立即 `npm run build`，逐个 commit。

1. 删自动和声检测系统（最大的一刀）
2. 删 Roman numeral / KeyStrip / Scale degree
3. 清理 Store
4. 清理死代码和 import
5. 验证所有保留功能正常

---

## 11. 新文件结构（预期）

```
src/
├── types/
│   └── model.ts          ← + Voice, ChordData, Clip.chords
├── utils/
│   ├── voicing.ts         ← 新建：QUALITY_MAP, classifyVoice, getChordToneLabel, notesToChordData
│   ├── chordAnalysis.ts   ← 瘦身后保留 detectWithFallback + 依赖函数
│   ├── midi.ts            ← 保留
│   ├── timing.ts          ← 保留
│   └── music.ts           ← 保留
├── store/
│   ├── projectStore.ts    ← + groupNotes, ungroupChord
│   └── uiStore.ts         ← + selectedChordId
├── components/PianoRoll/
│   ├── PianoRoll.tsx      ← 大幅瘦身 + 按需检测逻辑
│   ├── NoteLayer.tsx      ← 瘦身 + chord tone 标签（ChordData 驱动）
│   ├── ChordTrack.tsx     ← 重写：按需预览 + 用户和弦
│   ├── Grid.tsx           ← 保留
│   ├── VelocityLane.tsx   ← 保留
│   ├── PianoKeys.tsx      ← 保留
│   ├── Ruler.tsx          ← 保留
│   └── PlayheadHandle.tsx ← 保留
└── hooks/
    ├── useKeyboard.ts     ← + P/D 快捷键
    └── usePlayback.ts     ← 保留（不需改动）
```
