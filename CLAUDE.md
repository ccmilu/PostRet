## 技术栈

- 框架: Electron (最新稳定版) + React 18 + TypeScript
- 构建: Vite + vite-plugin-electron
- 姿态检测: MediaPipe JS (@mediapipe/tasks-vision) — 33 关键点+3D, 纯 WASM
- 屏幕模糊: macOS 26+ Liquid Glass 毛玻璃效果, macOS 13-15 系统级模糊效果（具体实现方案由开发时调研决定，优先使用系统原生 API）
- 持久化: electron-store
- 测试: Vitest (单元/集成) + Playwright (E2E, 原生 Electron 支持) + Agent Browser (UI/视觉验证)
- 包管理: npm

## 项目结构

- electron/ — 主进程代码 (Node.js 环境)
  - tray/, windows/, ipc/, blur/, screen/, permissions/, auto-launch/, store/
- src/ — renderer 进程代码 (浏览器环境)
  - components/ — React 组件 (settings/, calibration/, overlay/, shared/)
  - services/ — 业务逻辑 (pose-detection/, posture-analysis/, calibration/, multi-screen/, reminder/)
  - hooks/ — React Hooks
  - utils/ — 工具函数 (math.ts, smoothing.ts, debounce.ts, logger.ts)
  - types/ — TypeScript 类型定义 (electron.d.ts, settings.ts, ipc.ts)
  - styles/ — 样式文件 (global.css, settings.css, calibration.css)
- scripts/ — 构建/工具脚本
  - download-models.ts — 下载 MediaPipe 模型到 assets/models/
  - generate-test-landmarks.ts — 从照片生成关键点 JSON
- assets/
  - icons/ — tray-icon.png, tray-icon-alert.png, app-icon.icns
  - sounds/ — M1 使用系统提示音; 后续里程碑可能添加自定义音频
  - models/ — MediaPipe 模型（构建时下载）
- test/
  - unit/ — 单元测试, 与 src/ 结构镜像
  - integration/ — 集成测试
  - e2e/ — Playwright E2E 测试
  - fixtures/ — 测试数据 (landmarks/, photos/, videos/)
  - agents/ — AI 测试 agent 配置文件

## 架构决策

- 姿态检测在 renderer 进程运行 (MediaPipe WASM 依赖浏览器环境)
- 模糊控制在 main 进程 (Electron BrowserWindow 管理)
- renderer → main 通过 IPC 传递 PostureStatus, 主要通道:
  - `posture:status` — renderer→main, 上报姿态检测结果
  - `blur:activate` / `blur:deactivate` — main 内部, 模糊控制
  - `calibration:start` / `calibration:complete` — 双向, 校准流程
  - `settings:get` / `settings:set` — renderer→main, 配置读写
  - `camera:permission` — renderer→main, 权限请求
  - `app:pause` / `app:resume` — main→renderer, 暂停/恢复检测
- 完全本地处理，不上传任何图像/数据到云端
- 屏幕角度自适应: faceY(0.5) + noseChinRatio(0.3) + eyeMouthRatio(0.2) 三信号加权估算摄像头俯仰角变化, 补偿系数 headForward×0.8（torsoSlouch×0.5 暂不启用，待多摄像头支持）
- 多屏幕检测: 鼠标位置(权重0.6) + 头部朝向(权重0.4) 融合判断, 1.5秒迟滞防抖
- 自适应基准线: 良好姿态持续30秒后以学习率0.001漂移, 最大漂移5度

## 姿态判定流水线

