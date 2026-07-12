# 中枢看板 (hub-dashboard) — 开发文档

> 本文件用于**二次开发 / 在其他电脑上继续编辑**。内容基于当前仓库内**真实源码**整理（非设想）。
> 最后核对时间：2026-07-12

---

## 0. 一句话概述

Obsidian 第三方插件「中枢看板」，把个人系统的多个模块（首页仪表盘、修习课表、典藏馆、旅行记忆、创意工坊）集中在一屏里展示与管理。

- **插件 ID**：`hub-dashboard`
- **显示名**：`中枢看板`
- **原名 / 旧 ID**：`magic-os` / `Magic OS`（已改名，源码内已无残留）
- **类型**：Obsidian 社区插件（非桌面独占）
- **入口**：`src/main.ts` → 经 esbuild 打包为根目录 `main.js`
- **minAppVersion**：1.5.0

---

## ⚠️ 1. 当前源码状态与重要提醒（务必先读）

**当前仓库里的源码是「网格(grid)版」，不是「画布(canvas)版」。**

证据：
- `modules/homepage/HomepageView.ts` 的 `renderHomeDashboard()` 使用 **CSS Grid**（`grid-template-columns: repeat(gridColumns,1fr)` + `cardSpans`/`cardRowSpans`）排布卡片。
- 全源码**搜不到** `useCanvas`、`cardLayout` 的百分比坐标、`SNAP` 吸附、`sch-chip-toggle` 状态圆圈、`hexToRgba` 颜色底图等实现。
- `src/modules/homepage/GridEngine.ts` 的职责是**生成网格 CSS**（见第 7 节），而非自由画布。

**但 `data.json` 里却带着画布时代的配置**（这是不一致的根源，请留意）：

```jsonc
"useCanvas": true,
"cardLayout": {
  "schedule": { "x": 0, "y": 2,   "w": 46, "h": 24 },
  "tasks":    { "x": 0, "y": 27,  "w": 26, "h": 26 },
  "workshop": { "x": 0, "y": 54,  "w": 100, "h": 34 }
}
```

> 结论：这些 `useCanvas` / `cardLayout`（x/y/w/h 百分比）字段**当前源码不会读取**，属于「死配置」。插件现在只会按网格布局渲染。

### 为什么会这样？
画布模式、2% 吸附、opacity 伪元素修复、日程颜色底图、状态切换圆圈等功能，是在 **2026-07-03 备份之后**的会话中开发的；而本仓库源码是从 **`magic-os-backup-20260703`** 这个 7/3 备份恢复并做改名替换得到的，因此**丢失了 7/3 之后开发的画布相关功能**。

### ✅ 已定论（2026-07-12）：采用网格版
- 决策：**保留网格(grid)版**作为当前基线，不再恢复画布功能。
- 已清理 `data.json`：移除 `useCanvas` 与 `cardLayout`（画布百分比坐标）等死配置；网格配置（`gridColumns` / `cardSpans` / `cardRowSpans` / `cardOrder` / `cardVisibility`）保持不变，源码可正常编译运行。
- 因此第 12 节「待恢复功能」当前**不再执行**；若日后想升级为画布版，再按该清单补回即可。

---

## 2. 目录结构与各文件职责

