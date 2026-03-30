# PRODUCT.md — MIDI 创作工作台

> 这是项目的核心文档。每次开启新的 AI 对话，先把这个文件丢给 AI。

-----

## 产品定位

一个**专为音乐写作而生的 MIDI 编辑器**，不是 DAW 替代品。核心差异化在三个方向的交叉：

- **感知层**：比现有 DAW 更聪明的 piano roll（音阶/和弦感知、智能选择、高级 velocity 编辑）
- **表情层**：MPE 级别的音符内部控制（滑音、颤音、弯音可视化）
- **理论层**：实时和声分析 + 规则检查（古典/爵士乐理，色彩张力评分）

写完之后导出 MIDI 到其他 DAW 混音。

### 两种目标形态

1. **网页独立工具**：加载轻量音源，随时随地写音乐，先做这个
1. **DAW 配套工具**：通过 Virtual MIDI Port 与 DAW 双向同步，第二阶段

### 明确不做的事

- 不做 DAW 插件形式
- 不用机器学习
- 第一版不做混音/音频引擎
- MPE 滑音颤音系统在 piano roll 核心完成后再做

-----

## 技术选型

- **协议**：MPE（不是 MIDI 2.0，生态更成熟）
- **平台**：网页端，React + TypeScript + Tone.js
- **时间单位**：Tick（DAW 惯例，`ticksPerBeat` 通常为 480）
- **Undo**：第一版纯快照（Snapshot），数据量小，实现简单

-----

## 数据结构

### 核心原则

- 编辑器内部用 `startTick + duration`，不存 `noteOff`（DAW 业界惯例）
- 导出时计算 `noteOff = startTick + duration`，反向转换成 MIDI 文件格式
- 每种数据只有一个真相来源，不存冗余字段

### 完整类型定义

```typescript
// ─── Project 层（全局） ───────────────────────────────────

type Project = {
  name: string
  ticksPerBeat: number          // 1拍 = N tick，通常 480
  tracks: Track[]

  // 全局时间/调性信息，不属于任何 Track
  tempoChanges: TempoChange[]
  timeSignatureChanges: TimeSignatureChange[]
  keyChanges: KeyChange[]
  chordRegions: ChordRegion[]   // 用户手动标记的和弦区域

  history: ProjectSnapshot[]    // Undo 快照栈
}

type TempoChange = {
  tick: number
  bpm: number
}

type TimeSignatureChange = {
  tick: number
  numerator: number             // 几拍，如 4
  denominator: number           // 几分音符一拍，如 4
}

type KeyChange = {
  tick: number
  key: string                   // 如 "C major"、"A minor"
}

// 用户在时间轴上手动框出的和弦区域
// 这个区域内的音符被视为一个和弦，用于 velocity 垂直编辑、选最低音等操作
// 未来可以加自动识别逻辑，只需自动生成 ChordRegion，编辑功能不需要改
type ChordRegion = {
  startTick: number
  endTick: number
}

// ─── Track 层 ────────────────────────────────────────────

type Track = {
  id: string
  name: string                  // 如 "小提琴"、"钢琴"
  instrument: string
  clips: Clip[]
  muted: boolean
  solo: boolean
}

// ─── Clip 层 ─────────────────────────────────────────────

type Clip = {
  id: string
  startTick: number             // Clip 在 Track 时间轴上的位置
  notes: Note[]
}

// ─── Note 层（最核心） ────────────────────────────────────

type Note = {
  id: string
  pitch: number                 // 0–127，60 = C4
  startTick: number
  duration: number              // 单位：tick（不存 noteOff，按需计算）
  velocity: number              // 0–127
  channel: number               // MPE 用，每个音符分配独立通道
  isSelected: boolean           // 编辑器 UI 状态
  pitchBend: BendPoint[]        // MPE 每音独立弯音曲线
}

// ─── MPE 弯音曲线 ─────────────────────────────────────────

type BendPoint = {
  tick: number                  // 相对于音符 startTick 的偏移（0 = 音头）
  value: number                 // -8192 到 +8191，0 = 不弯
  curveHandle?: {               // 贝塞尔曲线手柄（可选）
    x: number
    y: number
  }
}

// ─── Undo 快照 ────────────────────────────────────────────

type ProjectSnapshot = {
  timestamp: number
  state: Omit<Project, 'history'>
}
```

-----

## 关键设计决定

### 关于 ChordRegion

- 和弦/调性信息存在 **Project 层**，不在 Track 或 Clip 里
- 原因：和声分析需要所有声部一起看，单轨和弦信息没有意义（Dorico/Sibelius 的做法）
- 琶音识别逻辑暂不做，用户手动标记柱状和弦区域

### 关于 MPE Pitch Bend

- 每个音符的 `pitchBend` 数组，**第一个点（tick=0）的 value 必须显式存储**，不能假设为 0
- 原因：MPE 音源会记住通道上一次的 pitch bend 状态。新音符 Note On 前必须先发送起始 bend 值，否则音高会从上一个音符结束时的状态开始
- 软件导出 MIDI 时自动在 Note On 前插入起始 bend 事件，用户不需要手动操作

### 关于 Undo

- 第一版：纯快照（每次操作前复制整个 Project 状态）
- 理由：MIDI 数据量小（几百 KB），50 个快照也就几十 MB，实现两小时搞定
- 等真正遇到性能问题再迁移到命令模式（Command Pattern）

-----

## MVP 功能范围（第一版）

按优先级顺序：

1. **Piano roll 渲染**：加载 MIDI 文件，显示音符方块，正确处理 tick 坐标系
1. **音阶/和弦感知**：琴键列高亮当前调性音，标注非调内音，显示和弦功能（根音/三音/七音）
1. **基础编辑**：点击添加、拖拽移动、拖拽改时长、删除、Undo
1. **智能选择**：框选后可选"最低音"/"第N低音"/"按时值筛选"
1. **Velocity 垂直编辑模式**：选中和弦内音符，velocity 按音高从低到高排列显示和编辑
1. **MIDI 导入导出**

**第一版不做**：MPE 滑音系统、网页音源、DAW 集成、和声规则检查

-----

## 开发工具

- **主力**：Claude Code（从零搭架构，跨文件操作）
- **日常编辑**：Cursor（骨架建好后）
- **语言**：TypeScript

-----

## 上下文文件约定

|文件            |内容                 |
|--------------|-------------------|
|`PRODUCT.md`  |产品定位、数据结构、设计决定（本文件）|
|`TASKS.md`    |当前在做什么、下一步、决定不做什么  |
|`DECISIONS.md`|技术决策日志（为什么选这个方案）   |


> 每次对话结束前，让 AI 更新这三个文件。
