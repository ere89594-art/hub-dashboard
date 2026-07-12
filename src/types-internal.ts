// 中枢看板 — Obsidian 运行时存在但未在官方类型中声明的内部 API
// 仅在确有必要时，通过 `as AppWithInternals` 做一次集中、窄化的断言，
// 避免散落大量 `as any`（例如 app.plugins / app.setting / app.commands / app.showInFolder）。
import type { App } from 'obsidian';

export type AppWithInternals = App & {
  plugins: {
    disablePlugin(id: string): Promise<void>;
    enablePlugin(id: string): Promise<void>;
    plugins: Record<string, unknown>;
  };
  setting: {
    open(): void;
    openTabById(id: string): void;
  };
  showInFolder(path: string): void;
  commands: {
    executeCommandById(id: string): void;
  };
};
