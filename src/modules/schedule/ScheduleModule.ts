// 中枢看板 — 修习课表模块

import { WorkspaceLeaf, TFile } from 'obsidian';
import type MagicOSPlugin from '../../main';
import type { SchedulePreset, ScheduleFrontmatter } from '../../types';
import { parseFrontmatter, serializeFrontmatter } from '../../services/FrontmatterService';
import { VaultService } from '../../services/VaultService';

export class ScheduleModule {
  private plugin: MagicOSPlugin;
  private vault: VaultService;
  private container: HTMLElement;
  private schView: 'week' | 'month' = 'week';
  private presets: SchedulePreset[] = [];
  private embeddedLeaf: WorkspaceLeaf | null = null;
  private detailPanel: HTMLElement | null = null;

  constructor(plugin: MagicOSPlugin, container: HTMLElement) {
    this.plugin = plugin;
    this.vault = plugin.vaultService;
    this.container = container;
    this.loadPresets();
  }

  private loadPresets(): void {
    const s = this.plugin.magicSettings;
    this.presets = s.schedulePresets || [];
  }

  private savePresets(): void {
    this.plugin.magicSettings.schedulePresets = this.presets;
    this.plugin.saveSettings();
  }

  async render(): Promise<void> {
    const ct = this.container;
    ct.empty();

    // 顶部行：预设侧栏 + 日历
    const topRow = ct.createDiv({ cls: 'sch-top-row' });
    topRow.style.cssText = 'display:flex;gap:12px;padding:0 20px;flex:0 0 auto;';

    this.renderSidebar(topRow);
    await this.renderCalendar(topRow);

    // 统计栏
    await this.renderStats(ct);

    // 底部双面板：任务列表 + 详情
    const bottom = ct.createDiv({ cls: 'sch-bottom' });
    bottom.style.cssText = 'display:flex;gap:12px;padding:0 20px 20px;flex:1;min-height:200px;';
    await this.renderTaskList(bottom);
    this.renderDetailPanel(bottom);
  }

  // === 侧栏：预设任务 ===

  private renderSidebar(parent: HTMLElement): void {
    const sb = parent.createDiv({ cls: 'sch-sidebar' });
    sb.style.cssText =
      'width:150px;flex-shrink:0;padding:10px;background:var(--background-secondary);border-radius:16px;border:1px solid var(--background-modifier-border);overflow-y:auto;display:flex;flex-direction:column;';

    const hdr = sb.createDiv();
    hdr.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
    hdr.createEl('span', { text: '预设任务', cls: 'sch-sidebar-title' }).style.cssText =
      'font-size:13px;font-weight:600;color:var(--text-normal);';

    const searchInput = hdr.createEl('input', {
      attr: { placeholder: '搜索...' },
    }) as HTMLInputElement;
    searchInput.style.cssText =
      'width:70px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:4px;padding:2px 6px;font-size:11px;color:var(--text-normal);';
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      sb.querySelectorAll<HTMLElement>('.sch-preset-item').forEach((it) => {
        it.style.display = it.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    });

    // 统计
    sb.createDiv({ cls: 'sch-sb-stats' }).textContent =
      '本周任务: ' + this.vault.listMarkdownFiles(this.plugin.folder('修习课表')).length + ' 个';

    // 视图切换
    const viewToggle = sb.createEl('button', {
      text: this.schView === 'week' ? '📅 周视图' : '📆 月视图',
      cls: 'sch-view-toggle',
    });
    viewToggle.style.cssText =
      'width:100%;margin-bottom:8px;height:28px;font-size:11px;border-radius:8px;border:1px solid var(--background-modifier-border);background:transparent;cursor:pointer;color:var(--text-muted);';
    viewToggle.addEventListener('click', () => {
      this.schView = this.schView === 'week' ? 'month' : 'week';
      this.render();
    });

    // 预设列表
    const presetList = sb.createDiv({ cls: 'sch-preset-list' });
    presetList.style.cssText = 'flex:1;overflow-y:auto;';

    for (let i = 0; i < this.presets.length; i++) {
      const p = this.presets[i];
      const item = presetList.createDiv({ cls: 'sch-preset-item' });
      item.setAttribute('draggable', 'true');
      item.style.cssText = `border-left:4px solid ${p.color};padding:8px 10px;margin-bottom:4px;background:var(--background-primary);border-radius:8px;cursor:grab;font-size:12px;display:flex;align-items:center;justify-content:space-between;`;
      item.createSpan({ text: p.name });
      const right = item.createDiv();
      right.style.cssText = 'display:flex;align-items:center;gap:4px;';
      right.createSpan({ text: p.duration + 'h' }).style.cssText =
        'font-size:10px;color:var(--text-muted);';
      const delBtn = right.createEl('button', { text: '×' });
      delBtn.style.cssText =
        'border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0 2px;';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.presets.splice(i, 1);
        this.savePresets();
        this.render();
      });

