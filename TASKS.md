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
- [x] 桌面/手机端分离架构（共享 store/utils/hooks，独立 UI 层）
- [x] 手机版 Option C 交互（默认滚动，工具栏切换编辑态）

## 当前在做

（无 — 等待用户反馈）

## 下一步

- [ ] 框选后的智能选择功能（最低音/第N低音/按时值筛选）
- [ ] 更精细的 velocity 垂直编辑（和弦内按音高排列）
- [ ] 手机端体验打磨（根据实际使用反馈调整）

## 决定不做（第一版）

- MPE 滑音/颤音系统
- 网页音源
- DAW 集成
- 和声规则检查
- 多 Clip 同时编辑
- 手机端触屏编辑（改为独立手机版 with Option C）