```
hub-dashboard/
├── manifest.json          # 插件元信息（id / name / version / minAppVersion）
├── data.json              # 运行时设置（由插件写回，见第 8 节）
├── main.js                # ⚠️ 构建产物（由 src 编译生成，不要手改）
├── esbuild.config.mjs     # 打包配置（入口 src/main.ts → main.js）
├── tsconfig.json          # TS 配置
├── package.json           # 依赖与脚本
├── package-lock.json
├── node_modules/          # 依赖（npm install 生成）
└── src/
    ├── main.ts                       # 插件入口：注册视图/命令/ribbon/文件监听
    ├── types.ts                      # 全部 TS 接口、常量（GAP_MAP / PIPELINE_STAGES 等）
    ├── settings.ts                   # 设置面板（MagicOSSettingTab）
    ├── settings-defaults.ts          # 默认设置 DEFAULT_SETTINGS
    ├── modules/
    │   ├── homepage/
    │   │   ├── HomepageView.ts       # ★核心视图：toolbar/navbar/首页网格/各模块子视图
    │   │   ├── GridEngine.ts         # 网格 CSS 生成器（generateGridStyle 等）
    │   │   └── TaskModal.ts          # 任务详情弹窗（TaskDetailModal extends Modal）
    │   ├── schedule/
    │   │   ├── ScheduleModule.ts     # 修习课表（日历视图）
    │   │   └── ProjectModule.ts      # 项目管理
    │   ├── library/
    │   │   └── LibraryModule.ts      # 典藏馆（影视/书/音乐）
    │   ├── travel/
    │   │   └── TravelModule.ts       # 旅行记忆（地图，依赖 leaflet/three）
    │   └── workshop/
    │       └── WorkshopModule.ts     # 创意工坊（创作流水线）
    ├── services/
    │   ├── VaultService.ts           # 读写 vault 文件、listMarkdownFiles、ensureFolder
    │   └── FrontmatterService.ts     # YAML frontmatter 解析/序列化 + 各类型推断
    ├── styles/                       # 当前为空（样式以内联 cssText 写在 TS 中）
    └── theme/                        # 当前为空
```

> `styles/` 与 `theme/` 在 7/3 备份里本来就是空目录，样式全部以 `element.style.cssText` 形式内联在 TS 代码里。

---

## 3. 环境要求与构建命令

### 依赖
见 `package.json`：

- 运行时：`dayjs`、`leaflet`、`three`、`three-globe`
- 开发：`obsidian`、`esbuild`、`typescript`、`@types/node`、`@types/leaflet`、`@types/three`

### Node 版本
- 实测构建用 **Node 22.22.x**（managed runtime）。建议 **≥ 18**。
- 注意：`obsidian` 包需通过 npm 安装（它会提供 `obsidian` 类型与模块，构建时被标记为 external）。

### 安装依赖
```bash
cd hub-dashboard
npm install
```

### 构建
```bash
# 完整生产构建（先 tsc 类型检查，再 esbuild 打包）
npm run build
# 等价于：
#   tsc -noEmit -skipLibCheck && node esbuild.config.mjs production

# 开发模式（监听文件变化 + 内联 sourcemap，便于调试）
npm run dev
# 等价于：node esbuild.config.mjs   （watch 模式）
```

构建产物为根目录 `main.js`。`esbuild.config.mjs` 的关键配置：
- `entryPoints: ['src/main.ts']`
- `external: ['obsidian','electron']`（运行时由 Obsidian 提供）
- `format: 'cjs'`，`target: 'ES2022'`，`treeShaking: true`
- 生产模式 `sourcemap: false`，开发模式 `sourcemap: 'inline'`

### 无 npm 时直接调用（示例）
```bash
node node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node esbuild.config.mjs production
```

---

## 4. 部署到 Obsidian 与重载方式

1. 把整个 `hub-dashboard/` 文件夹放到 vault 的 `.obsidian/plugins/` 下。
2. 首次启用：Obsidian 设置 → 第三方插件 → 开启「中枢看板」。
3. **改完源码并 `npm run build` 生成新的 `main.js` 后**，需要让 Obsidian 重新加载插件（否则它缓存旧 `main.js`）：
   - **方式 A（最常用）**：打开「中枢看板」视图 → 点右上角 **🔄 重载按钮**。当前实现是 `plugins.disablePlugin('hub-dashboard')` 后 150ms 再 `enablePlugin`。
   - **方式 B**：设置 → 关闭插件再打开，或点「重新加载插件」。
   - **方式 C（最稳）**：完全退出 Obsidian 再重开。

> 注意：Obsidian 不会自动扫描文件夹改名/新增，改 ID 或换目录后需重启软件并在设置里重新开启。

---

## 5. 架构与生命周期（main.ts）

