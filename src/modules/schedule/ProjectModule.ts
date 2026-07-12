// 中枢看板 — 项目管理器模块

import type MagicOSPlugin from '../../main';
import { TFile } from 'obsidian';
import { parseFrontmatter, serializeFrontmatter } from '../../services/FrontmatterService';
import type { ScheduleFrontmatter } from '../../types';

export class ProjectModule {
  private plugin: MagicOSPlugin;
  private container: HTMLElement;
  private selectedProject: string | null = null;

  constructor(plugin: MagicOSPlugin, container: HTMLElement) {
    this.plugin = plugin;
    this.container = container;
  }

  async render(): Promise<void> {
    const ct = this.container;
    ct.empty();

    const layout = ct.createDiv();
    layout.style.cssText = 'display:flex;gap:12px;padding:0 20px 20px;height:100%;';

    await this.renderProjectList(layout);
    await this.renderTaskBoard(layout);
  }

  // === 项目列表（左侧） ===

  private async renderProjectList(parent: HTMLElement): Promise<void> {
    const panel = parent.createDiv();
    panel.style.cssText =
      'width:220px;flex-shrink:0;padding:12px;background:var(--background-secondary);border-radius:16px;border:1px solid var(--background-modifier-border);overflow-y:auto;display:flex;flex-direction:column;';

    const hdr = panel.createDiv();
    hdr.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
    hdr.createEl('h4', { text: '📁 项目列表' }).style.cssText =
      'font-size:13px;font-weight:600;margin:0;color:var(--interactive-accent);';

    const addBtn = hdr.createEl('button', { text: '+' });
    addBtn.style.cssText =
      'width:24px;height:24px;border:1px solid var(--background-modifier-border);border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;';
    addBtn.addEventListener('click', () => this.showNewProjectDialog());

    // 加载项目列表
    const vault = this.plugin.vaultService;
    const projFolder = vault.getFolder('项目管理');

    if (!projFolder) {
      await vault.ensureFolder('项目管理');
    }

    const subfolders = vault.listSubfolders('项目管理');
    for (const sf of subfolders) {
      const item = panel.createDiv({ cls: 'proj-item' });
      item.style.cssText = `padding:8px 10px;margin-bottom:4px;border-radius:8px;cursor:pointer;font-size:12px;background:${this.selectedProject === sf.name ? 'var(--interactive-accent)' : 'var(--background-primary)'};color:${this.selectedProject === sf.name ? 'var(--text-on-accent)' : 'var(--text-normal)'};display:flex;align-items:center;justify-content:space-between;`;
      item.createSpan({ text: sf.name });

      // 计算进度
      const tasks = vault.listMarkdownFiles('项目管理/' + sf.name);
      let done = 0;
      for (const t of tasks) {
        const c = await vault.readFile(t);
        const pp = parseFrontmatter(c);
        if ((pp?.data as ScheduleFrontmatter)?.状态 === '完成') done++;
      }
      const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
      item.createSpan({ text: `${progress}%` }).style.cssText = 'font-size:10px;opacity:0.7;';

      item.addEventListener('click', () => {
        this.selectedProject = sf.name;
        this.render();
      });
    }

    if (subfolders.length === 0) {
      panel.createDiv({ text: '点击 + 创建项目' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:20px;';
    }
  }

  // === 任务面板（右侧） ===

  private async renderTaskBoard(parent: HTMLElement): Promise<void> {
    const panel = parent.createDiv();
    panel.style.cssText =
      'flex:1;padding:12px;background:var(--background-secondary);border-radius:16px;border:1px solid var(--background-modifier-border);overflow-y:auto;display:flex;flex-direction:column;';

    if (!this.selectedProject) {
      panel.createDiv({ text: '← 选择一个项目查看任务' }).style.cssText =
        'text-align:center;font-size:12px;color:var(--text-faint);padding:40px;';
      return;
    }

    const hdr = panel.createDiv();
    hdr.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    hdr.createEl('h4', { text: this.selectedProject }).style.cssText =
      'font-size:14px;font-weight:600;margin:0;color:var(--interactive-accent);';

    const addTaskBtn = hdr.createEl('button', { text: '+ 新建任务' });
    addTaskBtn.style.cssText =
      'font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;';
    addTaskBtn.addEventListener('click', () => this.showNewTaskDialog(this.selectedProject!));

    // 进度条
    const vault = this.plugin.vaultService;
    const tasks = vault.listMarkdownFiles('项目管理/' + this.selectedProject);
    let doneCnt = 0;
    for (const t of tasks) {
      const c = await vault.readFile(t);
      const pp = parseFrontmatter(c);
      if ((pp?.data as ScheduleFrontmatter)?.状态 === '完成') doneCnt++;
    }
    const progress = tasks.length > 0 ? Math.round((doneCnt / tasks.length) * 100) : 0;

    const progressContainer = panel.createDiv();
    progressContainer.style.cssText = 'margin-bottom:12px;';
    const progressLabel = progressContainer.createDiv();
    progressLabel.style.cssText =
      'display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;';
    progressLabel.createSpan({ text: '进度' });
    progressLabel.createSpan({ text: `${doneCnt}/${tasks.length} (${progress}%)` });

    const progressBar = progressContainer.createDiv();
    progressBar.style.cssText =
      'height:8px;background:var(--background-primary);border-radius:4px;overflow:hidden;';
    const progressFill = progressBar.createDiv();
    progressFill.style.cssText = `height:100%;width:${progress}%;background:linear-gradient(90deg,var(--interactive-accent),var(--interactive-accent));border-radius:4px;transition:width 0.3s ease;`;

    // 任务列表
    for (const f of tasks) {
      const cnt = await vault.readFile(f);
      const pp = parseFrontmatter(cnt);
      const fm = (pp?.data ?? {}) as ScheduleFrontmatter;
      const done = fm.状态 === '完成';
      const priority = fm.优先级 || '黄';

      const item = panel.createDiv({ cls: 'proj-task-item' });
      const priorityColor =
        priority === '红' ? '#f38ba8' : priority === '黄' ? '#f9e2af' : '#a6e3a1';
      item.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;border-radius:8px;background:var(--background-primary);${done ? 'opacity:0.5;' : ''}cursor:pointer;`;
      item.style.borderLeft = `4px solid ${priorityColor}`;

      // 完成复选框
      const checkbox = item.createDiv();
      checkbox.style.cssText = `width:16px;height:16px;border-radius:4px;border:1.5px solid ${priorityColor};display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;cursor:pointer;${done ? `background:${priorityColor};color:#000;` : ''}`;
      checkbox.textContent = done ? '✓' : '';
      checkbox.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        fm.状态 = done ? '待办' : '完成';
        await vault.writeFile(f, serializeFrontmatter(fm, pp?.body || ''));
        this.render();
      });

      item.createSpan({ text: fm.标题 || f.basename }).style.cssText =
        `flex:1;font-size:12px;${done ? 'text-decoration:line-through;' : ''}`;
      if (fm.截止日期) {
        item.createSpan({ text: '截止: ' + fm.截止日期 }).style.cssText =
          'font-size:10px;color:var(--text-muted);';
      }
      item.createSpan({ text: priority }).style.cssText =
        `font-size:10px;padding:1px 6px;border-radius:8px;background:${priorityColor};color:#000;font-weight:600;`;

      item.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(f.path, '', false);
      });

      item.addEventListener('contextmenu', (ev: MouseEvent) => {
        ev.preventDefault();
        this.showTaskContextMenu(ev, f);
      });
    }

    if (tasks.length === 0) {
      panel.createDiv({ text: '暂无任务，点击 + 新建任务' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:20px;';
    }
  }

  // === 对话框 ===

  private showNewProjectDialog(): void {
    const modal = new ProjectInputDialog(
      this.plugin.app,
      '新项目',
      '项目名称',
      async (name: string) => {
        if (!name.trim()) return;
        const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '_');
        await this.plugin.vaultService.ensureFolder('项目管理/' + safeName);
        this.selectedProject = safeName;
        this.render();
      },
    );
    modal.open();
  }

  private showNewTaskDialog(projectName: string): void {
    const modal = new TaskInputDialog(
      this.plugin.app,
      projectName,
      async (name: string, priority: string, dueDate: string) => {
        if (!name.trim()) return;
        const vault = this.plugin.vaultService;
        const fileName = `${name.trim()}-${Date.now()}.md`;
        const content = `---\n标题: "${name.trim()}"\n创建日期: ${window.moment().format('YYYY-MM-DD')}\n截止日期: ${dueDate || ''}\n优先级: ${priority}\n状态: 待办\n所属项目: ${projectName}\n标签: []\n---\n\n# ${name.trim()}\n`;
        await vault.createMarkdownFile(`项目管理/${projectName}/${fileName}`, content);
        this.render();
      },
    );
    modal.open();
  }

  private showTaskContextMenu(ev: MouseEvent, f: TFile): void {
    const old = document.querySelector('.proj-ctx-menu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.className = 'proj-ctx-menu';
    menu.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:9999;min-width:120px;padding:4px;`;

    const items = [
      { label: '📂 打开', action: () => this.plugin.app.workspace.openLinkText(f.path, '', false) },
      {
        label: '🗑 删除',
        action: async () => {
          await (this.plugin.app.vault as any).delete(f);
          this.render();
        },
        danger: true,
      },
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
}

// === 简单输入对话框 ===

import { Modal, App, Setting } from 'obsidian';

class ProjectInputDialog extends Modal {
  private title: string;
  private label: string;
  private cb: (value: string) => void;
  private inputValue = '';

  constructor(app: App, title: string, label: string, cb: (value: string) => void) {
    super(app);
    this.title = title;
    this.label = label;
    this.cb = cb;
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl('h3', { text: this.title }).style.cssText = 'margin:0 0 12px;font-size:15px;';
    new Setting(el).setName(this.label).addText((text) => {
      text.inputEl.style.width = '200px';
      text.onChange((v) => (this.inputValue = v));
      setTimeout(() => text.inputEl.focus(), 50);
    });
    const btnRow = el.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    const ok = btnRow.createEl('button', { text: '确定' });
    ok.style.cssText =
      'padding:4px 16px;border-radius:6px;border:none;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;';
    ok.addEventListener('click', () => {
      this.cb(this.inputValue);
      this.close();
    });
    const cancel = btnRow.createEl('button', { text: '取消' });
    cancel.style.cssText =
      'padding:4px 16px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;';
    cancel.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class TaskInputDialog extends Modal {
  private projectName: string;
  private cb: (name: string, priority: string, dueDate: string) => void;
  private taskName = '';
  private priority = '黄';
  private dueDate = '';

  constructor(
    app: App,
    projectName: string,
    cb: (name: string, priority: string, dueDate: string) => void,
  ) {
    super(app);
    this.projectName = projectName;
    this.cb = cb;
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl('h3', { text: `新任务 - ${this.projectName}` }).style.cssText =
      'margin:0 0 12px;font-size:15px;';

    new Setting(el).setName('任务名称').addText((text) => {
      text.inputEl.style.width = '200px';
      text.onChange((v) => (this.taskName = v));
      setTimeout(() => text.inputEl.focus(), 50);
    });

    new Setting(el).setName('优先级').addDropdown((dd) => {
      dd.addOption('红', '🔴 高（红）');
      dd.addOption('黄', '🟡 中（黄）');
      dd.addOption('绿', '🟢 低（绿）');
      dd.setValue('黄');
      dd.onChange((v) => (this.priority = v));
    });

    new Setting(el).setName('截止日期').addText((text) => {
      text.inputEl.style.width = '200px';
      text.setPlaceholder('YYYY-MM-DD');
      text.onChange((v) => (this.dueDate = v));
    });

    const btnRow = el.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    const ok = btnRow.createEl('button', { text: '确定' });
    ok.style.cssText =
      'padding:4px 16px;border-radius:6px;border:none;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;';
    ok.addEventListener('click', () => {
      this.cb(this.taskName, this.priority, this.dueDate);
      this.close();
    });
    const cancel = btnRow.createEl('button', { text: '取消' });
    cancel.style.cssText =
      'padding:4px 16px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;';
    cancel.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
