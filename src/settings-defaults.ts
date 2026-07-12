// 中枢看板 — 默认设置

import type { MagicOSSettings } from './types';

export const DEFAULT_SETTINGS: MagicOSSettings = {
  moduleNames: {
    homepage: '首页',
    schedule: '修习课表',
    library: '典藏馆',
    travel: '旅行记忆',
    creativeWorkshop: '创意工坊',
  },
  homepageLayout: {
    gridColumns: 4,
    gridRows: 'auto',
    cardGap: 'M',
    cardVisibility: {
      schedule: true,
      tasks: true,
      workshop: true,
    },
    cardOrder: ['schedule', 'tasks', 'workshop'],
    cardSpans: {
      schedule: 2,
      tasks: 2,
      workshop: 4,
    },
    cardRowSpans: {
      schedule: 1,
      tasks: 1,
      workshop: 1,
    },
    cardLayout: {
      schedule: { x: 0, y: 0, w: 50 },
      tasks: { x: 50, y: 0, w: 50 },
      workshop: { x: 0, y: 25, w: 100 },
    },
    navIcons: {
      schedule: '📅',
      library: '📚',
      travel: '🗺️',
      workshop: '🎬',
    },
  },
  homepageFilters: {
    overdueThreshold: 1,
    stagnationThreshold: 7,
    preloadDays: 3,
  },
  customCards: [],
  schedulePresets: [
    { name: '健身', duration: 2, color: '#f38ba8' },
    { name: '阅读', duration: 2, color: '#89b4fa' },
    { name: '写作', duration: 3, color: '#a6e3a1' },
  ],
  schedulePalette: [
    '#e8b4b8',
    '#f5c2e7',
    '#f38ba8',
    '#fab387',
    '#f9e2af',
    '#a6e3a1',
    '#b8d8be',
    '#89b4fa',
    '#b4c6e8',
    '#cba6f7',
  ],
  icloudCalendar: {
    enabled: false,
    calendarName: '中枢看板',
  },
  gaodeApiKey: '',
  placeCache: {},
  travelResetLat: 29.562943,
  travelResetLng: 106.551294,
  travelResetLabel: '重庆',
  travelCacheTiles: true,
  travelDefaultView: 'standard',
};
