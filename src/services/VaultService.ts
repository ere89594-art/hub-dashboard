// 中枢看板 — Vault 文件操作服务

import { Vault, TFile, TFolder } from 'obsidian';

export class VaultService {
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /** 读取文件内容 */
  async readFile(file: TFile): Promise<string> {
    return await this.vault.read(file);
  }

  /** 写入文件内容 */
  async writeFile(file: TFile, content: string): Promise<void> {
    await this.vault.modify(file, content);
  }

  /** 获取指定路径下的文件夹，不存在则返回 null */
  getFolder(path: string): TFolder | null {
    const folder = this.vault.getAbstractFileByPath(path);
    if (folder instanceof TFolder) return folder;
    return null;
  }

  /** 列出文件夹中所有 .md 文件（递归） */
  listMarkdownFiles(folderPath: string): TFile[] {
    const folder = this.getFolder(folderPath);
    if (!folder) return [];

    const files: TFile[] = [];
    const stack: (TFile | TFolder)[] = [...folder.children] as (TFile | TFolder)[];

    // BFS/DFS 遍历
    while (stack.length > 0) {
      const item = stack.pop()!;
      if (item instanceof TFile && item.extension === 'md') {
        files.push(item);
      } else if (item instanceof TFolder) {
        // 跳过 assets 等非内容文件夹
        if (item.name === 'assets') continue;
        stack.push(...(item.children as (TFile | TFolder)[]));
      }
    }

    return files;
  }

  /** 列出子文件夹（仅一层） */
  listSubfolders(folderPath: string): TFolder[] {
    const folder = this.getFolder(folderPath);
    if (!folder) return [];
    return folder.children.filter((c): c is TFolder => c instanceof TFolder);
  }

  /** 统计文件夹中 .md 文件数量（不含递归） */
  countMarkdownFiles(folderPath: string): number {
    const folder = this.getFolder(folderPath);
    if (!folder) return 0;
    return folder.children.filter((c) => c instanceof TFile && c.extension === 'md').length;
  }

  /** 获取文件的 stat（ctime, mtime） */
  getFileStat(file: TFile): { ctime: number; mtime: number } {
    return { ctime: file.stat.ctime, mtime: file.stat.mtime };
  }

  /** 根据路径获取文件 */
  getFile(path: string): TFile | null {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return file;
    return null;
  }

  /** 确保文件夹存在（不存在则递归创建） */
  async ensureFolder(path: string): Promise<TFolder> {
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return existing;

    // 递归创建父文件夹
    await this.vault.createFolder(path);
    const created = this.vault.getAbstractFileByPath(path);
    if (created instanceof TFolder) return created;
    throw new Error(`无法创建文件夹: ${path}`);
  }

  /** 创建 Markdown 文件 */
  async createMarkdownFile(path: string, content: string): Promise<TFile> {
    // 确保父文件夹存在
    const parts = path.split('/');
    parts.pop();
    if (parts.length > 0) {
      await this.ensureFolder(parts.join('/'));
    }

    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;

    return await this.vault.create(path, content);
  }
}
