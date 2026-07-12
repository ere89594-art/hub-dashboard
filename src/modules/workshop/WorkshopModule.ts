// 中枢看板 — 创意工坊模块
import { WorkspaceLeaf, TFile } from 'obsidian';
import type MagicOSPlugin from '../../main';
import { PIPELINE_STAGES, type WorkshopFrontmatter } from '../../types';
import { parseFrontmatter, parseWorkshopFrontmatter } from '../../services/FrontmatterService';

export class WorkshopModule {
  private container!: HTMLElement;
  public embeddedLeaf: WorkspaceLeaf | null = null;
  private stageListEl!: HTMLElement;
  private cardListEl!: HTMLElement;
  private detailPanel!: HTMLElement;
  private selectedStage: number | null = null;

  constructor(
    private plugin: MagicOSPlugin,
    container: HTMLElement,
  ) {
    this.container = container;
  }

  render() {
    this.container.empty();
    this.container.style.cssText = 'display:flex;height:100%;overflow:hidden;';

    // Left: Stage list
    this.stageListEl = this.container.createDiv();
    this.stageListEl.style.cssText =
      'width:160px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--background-modifier-border);padding:8px;';

    // Center: Card list
    this.cardListEl = this.container.createDiv();
    this.cardListEl.style.cssText =
      'width:220px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--background-modifier-border);padding:8px;';

    // Right: Detail panel
    this.detailPanel = this.container.createDiv();
    this.detailPanel.style.cssText = 'flex:1;overflow:hidden;';

    this.loadAndRenderAll();
  }

  private async loadAndRenderAll() {
    const vault = this.plugin.vaultService;
    const files = vault.listMarkdownFiles(this.plugin.folder('创意工坊'));

    // Count by stage
    const stageCounts: Record<number, number> = {};
    const stageFiles: Record<number, { file: TFile; frontmatter: WorkshopFrontmatter; body: string }[]> =
      {};
    for (const st of PIPELINE_STAGES) {
      stageCounts[st.number] = 0;
      stageFiles[st.number] = [];
    }

    for (const f of files) {
      const cnt = await vault.readFile(f);
      const pp = parseFrontmatter(cnt);
      if (!pp) continue;
      const wf = parseWorkshopFrontmatter(pp.data);
      const stage = PIPELINE_STAGES.find((s) => s.name === wf.创作状态);
      const n = stage ? stage.number : 0;
      stageCounts[n] = (stageCounts[n] || 0) + 1;
      stageFiles[n].push({ file: f, frontmatter: wf, body: pp.body });
    }

    this.renderStageList(stageCounts);
    if (this.selectedStage !== null) {
      this.renderCardList(stageFiles[this.selectedStage] || []);
    }
  }

  private renderStageList(stageCounts: Record<number, number>) {
    this.stageListEl.empty();
    this.stageListEl.createEl('h4', { text: '创作阶段' }).style.cssText =
      'font-size:12px;font-weight:600;margin:0 0 8px;color:var(--text-muted);';
    for (const st of PIPELINE_STAGES) {
      const item = this.stageListEl.createDiv();
      item.style.cssText = `padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;justify-content:space-between;${this.selectedStage === st.number ? 'background:var(--interactive-accent);color:var(--text-on-accent);' : ''}`;
      const lbl = item.createSpan({ text: st.label });
      lbl.style.cssText = 'flex:1;';
      item.createSpan({ text: String(stageCounts[st.number] || 0) });
      item.addEventListener('click', () => {
        this.selectedStage = st.number;
        this.loadAndRenderAll();
      });
    }
  }

  private renderCardList(items: { file: TFile; frontmatter: WorkshopFrontmatter; body: string }[]) {
    this.cardListEl.empty();
    this.cardListEl.createEl('h4', { text: '项目卡片' }).style.cssText =
      'font-size:12px;font-weight:600;margin:0 0 8px;color:var(--text-muted);';
    for (const item of items) {
      const card = this.cardListEl.createDiv();
      card.style.cssText =
        'padding:8px;background:var(--background-secondary);border-radius:6px;margin-bottom:6px;cursor:pointer;font-size:12px;border:1px solid var(--background-modifier-border);';
      card.textContent = item.frontmatter.标题 || item.file.basename;
      card.addEventListener('click', () => this.openInDetailPanel(item.file.path));
    }
  }

  private async openInDetailPanel(filePath: string) {
    this.detailPanel.empty();
    try {
      this.embeddedLeaf = new WorkspaceLeaf(this.plugin.app);
      this.embeddedLeaf.containerEl.style.cssText = 'width:100%;height:100%;';
      this.detailPanel.appendChild(this.embeddedLeaf.containerEl);
      await this.embeddedLeaf.openFile(this.plugin.vaultService.getFile(filePath));
    } catch {
      const cnt = await this.plugin.vaultService.readFile(
        this.plugin.vaultService.getFile(filePath)!,
      );
      const pp = parseFrontmatter(cnt);
      const body = (pp?.body || '').trim();
      const textDiv = this.detailPanel.createDiv();
      textDiv.style.cssText =
        'padding:12px;font-size:13px;color:var(--text-normal);white-space:pre-wrap;overflow-y:auto;height:100%;';
      textDiv.textContent = body || '（无内容）';
    }
  }

  destroy() {
    if (this.embeddedLeaf) {
      this.embeddedLeaf.detach();
      this.embeddedLeaf = null;
    }
  }
}
