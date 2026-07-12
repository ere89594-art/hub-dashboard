// 中枢看板 — 响应式栅格布局引擎

import type { HomepageLayout } from '../../types';
import { GAP_MAP } from '../../types';

/** 根据布局配置生成网格容器 CSS style */
export function generateGridStyle(layout: HomepageLayout): string {
  const gap = GAP_MAP[layout.cardGap] || '16px';
  return `
    display: grid;
    grid-template-columns: repeat(${layout.gridColumns}, 1fr);
    gap: ${gap};
    padding: 20px;
    width: 100%;
    box-sizing: border-box;
  `;
}

/** 生成单张卡片的 CSS style */
export function generateCardStyle(cardId: string, layout: HomepageLayout): string {
  const span = layout.cardSpans[cardId] || 2;
  return `
    grid-column: span ${Math.min(span, layout.gridColumns)};
    background: var(--background-secondary, #313244);
    border-radius: 14px;
    padding: 18px;
    border: 1px solid var(--background-modifier-border, #45475a);
    transition: border-color 0.2s ease;
  `;
}

/** 生成导航卡片 CSS style */
export function generateNavCardStyle(): string {
  return `
    text-align: center;
    cursor: pointer;
    background: var(--background-secondary, #313244);
    border-radius: 14px;
    padding: 20px 12px 16px;
    border: 1px solid var(--background-modifier-border, #45475a);
    transition: background 0.15s ease;
  `;
}

/** 生成响应式 CSS（媒体查询） */
export function generateResponsiveCSS(): string {
  return `
    /* 平板：3列 */
    @media (max-width: 900px) {
      .hub-dashboard-grid {
        grid-template-columns: repeat(3, 1fr) !important;
      }
      .hub-dashboard-grid .card-full {
        grid-column: 1 / -1 !important;
      }
    }
    /* 手机/窄窗：2列导航 + 单列卡片 */
    @media (max-width: 600px) {
      .hub-dashboard-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 10px !important;
        padding: 12px !important;
      }
      .hub-dashboard-grid > * {
        grid-column: 1 / -1 !important;
      }
      .hub-dashboard-grid .nav-card {
        grid-column: span 1 !important;
      }
    }
    /* 导航卡片 hover 效果 */
    .hub-dashboard-nav-card:hover {
      background: var(--background-modifier-hover, #45475a);
    }
    /* 卡片标题 */
    .hub-dashboard-card-title {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 14px 0;
      color: var(--text-normal, #cdd6f4);
    }
    .hub-dashboard-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .hub-dashboard-card-link {
      font-size: 10px;
      color: var(--text-accent, #89b4fa);
      cursor: pointer;
    }
    /* 导航卡片 */
    .hub-dashboard-nav-icon {
      font-size: 34px;
      margin-bottom: 8px;
    }
    .hub-dashboard-nav-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-normal, #cdd6f4);
    }
    .hub-dashboard-nav-stat {
      font-size: 10px;
      color: var(--text-muted, #a6adc8);
      margin-top: 4px;
    }
    /* 日程条目 */
    .hub-dashboard-schedule-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--background-primary, #45475a);
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .hub-dashboard-schedule-time {
      font-size: 13px;
      color: var(--text-accent, #f5c2e7);
      font-weight: 600;
      min-width: 42px;
    }
    .hub-dashboard-schedule-title {
      font-size: 13px;
      color: var(--text-normal, #cdd6f4);
    }
    .hub-dashboard-empty-text {
      text-align: center;
      font-size: 11px;
      color: var(--text-faint, #585b70);
      padding: 12px;
    }
    /* 任务条目 */
    .hub-dashboard-task-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      margin-bottom: 6px;
    }
    .hub-dashboard-task-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .hub-dashboard-task-label {
      font-size: 11px;
      font-weight: 600;
      min-width: 30px;
      text-transform: uppercase;
    }
    .hub-dashboard-task-title {
      font-size: 13px;
      color: var(--text-normal, #cdd6f4);
    }
    /* 流水线标签 */
    .hub-dashboard-pipeline-tag {
      padding: 5px 12px;
      border-radius: 14px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .hub-dashboard-pipeline-tag-active {
      color: #1e1e2e;
    }
    .hub-dashboard-pipeline-tag-empty {
      color: var(--text-muted, #a6adc8);
      background: var(--background-primary, #45475a);
    }
    .hub-dashboard-pipeline-arrow {
      color: var(--text-faint, #585b70);
      font-weight: 300;
    }
    .hub-dashboard-stagnation-box {
      background: rgba(243, 139, 168, 0.1);
      border: 1px solid rgba(243, 139, 168, 0.25);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 11px;
    }
    /* 自定义卡片占位 */
    .hub-dashboard-custom-placeholder {
      background: transparent;
      border-radius: 14px;
      padding: 24px;
      border: 2px dashed var(--background-modifier-border, #45475a);
      text-align: center;
    }
    /* 页面标题 */
    .hub-dashboard-page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 0 20px;
    }
    .hub-dashboard-page-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-normal, #cdd6f4);
    }
  `;
}