```
原始关键点(33个)
     ↓
[可见性过滤] — visibility < 0.5 时丢弃该帧
     ↓
[角度提取] — 从 world landmarks 计算 5 个指标:
  1. headForward: angle(ear, shoulder, vertical)
  2. ~~torsoSlouch: angle(shoulder, hip, vertical)~~ — 代码保留，暂不启用
  3. headTilt: atan2(leftEar.y - rightEar.y, leftEar.x - rightEar.x)
  4. faceFrameRatio: |leftEar.x - rightEar.x| / frameWidth
  5. shoulderDiff: |leftShoulder.y - rightShoulder.y|
     ↓
[屏幕角度补偿] — (M2+) 根据估算的摄像头俯仰角调整
     ↓
[时间平滑] — EMA 滤波器 (alpha=0.3) + 抖动过滤器
     ↓
[基准线比较] — 减去校准基准值，得到偏差量
     ↓
[规则评估] — 各偏差与灵敏度缩放后的阈值比较
     ↓
PostureStatus { isGood, violations[], confidence, timestamp }
```

### 关键点使用映射

| 检测项 | 使用的关键点 |
|--------|-------------|
| 头部前倾 | LEFT_EAR(7), RIGHT_EAR(8), LEFT_SHOULDER(11), RIGHT_SHOULDER(12) |
| ~~驼背弯腰~~ (暂不启用) | LEFT_SHOULDER(11), RIGHT_SHOULDER(12), LEFT_HIP(23), RIGHT_HIP(24) |
| 歪头 | LEFT_EAR(7), RIGHT_EAR(8) |
| 距屏幕太近 | LEFT_EAR(7), RIGHT_EAR(8) + 画面尺寸 |
| 肩膀不对称 | LEFT_SHOULDER(11), RIGHT_SHOULDER(12) |

## 编码约定

- 不可变数据: 所有状态更新返回新对象, 不修改原对象
- 纯函数优先: angle-calculator, math utils 全部为无副作用纯函数
- 文件大小: 200-400 行典型, 800 行上限
- 函数大小: < 50 行
- 错误处理: 系统边界(摄像头/权限/文件)必须处理, 内部纯计算可信任输入
- TypeScript strict mode

## MediaPipe 注意事项

- Electron CSP 配置需允许 WASM 执行:
  ```
  content-security-policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:
  ```
- 模型文件 (~30MB) 在构建时通过 `npm run download-models` 下载到 assets/models/, 运行时从本地加载
- PoseLandmarker 配置: runningMode='VIDEO', numPoses=1, minPoseDetectionConfidence=0.5
- 使用 world landmarks (metric scale) 计算角度, normalized landmarks 计算画面内位置
- 默认检测频率 500ms (2 FPS), 可配置 100ms-2000ms
- WASM 首次加载需 2-5 秒, 后续帧 20-40ms (Apple Silicon)

## NPM Scripts

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发服务器 (Vite + Electron HMR) |
| `npm run build` | 生产构建 |
| `npm run package` | Electron Builder 打包 (.dmg) |
| `npm test` | 运行全量测试（单元+集成+E2E） |
| `npm run test:unit` | 仅运行 Vitest 单元/集成测试 |
| `npm run test:e2e` | 仅运行 Playwright E2E 测试 |
| `npm run test:accuracy` | 40 张照片算法精度测试 |
| `npm run test:performance` | CPU/内存/帧时间性能测试 |
| `npm run test:multi-screen` | mock 多屏场景测试 |
| `npm run test:permissions` | 6 种权限状态测试 |
| `npm run download-models` | 下载 MediaPipe 模型到 assets/models/ |
| `npm run generate-landmarks` | 从测试照片生成关键点 JSON |

## 里程碑进度

- [x] **Milestone 1: 核心检测引擎** — 已完成
  - [x] Phase 1.1: 项目脚手架 + 测试基础设施
  - [x] Phase 1.2: 摄像头和姿态检测
  - [x] Phase 1.3: 姿态分析引擎
  - [x] Phase 1.4: 简单校准
  - [x] Phase 1.5: 模糊和提醒
  - [x] Phase 1.6: 设置 UI
  - [x] Phase 1.7: 主检测循环 + 端到端集成
- [ ] **Milestone 2: 自适应智能** — 尚未开始
- [ ] **Milestone 3: 多屏幕与产品化** — 尚未开始

## 测试照片标签 Schema

