# TASKS.md — 当前任务跟踪

## 已完成

- [x] 项目脚手架搭建（Vite + React + TypeScript）
- [x] 核心数据类型定义（Project, Track, Clip, Note, BendPoint 等）
- [x] Zustand store 设计与实现（projectStore + uiStore）
- [x] 工具函数：tick/pixel 转换、吸附、音乐理论（音阶/和弦检测）
- [x] Piano Roll 核心渲染（Canvas：网格 + 音符层 + 琴键列）
- [x] 音阶感知高亮（琴键和网格行按调性着色）
- [x] 基础编辑交互（绘制/选择/擦除工具、拖拽移动、缩放时长）
- [x] Velocity Lane（力度柱状图编辑）
- [x] 键盘快捷键（1/2/3 切工具、Delete 删除、Ctrl+Z/Y 撤销重做、Space 播放）
- [x] MIDI 导入导出（@tonejs/midi）
- [x] Undo/Redo 快照系统
- [x] 工具栏 UI — Apple 美学风格（毛玻璃、段落控件、圆角）
- [x] GitHub Pages 自动部署（GitHub Actions）
- [x] 播放功能（Tone.js PolySynth + 播放头 + Transport 调度）
- [x] 桌面/手机端分离架构 → 已改为纯桌面端，手机显示提示

### 2026-03-30 完成

- [x] Logic Pro 风格桌面 UI 完整重写（深色主题、velocity 色谱音符、写实琴键）
- [x] Salamander Grand Piano 采样器（正确的 MIDI Note Off 停止）
- [x] Ruler + 底部 PlayheadHandle（小节/拍标记、可拖拽播放头）
- [x] 绝对位置追踪（音符移动/缩放/裁剪头部，无 delta 累积误差）
- [x] 画笔工具：创建后拖拽同时设置音高和时长
- [x] Undo 合并：beginDrag/endDrag 确保每个手势一个 undo 步骤
- [x] 选区状态存入 undo 历史
- [x] 音符预览：新预览打断旧预览，使用实际时长和力度
- [x] 复制粘贴（Ctrl+C/V）在播放头位置粘贴
- [x] 空格键全局拦截播放/停止
- [x] 中键摇杆式平移
- [x] 缩放以播放头为中心
- [x] Shift+点击加选（音符和 velocity 柱）
- [x] 全局 document mouseup（防止拖拽状态卡死）
- [x] VelocityLane 完整重写：velocity 色谱、精确抓取区、绘制顺序感知 hit test、双向 hover 高亮联动 NoteLayer、相对拖拽（无跳变）、可调大小、点击选中音符、多选同步修改 velocity
- [x] MIDI 导入修复（PPQ getter 变通、UI 状态重置、过滤空轨道、多轨选择对话框、合并到单 clip）
- [x] MIDI 导出修复（PPQ 只读属性、DOM 挂载下载链接）
- [x] 钢琴键交互：点击试听（按住持续、松手停止、支持刮奏）、点击选中同音高音符、Shift 加选、根据选中 Key 显示主音标签、空键清除选区
- [x] Snap 修复：公式从 `ticksPerBeat/division` 改为 `ticksPerBeat*4/division`，Grid 同步
- [x] Ctrl+滚轮缩放拦截浏览器页面缩放（native addEventListener passive:false）
- [x] 深色 dropdown（colorScheme: dark）
- [x] 删除移动版组件，手机访问显示中英文提示框
- [x] 默认分支改为 main，GitHub Pages 部署从 main 触发

### 2026-03-30 完成（第二批）

- [x] README 添加未来展望章节（可视化乐理、基于规则的琶音/伴奏生成、旋律分析与变奏管理）
- [x] README 添加无生成式 AI 声明
- [x] 页面刷新/关闭前弹出浏览器确认对话框，防止意外丢失未导出的工作

### 2026-03-30 完成（第三批）

- [x] 重命名系统（项目名可编辑，铅笔 SVG 图标，Enter/Escape 确认，focus 时图标亮）
- [x] 可更改 Time Signature（分子/分母下拉选择，影响 Grid/Ruler/PlayheadHandle，公式 ticksPerBeat*numerator*4/denominator）
- [x] BPM 可编辑（导入后可修改，带 undo）
- [x] 播放控件/撤销重做图标全部换为 SVG（禁止代码中使用 emoji）
- [x] 所有控件按钮 hover 高亮效果
- [x] 播放/空格 bug 修复（capture phase 拦截 + stopPropagation，按钮 tabIndex={-1}，消除双重 toggle）
- [x] 钢琴键 Shift+拖选改为范围模式（起始→当前 pitch 连续范围，反向缩小，不再 toggle 抖动）
- [x] 钢琴键选区操作纳入 undo（beginDrag/endDrag 包裹整个手势）

### 2026-03-30 完成（第四批）

