// 中枢看板 — 首页视图（整合所有模块）

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';
import type MagicOSPlugin from '../../main';
import type {
  HomepageData,
  HomepageLayout,
  ScheduleCardData,
  TaskCardData,
  WorkshopOverviewData,
} from '../../types';
import { PIPELINE_STAGES, GAP_MAP } from '../../types';
import {
  parseFrontmatter,
  parseScheduleFrontmatter,
  parseWorkshopFrontmatter,
} from '../../services/FrontmatterService';
import { ScheduleModule } from '../schedule/ScheduleModule';
import { ProjectModule } from '../schedule/ProjectModule';
import { LibraryModule } from '../library/LibraryModule';
import { TravelModule } from '../travel/TravelModule';

export const HOMEPAGE_VIEW_TYPE = 'hub-dashboard-homepage';

const PC: Record<number, string> = {
  0: '#cba6f7',
  1: '#89b4fa',
  2: '#f9e2af',
  3: '#6c7086',
  4: '#6c7086',
  5: '#6c7086',
  6: '#a6e3a1',
  7: '#f5c2e7',
  8: '#585b70',
};
const PA = new Set([0, 1, 2, 6]);

/** obsidian 包的类型定义未公开声明 App.plugins / App.setting，
 *  这里做一次集中、窄化的类型断言，避免散落大量 `as any`。 */
type AppWithInternals = App & {
  plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> };
  setting: { open(): void; openTabById(id: string): void };
};

type ModuleKey = 'home' | 'schedule' | 'library' | 'travel' | 'workshop';

export class HomepageView extends ItemView {
  plugin: MagicOSPlugin;
  private data: HomepageData | null = null;
  private module: ModuleKey = 'home';
  private scheduleModule: ScheduleModule | null = null;
  private projectModule: ProjectModule | null = null;
  private libraryModule: LibraryModule | null = null;
  private travelModule: TravelModule | null = null;
  private scheduleSubTab: 'calendar' | 'project' = 'calendar';
  private dragCid: string | null = null;
  private canvasRects: Map<string, { x: number; y: number; w: number; h: number }> = new Map();
  private canvasEl: HTMLElement | null = null;
  private topZ = 10;

  constructor(leaf: WorkspaceLeaf, plugin: MagicOSPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return HOMEPAGE_VIEW_TYPE;
  }
  getDisplayText() {
    return this.plugin.magicSettings.moduleNames.homepage;
  }
  getIcon() {
    return 'sparkles';
  }

  async onOpen() {
    await this.refresh();
  }

  async onClose() {
    this.scheduleModule?.destroy();
  }

  async refresh() {
    await this.collectData();
    this.render();
  }

  /** 🔑 智能刷新：旅行模块激活时只轻量刷新（不销毁地图），其他情况全量刷新 */
  async smartRefresh(): Promise<void> {
    if (this.module === 'travel' && this.travelModule) {
      // 后台预取首页数据（供返回首页时使用，不阻塞、不重渲染）
      this.collectData().catch(() => {});
      // 轻量刷新旅行模块（不销毁地图）
      await this.travelModule.onExternalFileChange();
    } else {
      await this.refresh();
    }
  }

  /** 切换模块（外部调用） */
  switchToModule(key: string) {
    if (key === 'homepage') this.module = 'home';
    else if (key === 'schedule') this.module = 'schedule';
    else if (key === 'library') this.module = 'library';
    else if (key === 'travel') this.module = 'travel';
    else if (key === 'workshop') this.module = 'workshop';
    this.render();
  }

  // === 数据收集 ===

  private async collectData() {
    const s = this.plugin.magicSettings;
    const vault = this.plugin.vaultService;
    const today = window.moment().format('YYYY-MM-DD');

    const scheduleCards: ScheduleCardData[] = [];
    const taskCards: TaskCardData[] = [];
    const workshopOverview: WorkshopOverviewData = { stages: [], stagnationWarnings: [] };

    // 修习课表数据
    for (const f of vault.listMarkdownFiles('修习课表')) {
      const cnt = await vault.readFile(f);
      const pp = parseFrontmatter(cnt);
      if (!pp) continue;
      const fm = parseScheduleFrontmatter(pp.data);
      if (!fm.日期) continue;
      const diff = window.moment(fm.日期).diff(window.moment(today), 'days');

      if (fm.类型 === '日程') {
        if (diff >= 0 && diff < s.homepageFilters.preloadDays) {
          scheduleCards.push({
            title: fm.标题,
            time: fm.时间 || '',
            date: fm.日期,
            sourceModule: fm.所属模块 || '修习课表',
            filePath: f.path,
            status: fm.状态,
          });
        }
      } else if (fm.状态 === '待办') {
        const overdue = diff < -s.homepageFilters.overdueThreshold;
        if (overdue || diff === 0 || (diff >= -7 && diff <= 7)) {
          taskCards.push({
            title: fm.标题,
            priority: fm.优先级,
            date: fm.日期,
            status: fm.状态,
            overdue,
            filePath: f.path,
          });
        }
      }
    }

    scheduleCards.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : (a.time || '').localeCompare(b.time || ''),
    );
    taskCards.sort((a, b) =>
      a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : a.date.localeCompare(b.date),
    );

