# 中枢看板 · 团队代码质量标准（CODE QUALITY STANDARDS）

> 本文档定义本插件团队的代码质量基线。**所有 PR 必须满足本文档的「准入门槛」**，
> 由代码评审（Code Review）和 CI 质量闸门共同把关。
> 目标不是"写得花哨"，而是**可读、可维护、可演进**——让团队任何一人都能在三个月后
> 无痛接手别人的代码。

---

## 0. 质量基线（准入门槛）

提交前本地必须全绿：

```bash
npm run lint          # ESLint：0 error（warn 需 PR 说明）
npm run format:check  # Prettier：格式一致
npm run build         # tsc 类型检查 + 生产构建，0 错误
```

> 现状说明：仓库初始阶段为"能跑"版本，存在技术债（见第 6 节）。
> 新代码**不允许**新增第 6 节列出的债务；旧债务按迭代逐步偿还。

---

## 1. 类型安全（最优先）

- **禁止新增 `any`**。`tsconfig` 已开 `noImplicitAny` + `strictNullChecks`，
  编译器放过的是**显式** `any`，由 ESLint `no-explicit-any` 兜底拦截。
- 必须 `any` 时（如上游 `obsidian` 类型未暴露的 API），**集中、窄化**断言一次，
  并命名类型，禁止散落 `as any`：
  ```ts
  // ✅ 正确：集中断言 + 命名类型
  type AppWithInternals = App & {
    plugins: { disablePlugin(id: string): Promise<void> };
  };
  const app = this.app as AppWithInternals;
  ```
  ```ts
  // ❌ 错误：散落、无约束
  (this.app as any).plugins.disablePlugin('x');
  ```
- 用具体联合类型替代魔法字符串。卡片 id、模块 key 等统一用 `type XxxKey = 'a' | 'b'`。
- 依赖 `tsconfig` 已开启的 `strictNullChecks`：**不要**用 `!` 非空断言掩盖空值，
  优先用可选链 `?.` 和早期 `return`。

---

## 2. 安全（红线）

- **禁止用 `innerHTML` 拼接动态数据**（笔记标题/用户输入）。这是 XSS 入口。
  一律走 DOM API（`createEl` / `createSpan`）：
  ```ts
  // ❌ 危险
  box.innerHTML = `<span>${w.title}</span>`;
  // ✅ 安全
  box.createSpan({ text: w.title });
  ```
- 静态模板若用 `innerHTML`，内容必须**完全常量**，不得含任何变量。

---

## 3. 架构与单一职责

- **一个文件一个职责**，单文件建议 ≤ 300 行；超过即拆分。
- `HomepageView.ts`（当前 698 行）是反面教材：同时承担
  数据收集、工具栏、导航栏、3 张卡片、拖拽/缩放交互、5 个模块渲染、CSS 注入。
  **目标拆分**：
  - `HomeDataCollector.ts`：数据聚合（从 vault 取数）
  - `cards/`：每张卡片一个组件（`ScheduleCard.ts` / `TasksCard.ts` / `WorkshopCard.ts`）
  - `CardInteraction.ts`：拖拽排序 + 缩放跨度（与渲染解耦）
  - `HomepageView.ts`：只做编排（render 调度），不写业务细节
- 渲染与交互分离：卡片"长什么样"归组件，"怎么拖"归交互控制器。

---

## 4. 样式规范

- **禁止散落的 `element.style.cssText = '...'`**（当前约 40+ 处）。
  原因：不可读、无法统一主题、无法复用。
  ✅ 改为：语义化 CSS 类，集中在 `injectStyles()` / 独立 css 文件中定义，
  主题色一律用 Obsidian CSS 变量（`var(--text-normal)` 等）。
  ```ts
  // ❌ 反例
  card.style.cssText = 'background:var(--background-secondary);border-radius:14px;...';
  // ✅ 正例
  card.addClass('hub-dashboard-card');
  // 样式在 getAllStyles() 里：
  // .hub-dashboard-card { background: var(--background-secondary); border-radius: 14px; }
  ```
- 复用已有 token，不要硬编码颜色值（除语义化强调色外）。

---

## 5. 命名与常量

- 模块 key、卡片 id、命令 id 等字符串**集中定义为常量/联合类型**，禁止在多处硬编码。
- 局部 `PC` / `PA` 这类颜色/激活集合应提取到 `types.ts` 或 `theme` 模块，便于统一改。

---

## 6. 已知技术债（待偿还清单）

| 位置 | 问题 | 严重度 | 计划 |
|------|------|--------|------|
| `HomepageView.ts` | 单文件 698 行，违反 SRP | 高 | 按第 3 节拆分 |
| 全仓 | 34 处 `as any` / `(x as any)` | 中 | 新代码禁增；旧码迭代替换 |
| `HomepageView` 等 | ~40 处内联 `cssText` | 中 | 迁移到 CSS 类 |
| `HomepageView:413` 等 | `innerHTML` 拼接（已修 1 处） | 高→已修 | 其余 3 处待修 |
| `types.ts` | `HomepageLayout.cardLayout` / `gridRows` 死字段；`CustomCard` 未使用 | 低 | 清理类型漂移 |
| `window.moment()` ×15 | 依赖全局注入，难测试 | 低 | 改用 `import { moment } from 'obsidian'` |
| 测试 | 无单测（`test` 脚本为空） | 中 | 先给 `services/` 补单测 |

---

## 7. 代码评审（Code Review）检查清单

评审者逐条确认：

- [ ] `npm run lint` / `format:check` / `build` 全绿
- [ ] 无新增 `any`、无新增 `innerHTML` 拼变量
- [ ] 单文件未超 300 行（或已在 PR 说明拆分计划）
- [ ] 样式未用内联 `cssText`，主题走 CSS 变量
- [ ] 魔法字符串已抽常量/联合类型
- [ ] 新增业务逻辑有对应（或计划中的）测试
- [ ] 改动对现有功能无回归（首页拖拽/缩放、模块切换、文件监听刷新）

---

## 8. 提交信息规范

采用 Conventional Commits：

```
feat: 首页卡片支持拖拽排序
fix: 修复日程卡片 XSS（innerHTML → DOM）
refactor: 提取 AppWithInternals 集中类型断言
style: 迁移卡片内联样式到 CSS 类
```

---

## 9. 质量工具链

| 工具 | 作用 | 命令 |
|------|------|------|
| ESLint (flat) + typescript-eslint | 静态检查、拦截 `any`/未用变量 | `npm run lint` / `lint:fix` |
| Prettier | 格式统一 | `npm run format` / `format:check` |
| TypeScript `tsc` | 类型检查 | 含于 `npm run build` |
| esbuild | 生产构建 | `npm run build` |

> 安装质量工具链：`npm install`（已写入 `devDependencies`）。
> 建议接入 git pre-commit hook（husky + lint-staged）自动跑 lint/format。
