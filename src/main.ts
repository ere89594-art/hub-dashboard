// 中枢看板 — 插件入口

import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from './settings-defaults';
import { MagicOSSettingTab } from './settings';
import { HomepageView, HOMEPAGE_VIEW_TYPE } from './modules/homepage/HomepageView';
import { VaultService } from './services/VaultService';
import type { MagicOSSettings } from './types';

export default class MagicOSPlugin extends Plugin {
  declare magicSettings: MagicOSSettings;
  vaultService!: VaultService;
  private homepageView: HomepageView | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.vaultService = new VaultService(this.app.vault);

    this.registerView(HOMEPAGE_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      this.homepageView = new HomepageView(leaf, this);
      return this.homepageView;
    });

    this.addSettingTab(new MagicOSSettingTab(this.app, this));
    this.registerCommands();

    this.addRibbonIcon('sparkles', this.magicSettings.moduleNames.homepage, () => {
      this.activateModuleView('homepage');
    });

    const v = this.app.vault;
    this.registerEvent(
      v.on('modify', (file: TFile) => {
        if (file instanceof TFile && file.extension === 'md') this.onFileChanged(file);
      }),
    );
    this.registerEvent(
      v.on('create', (file: TFile) => {
        if (file instanceof TFile && file.extension === 'md') this.onFileChanged(file);
      }),
    );
    this.registerEvent(
      v.on('delete', (file: TFile) => {
        if (file instanceof TFile && file.extension === 'md') this.onFileChanged(file);
      }),
    );
  }

  async onunload(): Promise<void> {
    const style = document.getElementById('hub-dashboard-styles');
    if (style) style.remove();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    if (data) {
      this.magicSettings = {
        ...DEFAULT_SETTINGS,
        ...data,
        moduleNames: { ...DEFAULT_SETTINGS.moduleNames, ...(data.moduleNames || {}) },
        homepageLayout: { ...DEFAULT_SETTINGS.homepageLayout, ...(data.homepageLayout || {}) },
        homepageFilters: { ...DEFAULT_SETTINGS.homepageFilters, ...(data.homepageFilters || {}) },
        customCards: data.customCards || [],
        icloudCalendar: {
          ...DEFAULT_SETTINGS.icloudCalendar,
          ...(data.icallCalendar || data.icloudCalendar || {}),
        },
        schedulePresets: data.schedulePresets || DEFAULT_SETTINGS.schedulePresets,
        schedulePalette: data.schedulePalette || DEFAULT_SETTINGS.schedulePalette,
      };
    } else {
      this.magicSettings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.magicSettings);
    if (this.homepageView && this.homepageView.getViewType() === HOMEPAGE_VIEW_TYPE) {
      this.homepageView.refresh();
    }
  }

  /** 静默保存设置 — 不触发视图刷新（用于缓存更新等场景，避免死循环） */
  async saveSettingsSilent(): Promise<void> {
    await this.saveData(this.magicSettings);
  }

  /** 统一拼接数据存放路径：vaultRoot/name（未配置时直接 name） */
  folder(name: string): string {
    return this.magicSettings.vaultRoot ? `${this.magicSettings.vaultRoot}/${name}` : name;
  }

  private registerCommands(): void {
    const nm = this.magicSettings.moduleNames;

    this.addCommand({
      id: 'open-homepage',
      name: `打开${nm.homepage}`,
      callback: () => this.activateModuleView('homepage'),
    });
    this.addCommand({
      id: 'open-schedule',
      name: `打开${nm.schedule}`,
      callback: () => this.activateModuleView('schedule'),
    });
    this.addCommand({
      id: 'open-library',
      name: `打开${nm.library}`,
      callback: () => this.activateModuleView('library'),
    });
    this.addCommand({
      id: 'open-travel',
      name: `打开${nm.travel}`,
      callback: () => this.activateModuleView('travel'),
    });
    this.addCommand({
      id: 'open-workshop',
      name: `打开${nm.creativeWorkshop}`,
      callback: () => this.activateModuleView('workshop'),
    });
    this.addCommand({
      id: 'refresh-homepage',
      name: '刷新首页数据',
      callback: () => {
        this.homepageView?.refresh();
      },
    });
  }

  async activateModuleView(moduleKey: string): Promise<void> {
    if (moduleKey === 'homepage') {
      await this.activateHomepage();
      return;
    }
    await this.activateHomepage();
    setTimeout(() => {
      this.homepageView?.switchToModule(moduleKey);
    }, 100);
  }

  private async activateHomepage(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(HOMEPAGE_VIEW_TYPE);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf();
    if (leaf) {
      await leaf.setViewState({ type: HOMEPAGE_VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  private onFileChanged(file: TFile): void {
    if (
      file.path.includes('修习课表') ||
      file.path.includes('创意工坊') ||
      file.path.includes('典藏馆') ||
      file.path.includes('旅行记忆') ||
      file.path.includes('项目管理')
    ) {
      this.debouncedRefresh();
    }
  }

  private _refreshTimer: NodeJS.Timeout | null = null;
  private debouncedRefresh(): void {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this.homepageView?.smartRefresh();
    }, 300);
  }
}
