// 中枢看板 — Task Detail Modal
import { Modal, App, MarkdownRenderer, Component } from 'obsidian';
import { parseFrontmatter, serializeFrontmatter } from '../../services/FrontmatterService';
import type { ScheduleFrontmatter } from '../../types';
import type { VaultService } from '../../services/VaultService';

let _done = false;
function injectCss() {
  if (_done) return;
  _done = true;
  const s = document.createElement('style');
  s.id = 'hub-dashboard-modal';
  s.textContent =
    '.tdm-modal.modal-content{height:70vh!important;min-height:400px!important;display:flex!important;flex-direction:column!important}' +
    '.tdm-toolbar{display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--background-modifier-border);flex-shrink:0}' +
    '.tdm-title{font-size:15px;font-weight:600;color:var(--text-normal);flex:1}' +
    '.tdm-btn{font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer}' +
    '.tdm-btn:hover{background:var(--background-modifier-hover)}' +
    '.tdm-status{font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-muted);cursor:pointer}' +
    '.tdm-status:hover{background:var(--interactive-accent);color:var(--text-on-accent)}' +
    '.tdm-meta{font-size:10px;color:var(--text-muted);padding:6px 14px;border-bottom:1px solid var(--background-modifier-border);flex-shrink:0}' +
    '.tdm-body{flex:1;min-height:0;overflow:hidden;position:relative}' +
    '.tdm-textarea{position:absolute;top:0;left:0;right:0;bottom:0;width:100%;box-sizing:border-box;padding:14px;border:none;resize:none;outline:none;font:inherit;font-size:14px;line-height:1.7;color:var(--text-normal);background:var(--background-primary)}' +
    '.tdm-preview{position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;padding:14px;font-size:14px;line-height:1.7;color:var(--text-normal)}' +
    '.tdm-preview p{margin:4px 0}';
  document.head.appendChild(s);
}

export class TaskDetailModal extends Modal {
  private fp = '';
  private body = '';
  private fm: Partial<ScheduleFrontmatter> = {};
  private preview = false;
  private timer: number | null = null;
  private vs: VaultService;
  private cb?: () => void;

  constructor(app: App, fp: string, vs: VaultService, cb?: () => void) {
    super(app);
    this.fp = fp;
    this.vs = vs;
    this.cb = cb;
  }

  async onOpen() {
    injectCss();
    const el = this.contentEl;
    el.empty();
    el.addClass('tdm-modal');
    const f = this.vs.getFile(this.fp);
    if (!f) {
      el.setText('Not found');
      return;
    }
    const cnt = await this.vs.readFile(f);
    const pp = parseFrontmatter(cnt);
    this.fm = (pp?.data ?? {}) as Partial<ScheduleFrontmatter>;
    this.body = pp?.body || '';
    this.render();
  }

  private render() {
    const el = this.contentEl;
    el.empty();
    // toolbar
    const tb = el.createDiv({ cls: 'tdm-toolbar' });
    tb.createEl('span', { text: this.fm.标题 || 'Untitled', cls: 'tdm-title' });
    const sb = tb.createEl('button', { text: this.fm.状态 || 'Pending', cls: 'tdm-status' });
    sb.addEventListener('click', async () => {
      this.fm.状态 = this.fm.状态 === '完成' ? '待办' : '完成';
      await this.save();
      sb.textContent = this.fm.状态;
    });
    const tg = tb.createEl('button', { text: this.preview ? 'Edit' : 'Preview', cls: 'tdm-btn' });
    tg.addEventListener('click', () => {
      this.preview = !this.preview;
      this.render();
    });
    const sv = tb.createEl('button', { text: 'Save', cls: 'tdm-btn' });
    sv.addEventListener('click', async () => {
      await this.save();
      sv.textContent = '✓';
      setTimeout(() => (sv.textContent = 'Save'), 1200);
    });
    tb.createEl('button', { text: '✕', cls: 'tdm-btn' }).addEventListener('click', () =>
      this.close(),
    );
    // meta
    const mt = el.createDiv({ cls: 'tdm-meta' });
    mt.textContent = `${this.fm.日期 || ''}  ${this.fm.时间 || ''}  Priority: ${this.fm.优先级 || 'Normal'}`;
    // body — absolute positioning ensures identical height
    const bd = el.createDiv({ cls: 'tdm-body' });
    if (this.preview) {
      const pv = bd.createDiv({ cls: 'tdm-preview' });
      if (this.body.trim())
        MarkdownRenderer.renderMarkdown(this.body, pv, this.fp, new Component());
      else pv.createDiv({ text: 'No content' });
    } else {
      const ta = bd.createEl('textarea', { cls: 'tdm-textarea' }) as HTMLTextAreaElement;
      ta.value = this.body;
      ta.addEventListener('input', () => {
        this.body = ta.value;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.save(), 1500);
      });
    }
  }

  private async save() {
    const f = this.vs.getFile(this.fp);
    if (!f) return;
    await this.vs.writeFile(f, serializeFrontmatter(this.fm, this.body));
  }

  onClose() {
    this.contentEl.empty();
    if (this.cb) this.cb();
  }
}