- `onload()`：
  1. `loadSettings()` 读取 `data.json`（与 `DEFAULT_SETTINGS` 深合并）。
  2. 实例化 `VaultService`。
  3. `registerView(HOMEPAGE_VIEW_TYPE, ...)` 注册首页视图（视图类型常量 `hub-dashboard-homepage`）。
  4. `addSettingTab` 注册设置页。
  5. `registerCommands()` 注册各模块打开命令 + 「刷新首页数据」。
  6. `addRibbonIcon('sparkles', ...)` 在侧栏加图标，点击打开首页。
  7. 注册 vault 的 `modify / create / delete` 事件监听（仅 `.md` 文件）。
- `onunload()`：移除注入的样式节点 `#hub-dashboard-styles`（若存在）。
- **文件监听**（`onFileChanged`）：路径包含 `修习课表 / 创意工坊 / 典藏馆 / 旅行记忆 / 项目管理` 的 md 变更，会触发 `debouncedRefresh()`（300ms 防抖）→ `homepageView.smartRefresh()`，实现数据实时更新。
- **模块跳转**（`activateModuleView`）：首页视图始终存在；非首页模块通过 `switchToModule(key)` 在首页视图内切换子视图（非新开标签）。

---

## 6. 首页视图机制（HomepageView.ts）

视图内部状态：`module: 'home' | 'schedule' | 'library' | 'travel' | 'workshop'`。

渲染链路：`onOpen → refresh → render →` 依 `module` 渲染：
- `module === 'home'`：`renderToolbar` + `renderNavBar` + `renderHomeDashboard`
- 其他：`renderToolbar` + 对应模块子视图（`renderScheduleModule` / `renderLibraryModule` / `renderTravelModule` / `renderWorkshopPlaceholder`）

### 导航栏（renderNavBar）
四个模块入口卡片（📅 修习课表 / 📚 典藏馆 / 🗺️ 旅行记忆 / 🎬 创意工坊），点击切换 `module`。卡片显示各模块统计（今日日程数 / 创作中项数 / 藏品数 / 地点数）。

### 首页仪表盘（renderHomeDashboard）— 当前为网格
```ts
grid.style.cssText =
  `display:grid;grid-template-columns:repeat(${layout.gridColumns},1fr);
   grid-auto-rows:minmax(80px,auto);gap:${gap};...`;
for (const cid of layout.cardOrder) {
  if (!layout.cardVisibility[cid]) continue;
  if (cid === 'schedule') renderScheduleCard(...);
  if (cid === 'tasks')    renderTasksCard(...);
  if (cid === 'workshop') renderWorkshopCard(...);
}
```
卡片通过 `grid-column: span cardSpans[cid]`、`grid-row: span cardRowSpans[cid]` 占格。

卡片类型：`schedule`（今日日程）、`tasks`（任务分组：逾期/今日/本周，各带颜色底 `rgba(...,0.1)`）、`workshop`（创意工坊流水线概览）。

**卡片交互（已实现）**：每卡片由 `makeCardInteractive()` 挂上交互：
- **拖拽排序**：卡片可 `draggable`，拖到另一卡片上（左/右半区决定插入前/后）即重排 `homepageLayout.cardOrder`，经 `reorderCard()` 存回设置并重渲染。
- **缩放跨度**：卡片右下角有 `.hub-card-resize` 手柄，按住拖拽按网格单元改变 `cardSpans`（列跨度，1~gridColumns）与 `cardRowSpans`（行跨度，1~6），松手经 `saveSettingsSilent()` 持久化。
- 拖拽视觉反馈样式在 `getAllStyles()` 内（`.hub-card-dragging` / `.hub-card-drop-before` / `.hub-card-drop-after` / `.hub-card-resize`）。

---

## 7. 网格引擎（GridEngine.ts）

提供纯函数生成 CSS，避免重复：
- `generateGridStyle(layout)` → 网格容器 style（columns / gap / padding）。
- `generateCardStyle(cardId, layout)` → 单卡 style（span + 主题变量背景）。
- `generateNavCardStyle()` → 导航卡 style。
- 引用 `GAP_MAP`（`S:'8px' / M:'16px' / L:'24px'`，见 types.ts）。

