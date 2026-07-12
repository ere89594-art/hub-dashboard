// 中枢看板 — Frontmatter 解析服务

import { parseYaml, stringifyYaml } from 'obsidian';
import type {
  CommonFrontmatter,
  ScheduleFrontmatter,
  WorkshopFrontmatter,
  ScheduleType,
  Priority,
  TaskStatus,
  ContentType,
  CreativeStatus,
  Platform,
} from '../types';

/** 从 Markdown 内容中提取 YAML frontmatter */
export function parseFrontmatter(
  content: string,
): { data: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) return null;

  try {
    const yamlStr = match[1];
    const body = match[2] || '';
    const data = parseYaml(yamlStr) as Record<string, unknown>;
    return { data: data ?? {}, body };
  } catch {
    return null;
  }
}

/** 将对象序列化为 YAML frontmatter 并拼接正文 */
export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  // 过滤掉 undefined 和空数组
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) {
      clean[k] = v;
    }
  }
  const yaml = stringifyYaml(clean);
  return `---\n${yaml}---\n${body}`;
}

/** 安全获取字符串字段 */
function getStr(data: Record<string, unknown>, key: string, fallback: string = ''): string {
  const v = data[key];
  return typeof v === 'string' ? v : fallback;
}

/** 安全获取字符串数组 */
function getStrArray(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

/** 解析共用字段 */
export function parseCommonFrontmatter(data: Record<string, unknown>): CommonFrontmatter {
  return {
    标题: getStr(data, '标题', '未命名'),
    创建日期: getStr(data, '创建日期', ''),
    截止日期: getStr(data, '截止日期') || undefined,
    标签: getStrArray(data, '标签'),
    所属模块: getStr(data, '所属模块', ''),
  };
}

/** 解析修习课表 frontmatter */
export function parseScheduleFrontmatter(data: Record<string, unknown>): ScheduleFrontmatter {
  const common = parseCommonFrontmatter(data);
  const type = (getStr(data, '类型', '任务') as ScheduleType) || '任务';
  return {
    ...common,
    类型: type === '日程' ? '日程' : '任务',
    日期: getStr(data, '日期', ''),
    时间: type === '日程' ? getStr(data, '时间') || undefined : undefined,
    优先级: (getStr(data, '优先级', '中') as Priority) || '中',
    状态: (getStr(data, '状态', '待办') as TaskStatus) || '待办',
  };
}

/** 解析创意工坊 frontmatter */
export function parseWorkshopFrontmatter(data: Record<string, unknown>): WorkshopFrontmatter {
  const common = parseCommonFrontmatter(data);
  const ct = getStr(data, '内容类型', '短视频') as ContentType;
  const validTypes: ContentType[] = ['短视频', '图文', '播客', '设计', '长文', '社交媒体'];
  return {
    ...common,
    内容类型: validTypes.includes(ct) ? ct : '短视频',
    创作状态: (getStr(data, '创作状态', '灵感') as CreativeStatus) || '灵感',
    计划发布: getStr(data, '计划发布') || undefined,
    实际发布: getStr(data, '实际发布') || undefined,
    平台: (getStr(data, '平台') as Platform) || undefined,
    负责人: getStr(data, '负责人') || undefined,
    协作人: getStr(data, '协作人') ? getStrArray(data, '协作人') : undefined,
    版本: getStr(data, '版本', '1.0'),
    附件: getStr(data, '附件') ? getStrArray(data, '附件') : undefined,
  };
}

/** 从文件路径推断所属模块 */
export function inferModule(filePath: string): string {
  if (filePath.includes('修习课表')) return '修习课表';
  if (filePath.includes('创意工坊')) return '创意工坊';
  return '';
}

/** 从创意工坊文件路径推断创作状态 */
export function inferCreativeStatus(filePath: string): CreativeStatus | null {
  const statusMap: Record<string, CreativeStatus> = {
    '00-灵感捕捉': '灵感',
    '01-选题策划': '选题',
    '02-内容创作': '创作',
    '03-审核修改': '审核',
    '04-排版设计': '排版',
    '05-发布排期': '待发布',
    '06-已发布': '已发布',
    '07-数据复盘': '归档', // 复盘完即归档
    '08-归档': '归档',
  };
  for (const [folder, status] of Object.entries(statusMap)) {
    if (filePath.includes(folder)) return status;
  }
  return null;
}