      item.addEventListener('dragstart', (ev: DragEvent) => {
        ev.dataTransfer!.setData('text/plain', JSON.stringify(p));
        ev.dataTransfer!.effectAllowed = 'copy';
      });
    }

    // 新建设定
    const addBtn = sb.createEl('button', { text: '+ 新建设定' });
    addBtn.style.cssText =
      'width:100%;height:30px;background:transparent;border:1px dashed var(--background-modifier-border);border-radius:8px;cursor:pointer;color:var(--text-muted);font-size:11px;margin-top:4px;flex-shrink:0;';

    const addPanel = sb.createDiv({ cls: 'sch-add-panel' });
    addPanel.style.cssText =
      'display:none;margin-top:6px;padding:8px;background:var(--background-primary);border-radius:8px;flex-shrink:0;';
    addPanel.innerHTML = `
      <label style="font-size:10px;color:var(--text-muted);">名称</label>
      <input placeholder="任务名称" style="width:100%;box-sizing:border-box;margin-bottom:6px;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:4px;padding:4px 6px;font-size:12px;color:var(--text-normal);">
      <label style="font-size:10px;color:var(--text-muted);">时长（小时）</label>
      <input type="number" min="1" max="8" value="2" style="width:100%;box-sizing:border-box;margin-bottom:6px;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:4px;padding:4px 6px;font-size:12px;color:var(--text-normal);">
      <label style="font-size:10px;color:var(--text-muted);">颜色</label>
      <div class="sch-palette-row" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;"></div>
      <input type="color" value="#b4c6e8" style="width:100%;height:24px;border:none;cursor:pointer;margin-bottom:6px;">
      <div style="display:flex;gap:4px;">
        <button class="sch-add-ok" style="flex:1;height:24px;border:none;border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:11px;">添加</button>
        <button class="sch-add-cancel" style="flex:1;height:24px;border:1px solid var(--background-modifier-border);border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px;">取消</button>
      </div>
    `;

    // 填充调色板色块
    const palette = this.plugin.magicSettings.schedulePalette || [];
    const paletteRow = addPanel.querySelector('.sch-palette-row') as HTMLElement;
    const colorInput = addPanel.querySelector('input[type="color"]') as HTMLInputElement;
    for (const c of palette) {
      const sw = paletteRow.createDiv();
      sw.style.cssText = `width:20px;height:20px;border-radius:4px;background:${c};cursor:pointer;border:1.5px solid transparent;`;
      sw.addEventListener('click', () => {
        colorInput.value = c;
        paletteRow
          .querySelectorAll<HTMLElement>('div')
          .forEach((d: HTMLElement) => (d.style.borderColor = 'transparent'));
        sw.style.borderColor = 'var(--interactive-accent)';
      });
    }

    addBtn.addEventListener('click', () => {
      addPanel.style.display = addPanel.style.display === 'none' ? 'block' : 'none';
    });

    (addPanel.querySelector('.sch-add-ok') as HTMLElement).addEventListener('click', () => {
      const inputs = addPanel.querySelectorAll('input');
      const name = (inputs[0] as HTMLInputElement).value.trim();
      if (!name) return;
      const dur = parseInt((inputs[1] as HTMLInputElement).value) || 2;
      const color = (inputs[2] as HTMLInputElement).value;
      this.presets.push({ name, duration: dur, color });
      this.savePresets();
      this.render();
    });

    (addPanel.querySelector('.sch-add-cancel') as HTMLElement).addEventListener('click', () => {
      addPanel.style.display = 'none';
    });

    // iCloud 同步按钮
    if (this.plugin.magicSettings.icloudCalendar.enabled) {
      const syncBtn = sb.createEl('button', { text: ' iCloud 同步' });
      syncBtn.style.cssText =
        'width:100%;height:28px;margin-top:6px;border:1px solid var(--interactive-accent);border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px;flex-shrink:0;';
      syncBtn.addEventListener('click', () => this.syncToICloud());
    }
  }

  // === 日历 ===

  private async renderCalendar(parent: HTMLElement): Promise<void> {
    const cal = parent.createDiv({ cls: 'sch-calendar' });
    cal.style.cssText = `flex:1;overflow-y:auto;display:flex;flex-direction:column;background:var(--background-secondary);border-radius:16px;border:1px solid var(--background-modifier-border);padding:12px;max-height:${this.schView === 'week' ? '320px' : '280px'};`;

    const today = window.moment();
    const weekStart =
      this.schView === 'week'
        ? today.clone().startOf('isoWeek')
        : today.clone().startOf('month').startOf('isoWeek');
    const totalDays = this.schView === 'week' ? 7 : 35;

    // 日期头
    const headerRow = cal.createDiv({ cls: 'sch-day-headers' });
    headerRow.style.cssText =
      'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;flex-shrink:0;';
    for (let d = 0; d < totalDays; d++) {
      const day = weekStart.clone().add(d, 'days');
      const dh = headerRow.createDiv({ cls: 'sch-day-header' });
      dh.style.cssText = 'text-align:center;padding:4px 2px;border-radius:8px;font-size:11px;';
      if (day.isSame(today, 'day')) dh.style.background = 'var(--background-modifier-hover)';
      dh.createSpan({ text: ['一', '二', '三', '四', '五', '六', '日'][d % 7] });
      dh.createSpan({ text: ' ' + day.format('M/D') }).style.cssText = 'color:var(--text-muted);';
    }

    // 日期单元格
    const cellsContainer = cal.createDiv({ cls: 'sch-day-cells' });
    cellsContainer.style.cssText =
      'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;flex:1;';

    const allFiles = this.vault.listMarkdownFiles(this.plugin.folder('修习课表'));

    for (let d = 0; d < totalDays; d++) {
      const day = weekStart.clone().add(d, 'days');
      const dateStr = day.format('YYYY-MM-DD');
      const cell = cellsContainer.createDiv({ cls: 'sch-day-cell' });
      cell.style.cssText = `background:var(--background-primary);border-radius:10px;padding:4px;position:relative;min-height:${this.schView === 'week' ? '100px' : '40px'};display:flex;flex-direction:column;`;
      if (day.isSame(today, 'day'))
        cell.style.boxShadow = '0 0 0 1.5px var(--interactive-accent) inset';

      // 加载该日期的任务
      const dayFiles = allFiles.filter(
        (f) => f.basename.includes(dateStr) || f.path.includes(dateStr),
      );

      if (this.schView === 'week') {
        // 周视图：渲染任务 chip
        for (const f of dayFiles.slice(0, 5)) {
          const cnt = await this.vault.readFile(f);
          const pp = parseFrontmatter(cnt);
          const fm = (pp?.data ?? {}) as ScheduleFrontmatter;
          const done = fm.状态 === '完成';
          const time = fm.时间 || '';

          const chip = cell.createDiv({ cls: 'sch-task-chip' });
          chip.style.cssText = `background:${done ? 'rgba(166,227,161,0.15)' : 'rgba(255,255,255,0.08)'};border-radius:6px;padding:3px 6px;margin-bottom:2px;font-size:11px;cursor:pointer;${done ? 'text-decoration:line-through;opacity:0.5;' : ''}display:flex;align-items:center;gap:4px;overflow:hidden;white-space:nowrap;`;
          if (time)
            chip.createSpan({ text: time }).style.cssText =
              'color:var(--text-accent);font-weight:600;font-size:10px;flex-shrink:0;';
          chip.createSpan({ text: (fm.标题 || f.basename).substring(0, 14) }).style.cssText =
            'overflow:hidden;text-overflow:ellipsis;';

          chip.addEventListener('click', () => this.openInDetailPanel(f.path));
          chip.addEventListener('contextmenu', (ev: MouseEvent) => {
            ev.preventDefault();
            this.showContextMenu(ev, f);
          });
          chip.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            this.toggleComplete(f.path);
          });
        }
      } else {
        // 月视图：只显示任务数量
        if (dayFiles.length > 0) {
          const badge = cell.createDiv({ cls: 'sch-month-count' });
          badge.style.cssText =
            'text-align:center;font-size:10px;color:var(--text-muted);background:var(--background-modifier-hover);border-radius:10px;padding:1px 6px;margin:2px auto;font-weight:500;';
          badge.textContent = String(dayFiles.length);
        }
      }

      // 添加按钮（底部 + 号）
      const addBar = cell.createDiv({ cls: 'sch-cell-foot' });
      addBar.style.cssText =
        'position:absolute;bottom:0;left:0;right:0;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;color:var(--text-muted);opacity:0.3;border-radius:0 0 10px 10px;';
      addBar.textContent = '+';
      addBar.addEventListener('mouseenter', () => {
        addBar.style.opacity = '1';
        addBar.style.color = 'var(--interactive-accent)';
      });
      addBar.addEventListener('mouseleave', () => {
        addBar.style.opacity = '0.3';
        addBar.style.color = 'var(--text-muted)';
      });
      addBar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.quickCreateTask(dateStr);
      });

      // 双击空白处创建任务
      cell.addEventListener('dblclick', (ev) => {
        if (ev.target === cell || (ev.target as HTMLElement).classList.contains('sch-day-cell')) {
          this.quickCreateTask(dateStr);
        }
      });

      // 拖拽放置
      cell.addEventListener('dragover', (ev: DragEvent) => {
        ev.preventDefault();
        ev.dataTransfer!.dropEffect = 'copy';
        cell.style.background = 'var(--background-modifier-hover)';
      });
      cell.addEventListener('dragleave', () => {
        cell.style.background = '';
      });
      cell.addEventListener('drop', async (ev: DragEvent) => {
        ev.preventDefault();
        cell.style.background = '';
        const data = ev.dataTransfer!.getData('text/plain');
        if (!data) return;
        const preset: SchedulePreset = JSON.parse(data);
        const fileName = `${preset.name}-${dateStr}.md`;
        const content = `---\n标题: "${preset.name}"\n类型: 日程\n日期: ${dateStr}\n时间: "09:00"\n优先级: 中\n状态: 待办\n时长: ${preset.duration}\n颜色: "${preset.color}"\n创建日期: ${today.format('YYYY-MM-DD')}\n标签: []\n所属模块: 修习课表\n---\n\n# ${preset.name}\n\n时长: ${preset.duration}h\n`;
        await this.vault.createMarkdownFile(this.plugin.folder('修习课表') + '/' + fileName, content);
        this.render();
      });
    }
  }

  // === 统计栏 ===

  private async renderStats(parent: HTMLElement): Promise<void> {
    const allFiles = this.vault.listMarkdownFiles(this.plugin.folder('修习课表'));
    let doneCnt = 0,
      pendCnt = 0,
      todayCnt = 0,
      hiCnt = 0;
    const todayStr = window.moment().format('YYYY-MM-DD');

    const reads = allFiles.map((f) =>
      this.vault
        .readFile(f)
        .then((c) => {
          const pp = parseFrontmatter(c);
          if (!pp) return;
          const fm = pp.data as ScheduleFrontmatter;
          if (fm.状态 === '完成') doneCnt++;
          else pendCnt++;
          if (fm.日期 === todayStr) todayCnt++;
          if (fm.优先级 === '高') hiCnt++;
        })
        .catch(() => {}),
    );
    await Promise.all(reads);

    const bar = parent.createDiv({ cls: 'sch-stats-bar' });
    bar.style.cssText =
      'display:flex;gap:16px;padding:10px 20px;margin:8px 20px;background:var(--background-secondary);border-radius:14px;border:1px solid var(--background-modifier-border);font-size:12px;color:var(--text-muted);flex-wrap:wrap;';
    bar.createEl('span', { text: `✅ 已完成: ${doneCnt}` });
    bar.createEl('span', { text: `⏳ 待办: ${pendCnt}` });
    bar.createEl('span', { text: `📅 今日: ${todayCnt}` });
    bar.createEl('span', { text: `📊 总计: ${allFiles.length}` });
    bar.createEl('span', { text: `🔴 高优先级: ${hiCnt}` });
  }

  // === 底部：任务列表 + 详情面板 ===

  private async renderTaskList(parent: HTMLElement): Promise<void> {
    const panel = parent.createDiv({ cls: 'sch-bot-panel' });
    panel.style.cssText =
      'flex:0.35;background:var(--background-secondary);border-radius:16px;border:1px solid var(--background-modifier-border);padding:12px;overflow-y:auto;';

    const allFiles = this.vault.listMarkdownFiles(this.plugin.folder('修习课表'));
    // 收集所有未完成任务
    const incompleteTasks: { file: TFile; fm: ScheduleFrontmatter; priority: string }[] = [];
    for (const f of allFiles) {
      const cnt = await this.vault.readFile(f);
      const pp = parseFrontmatter(cnt);
      const fm = (pp?.data ?? {}) as ScheduleFrontmatter;
      if (fm.状态 === '完成') continue;
      incompleteTasks.push({ file: f, fm, priority: fm.优先级 || '中' });
    }

    panel.createEl('h4', {
      text: `未完成任务 (${incompleteTasks.length})`,
      cls: 'sch-panel-title',
    }).style.cssText =
      'font-size:13px;font-weight:600;margin:0 0 8px;color:var(--interactive-accent);';

    for (const { file: f, fm, priority } of incompleteTasks) {
      const item = panel.createDiv({ cls: 'sch-task-item' });
      item.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;margin-bottom:3px;font-size:12px;background:var(--background-primary);cursor:pointer;';
      const dotColor = priority === '高' ? '#f38ba8' : priority === '中' ? '#f9e2af' : '#a6e3a1';
      item.createDiv({ cls: 'dot' }).style.cssText =
        `width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;`;
      item.createSpan({ text: fm.标题 || f.basename }).style.cssText =
        'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      item.createSpan({ text: fm.日期 || '' }).style.cssText =
        'font-size:10px;color:var(--text-muted);flex-shrink:0;';

      item.addEventListener('click', () => this.openInDetailPanel(f.path));
      item.addEventListener('contextmenu', (ev: MouseEvent) => {
        ev.preventDefault();
        this.showContextMenu(ev, f);
      });
    }

    if (incompleteTasks.length === 0) {
      panel.createDiv({ text: '暂无任务', cls: 'hub-dashboard-empty-text' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:20px;';
    }
  }

  private renderDetailPanel(parent: HTMLElement): void {
    this.detailPanel = parent.createDiv({ cls: 'sch-detail-panel' });
    this.detailPanel.setAttribute('id', 'sch-detail-panel');
    this.detailPanel.style.cssText =
      'flex:0.65;background:var(--background-secondary);border-radius:16px;border:1px solid var(--background-modifier-border);overflow:hidden;position:relative;display:flex;flex-direction:column;';
    this.detailPanel.createDiv({
      text: '点击任务查看详情',
      cls: 'hub-dashboard-empty-text',
    }).style.cssText =
      'text-align:center;font-size:11px;color:var(--text-faint);padding:40px 20px;';
  }

  // === 任务操作 ===

  private async quickCreateTask(dateStr: string): Promise<void> {
    // 显示颜色 + 名称选择弹窗
    this.showQuickCreatePopup(dateStr);
  }

  private showQuickCreatePopup(dateStr: string): void {
    // 移除旧弹窗
    const old = document.querySelector('.sch-quick-popup');
    if (old) old.remove();

    const palette = this.plugin.magicSettings.schedulePalette || [];
    const overlay = document.createElement('div');
    overlay.className = 'sch-quick-popup';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);';

    const dialog = overlay.createDiv();
    dialog.style.cssText =
      'background:var(--background-primary);border-radius:16px;border:1px solid var(--background-modifier-border);box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:20px;min-width:280px;max-width:340px;';
    dialog.createEl('div', { text: '新建任务' }).style.cssText =
      'font-size:15px;font-weight:600;color:var(--text-normal);margin-bottom:4px;';
    dialog.createEl('div', { text: dateStr }).style.cssText =
      'font-size:11px;color:var(--text-muted);margin-bottom:12px;';

    // 名称输入
    const nameInput = dialog.createEl('input', {
      attr: { placeholder: '任务名称', value: '新日程' },
    }) as HTMLInputElement;
    nameInput.style.cssText =
      'width:100%;box-sizing:border-box;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:8px;padding:8px 10px;font-size:13px;color:var(--text-normal);margin-bottom:12px;outline:none;';

    // 颜色选择
    dialog.createEl('div', { text: '颜色' }).style.cssText =
      'font-size:11px;color:var(--text-muted);margin-bottom:6px;';
    const colorRow = dialog.createDiv();
    colorRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;';
    let selColor = palette[0] || '#b4c6e8';

    for (const c of palette) {
      const sw = colorRow.createDiv();
      sw.style.cssText = `width:28px;height:28px;border-radius:8px;background:${c};cursor:pointer;border:2px solid ${c === selColor ? 'var(--interactive-accent)' : 'transparent'};transition:border 0.15s;`;
      sw.addEventListener('click', () => {
        selColor = c;
        colorRow.querySelectorAll<HTMLElement>('div').forEach((d: HTMLElement) => (d.style.borderColor = 'transparent'));
        sw.style.borderColor = 'var(--interactive-accent)';
      });
    }

    // 自定义颜色
    const customColor = dialog.createEl('input', {
      attr: { type: 'color', value: palette[0] || '#b4c6e8' },
    }) as HTMLInputElement;
    customColor.style.cssText =
      'width:28px;height:28px;border:none;cursor:pointer;padding:0;margin-bottom:14px;background:transparent;';
    customColor.addEventListener('input', () => {
      selColor = customColor.value;
    });

    // 按钮
    const btnRow = dialog.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;';
    const okBtn = btnRow.createEl('button', { text: '创建' });
    okBtn.style.cssText =
      'flex:1;height:32px;border:none;border-radius:8px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:13px;font-weight:500;';
    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.style.cssText =
      'flex:1;height:32px;border:1px solid var(--background-modifier-border);border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;';

    okBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim() || '新日程';
      overlay.remove();
      const fileName = `日程-${dateStr}-${Date.now()}.md`;
      const content = `---\n标题: "${name}"\n类型: 日程\n日期: ${dateStr}\n时间: "09:00"\n优先级: 中\n状态: 待办\n颜色: "${selColor}"\n创建日期: ${window.moment().format('YYYY-MM-DD')}\n标签: []\n所属模块: 修习课表\n---\n\n# ${name}\n`;
      await this.vault.createMarkdownFile(this.plugin.folder('修习课表') + '/' + fileName, content);
      this.render();
      this.openInDetailPanel(this.plugin.folder('修习课表') + '/' + fileName);
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    setTimeout(() => nameInput.focus(), 50);
  }

  private async openInDetailPanel(filePath: string): Promise<void> {
    if (!this.detailPanel) return;
    const f = this.vault.getFile(filePath);
    if (!f) return;

    // 清除旧的嵌入叶子
    if (this.embeddedLeaf) {
      this.embeddedLeaf.detach();
      this.embeddedLeaf = null;
    }

    this.detailPanel.empty();
    const cnt = await this.vault.readFile(f);
    const pp = parseFrontmatter(cnt);
    const fm = (pp?.data ?? {}) as ScheduleFrontmatter;
    const body = (pp?.body || '').trim();

    // 工具栏
    const tb = this.detailPanel.createDiv();
    tb.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--background-modifier-border);flex-shrink:0;';
    tb.createEl('span', { text: fm.标题 || f.basename }).style.cssText =
      'font-size:13px;font-weight:600;color:var(--text-normal);flex:1;';

    const statusBtn = tb.createEl('button', { text: fm.状态 || '待办' });
    statusBtn.style.cssText =
      'font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-muted);cursor:pointer;';
    statusBtn.addEventListener('click', async () => {
      await this.toggleComplete(filePath);
    });

    const openBtn = tb.createEl('button', { text: '打开' });
    openBtn.style.cssText =
      'font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;';
    openBtn.addEventListener('click', () => {
      this.plugin.app.workspace.openLinkText(filePath, '', false);
    });

    // 元数据
    const meta = this.detailPanel.createDiv();
    meta.style.cssText =
      'font-size:10px;color:var(--text-muted);padding:6px 12px;border-bottom:1px solid var(--background-modifier-border);flex-shrink:0;';
    meta.textContent = `日期: ${fm.日期 || ''}  |  时间: ${fm.时间 || ''}  |  优先级: ${fm.优先级 || '中'}`;

    // 正文区域 - 使用嵌入的 Markdown 视图
    const bodyContainer = this.detailPanel.createDiv();
    bodyContainer.style.cssText = 'flex:1;overflow:hidden;position:relative;';

    // 创建嵌入的 Markdown 编辑器
    try {
      this.embeddedLeaf = new WorkspaceLeaf(this.plugin.app);
      bodyContainer.appendChild(this.embeddedLeaf.containerEl);
      this.embeddedLeaf.containerEl.style.cssText = 'width:100%;height:100%;';
      await this.embeddedLeaf.openFile(f);
    } catch {
      // 降级为纯文本显示
      const textDiv = bodyContainer.createDiv();
      textDiv.style.cssText =
        'padding:12px;font-size:13px;color:var(--text-normal);white-space:pre-wrap;overflow-y:auto;height:100%;';
      textDiv.textContent = body || '（无内容）';
    }
  }

  private async toggleComplete(filePath: string): Promise<void> {
    const f = this.vault.getFile(filePath);
    if (!f) return;
    const cnt = await this.vault.readFile(f);
    const pp = parseFrontmatter(cnt);
    if (!pp) return;
    const fm = pp.data as ScheduleFrontmatter;
    fm.状态 = fm.状态 === '完成' ? '待办' : '完成';
    await this.vault.writeFile(f, serializeFrontmatter(fm, pp.body));
    this.render();
  }

  private async deleteTask(filePath: string): Promise<void> {
    const f = this.vault.getFile(filePath);
    if (!f) return;
    await (this.plugin.app.vault as any).delete(f);
    this.render();
  }

  private showContextMenu(ev: MouseEvent, f: TFile): void {
    const old = document.querySelector('.sch-ctx-menu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.className = 'sch-ctx-menu';
    menu.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:9999;min-width:140px;padding:4px;`;

    const items = [
      { label: '✓ 标记完成/待办', action: () => this.toggleComplete(f.path) },
      {
        label: '📂 打开文件',
        action: () => this.plugin.app.workspace.openLinkText(f.path, '', false),
      },
      { label: '🗑 删除', action: () => this.deleteTask(f.path), danger: true },
    ];

    for (const it of items) {
      const mi = menu.createDiv({ text: it.label });
      mi.style.cssText = `padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:${it.danger ? 'var(--text-error)' : 'var(--text-normal)'};`;
      mi.addEventListener(
        'mouseenter',
        () => (mi.style.background = 'var(--background-modifier-hover)'),
      );
      mi.addEventListener('mouseleave', () => (mi.style.background = ''));
      mi.addEventListener('click', () => {
        menu.remove();
        it.action();
      });
    }

    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true });
    }, 10);
  }

  // === iCloud 日历同步 ===

  private async syncToICloud(): Promise<void> {
    try {
      const allFiles = this.vault.listMarkdownFiles(this.plugin.folder('修习课表'));
      const events: string[] = [];
      const today = window.moment().format('YYYY-MM-DD');

      for (const f of allFiles) {
        const cnt = await this.vault.readFile(f);
        const pp = parseFrontmatter(cnt);
        if (!pp) continue;
        const fm = pp.data as any;
        if (fm.状态 === '完成') continue;
        if (!fm.日期) continue;

        const date = fm.日期;
        const time = fm.时间 || '09:00';
        const title = fm.标题 || f.basename;
        const dt = `${date}T${time}:00`;

        events.push(
          `BEGIN:VEVENT\n` +
            `UID:${f.path}@hub-dashboard\n` +
            `DTSTAMP:${today}T000000Z\n` +
            `DTSTART:${dt}\n` +
            `SUMMARY:${title}\n` +
            `STATUS:CONFIRMED\n` +
            `END:VEVENT\n`,
        );
      }

      const calName = this.plugin.magicSettings.icloudCalendar.calendarName || '中枢看板';
      const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//中枢看板//Obsidian//EN\nCALSCALE:GREGORIAN\nX-WR-CALNAME:${calName}\n${events.join('')}END:VCALENDAR`;

      // 保存 ICS 文件到 vault
      await this.vault.ensureFolder(this.plugin.folder('修习课表'));
      const icsPath = this.plugin.folder('修习课表') + '/MagicOS-Calendar.ics';
      const existing = this.vault.getFile(icsPath);
      if (existing) {
        await this.vault.writeFile(existing, ics);
      } else {
        await this.plugin.app.vault.create(icsPath, ics);
      }

      // 尝试打开文件让用户导入
      new Notice(`已生成 ${events.length} 个日历事件，请导入 ICS 文件到 iCloud 日历`);
    } catch (e) {
      new Notice('同步失败: ' + e);
    }
  }

  destroy(): void {
    if (this.embeddedLeaf) {
      this.embeddedLeaf.detach();
      this.embeddedLeaf = null;
    }
  }
}

// 需要 Notice
import { Notice } from 'obsidian';