每张测试照片配一个同名 .json sidecar 文件:
```json
{
  "photoId": number,
  "filename": string,
  "category": "good" | "forward_head" | "head_tilt" | "too_close" | "edge_case",
  "expectedViolations": string[],
  "lidAngle": number,
  "lighting": "normal" | "bright" | "dim" | "side",
  "severity": "borderline" | "moderate" | "severe" | "combined" | null,
  "notes": string
}
```

## 开发流程

每完成一个功能模块，必须按以下顺序执行。不允许跳过步骤 2-6，不允许积攒多个功能后再测试。

1. **编写代码** — 实现功能模块
2. **单元测试** — 对纯逻辑代码（utils, services）编写并运行 Vitest 单元测试
3. **Agent Browser 探索验证** — 通过 Agent Browser (agent-browser skill) 交互式操控应用，验证功能在实际界面中是否正常工作。用截图+AI 视觉判断视觉效果。**UI/视觉功能必须执行此步骤**。注意：Agent Browser 基于 Bash 命令行调用，teammate 也可使用。
4. **修复问题** — 如果验证发现问题，修复后回到步骤 3
5. **固化 E2E 脚本** — 验证通过后，将操作步骤编写为 .spec.ts Playwright 测试脚本
6. **运行全量测试** — `npm test`（单元+集成+E2E），确认无回归
7. **Git 提交** — 功能 + 测试一起提交

核心算法（angle-calculator, posture-rules, smoothing）采用 TDD：先写测试再写实现。
每完成一个 Phase 的功能，对照该 Phase 的"测试 & 验收"清单逐条确认。

## 集成测试规则（Phase 1.7 教训）

单元测试全部通过但手动一试即发现大量 bug，根因：mock 掩盖了模块衔接处的问题。

**核心规则：**
- 关键链路必须有不 mock 中间层的集成测试（mock 只证明"如果依赖方正确我也正确"，不证明依赖方正确）
- 共享状态必须用 Context/Provider，并测试多组件间状态同步
- async 流程必须支持取消（generation counter / AbortController），并测试取消场景
- mock 数据必须反映真实场景（如 MediaPipe landmarks 的真实 visibility 分布）

**每个 Phase 完成后强制检查：**
- [ ] 有 Playwright E2E 在真实 Electron 环境走通核心用户流程？
- [ ] 在真实 Electron 环境手动冒烟测试过？（Agent Browser 不能替代）
- [ ] 关键链路有不 mock 中间层的集成测试？
- [ ] mock 数据反映真实场景？

## Agent Browser 规则

**所有涉及 UI 或视觉效果的功能，必须先通过 Agent Browser 交互式验证，再编写自动化测试脚本。** Agent Browser 通过 `agent-browser` skill 调用，基于 Bash 命令行，主会话和 teammate 均可使用。（如果要用到，在创建teammate时应该明确说明用这个skill）

### 验证方式

Agent Browser 通过 Vite dev server (`http://localhost:5173`) 访问 renderer 页面。需要先启动 dev server。

截图保存到 `test/screenshots/` 目录下，按 Phase 或功能模块分子目录，如 `test/screenshots/phase-1-6/`、`test/screenshots/calibration/`。

### 能力边界

| 能验证（renderer 层 UI） | 不能验证（Electron 原生功能） |
|-------------------------|---------------------------|
| React 组件、页面布局、CSS 样式 | Tray 菜单 |
| 设置页面、Tab 切换、表单控件交互 | 模糊覆盖窗口（BrowserWindow 层） |
| 校准向导 UI 流程 | 系统通知 |
| 截图 + AI 视觉判断 | Liquid Glass / macOS 原生效果 |
| 骨骼线叠加显示 | — |

**IPC 相关 UI**：Agent Browser 访问 Vite 页面时 preload 不加载，`window.electronAPI` 不存在。可通过 `agent-browser eval` 注入 mock，或改用 Playwright Electron E2E 脚本测试完整链路。

### Electron 原生功能的测试方式

