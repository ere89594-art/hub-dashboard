// 中枢看板 — 典藏馆模块

import { App, Modal, Setting, Notice, TFile, TFolder } from 'obsidian';
import type MagicOSPlugin from '../../main';
import type { LibraryCategory, LibraryStatus, LibraryItemFrontmatter } from '../../types';
import type { AppWithInternals } from '../../types-internal';
import { parseFrontmatter, serializeFrontmatter } from '../../services/FrontmatterService';

const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  movie: '🎬 电影',
  tv: '📺 剧集',
  book: '📖 书籍',
  music: '🎵 专辑',
};

export class LibraryModule {
  private plugin: MagicOSPlugin;
  private container: HTMLElement;
  private currentCategory: LibraryCategory | 'all' = 'all';
  private currentStatus: LibraryStatus | 'all' = 'all';

  constructor(plugin: MagicOSPlugin, container: HTMLElement) {
    this.plugin = plugin;
    this.container = container;
  }

  async render(): Promise<void> {
    const ct = this.container;
    ct.empty();

    // 顶部工具栏
    const toolbar = ct.createDiv();
    toolbar.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:0 20px 8px;flex-wrap:wrap;';

    // 豆瓣导入按钮
    const importBtn = toolbar.createEl('button', { text: '🔍 豆瓣导入' });
    importBtn.style.cssText =
      'padding:6px 14px;border-radius:8px;border:1px solid var(--interactive-accent);background:var(--background-secondary);color:var(--interactive-accent);cursor:pointer;font-size:12px;';
    importBtn.addEventListener('click', () => this.showDoubanImportDialog());

    // 新建文件夹按钮
    const newFolderBtn = toolbar.createEl('button', { text: '📁 新建文件夹' });
    newFolderBtn.style.cssText =
      'padding:6px 14px;border-radius:8px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:12px;';
    newFolderBtn.addEventListener('click', () => this.showNewFolderDialog());

    // 分类筛选
    const catFilter = toolbar.createDiv();
    catFilter.style.cssText = 'display:flex;gap:4px;margin-left:auto;';
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
      const btn = catFilter.createEl('button', { text: label });
      btn.style.cssText = `padding:4px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:${this.currentCategory === key ? 'var(--interactive-accent)' : 'transparent'};color:${this.currentCategory === key ? 'var(--text-on-accent)' : 'var(--text-muted)'};cursor:pointer;font-size:11px;`;
      btn.addEventListener('click', () => {
        this.currentCategory = key as LibraryCategory;
        this.render();
      });
    }
    const allBtn = catFilter.createEl('button', { text: '全部' });
    allBtn.style.cssText = `padding:4px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:${this.currentCategory === 'all' ? 'var(--interactive-accent)' : 'transparent'};color:${this.currentCategory === 'all' ? 'var(--text-on-accent)' : 'var(--text-muted)'};cursor:pointer;font-size:11px;`;
    allBtn.addEventListener('click', () => {
      this.currentCategory = 'all';
      this.render();
    });

    // 主内容区
    const content = ct.createDiv();
    content.style.cssText =
      'padding:0 20px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;';