    // 创意工坊数据
    const wsDir = vault.getFolder('创意工坊');
    if (wsDir) {
      const stageCounts: Record<number, number> = {};
      const threshold = s.homepageFilters.stagnationThreshold;

      for (const child of wsDir.children) {
        if (!('children' in child)) continue;
        const m = child.name.match(/^(\d+)-/);
        if (!m) continue;
        const n = parseInt(m[1]);
        stageCounts[n] = (stageCounts[n] || 0) + vault.countMarkdownFiles('创意工坊/' + child.name);

        if (n > 0 && n < 6) {
          for (const sf of vault.listMarkdownFiles('创意工坊/' + child.name)) {
            const cc = await vault.readFile(sf);
            const pp2 = parseFrontmatter(cc);
            if (!pp2) continue;
            const wf = parseWorkshopFrontmatter(pp2.data);
            if (
              wf.创建日期 &&
              window.moment(today).diff(window.moment(wf.创建日期), 'days') > threshold
            ) {
              workshopOverview.stagnationWarnings.push({
                title: wf.标题,
                stage: PIPELINE_STAGES.find((x) => x.number === n)?.label || '',
                days: window.moment(today).diff(window.moment(wf.创建日期), 'days'),
                filePath: sf.path,
              });
            }
          }
        }
      }

      workshopOverview.stages = PIPELINE_STAGES.map((st) => ({
        stage: st.name,
        stageNumber: st.number,
        count: stageCounts[st.number] || 0,
        label: st.label,
      }));
    }

