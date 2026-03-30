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
- [x] 键盘快捷键（1/2/3 切工具、Delete 删除、Ctrl+Z/Y 撤销重做）
- [x] MIDI 导入导出（@tonejs/midi）
- [x] Undo/Redo 快照系统
- [x] 工具栏 UI（工具选择、吸附设置、调性选择器）

## 当前在做

- [ ] UI 规划与视觉设计（用户要求先规划 UI 再继续开发）

## 下一步

- [ ] 框选后的智能选择功能（最低音/第N低音/按时值筛选）
- [ ] 手机端预览方案（用户在手机上工作，需要预览能力）
- [ ] 更精细的 velocity 垂直编辑（和弦内按音高排列）
- [ ] 播放功能（Tone.js 合成器 + 播放头）

## 决定不做（第一版）

- MPE 滑音/颤音系统
- 网页音源
- DAW 集成
- 和声规则检查
- 多 Clip 同时编辑