- [x] 空格键修复：移除 HTMLSelectElement 豁免 + 所有 select 加 tabIndex={-1}，空格始终触发播放
- [x] Auto Key Detection：72 候选调暴力评分（fitScore + tonic chord 验证），默认 Auto 模式
- [x] Confirm Key 按钮：锁定检测到的调性，方便在确定调上继续创作
- [x] 音阶级数标注（^记号）：相对大调音阶的级数，带升降号（b3, #4, b7 等），和弦上下文消歧
- [x] Bass line 级数常驻显示：每小节最低音始终在音符下方显示级数 badge
- [x] 和弦解决关系检测：纯根音运动分析（五度下行 → V→I，三全音替代 → bII→I），ii-V-I 三连检测
- [x] m#5 → 大三转位：Am#5 自动识别为 F/A 等
- [x] Modifier 临时工具切换：Pencil+Shift → Pointer，Pointer+Ctrl/Cmd → Pencil
- [x] Pencil 模式有选中音符时点击空白处取消选择（而非画新音符），光标跟随状态变化
- [x] 铅笔光标 SVG 图标

## 当前在做

（无 — 等待用户反馈）

## 下一步

- [ ] 音频延迟深度优化：用户可调 lookAhead 滑块（范围 10–150ms），探索 AudioContext latencyHint 设置
- [ ] 框选后的智能选择功能（最低音/第N低音/按时值筛选）
- [x] 重命名系统（项目名可编辑，铅笔图标，Enter/Escape 确认）
- [x] 可更改 Time Signature（分子/分母下拉选择，影响网格/Ruler/PlayheadHandle）
- [x] BPM 可编辑（导入后可修改）
- [ ] 和弦内 velocity 分布可视化与编辑（纵向展示同一时间点多个音符的 vel 分布，直观调整和弦内部力度平衡）
- [ ] Feature 告示栏（向用户展示功能介绍、快捷键提示、更新日志等）

## 待实现：Smart Snap — 速度感知自适应吸附

### 概念

鼠标拖拽速度决定 snap 粒度：快速移动时 snap 到大节拍（bar/beat），慢速移动时 snap 到细分（1/16、1/32）。这是一个原创交互特性，目前没有 DAW 实现过。

### 调研：类似交互模式

- **macOS 指针加速**：慢移精确、快移粗糙，非线性曲线映射物理速度→光标速度。完全相同的概念，应用在光标灵敏度上。
- **Raw Accel（游戏鼠标工具）**：用户自定义速度→灵敏度映射曲线（线性、幂函数、S 曲线等），开源参考：https://rawaccel.net/
- **iOS 惯性滚动**：手指速度→滚动距离的非线性映射，带动量衰减。
- **Ableton / Logic Pro**：只有 Ctrl/Shift 修饰键切换粗/细模式，不是连续速度感知。
- **KnobSlider 论文**（Frontiers in Robotics and AI）：研究旋钮 vs 滑条的粗/细控制体验，结论是不同物理形态适合不同精度需求。

### 实现计划

#### 1. 速度测量（~10 行）
- `mousemove` 时记录最近 3-5 个 `{timestamp, clientX}` 采样点（`useRef`）
- 计算滑动窗口内的平均速度（px/ms）
- 不触发 React 渲染

#### 2. 速度→snap 映射（~15 行，核心）
- 音乐层级候选：`[1920, 960, 480, 240, 120, 60]` ticks（全音符→三十二分音符）
- 初始阈值（需要手动调参）：
  - `< 0.5 px/ms` → 1/32
  - `0.5–2 px/ms` → 1/16
  - `2–5 px/ms` → 1/8
  - `5–10 px/ms` → 1/4
  - `> 10 px/ms` → 1/1
- **对数曲线**而非线性：人对慢速的感知分辨率远高于快速
- **迟滞（hysteresis）**：细→粗的切换阈值比粗→细高 20%，防止在边界来回抖动

#### 3. 集成（~10 行）
- `SnapResolution` 类型新增 `'smart'`
- `handleMouseMove` 中 move/resize/draw-resize/trim-start 分支根据实时速度计算 `snapTicks`
- Grid 背景网格跟随变化，加 50ms 防抖避免频繁重绘

#### 4. 调试（开发阶段）
- 界面角落显示当前速度值和对应的 snap 粒度（调参用，完成后移除）

### 风险与注意事项
- 触摸板的速度测量噪声可能导致 snap 频繁跳动，需要增大滑动窗口或加低通滤波
- 用户可能觉得"不可预测"，需要在 Toolbar 显示当前实际 snap 值作为视觉反馈
- 阈值、曲线形状、迟滞量需要反复手动测试调优，无法一次性确定最佳参数

### 参考链接
- Raw Accel 开源项目：https://rawaccel.net/
- Apple 指针加速设置：https://support.apple.com/guide/mac-help/change-your-mouse-or-trackpads-response-speed-mchlp1138/mac
- NN/g Sliders & Knobs 研究：https://www.nngroup.com/articles/sliders-knobs/
- KnobSlider 论文：https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00079/full

## 决定不做（第一版）

- MPE 滑音/颤音系统
- 网页音源
- DAW 集成
- 和声规则检查
- 多 Clip 同时编辑
- 手机端触屏编辑（已删除移动版，手机显示提示）