> 这是「网格版」的布局核心。若未来要做画布版，这部分应被「绝对定位 + 百分比坐标 + 拖拽/缩放句柄」取代（见第 12 节）。

---

## 8. 数据模型（data.json）

`data.json` 由插件 `saveData()` 写回，结构对应 `MagicOSSettings`（types.ts）。要点：

| 字段 | 说明 |
|------|------|
| `moduleNames` | 各模块中文显示名 |
| `homepageLayout` | 网格布局：`gridColumns`(2/3/4)、`cardGap`(S/M/L)、`cardVisibility`、`cardOrder`、`cardSpans`、`cardRowSpans`、`navIcons` |
| `homepageFilters` | `overdueThreshold` / `stagnationThreshold` / `preloadDays` |
| `schedulePresets` | 课表预设（名称/时长/颜色） |
| `schedulePalette` | 颜色面板 |
| `icloudCalendar` | iCloud 日历开关（当前 `enabled:false`） |
| `gaodeApiKey` | 高德地图 API Key（旅行地图用） |
| `placeCache` | 城市/地点经纬度缓存 |
| `travelReset*` | 旅行地图默认中心点 |
| `travelCacheTiles` / `travelDefaultView` | 旅行地图瓦片缓存 / 默认视图 |

> **⚠️ 死配置提醒**：`data.json` 里的 `useCanvas:true` 与 `cardLayout`（x/y/w/h 百分比）**当前源码不读取**。另外 `houseTheme`、`particle` 等字段也未在 `MagicOSSettings` 类型中定义（属于历史遗留，加载时被 `...data` 合并但无类型约束）。如需清理，建议统一收敛进类型定义。

---

## 9. 设置系统

- `settings-defaults.ts`：导出 `DEFAULT_SETTINGS`（`MagicOSSettings` 全量默认值）。
- `settings.ts`：`MagicOSSettingTab`（继承 Obsidian `PluginSettingTab`），在设置页渲染各配置项。
- `main.ts` 的 `loadSettings()` 做深合并：`DEFAULT_SETTINGS` 打底，再用 `data.json` 覆盖各子对象（`moduleNames` / `homepageLayout` / `homepageFilters` 逐层合并）。
- 修改设置后调用 `saveSettings()` → 写回 `data.json` 并 `homepageView.refresh()`；静默保存用 `saveSettingsSilent()`（不触发刷新，避免缓存更新死循环）。

---

## 10. Frontmatter 约定（各模块 md 文件）

模块数据来自 vault 内的 markdown 文件，靠 frontmatter 区分。相关类型见 `types.ts`，解析在 `FrontmatterService.ts`：

- `FrontmatterService.parseFrontmatter(content)`：拆分 YAML 头与正文。
- `serializeFrontmatter(data, body)`：反向序列化。
- 各类型解析器：`parseCommonFrontmatter` / `parseScheduleFrontmatter` / `parseWorkshopFrontmatter`。
- 模块推断：`inferModule(filePath)`、`inferCreativeStatus(filePath)`（按文件路径/文件名判断归属）。

主要 frontmatter 字段（节选）：
- **修习课表** `ScheduleFrontmatter`：`类型`(日程/任务)、`日期`、`时间`、`优先级`(高/中/低)、`状态`(待办/完成)、`所属模块`。
- **创意工坊** `WorkshopFrontmatter`：`内容类型`、`创作状态`(灵感→归档 8 阶段)、`平台`、`负责人` 等。阶段定义见 `PIPELINE_STAGES`（types.ts）。
- **典藏馆** `LibraryItemFrontmatter`：`类型`(movie/tv/book/music)、`状态`(想看/在看/已看)、`评分`、`导演/作者` 等。
- **旅行记忆** `TravelPlaceFrontmatter`：`城市`、`经度`、`纬度`、`到访次数`、`到访记录`。
- **项目管理** `ProjectFrontmatter` / `ProjectTaskFrontmatter`：`进度`、`任务数`、`完成数`、`优先级`(红/黄/绿) 等。

---

## 11. 在其他电脑上二次开发 — 上手清单