    // 加载典藏馆内容
    await this.renderItems(content);
    await this.renderLocalFolders(content);
  }

  // === 渲染典藏项目 ===

  private async renderItems(container: HTMLElement): Promise<void> {
    const vault = this.plugin.vaultService;
    await vault.ensureFolder(this.plugin.folder('典藏馆'));

    const allFiles = vault.listMarkdownFiles(this.plugin.folder('典藏馆'));
    const items: { file: TFile; fm: LibraryItemFrontmatter }[] = [];

    for (const f of allFiles) {
      const cnt = await vault.readFile(f);
      const pp = parseFrontmatter(cnt);
      if (!pp) continue;
      const fm = pp.data as LibraryItemFrontmatter;
      if (!fm.类型) continue; // 非典藏项目
      if (this.currentCategory !== 'all' && fm.类型 !== this.currentCategory) continue;
      if (this.currentStatus !== 'all' && fm.状态 !== this.currentStatus) continue;
      items.push({ file: f, fm });
    }

    for (const { file, fm } of items) {
      const card = container.createDiv({ cls: 'lib-item-card' });
      card.style.cssText =
        'background:var(--background-secondary);border-radius:12px;overflow:hidden;border:1px solid var(--background-modifier-border);cursor:pointer;display:flex;flex-direction:column;';

      // 封面区域
      const cover = card.createDiv();
      cover.style.cssText =
        'height:200px;background:var(--background-primary);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';

      if (fm.封面) {
        const img = cover.createEl('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        // 检查是否是 vault 内的图片路径
        const imgFile = this.plugin.vaultService.getFile(fm.封面);
        if (imgFile) {
          img.src = this.plugin.app.vault.getResourcePath(imgFile);
        } else if (fm.封面.startsWith('http')) {
          img.src = fm.封面;
        } else {
          cover.createDiv({
            text: CATEGORY_LABELS[fm.类型 as LibraryCategory] || '📦',
          }).style.cssText = 'font-size:48px;';
        }
      } else {
        cover.createDiv({
          text: CATEGORY_LABELS[fm.类型 as LibraryCategory] || '📦',
        }).style.cssText = 'font-size:48px;';
      }

      // 状态标签
      const statusBadge = cover.createDiv();
      statusBadge.style.cssText = `position:absolute;top:6px;right:6px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${fm.状态 === '已看' ? '#a6e3a1' : fm.状态 === '在看' ? '#f9e2af' : '#89b4fa'};color:#000;`;
      statusBadge.textContent = fm.状态 || '想看';

      // 信息区域
      const info = card.createDiv();
      info.style.cssText = 'padding:8px 10px;';

      const title = info.createDiv({ text: fm.标题 || file.basename });
      title.style.cssText =
        'font-size:13px;font-weight:600;color:var(--text-normal);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

      if (fm.评分) {
        info.createDiv({ text: '⭐ ' + fm.评分 }).style.cssText =
          'font-size:11px;color:var(--text-muted);margin-top:2px;';
      }

      // 点击打开
      card.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(file.path, '', false);
      });

      // 右键菜单
      card.addEventListener('contextmenu', (ev: MouseEvent) => {
        ev.preventDefault();
        this.showItemContextMenu(ev, file, fm);
      });
    }

    if (items.length === 0) {
      const empty = container.createDiv();
      empty.style.cssText =
        'grid-column:1/-1;text-align:center;padding:40px;font-size:13px;color:var(--text-faint);';
      empty.innerHTML = '典藏馆暂无内容<br>点击「豆瓣导入」添加电影、剧集、书籍或专辑';
    }
  }

  // === 渲染本地文件夹 ===

  private async renderLocalFolders(container: HTMLElement): Promise<void> {
    const vault = this.plugin.vaultService;
    const subfolders = vault.listSubfolders(this.plugin.folder('典藏馆'));

    for (const sf of subfolders) {
      // 跳过已知的内容文件夹
      if (['电影', '剧集', '书籍', '专辑'].includes(sf.name)) continue;

      const card = container.createDiv({ cls: 'lib-folder-card' });
      card.style.cssText =
        'background:var(--background-secondary);border-radius:12px;padding:16px;border:1px solid var(--background-modifier-border);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:120px;';

      card.createDiv({ text: '📁' }).style.cssText = 'font-size:36px;margin-bottom:8px;';
      card.createDiv({ text: sf.name }).style.cssText =
        'font-size:13px;font-weight:600;color:var(--text-normal);';

      const fileCount = vault.countMarkdownFiles(this.plugin.folder('典藏馆') + '/' + sf.name);
      card.createDiv({ text: `${fileCount} 个文件` }).style.cssText =
        'font-size:11px;color:var(--text-muted);margin-top:4px;';

      card.addEventListener('click', () => {
        // 打开文件夹中的第一个文件或在 Obsidian 文件浏览器中显示
        const files = vault.listMarkdownFiles(this.plugin.folder('典藏馆') + '/' + sf.name);
        if (files.length > 0) {
          this.plugin.app.workspace.openLinkText(files[0].path, '', false);
        } else {
          new Notice('此文件夹为空');
        }
      });

      card.addEventListener('contextmenu', (ev: MouseEvent) => {
        ev.preventDefault();
        this.showFolderContextMenu(ev, sf);
      });
    }
  }

  // === 豆瓣导入 ===

  private showDoubanImportDialog(): void {
    const modal = new DoubanImportModal(
      this.plugin.app,
      async (title: string, category: LibraryCategory) => {
        await this.importFromDouban(title, category);
      },
    );
    modal.open();
  }

  private async importFromDouban(title: string, category: LibraryCategory): Promise<void> {
    const vault = this.plugin.vaultService;

    // 尝试调用豆瓣插件的命令（如果已安装）
    const app = this.plugin.app as AppWithInternals;
    const doubanPlugin = app.plugins.plugins['obsidian-douban'];
    if (doubanPlugin) {
      // 执行豆瓣插件的搜索命令
      app.commands.executeCommandById('obsidian-douban:douban-search');
      new Notice('已调用豆瓣插件搜索，请在豆瓣搜索窗口中操作');
      return;
    }

    // 如果没有豆瓣插件，手动创建条目
    const catDir =
      category === 'movie'
        ? '电影'
        : category === 'tv'
          ? '剧集'
          : category === 'book'
            ? '书籍'
            : '专辑';
    await vault.ensureFolder(this.plugin.folder('典藏馆') + '/' + catDir);

    const fileName = `${title}-${Date.now()}.md`;
    const today = window.moment().format('YYYY-MM-DD');
    const content = `---\n标题: "${title}"\n类型: ${category}\n状态: 想看\n评分: ""\n导演: ""\n演员: ""\n作者: ""\n简介: ""\n封面: ""\n标签: []\n创建日期: ${today}\n---\n\n# ${title}\n\n## 基本信息\n\n- **类型**: ${CATEGORY_LABELS[category]}\n- **状态**: 💡 想看\n- **评分**: \n- **导演/作者**: \n\n## 简介\n\n\n\n## 评论 / 读后感 / 摘抄\n\n\n`;

    await vault.createMarkdownFile(`${this.plugin.folder('典藏馆')}/${catDir}/${fileName}`, content);
    new Notice(`已创建「${title}」，请打开文件补充详细信息`);
    this.render();
  }

  // === 文件夹操作 ===

  private showNewFolderDialog(): void {
    const modal = new FolderInputDialog(this.plugin.app, async (name: string) => {
      if (!name.trim()) return;
      const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '_');
      await this.plugin.vaultService.ensureFolder(this.plugin.folder('典藏馆') + '/' + safeName);
      new Notice(`已创建文件夹: ${safeName}`);
      this.render();
    });
    modal.open();
  }

  private showItemContextMenu(ev: MouseEvent, file: TFile, _fm: LibraryItemFrontmatter): void {
    const old = document.querySelector('.lib-ctx-menu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.className = 'lib-ctx-menu';
    menu.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:9999;min-width:140px;padding:4px;`;

    const items = [
      {
        label: '📂 打开',
        action: () => this.plugin.app.workspace.openLinkText(file.path, '', false),
      },
      { label: '💡 标记想看', action: () => this.changeStatus(file, '想看') },
      { label: '👀 标记在看', action: () => this.changeStatus(file, '在看') },
      { label: '✅ 标记已看', action: () => this.changeStatus(file, '已看') },
      {
        label: '🗑 删除',
        action: async () => {
          await this.plugin.app.vault.delete(file);
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

  private async changeStatus(file: TFile, status: LibraryStatus): Promise<void> {
    const cnt = await this.plugin.vaultService.readFile(file);
    const pp = parseFrontmatter(cnt);
    if (!pp) return;
    const fm = pp.data as any;
    fm.状态 = status;
    await this.plugin.vaultService.writeFile(file, serializeFrontmatter(fm, pp.body));
    this.render();
  }

  private showFolderContextMenu(ev: MouseEvent, folder: TFolder): void {
    const old = document.querySelector('.lib-ctx-menu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.className = 'lib-ctx-menu';
    menu.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:9999;min-width:140px;padding:4px;`;

    const items = [
      {
        label: '📂 在文件管理器中打开',
        action: () => {
          const app = this.plugin.app as AppWithInternals;
          app.showInFolder(folder.path);
        },
      },
      {
        label: '🗑 删除文件夹',
        action: async () => {
          await this.plugin.app.vault.delete(folder, true);
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

// === 豆瓣导入对话框 ===

class DoubanImportModal extends Modal {
  private cb: (title: string, category: LibraryCategory) => void;
  private title = '';
  private category: LibraryCategory = 'movie';

  constructor(app: App, cb: (title: string, category: LibraryCategory) => void) {
    super(app);
    this.cb = cb;
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl('h3', { text: '豆瓣导入' }).style.cssText = 'margin:0 0 12px;font-size:15px;';

    new Setting(el)
      .setName('名称')
      .setDesc('输入电影、剧集、书籍或专辑名称')
      .addText((text) => {
        text.inputEl.style.width = '260px';
        text.onChange((v) => (this.title = v));
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(el).setName('类型').addDropdown((dd) => {
      dd.addOption('movie', '🎬 电影');
      dd.addOption('tv', '📺 剧集');
      dd.addOption('book', '📖 书籍');
      dd.addOption('music', '🎵 专辑');
      dd.onChange((v) => (this.category = v as LibraryCategory));
    });

    el.createDiv({
      text: '提示：如已安装豆瓣插件，将自动调用插件搜索。否则将手动创建条目。',
    }).style.cssText = 'font-size:11px;color:var(--text-muted);margin:8px 0;';

    const btnRow = el.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    const ok = btnRow.createEl('button', { text: '导入' });
    ok.style.cssText =
      'padding:4px 16px;border-radius:6px;border:none;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;';
    ok.addEventListener('click', () => {
      this.cb(this.title, this.category);
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

class FolderInputDialog extends Modal {
  private cb: (name: string) => void;
  private name = '';

  constructor(app: App, cb: (name: string) => void) {
    super(app);
    this.cb = cb;
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl('h3', { text: '新建文件夹' }).style.cssText = 'margin:0 0 12px;font-size:15px;';
    new Setting(el).setName('文件夹名称').addText((text) => {
      text.inputEl.style.width = '260px';
      text.onChange((v) => (this.name = v));
      setTimeout(() => text.inputEl.focus(), 50);
    });

    const btnRow = el.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    const ok = btnRow.createEl('button', { text: '创建' });
    ok.style.cssText =
      'padding:4px 16px;border-radius:6px;border:none;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;';
    ok.addEventListener('click', () => {
      this.cb(this.name);
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
