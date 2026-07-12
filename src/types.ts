// 中枢看板 — 全局类型定义

/** 模块名称配置（可在设置中自定义） */
export interface ModuleNames {
  homepage: string;
  schedule: string;
  library: string;
  travel: string;
  creativeWorkshop: string;
}

/** 首页栅格布局配置 */
export interface HomepageLayout {
  gridColumns: 2 | 3 | 4;
  gridRows: 'auto' | '4' | '5' | '6';
  cardGap: 'S' | 'M' | 'L';
  cardVisibility: Record<string, boolean>;
  cardOrder: string[];
  cardSpans: Record<string, number>;
  cardRowSpans: Record<string, number>;
  cardLayout: Record<string, { x: number; y: number; w: number; h?: number }>;
  navIcons: Record<string, string>;
}

/** 首页数据筛选配置 */
export interface HomepageFilters {
  overdueThreshold: number;
  stagnationThreshold: number;
  preloadDays: number;
}

/** 首页自定义卡片 */
export interface CustomCard {
  id: string;
  title: string;
  content: string;
  span: number;
  enabled: boolean;
}

// === 课表预设 ===

export interface SchedulePreset {
  name: string;
  duration: number;
  color: string;
}

// === 日程/任务类型 ===

export type ScheduleType = '日程' | '任务';

/** 优先级 */
export type Priority = '高' | '中' | '低';

/** 任务状态 */
export type TaskStatus = '待办' | '完成';

// === 项目管理 ===

export interface ProjectFrontmatter {
  标题: string;
  创建日期: string;
  标签: string[];
  进度: number;
  任务数: number;
  完成数: number;
}

export interface ProjectTaskFrontmatter {
  标题: string;
  创建日期: string;
  截止日期?: string;
  优先级: '红' | '黄' | '绿';
  状态: TaskStatus;
  所属项目: string;
}

// === 典藏馆 ===

export type LibraryCategory = 'movie' | 'tv' | 'book' | 'music';
export type LibraryStatus = '想看' | '在看' | '已看';

export interface LibraryItemFrontmatter {
  标题: string;
  类型: LibraryCategory;
  状态: LibraryStatus;
  评分?: string;
  导演?: string;
  演员?: string;
  作者?: string;
  简介?: string;
  封面?: string;
  标签: string[];
  创建日期: string;
}

// === 旅行记忆 ===

export interface TravelPlaceFrontmatter {
  标题: string;
  城市: string;
  地点?: string | string[];
  经度: number;
  纬度: number;
  封面?: string;
  到访次数: number;
  到访记录: TravelVisit[];
  创建日期: string;
}

export interface TravelVisit {
  日期: string;
  笔记路径?: string;
  照片?: string[];
}

// === 共用 Frontmatter ===

export interface CommonFrontmatter {
  标题: string;
  创建日期: string;
  截止日期?: string;
  标签: string[];
  所属模块: string;
}

/** 修习课表 Frontmatter */
export interface ScheduleFrontmatter extends CommonFrontmatter {
  类型: ScheduleType;
  日期: string;
  时间?: string;
  优先级: Priority;
  状态: TaskStatus;
}

/** 创意工坊 Frontmatter */
export interface WorkshopFrontmatter extends CommonFrontmatter {
  内容类型: ContentType;
  创作状态: CreativeStatus;
  计划发布?: string;
  实际发布?: string;
  平台?: Platform;
  负责人?: string;
  协作人?: string[];
  版本?: string;
  附件?: string[];
}

export type ContentType = '短视频' | '图文' | '播客' | '设计' | '长文' | '社交媒体';
export type CreativeStatus =
  '灵感' | '选题' | '创作' | '审核' | '排版' | '待发布' | '已发布' | '归档';
export type Platform = '抖音' | '小红书' | '公众号' | 'B站' | '微博' | '多平台';

/** 日程卡片数据 */
export interface ScheduleCardData {
  title: string;
  time: string;
  date: string;
  sourceModule: string;
  filePath: string;
  status: TaskStatus;
}

/** 任务卡片数据 */
export interface TaskCardData {
  title: string;
  priority: Priority;
  date: string;
  status: TaskStatus;
  overdue: boolean;
  filePath: string;
}

/** 创意工坊阶段统计 */
export interface PipelineStageStats {
  stage: string;
  stageNumber: number;
  count: number;
  label: string;
}

export interface StagnationWarning {
  title: string;
  stage: string;
  days: number;
  filePath: string;
}

export interface WorkshopOverviewData {
  stages: PipelineStageStats[];
  stagnationWarnings: StagnationWarning[];
}

/** 首页聚合数据 */
export interface HomepageData {
  scheduleCards: ScheduleCardData[];
  taskCards: TaskCardData[];
  workshopOverview: WorkshopOverviewData;
}

/** 创意工坊流水线阶段定义 */
export const PIPELINE_STAGES: { number: number; name: string; label: string }[] = [
  { number: 0, name: '00-灵感捕捉', label: '💡 灵感' },
  { number: 1, name: '01-选题策划', label: '📝 选题' },
  { number: 2, name: '02-内容创作', label: '✍️ 创作' },
  { number: 3, name: '03-审核修改', label: '🔍 审核' },
  { number: 4, name: '04-排版设计', label: '🎨 排版' },
  { number: 5, name: '05-发布排期', label: '📅 排期' },
  { number: 6, name: '06-已发布', label: '🚀 发布' },
  { number: 7, name: '07-数据复盘', label: '📊 复盘' },
  { number: 8, name: '08-归档', label: '📦 归档' },
];

/** 间隙映射 */
export const GAP_MAP: Record<string, string> = {
  S: '8px',
  M: '16px',
  L: '24px',
};

/** 插件总设置 */
export interface MagicOSSettings {
  moduleNames: ModuleNames;
  /** 所有模块数据统一收纳的父文件夹（vault 根目录下的单层目录名），留空则各模块直接放在库根 */
  vaultRoot: string;
  homepageLayout: HomepageLayout;
  homepageFilters: HomepageFilters;
  customCards: CustomCard[];
  schedulePresets: SchedulePreset[];
  schedulePalette: string[];
  icloudCalendar: {
    enabled: boolean;
    calendarName: string;
  };
  gaodeApiKey: string;
  placeCache: Record<string, { lat: number; lng: number }>;
  travelResetLat: number;
  travelResetLng: number;
  travelResetLabel: string;
  travelCacheTiles: boolean;
  travelDefaultView: 'standard' | 'satellite' | 'terrain';
}
