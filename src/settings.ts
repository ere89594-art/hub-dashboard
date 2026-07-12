// 中枢看板 — 设置面板

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type MagicOSPlugin from './main';
import type { MagicOSSettings } from './types';
import { DEFAULT_SETTINGS } from './settings-defaults';

export class MagicOSSettingTab extends PluginSettingTab {
  plugin: MagicOSPlugin;

  constructor(app: App, plugin: MagicOSPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '中枢看板 设置' });

    // === 模块名称 ===
    containerEl.createEl('h3', { text: '模块名称' });

    const moduleKeys: (keyof MagicOSSettings['moduleNames'])[] = [
      'homepage',
      'schedule',
      'library',
      'travel',
      'creativeWorkshop',
    ];

    for (const key of moduleKeys) {
      new Setting(containerEl)
        .setName(this.plugin.magicSettings.moduleNames[key])
        .setDesc('自定义模块显示名称')
        .addText((text) =>
          text.setValue(this.plugin.magicSettings.moduleNames[key]).onChange(async (value) => {
            this.plugin.magicSettings.moduleNames[key] = value || DEFAULT_SETTINGS.moduleNames[key];
            await this.plugin.saveSettings();
          }),
        );
    }

    // === 数据存放位置 ===
    containerEl.createEl('h3', { text: '数据存放位置' });

    new Setting(containerEl)
      .setName('数据根文件夹')
      .setDesc('所有模块数据统一存放的父文件夹名称（位于 vault 根目录）')
      .addText((text) =>
        text
          .setValue(this.plugin.magicSettings.vaultRoot)
          .onChange(async (value) => {
            this.plugin.magicSettings.vaultRoot = value.trim() || '中枢看板';
            await this.plugin.saveSettings();
          }),
      );

    // === iCloud 日历同步 ===
    containerEl.createEl('h3', { text: 'iCloud 日历同步' });

    new Setting(containerEl)
      .setName('启用同步')
      .setDesc('将修习课表中的日程同步到 iCloud 日历（需要本地日历文件支持）')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.magicSettings.icloudCalendar.enabled)
          .onChange(async (value) => {
            this.plugin.magicSettings.icloudCalendar.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('日历名称')
      .setDesc('同步到 iCloud 的日历名称')
      .addText((text) =>
        text
          .setValue(this.plugin.magicSettings.icloudCalendar.calendarName)
          .onChange(async (value) => {
            this.plugin.magicSettings.icloudCalendar.calendarName = value || '中枢看板';
            await this.plugin.saveSettings();
          }),
      );

    // === 首页布局 ===
    containerEl.createEl('h3', { text: '首页 — 栅格布局' });

    new Setting(containerEl)
      .setName('网格列数')
      .setDesc('桌面端每行卡片列数（2-4列）')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('2', '2 列')
          .addOption('3', '3 列')
          .addOption('4', '4 列')
          .setValue(String(this.plugin.magicSettings.homepageLayout.gridColumns))
          .onChange(async (value) => {
            this.plugin.magicSettings.homepageLayout.gridColumns = Number(value) as 2 | 3 | 4;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('网格行数')
      .setDesc('内容区最大行数（auto=自动撑开，4/5/6=固定行高）')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('auto', '自动')
          .addOption('4', '4 行')
          .addOption('5', '5 行')
          .addOption('6', '6 行')
          .setValue(this.plugin.magicSettings.homepageLayout.gridRows)
          .onChange(async (value) => {
            this.plugin.magicSettings.homepageLayout.gridRows = value as 'auto' | '4' | '5' | '6';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('卡片间距')
      .setDesc('控制卡片之间的留白密度')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('S', '紧凑 (8px)')
          .addOption('M', '适中 (16px)')
          .addOption('L', '宽松 (24px)')
          .setValue(this.plugin.magicSettings.homepageLayout.cardGap)
          .onChange(async (value) => {
            this.plugin.magicSettings.homepageLayout.cardGap = value as 'S' | 'M' | 'L';
            await this.plugin.saveSettings();
          }),
      );

    // === 数据筛选 ===
    containerEl.createEl('h3', { text: '首页 — 数据筛选' });

    new Setting(containerEl)
      .setName('逾期阈值（天）')
      .setDesc('任务超过此天数未完成标记为逾期')
      .addSlider((slider) =>
        slider
          .setLimits(0, 7, 1)
          .setValue(this.plugin.magicSettings.homepageFilters.overdueThreshold)
          .onChange(async (value) => {
            this.plugin.magicSettings.homepageFilters.overdueThreshold = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('日程预加载天数')
      .setDesc('首页日程卡片提前显示未来几天的日程')
      .addSlider((slider) =>
        slider
          .setLimits(1, 7, 1)
          .setValue(this.plugin.magicSettings.homepageFilters.preloadDays)
          .onChange(async (value) => {
            this.plugin.magicSettings.homepageFilters.preloadDays = value;
            await this.plugin.saveSettings();
          }),
      );

    // === 导航图标 ===
    containerEl.createEl('h3', { text: '首页 — 导航图标' });

    const navKeys: string[] = ['schedule', 'library', 'travel', 'workshop'];
    for (const key of navKeys) {
      const modName =
        this.plugin.magicSettings.moduleNames[
          key as keyof typeof this.plugin.magicSettings.moduleNames
        ] || key;
      new Setting(containerEl).setName(`${modName} 图标`).addText((text) =>
        text
          .setValue(this.plugin.magicSettings.homepageLayout.navIcons[key] || '')
          .onChange(async (value) => {
            this.plugin.magicSettings.homepageLayout.navIcons[key] = value;
            await this.plugin.saveSettings();
          }),
      );
    }
    // === 旅行记忆 ===
    containerEl.createEl('h3', { text: '旅行记忆' });

    // 高德地图 API Key + 测试按钮
    new Setting(containerEl)
      .setName('高德地图 API Key')
      .setDesc('用于地理编码和地图瓦片加载。免费申请：console.amap.com/dev/key/app')
      .addText((text) =>
        text
          .setPlaceholder('输入你的高德 Web 服务 API Key')
          .setValue(this.plugin.magicSettings.gaodeApiKey)
          .onChange(async (value) => {
            this.plugin.magicSettings.gaodeApiKey = value.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addExtraButton((btn) => {
        btn
          .setIcon('search')
          .setTooltip('测试 API Key 是否有效')
          .onClick(async () => {
            const key = this.plugin.magicSettings.gaodeApiKey;
            if (!key) {
              new Notice('⚠️ 请先填写 API Key');
              return;
            }
            btn.setDisabled(true);
            new Notice('🔍 正在测试 API Key...');
            try {
              const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent('北京市')}&key=${encodeURIComponent(key)}`;
              const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
              const json = await resp.json();
              if (json.status === '1' && json.geocodes && json.geocodes.length > 0) {
                const gc = json.geocodes[0];
                new Notice(
                  `✅ API Key 有效！北京市编码结果：${gc.location} (${gc.formatted_address || '北京市'})`,
                  5000,
                );
              } else {
                new Notice(`❌ API 返回异常：${json.info || '未知错误'}`, 8000);
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : '网络错误';
              new Notice(`❌ 测试失败：${msg}`, 8000);
            } finally {
              btn.setDisabled(false);
            }
          });
      });

    // 3D 地球重置地点
    new Setting(containerEl)
      .setName('3D 地球重置地点 — 标签')
      .setDesc('点击「重置视角」按钮时显示的地点名称')
      .addText((text) =>
        text
          .setValue(this.plugin.magicSettings.travelResetLabel || '重庆')
          .onChange(async (value) => {
            this.plugin.magicSettings.travelResetLabel = value || '重庆';
            await this.plugin.saveSettingsSilent();
          }),
      );

    new Setting(containerEl)
      .setName('3D 地球重置地点 — 纬度')
      .setDesc('重置视角时正对屏幕的纬度（-90 到 90）')
      .addText((text) =>
        text
          .setValue(String(this.plugin.magicSettings.travelResetLat ?? 29.562943))
          .onChange(async (value) => {
            this.plugin.magicSettings.travelResetLat = parseFloat(value) || 29.562943;
            await this.plugin.saveSettingsSilent();
          }),
      );

    new Setting(containerEl)
      .setName('3D 地球重置地点 — 经度')
      .setDesc('重置视角时正对屏幕的经度（-180 到 180）')
      .addText((text) =>
        text
          .setValue(String(this.plugin.magicSettings.travelResetLng ?? 106.551294))
          .onChange(async (value) => {
            this.plugin.magicSettings.travelResetLng = parseFloat(value) || 106.551294;
            await this.plugin.saveSettingsSilent();
          }),
      );

    new Setting(containerEl)
      .setName('默认地图视图')
      .setDesc('打开旅行记忆时默认显示的地图类型')
      .addDropdown((dd) =>
        dd
          .addOption('standard', '🗺️ 标准地图')
          .addOption('satellite', '🛰️ 卫星影像')
          .addOption('terrain', '🏔️ 地形图')
          .setValue(this.plugin.magicSettings.travelDefaultView || 'standard')
          .onChange(async (value) => {
            this.plugin.magicSettings.travelDefaultView = value as 'standard' | 'satellite' | 'terrain';
            await this.plugin.saveSettingsSilent();
          }),
      );

    new Setting(containerEl)
      .setName('缓存地图瓦片到本地')
      .setDesc('将加载过的地图瓦片缓存到 IndexedDB，下次打开更快（占用浏览器存储空间）')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.magicSettings.travelCacheTiles !== false)
          .onChange(async (value) => {
            this.plugin.magicSettings.travelCacheTiles = value;
            await this.plugin.saveSettingsSilent();
            if (!value) {
              // 关闭缓存时清除已有缓存
              try {
                await indexedDB.deleteDatabase('hub-dashboard-tile-cache');
                new Notice('已清除瓦片缓存');
              } catch {
                /* ignore */
              }
            }
          }),
      )
      .addExtraButton((btn) => {
        btn
          .setIcon('trash')
          .setTooltip('清除所有已缓存瓦片')
          .onClick(async () => {
            try {
              indexedDB.deleteDatabase('hub-dashboard-tile-cache');
              new Notice('瓦片缓存已清除');
            } catch {
              new Notice('清除失败');
            }
          });
      });
  }
}