    this.data = { scheduleCards, taskCards, workshopOverview };
  }

  // === 主渲染 ===

  private render() {
    const ct = this.containerEl.children[1] as HTMLElement;
    ct.empty();
    ct.classList.add('hub-dashboard-homepage');
    ct.style.cssText = 'display:flex;flex-direction:column;height:100%;';
    this.injectStyles();

    const s = this.plugin.magicSettings;
    const layout = s.homepageLayout;
    const gap = GAP_MAP[layout.cardGap] || '16px';

    // 工具栏
    this.renderToolbar(ct);

    // 导航栏
    this.renderNavBar(ct, layout, gap);

    // 根据模块渲染
    if (this.module === 'home') {
      if (this.plugin.magicSettings.homepageMode === 'canvas') this.renderHomeCanvas(ct);
      else this.renderHomeDashboard(ct, layout, gap);
    } else if (this.module === 'schedule') {
      this.renderScheduleModule(ct);
    } else if (this.module === 'library') {
      this.renderLibraryModule(ct);
    } else if (this.module === 'travel') {
      this.renderTravelModule(ct);
    } else if (this.module === 'workshop') {
      this.renderWorkshopPlaceholder(ct);
    }
  }

  // === 工具栏 ===

  private renderToolbar(ct: HTMLElement) {
    const s = this.plugin.magicSettings;
    const tb = ct.createDiv({ cls: 'hub-dashboard-toolbar' });
    tb.style.cssText = 'display:flex;align-items:center;padding:8px 20px 4px;gap:8px;';

    const left = tb.createDiv({ cls: 'hub-dashboard-tb-left' });
    left.style.cssText = 'flex:1;display:flex;align-items:center;';

    if (this.module !== 'home') {
      const bk = left.createEl('span', {
        text: s.moduleNames.homepage,
        cls: 'hub-dashboard-breadcrumb',
      });
      bk.style.cssText = 'color:var(--text-accent);cursor:pointer;font-size:14px;';
      bk.addEventListener('click', () => {
        this.module = 'home';
        this.render();
      });
      const moduleName =
        this.module === 'schedule'
          ? s.moduleNames.schedule
          : this.module === 'library'
            ? s.moduleNames.library
            : this.module === 'travel'
              ? s.moduleNames.travel
              : s.moduleNames.creativeWorkshop;
      left.createEl('span', { text: ' > ' + moduleName }).style.cssText =
        'font-size:14px;color:var(--text-normal);';
    } else {
      left.createEl('span', {
        text: s.moduleNames.homepage,
        cls: 'hub-dashboard-page-title',
      }).style.cssText = 'font-size:16px;font-weight:600;color:var(--interactive-accent);';
    }

    // 重载/设置按钮
    const right = tb.createDiv({ cls: 'hub-dashboard-tb-right' });
    right.style.cssText = 'display:flex;gap:4px;align-items:center;';

    const rld = right.createEl('button', { text: '🔄' });
    rld.style.cssText =
      'background:transparent;border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px 8px;cursor:pointer;color:var(--text-muted);font-size:12px;';
    rld.title = '重载插件（应用代码改动后）';
    rld.addEventListener('click', async () => {
      const app = this.app as AppWithInternals;
      await app.plugins.disablePlugin('hub-dashboard');
      setTimeout(() => {
        void app.plugins.enablePlugin('hub-dashboard').then(() => {
          // 重载后重新拉起首页，避免看到空白页
          window.setTimeout(() => this.plugin.activateModuleView('homepage'), 60);
        });
      }, 300);
    });

    const cfg = right.createEl('button', { text: '⚙' });
    cfg.style.cssText =
      'background:transparent;border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px 8px;cursor:pointer;color:var(--text-muted);font-size:12px;';
    cfg.title = '设置';
    cfg.addEventListener('click', () => {
      const app = this.app as AppWithInternals;
      app.setting.open();
      app.setting.openTabById('hub-dashboard');
    });
  }

  // === 导航栏 ===

  private renderNavBar(ct: HTMLElement, layout: HomepageLayout, gap: string) {
    const s = this.plugin.magicSettings;
    const navBar = ct.createDiv({ cls: 'hub-dashboard-navbar' });
    navBar.style.cssText = `display:flex;gap:${gap};padding:8px 20px;`;

    const navItems = [
      { k: 'schedule', d: '📅' },
      { k: 'library', d: '📚' },
      { k: 'travel', d: '🗺️' },
      { k: 'workshop', d: '🎬' },
    ];

    for (const n of navItems) {
      const modName = s.moduleNames[n.k as keyof typeof s.moduleNames] || n.k;
      const card = navBar.createDiv({ cls: 'hub-dashboard-nav-card' });
      card.style.cssText =
        'flex:1;background:var(--background-secondary);border-radius:16px;padding:18px 10px 14px;border:1px solid var(--background-modifier-border);text-align:center;cursor:pointer;transition:all 0.2s ease;';
      if (n.k === this.module) card.style.borderColor = 'var(--interactive-accent)';

      card.createDiv({ text: layout.navIcons[n.k] || n.d }).style.cssText =
        'font-size:30px;margin-bottom:6px;';
      card.createDiv({ text: modName }).style.cssText =
        'font-weight:600;font-size:13px;color:var(--text-normal);';

      // 统计信息
      let stat = '';
      if (n.k === 'schedule' && this.data) {
        stat =
          '今日 ' +
          this.data.scheduleCards.filter((x) => x.date === window.moment().format('YYYY-MM-DD'))
            .length +
          ' 件';
      } else if (n.k === 'workshop' && this.data) {
        stat =
          this.data.workshopOverview.stages
            .filter((x) => x.stageNumber >= 1 && x.stageNumber <= 5)
            .reduce((a, x) => a + x.count, 0) + ' 项创作中';
      } else if (n.k === 'library') {
        const files = this.plugin.vaultService.listMarkdownFiles('典藏馆');
        stat = files.length + ' 件藏品';
      } else if (n.k === 'travel') {
        const files = this.plugin.vaultService.listMarkdownFiles('旅行记忆');
        stat = files.length + ' 个地点';
      }
      if (stat) {
        card.createDiv({ text: stat }).style.cssText =
          'font-size:10px;color:var(--text-muted);margin-top:4px;opacity:0.7;';
      }

      card.addEventListener('click', () => {
        this.module = n.k as ModuleKey;
        this.render();
      });
    }
  }

  // === 首页仪表盘 ===

  private renderHomeDashboard(ct: HTMLElement, layout: HomepageLayout, gap: string) {
    const grid = ct.createDiv({ cls: 'hub-dashboard-grid' });
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${layout.gridColumns},1fr);grid-auto-rows:minmax(80px,auto);gap:${gap};padding:10px 20px 20px;width:100%;box-sizing:border-box;`;

    for (const cid of layout.cardOrder) {
      if (!layout.cardVisibility[cid]) continue;
      let card: HTMLElement | null = null;
      if (cid === 'schedule') card = this.renderScheduleCard(grid, cid, layout);
      else if (cid === 'tasks') card = this.renderTasksCard(grid, cid, layout);
      else if (cid === 'workshop') card = this.renderWorkshopCard(grid, cid, layout);
      if (card) this.makeCardInteractive(card, cid);
    }
  }

  private renderScheduleCard(g: HTMLElement, cid: string, layout: HomepageLayout): HTMLElement {
    const card = g.createDiv({ cls: 'hub-dashboard-card' });
    card.setAttribute('data-card-id', cid);
    card.style.cssText = `grid-column:span ${Math.min(layout.cardSpans[cid] || 2, layout.gridColumns)};grid-row:span ${layout.cardRowSpans[cid] || 1};background:var(--background-secondary);border-radius:14px;padding:16px;border:1px solid var(--background-modifier-border);`;

    const hdr = card.createDiv();
    hdr.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    hdr.createEl('h4', { text: '📅 今日日程' }).style.cssText =
      'font-size:14px;font-weight:600;margin:0;color:var(--interactive-accent);';
    hdr.createSpan({
      text: '+' + this.plugin.magicSettings.homepageFilters.preloadDays + 'd',
    }).style.cssText = 'font-size:10px;color:var(--text-accent);cursor:pointer;';

    if (!this.data?.scheduleCards.length) {
      card.createDiv({ text: '暂无日程安排' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:12px;';
    } else {
      for (const s of this.data.scheduleCards) {
        const item = card.createDiv();
        const done = s.status === '完成';
        item.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:8px;${done ? 'opacity:0.5;' : ''}cursor:pointer;`;
        item.createSpan({ text: s.time || '--:--' }).style.cssText =
          'font-size:13px;color:var(--text-accent);font-weight:600;min-width:42px;';
        item.createSpan({ text: s.title }).style.cssText =
          `font-size:13px;color:var(--text-normal);${done ? 'text-decoration:line-through;' : ''}`;

        item.addEventListener('click', () => {
          this.module = 'schedule';
          this.render();
        });
      }
    }
    return card;
  }

  private renderTasksCard(g: HTMLElement, cid: string, layout: HomepageLayout): HTMLElement {
    const card = g.createDiv({ cls: 'hub-dashboard-card' });
    card.setAttribute('data-card-id', cid);
    card.style.cssText = `grid-column:span ${Math.min(layout.cardSpans[cid] || 2, layout.gridColumns)};grid-row:span ${layout.cardRowSpans[cid] || 1};background:var(--background-secondary);border-radius:14px;padding:16px;border:1px solid var(--background-modifier-border);`;

    const hdr = card.createDiv();
    hdr.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    hdr.createEl('h4', { text: '⚡ 待办任务' }).style.cssText =
      'font-size:14px;font-weight:600;margin:0;color:var(--interactive-accent);';
    hdr.createSpan({ text: '全部' }).style.cssText =
      'font-size:10px;color:var(--text-accent);cursor:pointer;';

    if (!this.data?.taskCards.length) {
      card.createDiv({ text: '暂无待办任务' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:12px;';
    } else {
      const groups = {
        overdue: this.data.taskCards.filter((t) => t.overdue),
        today: this.data.taskCards.filter(
          (t) => !t.overdue && t.date === window.moment().format('YYYY-MM-DD'),
        ),
        week: this.data.taskCards.filter(
          (t) => !t.overdue && t.date !== window.moment().format('YYYY-MM-DD'),
        ),
      };

      const renderGroup = (label: string, color: string, bg: string, tasks: TaskCardData[]) => {
        for (const t of tasks) {
          const item = card.createDiv();
          item.style.cssText = `display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;margin-bottom:6px;background:${bg};border-left:3px solid ${color};cursor:pointer;`;
          item.createDiv().style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;
          item.createSpan({ text: label }).style.cssText =
            'font-size:11px;font-weight:600;min-width:30px;';
          item.createSpan({ text: t.title }).style.cssText =
            'flex:1;font-size:13px;color:var(--text-normal);';
          if (t.overdue) {
            const days = window.moment(t.date).diff(window.moment(), 'days');
            item.createSpan({ text: days + 'd' }).style.cssText =
              `margin-left:auto;color:${color};font-size:11px;`;
          }

          item.addEventListener('click', () => {
            this.app.workspace.openLinkText(t.filePath, '', false);
          });
        }
      };

      renderGroup('逾期', '#f38ba8', 'rgba(243,139,168,0.1)', groups.overdue);
      renderGroup('今日', '#f9e2af', 'rgba(249,226,175,0.1)', groups.today);
      renderGroup('本周', '#a6e3a1', 'rgba(166,227,161,0.1)', groups.week);
    }
    return card;
  }

  private renderWorkshopCard(g: HTMLElement, cid: string, layout: HomepageLayout): HTMLElement {
    const card = g.createDiv({ cls: 'hub-dashboard-card' });
    card.setAttribute('data-card-id', cid);
    card.style.cssText = `grid-column:span ${Math.min(layout.cardSpans[cid] || 4, layout.gridColumns)};grid-row:span ${layout.cardRowSpans[cid] || 1};background:var(--background-secondary);border-radius:14px;padding:16px;border:1px solid var(--background-modifier-border);`;

    const hdr = card.createDiv();
    hdr.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    hdr.createEl('h4', { text: '🎬 创意工坊' }).style.cssText =
      'font-size:14px;font-weight:600;margin:0;color:var(--interactive-accent);';
    hdr.createSpan({ text: '打开' }).style.cssText =
      'font-size:10px;color:var(--text-accent);cursor:pointer;';

    if (this.data?.workshopOverview.stages.length) {
      const pipeline = card.createDiv();
      pipeline.style.cssText =
        'display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap;';

      for (let i = 0; i < this.data.workshopOverview.stages.length; i++) {
        const st = this.data.workshopOverview.stages[i];
        const active = PA.has(st.stageNumber) && st.count > 0;
        const tag = pipeline.createSpan({ text: `${st.label} ${st.count}` });
        tag.style.cssText = active
          ? `background:${PC[st.stageNumber] || '#6c7086'};color:#1e1e2e;padding:5px 12px;border-radius:14px;font-size:11px;font-weight:600;white-space:nowrap;`
          : 'background:var(--background-primary);color:var(--text-muted);padding:5px 12px;border-radius:14px;font-size:11px;font-weight:600;white-space:nowrap;';

        if (i < this.data.workshopOverview.stages.length - 1) {
          pipeline.createSpan({ text: '>' }).style.cssText =
            'color:var(--text-faint);font-weight:300;';
        }
      }
    }

    if (this.data?.workshopOverview.stagnationWarnings.length) {
      for (const w of this.data.workshopOverview.stagnationWarnings) {
        const box = card.createDiv();
        box.style.cssText =
          'background:rgba(243,139,168,0.1);border:1px solid rgba(243,139,168,0.25);border-radius:8px;padding:10px 14px;font-size:11px;cursor:pointer;margin-bottom:4px;';
        const staleLabel = box.createSpan({ text: '停滞: ' });
        staleLabel.style.cssText = 'color:#f38ba8;';
        box.createSpan({ text: ` ${w.title} 在 ${w.stage} 已 ${w.days} 天` });
        box.addEventListener('click', () => {
          this.app.workspace.openLinkText(w.filePath, '', false);
        });
      }
    } else if (this.data) {
      card.createDiv({ text: '一切进展顺利 ✨' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:8px;';
    }
    return card;
  }

  // === 首页卡片画布（自由布局）===

  private renderHomeCanvas(ct: HTMLElement) {
    const canvas = ct.createDiv({ cls: 'hub-dashboard-canvas' });
    canvas.style.cssText = 'position:relative;flex:1;overflow:hidden;background:var(--background-primary);';
    this.canvasEl = canvas;

    const layout = this.plugin.magicSettings.homepageLayout;
    const ids = layout.cardOrder.filter((id) => layout.cardVisibility[id] !== false);
    const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
    let needDefaults = false;

    for (const id of ids) {
      const p = layout.canvasPos[id];
      if (p && typeof p.w === 'number' && typeof p.h === 'number') {
        rects[id] = { x: p.x, y: p.y, w: p.w, h: p.h };
      } else {
        rects[id] = { x: 16, y: 16, w: 320, h: 280 };
        needDefaults = true;
      }
    }
    this.canvasRects = new Map(Object.entries(rects));

    for (const id of ids) {
      let card: HTMLElement | null = null;
      if (id === 'schedule') card = this.renderScheduleCard(canvas, id, layout);
      else if (id === 'tasks') card = this.renderTasksCard(canvas, id, layout);
      else if (id === 'workshop') card = this.renderWorkshopCard(canvas, id, layout);
      if (!card) continue;
      this.styleCanvasCard(card, id);
      this.makeCanvasCardInteractive(card, id);
    }

    if (needDefaults) {
      requestAnimationFrame(() => this.applyDefaultCanvasLayout(canvas, ids));
    }
  }

  private styleCanvasCard(card: HTMLElement, id: string) {
    card.style.position = 'absolute';
    card.style.gridColumn = 'auto';
    card.style.gridRow = 'auto';
    card.style.margin = '0';
    card.style.padding = '0';
    card.style.overflow = 'hidden';
    card.style.touchAction = 'none';
    card.style.userSelect = 'none';

    const r = this.canvasRects.get(id)!;
    card.style.left = r.x + 'px';
    card.style.top = r.y + 'px';
    card.style.width = r.w + 'px';
    card.style.height = r.h + 'px';

    const body = document.createElement('div');
    body.className = 'hub-card-body';
    body.style.cssText =
      'position:absolute;top:26px;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;padding:0 16px 16px;';
    body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    while (card.firstChild) body.appendChild(card.firstChild);
    card.appendChild(body);

    const handle = card.createDiv({ cls: 'hub-card-drag' });
    handle.style.cssText =
      'position:absolute;top:0;left:0;right:0;height:26px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--text-faint);font-size:10px;cursor:grab;background:var(--background-secondary);z-index:6;touch-action:none;user-select:none;border-top-left-radius:14px;border-top-right-radius:14px;';
    handle.createSpan({ text: '⋮⋮' });
    handle.createSpan({ text: '拖动 · 滚轮在卡内滚动' });

    const rh = card.createDiv({ cls: 'hub-card-resize' });
    rh.style.cssText =
      'position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;z-index:6;touch-action:none;opacity:0.5;' +
      'background:linear-gradient(135deg,transparent 45%,var(--text-muted) 45%,var(--text-muted) 55%,transparent 55%,' +
      'transparent 68%,var(--text-muted) 68%,var(--text-muted) 78%,transparent 78%);';
    rh.addEventListener('mouseenter', () => (rh.style.opacity = '0.95'));
    rh.addEventListener('mouseleave', () => (rh.style.opacity = '0.5'));
  }

  private makeCanvasCardInteractive(card: HTMLElement, id: string) {
    const handle = card.querySelector('.hub-card-drag') as HTMLElement | null;
    const rh = card.querySelector('.hub-card-resize') as HTMLElement | null;
    if (!handle) return;

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY };
      const orig = { ...this.canvasRects.get(id)! };
      let lastValid = { x: orig.x, y: orig.y };
      card.style.zIndex = String(++this.topZ);
      handle.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const cand = this.tryPlace(
          id,
          orig.x + (ev.clientX - start.x),
          orig.y + (ev.clientY - start.y),
          orig.w,
          orig.h,
        );
        if (cand) {
          lastValid = cand;
          card.style.left = cand.x + 'px';
          card.style.top = cand.y + 'px';
        }
      };
      const end = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        this.canvasRects.set(id, { x: lastValid.x, y: lastValid.y, w: orig.w, h: orig.h });
        this.persistCanvasPos(id, lastValid.x, lastValid.y, orig.w, orig.h);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });

    if (!rh) return;
    rh.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY };
      const orig = { ...this.canvasRects.get(id)! };
      const MIN_W = 200;
      const MIN_H = 140;
      let lastValid = { w: orig.w || MIN_W, h: orig.h || MIN_H };
      card.style.zIndex = String(++this.topZ);
      rh.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const cand = this.tryResize(
          id,
          orig.x,
          orig.y,
          Math.max(MIN_W, (orig.w || MIN_W) + (ev.clientX - start.x)),
          Math.max(MIN_H, (orig.h || MIN_H) + (ev.clientY - start.y)),
        );
        if (cand) {
          lastValid = cand;
          card.style.width = cand.w + 'px';
          card.style.height = cand.h + 'px';
        }
      };
      const end = (ev: PointerEvent) => {
        rh.releasePointerCapture(ev.pointerId);
        rh.removeEventListener('pointermove', move);
        rh.removeEventListener('pointerup', end);
        rh.removeEventListener('pointercancel', end);
        const cur = this.canvasRects.get(id)!;
        const x = cur?.x ?? orig.x;
        const y = cur?.y ?? orig.y;
        this.canvasRects.set(id, { x, y, w: lastValid.w, h: lastValid.h });
        this.persistCanvasPos(id, x, y, lastValid.w, lastValid.h);
      };
      rh.addEventListener('pointermove', move);
      rh.addEventListener('pointerup', end);
      rh.addEventListener('pointercancel', end);
    });
  }

  private tryPlace(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): { x: number; y: number } | null {
    if (!this.canvasEl) return null;
    const vw = this.canvasEl.clientWidth;
    const vh = this.canvasEl.clientHeight;
    // 方案B：允许卡片自由重叠摆放，仅约束不超出画布视口（卡片永不丢失在窗口外）
    const nx = Math.max(0, Math.min(x, Math.max(0, vw - w)));
    const ny = Math.max(0, Math.min(y, Math.max(0, vh - h)));
    return { x: nx, y: ny };
  }

  private tryResize(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): { w: number; h: number } | null {
    if (!this.canvasEl) return null;
    const vw = this.canvasEl.clientWidth;
    const vh = this.canvasEl.clientHeight;
    const MIN_W = 200;
    const MIN_H = 140;
    // 方案B：允许自由重叠，仅约束不超出视口、不小于最小尺寸
    let nw = w;
    let nh = h;
    if (x + nw > vw) nw = vw - x;
    if (y + nh > vh) nh = vh - y;
    if (nw < MIN_W || nh < MIN_H) return null;
    return { w: nw, h: nh };
  }

  private persistCanvasPos(id: string, x: number, y: number, w: number, h: number) {
    this.plugin.magicSettings.homepageLayout.canvasPos[id] = {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    };
    this.plugin.saveSettingsSilent();
  }

  private applyDefaultCanvasLayout(canvas: HTMLElement, ids: string[]) {
    const vw = canvas.clientWidth || 1000;
    const vh = canvas.clientHeight || 640;
    const GAP = 24;
    const colW = Math.max(220, Math.min(360, Math.floor(vw / 2 - GAP * 2)));
    const rowH = Math.max(160, Math.min(240, Math.floor(vh / 2 - GAP * 2)));
    const defs: Record<string, { x: number; y: number; w: number; h: number }> = {};
    if (ids.includes('schedule')) defs.schedule = { x: GAP, y: GAP, w: colW, h: rowH };
    if (ids.includes('tasks')) defs.tasks = { x: GAP * 2 + colW, y: GAP, w: colW, h: rowH };
    if (ids.includes('workshop'))
      defs.workshop = { x: GAP, y: GAP * 2 + rowH, w: colW, h: rowH };
    for (const id of ids) {
      const d = defs[id] || { x: GAP, y: GAP, w: 320, h: 280 };
      this.canvasRects.set(id, d);
      const el = this.containerEl.querySelector(
        `[data-card-id="${id}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.style.left = d.x + 'px';
        el.style.top = d.y + 'px';
        el.style.width = d.w + 'px';
        el.style.height = d.h + 'px';
      }
      this.persistCanvasPos(id, d.x, d.y, d.w, d.h);
    }
  }

  // === 首页卡片交互：拖拽排序 + 缩放跨度 ===

  private makeCardInteractive(card: HTMLElement, cid: string) {
    card.setAttribute('draggable', 'true');
    card.style.cursor = 'grab';
    card.title = '拖拽排序 · 右下角拖拽缩放';

    // --- 拖拽排序（HTML5 DnD）---
    card.addEventListener('dragstart', (e: DragEvent) => {
      this.dragCid = cid;
      card.classList.add('hub-card-dragging');
      card.style.cursor = 'grabbing';
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', cid);
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    card.addEventListener('dragend', () => {
      this.dragCid = null;
      card.classList.remove('hub-card-dragging');
      card.style.cursor = 'grab';
      card.parentElement
        ?.querySelectorAll('.hub-card-drop-before,.hub-card-drop-after')
        .forEach((el) => el.classList.remove('hub-card-drop-before', 'hub-card-drop-after'));
    });

    card.addEventListener('dragover', (e: DragEvent) => {
      if (!this.dragCid || this.dragCid === cid) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const before = e.clientX - rect.left < rect.width / 2;
      card.classList.toggle('hub-card-drop-before', before);
      card.classList.toggle('hub-card-drop-after', !before);
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('hub-card-drop-before', 'hub-card-drop-after');
    });

    card.addEventListener('drop', (e: DragEvent) => {
      if (!this.dragCid || this.dragCid === cid) return;
      e.preventDefault();
      const before = card.classList.contains('hub-card-drop-before');
      card.classList.remove('hub-card-drop-before', 'hub-card-drop-after');
      this.reorderCard(this.dragCid, cid, before);
    });

    // --- 缩放跨度（右下角拖拽，改变 grid-column / grid-row span）---
    const handle = card.createDiv({ cls: 'hub-card-resize' });
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      card.setAttribute('draggable', 'false');
      card.style.cursor = 'nwse-resize';

      const lo = this.plugin.magicSettings.homepageLayout;
      const startX = e.clientX,
        startY = e.clientY;
      const startCol = lo.cardSpans[cid] || 1;
      const startRow = lo.cardRowSpans[cid] || 1;
      const gridEl = card.parentElement as HTMLElement;
      const cellW = gridEl.clientWidth / lo.gridColumns;
      const cellH = 80;
      const maxCol = lo.gridColumns;
      const maxRow = 6;

      const clamp = (v: number, lo2: number, hi: number) => Math.max(lo2, Math.min(hi, v));

      const move = (ev: PointerEvent) => {
        const dCol = Math.round((ev.clientX - startX) / cellW);
        const dRow = Math.round((ev.clientY - startY) / cellH);
        const nc = clamp(startCol + dCol, 1, maxCol);
        const nr = clamp(startRow + dRow, 1, maxRow);
        card.style.gridColumn = `span ${nc}`;
        card.style.gridRow = `span ${nr}`;
      };
      const up = (ev: PointerEvent) => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        card.setAttribute('draggable', 'true');
        card.style.cursor = 'grab';
        const dCol = Math.round((ev.clientX - startX) / cellW);
        const dRow = Math.round((ev.clientY - startY) / cellH);
        lo.cardSpans[cid] = clamp(startCol + dCol, 1, maxCol);
        lo.cardRowSpans[cid] = clamp(startRow + dRow, 1, maxRow);
        this.plugin.saveSettingsSilent();
      };
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  private reorderCard(fromCid: string, toCid: string, before: boolean) {
    const order = this.plugin.magicSettings.homepageLayout.cardOrder;
    const fromIdx = order.indexOf(fromCid);
    if (fromIdx < 0) return;
    order.splice(fromIdx, 1);
    let toIdx = order.indexOf(toCid);
    if (toIdx < 0) toIdx = order.length;
    else if (!before) toIdx += 1;
    order.splice(toIdx, 0, fromCid);
    this.plugin.saveSettingsSilent();
    this.render();
  }

  // === 修习课表模块 ===

  private renderScheduleModule(ct: HTMLElement) {
    // 子标签栏
    const subTabs = ct.createDiv();
    subTabs.style.cssText = 'display:flex;gap:4px;padding:0 20px 8px;';

    const calBtn = subTabs.createEl('button', { text: '📅 日程课表' });
    calBtn.style.cssText = `padding:6px 14px;border-radius:8px;border:1px solid var(--background-modifier-border);background:${this.scheduleSubTab === 'calendar' ? 'var(--interactive-accent)' : 'transparent'};color:${this.scheduleSubTab === 'calendar' ? 'var(--text-on-accent)' : 'var(--text-muted)'};cursor:pointer;font-size:12px;`;
    calBtn.addEventListener('click', () => {
      this.scheduleSubTab = 'calendar';
      this.render();
    });

    const projBtn = subTabs.createEl('button', { text: '📁 项目管理' });
    projBtn.style.cssText = `padding:6px 14px;border-radius:8px;border:1px solid var(--background-modifier-border);background:${this.scheduleSubTab === 'project' ? 'var(--interactive-accent)' : 'transparent'};color:${this.scheduleSubTab === 'project' ? 'var(--text-on-accent)' : 'var(--text-muted)'};cursor:pointer;font-size:12px;`;
    projBtn.addEventListener('click', () => {
      this.scheduleSubTab = 'project';
      this.render();
    });

    // 内容容器
    const content = ct.createDiv();
    content.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

    if (this.scheduleSubTab === 'calendar') {
      this.scheduleModule?.destroy();
      this.scheduleModule = new ScheduleModule(this.plugin, content);
      this.scheduleModule.render();
    } else {
      this.projectModule = new ProjectModule(this.plugin, content);
      this.projectModule.render();
    }
  }

  // === 典藏馆模块 ===

  private renderLibraryModule(ct: HTMLElement) {
    const content = ct.createDiv();
    content.style.cssText = 'flex:1;overflow-y:auto;';
    this.libraryModule = new LibraryModule(this.plugin, content);
    this.libraryModule.render();
  }

  // === 旅行记忆模块 ===

  private renderTravelModule(ct: HTMLElement) {
    // 🔧 修复闪烁：销毁旧模块，防止旧 Leaflet 地图残留
    this.travelModule?.destroy();
    this.travelModule = null;

    const content = ct.createDiv();
    content.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';
    this.travelModule = new TravelModule(this.plugin, content, () => {
      // 🔧 返回首页回调
      this.module = 'home';
      this.render();
    });
    this.travelModule.render();
  }

  // === 创意工坊占位 ===

  private renderWorkshopPlaceholder(ct: HTMLElement) {
    const content = ct.createDiv();
    content.style.cssText = 'padding:40px 20px;text-align:center;';
    content.createEl('h3', { text: '🎬 创意工坊' }).style.cssText =
      'font-size:18px;font-weight:600;margin-bottom:8px;color:var(--interactive-accent);';
    content.createDiv({ text: '创意工坊模块正在开发中...' }).style.cssText =
      'font-size:13px;color:var(--text-muted);';
    content.createDiv({ text: '请在首页查看创意工坊流水线概览' }).style.cssText =
      'font-size:12px;color:var(--text-faint);margin-top:4px;';
  }

  // === 样式注入 ===

  private injectStyles() {
    if (document.getElementById('hub-dashboard-styles')) {
      document.getElementById('hub-dashboard-styles')!.textContent = this.getAllStyles();
      return;
    }
    const st = document.createElement('style');
    st.id = 'hub-dashboard-styles';
    st.textContent = this.getAllStyles();
    document.head.appendChild(st);
  }

  private getAllStyles(): string {
    return `
      @keyframes magic-pulse {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.3); }
      }
      .hub-dashboard-homepage {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        height: 100%;
      }
      .hub-dashboard-toolbar {
        display: flex;
        align-items: center;
        padding: 8px 20px 4px;
        gap: 8px;
        flex-shrink: 0;
      }
      .hub-dashboard-tb-left {
        flex: 1;
        display: flex;
        align-items: center;
      }
      .hub-dashboard-tb-right {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .hub-dashboard-navbar {
        display: flex;
        flex-shrink: 0;
      }
      .hub-dashboard-nav-card:hover {
        background: var(--background-modifier-hover) !important;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
      .hub-dashboard-card {
        transition: border-color 0.2s ease, transform 0.2s ease;
        position: relative;
      }
      .hub-dashboard-card:hover {
        border-color: var(--interactive-accent) !important;
      }
      .hub-dashboard-card.hub-card-dragging {
        opacity: 0.4;
        cursor: grabbing;
      }
      .hub-dashboard-card.hub-card-drop-before {
        box-shadow: -3px 0 0 0 var(--interactive-accent);
      }
      .hub-dashboard-card.hub-card-drop-after {
        box-shadow: 3px 0 0 0 var(--interactive-accent);
      }
      .hub-card-resize {
        position: absolute;
        right: 6px;
        bottom: 6px;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        opacity: 0;
        transition: opacity 0.15s ease;
        border-radius: 0 0 8px 0;
        background:
          linear-gradient(135deg, transparent 50%, var(--text-faint) 50%, var(--text-faint) 58%, transparent 58%, transparent 70%, var(--text-faint) 70%, var(--text-faint) 78%, transparent 78%);
      }
      .hub-dashboard-card:hover .hub-card-resize {
        opacity: 0.55;
      }
      .hub-card-resize:hover {
        opacity: 1 !important;
      }
      .hub-dashboard-empty-text {
        text-align: center;
        font-size: 11px;
        color: var(--text-faint);
        padding: 12px;
      }
      .hub-dashboard-canvas {
        background-image: radial-gradient(var(--background-modifier-border) 1px, transparent 1px);
        background-size: 22px 22px;
      }
      .hub-card-drag {
        user-select: none;
      }
      @media (max-width: 900px) {
        .hub-dashboard-grid { grid-template-columns: repeat(3,1fr) !important; }
      }
      @media (max-width: 700px) {
        .sch-top-row { flex-direction: column !important; }
        .sch-sidebar { width: 100% !important; }
        .sch-bottom { flex-direction: column !important; }
      }
    `;
  }
}