Tray、系统通知、覆盖窗口等无法通过 Agent Browser 验证，使用以下方式：
- **Vitest 单元测试** — mock Electron API，测试 main 进程逻辑
- **Playwright Electron E2E 脚本** (`.spec.ts`) — 启动真实 Electron 实例，全链路可用

### 必须使用 Agent Browser 验证的场景

- 设置页面的布局、Tab 切换、控件交互
- 校准向导的步骤流程和 UI 反馈
- 骨骼线叠加显示
- 其他 renderer 层 React UI

### 可以跳过 Agent Browser 的场景

- 纯数据逻辑（IPC 通信、配置读写、数值计算）
- 无 UI 的单元测试
- Electron 原生功能（用 Vitest mock 或 Playwright E2E 脚本）

## 测试策略

### E2E 测试工具

| 工具 | 适用场景 | 是否强制 |
|------|---------|---------|
| **Agent Browser** (交互式) | renderer 层 UI 首次验证、视觉效果判断（截图+AI视觉）、探索性测试。主会话和 teammate 均可使用 | **renderer UI 强制** |
| **Playwright Electron 脚本** (.spec.ts) | 回归测试、CI 自动运行、Electron 原生功能测试、IPC 全链路测试 | 所有 E2E 功能必须有脚本 |

### 摄像头模拟

E2E 和集成测试使用 Chromium 内置参数替代实时摄像头：
```
--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream
--use-file-for-fake-video-capture=test/fixtures/videos/xxx.webm
```

### Agent Team 测试架构

测试通过 Agent Team 执行，原因：
- 测试需要调用大量工具（运行测试、读取结果、分析截图、检查性能数据），上下文非常长
- 通过独立 agent 分拆测试领域，每个 agent 在自己的上下文中完成，leader 只接收最终报告
- 避免主会话上下文爆炸

Agent Team 组成：
1. Algorithm Agent — `npm run test:accuracy` — 40 张照片精度测试
2. UI/E2E Agent — `npm run test:e2e` — Playwright 全流程测试
3. Performance Agent — `npm run test:performance` — CPU/内存/帧时间
4. Multi-Screen Agent — `npm run test:multi-screen` — mock 多屏场景
5. Permission Agent — `npm run test:permissions` — 6 种权限状态

使用规则：
- 每个 agent 只返回结果摘要（通过/失败 + 关键指标 + 失败用例列表）
- 5 个 agent 并行启动
- agent 发现失败时分析原因并建议修复方案，但不自行修改代码
- 每个 agent 对应的测试也可通过 npm 命令独立执行

### 创建测试 Agent 时的指令要求

在创建测试 Agent Team 的各个 teammate 时，prompt 中必须包含以下指导：

1. **先读 plan 再测试** — agent 启动后，先读取实现计划文件中对应 Phase 的"测试 & 验收"部分，理解所有验收标准
2. **补充完善测试** — 根据 plan 中的验收标准，检查现有测试是否覆盖了所有条目。如果发现缺失的测试用例，先补充编写，再运行
3. **不是只跑 npm test** — agent 的职责不仅仅是运行已有测试，而是确保 plan 中列出的每一条验收标准都有对应的测试覆盖
4. **报告覆盖缺口** — 如果某些验收标准无法通过自动化测试覆盖（如需要手动验证的视觉效果），在报告中明确标注为"需手动验证"

## 关键技术风险

| 风险 | 等级 | 应对策略 |
|------|------|---------|
| MediaPipe WASM 性能 | 高 | 默认 500ms 检测间隔(2FPS); 可降级 LITE 模型; 考虑 Web Worker |
| Liquid Glass 兼容性 | 高 | 始终保留旧版 macOS 模糊降级方案; 自动检测系统版本 |
| 屏幕角度估算精度 | 中 | 三信号加权+保守补偿+最大漂移上限+用 40 张照片调参 |
| 误报导致用户反感 | 中 | 默认中等灵敏度+时间平滑+可配置延迟+低置信度帧忽略 |
| macOS 摄像头权限 UX | 中 | 启动前检查+友好引导对话框+拒绝后手动开启指引 |
