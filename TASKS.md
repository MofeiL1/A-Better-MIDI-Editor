# TASKS.md — 任务跟踪

## 已完成

### 基础架构

- [x] 项目脚手架搭建（Vite + React + TypeScript）
- [x] 核心数据类型定义（Project, Track, Clip, Note）
- [x] Zustand store 设计与实现（projectStore + uiStore）
- [x] 工具函数：tick/pixel 转换、吸附、音乐理论
- [x] GitHub Pages 自动部署（GitHub Actions）
- [x] Undo/Redo 快照系统（50 层，手势级合并）

### Piano Roll 核心

- [x] Canvas 渲染（网格 + 音符层 + 琴键列）
- [x] Ruler + PlayheadHandle（小节/拍标记、可拖拽播放头）
- [x] Velocity Lane（力度色谱、精确抓取区、双向 hover 联动）
- [x] 播放功能（Tone.js Sampler + Transport 调度）
- [x] Smart Snap（zoom-adaptive 网格，1/32 到全音符）
- [x] Zoom Slider（9 档位离散缩放，播放头为锚点）
- [x] 中键摇杆式平移

### 统一音符模型（2026-04-01 重构）

- [x] 合并 Dot 和 Note 为统一 Note 类型（`duration: number | null`）
- [x] null-duration = 自动连奏（延伸到下一个音符），number = 已确认时值
- [x] noteDuration.ts：computeAutoLegato、getEffectiveDuration、computeNullDurations
- [x] 播放系统统一使用 getEffectiveDuration
- [x] 旧 dotDuration.ts 删除，loadProject 迁移旧存档格式

### 三角形音符头（2026-04-01）

- [x] 圆形音符头改为向右等边三角形（三角圆角，占满轨道高度）
- [x] 延长线从音符起始位置开始绘制，三角形头覆盖在上层
- [x] Ghost notes 和 preview 同步改为三角形
- [x] 去掉所有白色描边/线框

### 交互区域重构（2026-04-01）

- [x] 三角形头对 hit test "透明"，延长线 zone 穿透三角形
- [x] confirmed 音符：三角形头 = trim-start，延长线中段 = body(move)，尾部 = resize
- [x] null-duration 音符：三角形头 = body(move)，延长线中段 = ext-body（flex 工具下透明），尾部 = ext-end(resize)
- [x] Flex 工具下 null-duration 的 ext-body 不显示 hover，显示 preview ghost 穿透
- [x] trimNoteStart 支持 null-duration（只移动 startTick，不调整 duration）

### Flex 工具（2026-04-01）

- [x] 重命名 dot → flex（ToolMode、Toolbar、键盘快捷键）
- [x] 默认工具改为 Flex
- [x] Q/W/E/R/T 时值预设（toggle + 应用到选中音符）
- [x] Enter 确认时值，Period(.) 清除时值
- [x] 点击空白放置音符（duration = preset 或 null）
- [x] Ctrl/Cmd 临时切换为 Pointer

### 右键工具轮盘（2026-04-01）

- [x] 右键拦截浏览器默认菜单
- [x] 径向 SVG 轮盘（Pointer 左上 / Flex 右上 / Pencil 下方）
- [x] 纯角度判断，无距离上限（盲操 — 向方向甩鼠标即可）
- [x] 内圈死区（小于 INNER_RADIUS 不选择）
- [x] 背景渐变（中心不透明→边缘透明），图标/文字始终不透明
- [x] 内圈 + 分割线描边，外圈无描边

### 其他功能

- [x] 删除 eraser 工具
- [x] 删除默认 demo 曲（空白项目启动）
- [x] MIDI 导入导出（多轨选择，导入为 confirmed duration）
- [x] 复制粘贴（Ctrl+C/V，播放头位置粘贴）
- [x] Alt+拖动复制（ghost 实时切换移动/复制）
- [x] 钢琴键交互（试听、刮奏、按音高选中）
- [x] 项目重命名、BPM 编辑、Time Signature 编辑
- [x] 空格键全局拦截（capture phase）

## 当前在做

（无 — 等待用户反馈）

## 下一步

- [ ] 调性检测与音阶级数显示
- [ ] 和弦轨道（自动检测 + Roman numeral 分析）
- [ ] 和弦编组（选中音符组合为和弦对象）
- [ ] Voicing 变换（drop-2、rootless、声部进行）
- [ ] 和弦内 velocity 分布可视化
- [ ] 音频延迟优化（用户可调 lookAhead）
- [ ] Feature 告示栏（功能介绍、更新日志）

## 决定不做（第一版）

- MPE 滑音/颤音系统
- 网页音源
- DAW 集成
- 和声规则检查
- 多 Clip 同时编辑
- 手机端触屏编辑