1. **准备 Node**：安装 Node ≥ 18（推荐 22.x）。
2. **拿到代码**：把整个 `hub-dashboard/` 文件夹拷贝 / git clone 到目标机。
3. **装依赖**：
   ```bash
   cd hub-dashboard
   npm install
   ```
4. **开发循环**：
   - 终端跑 `npm run dev`（esbuild watch，改 TS 自动重打包 `main.js`）。
   - 把 `hub-dashboard/` 软链或复制到目标 Obsidian vault 的 `.obsidian/plugins/`：
     ```bash
     # Windows（管理员 PowerShell）示例软链
     New-Item -ItemType Junction -Path "<vault>/.obsidian/plugins/hub-dashboard" -Target "<源码路径>/hub-dashboard"
     ```
   - 在 Obsidian 设置里开启插件；改完代码后点视图内 🔄 重载（见第 4 节）。
5. **出包**：`npm run build` 生成生产 `main.js`，即可分发 / 提交。
6. **改完随手验证**：打开首页，确认卡片渲染、导航切换、文件监听实时刷新正常。

---

## 12. 已知问题 & 待恢复功能（画布版）

> 以下功能是 7/3 备份**之后**开发的，当前源码缺失，需重新实现或找回历史会话记录补回。

| 功能 | 说明 | 现状 |
|------|------|------|
| 画布模式 | 卡片绝对定位（百分比 x/y/w/h），自由拖拽 + 缩放句柄 | ❌ 缺失（代码走网格） |
| 2% 吸附 | 拖拽/缩放时对 `SNAP=2` 取整对齐 | ❌ 缺失 |
| 边界约束 | 卡片不超出画布范围 | ❌ 缺失 |
| 细分网格 | 4px + 24px 双层 gradient 背景 | ❌ 缺失 |
| opacity 修复 | 画布透明度放到 `::before` 伪元素，避免级联到子元素导致不可见 | ❌ 缺失 |
| 日程颜色底图 | 任务项用 `hexToRgba(color, 0.15)` 作背景 | ❌ 缺失（当前是固定 `rgba(...,0.1)`） |
| 状态切换圆圈 | `sch-chip-toggle` 14px 圆圈点击切换完成状态 | ❌ 缺失 |
| 点击跳转模块 | 卡片点击在首页视图内切换，非新开 md | ✅ 已实现（switchToModule） |

**恢复建议**：
- 优先从本插件的历史开发会话（WorkBuddy 对话记录）中提取上述功能的实现片段，逐段补回 `HomepageView.ts` / 新增 `CanvasEngine`。
- 补回后务必同步更新 `data.json` 与 `types.ts` 的 `HomepageLayout`（让 `useCanvas` / `cardLayout` 真正生效），并删除/收敛死配置。
- 建议新增独立的 `src/modules/homepage/CanvasEngine.ts` 与 `GridEngine.ts` 并列，由 `useCanvas` 开关切换两套布局，避免网格逻辑被画布代码污染。

---

## 13. 改名历史（便于排查旧痕迹）

- 旧：`magic-os` / `Magic OS`
- 新：`hub-dashboard` / `中枢看板`
- 改名方式：全量 `sed` 替换 `magic-os → hub-dashboard`、`Magic OS → 中枢看板`，复制目录为 `hub-dashboard`，清理旧 `magic-os` 文件夹。
- 当前源码已无 `magic-os` / `Magic OS` 残留（已验证）。`manifest.json` 的 `id` 为 `hub-dashboard`、`name` 为 `中枢看板`。
- 注意：`esbuild.config.mjs` 的 `external` 仍含 `'electron'`（保留无害）；`main.ts` 卸载时清理的样式 id 为 `hub-dashboard-styles`。

---

## 14. 快速命令速查

```bash
# 安装
npm install

# 开发（监听）
npm run dev

# 生产构建（类型检查 + 打包）
npm run build

# 单独类型检查
npx tsc -noEmit -skipLibCheck

# 单独打包
node esbuild.config.mjs production
```

---

*文档基于当前仓库真实源码核对生成。若后续补回了画布功能，请同步更新第 1、6、7、12 节。*
