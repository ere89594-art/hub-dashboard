// 中枢看板 — 旅行记忆模块（Leaflet 2D 平面地图 + 3D 视觉风格）

import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import type MagicOSPlugin from '../../main';
import { parseFrontmatter } from '../../services/FrontmatterService';
import * as L from 'leaflet';

type MapViewType = 'standard' | 'satellite' | 'terrain';

export class TravelModule {
  private plugin: MagicOSPlugin;
  private container: HTMLElement;
  private onNavigateHome: (() => void) | null;
  private places: { file: TFile; fm: TravelPlaceFrontmatter; lon: number; lat: number }[] = [];
  private placeCache: Map<string, { lat: number; lng: number }>;
  private rightPanelEl: HTMLElement | null = null;

  private leafletMap: L.Map | null = null;
  private tileLayers: L.TileLayer[] = [];
  private markerLayer: L.LayerGroup | null = null;
  private currentView: MapViewType = 'standard';

  private _rendering = false;
  private _destroyed = false;
  private _lightRefreshing = false;
  private placeFiles: Map<string, TFile[]> = new Map();

  constructor(plugin: MagicOSPlugin, container: HTMLElement, onNavigateHome?: () => void) {
    this.plugin = plugin;
    this.container = container;
    this.onNavigateHome = onNavigateHome || null;
    const cache = this.plugin.magicSettings.placeCache || {};
    this.placeCache = new Map(Object.entries(cache));
    this.currentView = this.plugin.magicSettings.travelDefaultView || 'standard';
  }

  async render(): Promise<void> {
    if (this._rendering) return;
    this._rendering = true;

    const ct = this.container;
    ct.empty();
    this.places = [];

    this.buildLayout(ct);

    // 注入 Leaflet CSS（先注入，不阻塞）
    this.injectStyles();

    // 🔑 先初始化地图（用户立刻看到地图），再异步加载地点数据
    requestAnimationFrame(() => this.initLeaflet());

    // 异步加载旅行记忆文件（不阻塞地图渲染）
    (async () => {
      await new Promise((r) => setTimeout(r, 50)); // 让地图先渲染一帧
      const vault = this.plugin.vaultService;
      await vault.ensureFolder('旅行记忆');
      const allFiles = vault.listMarkdownFiles('旅行记忆');
      for (const f of allFiles) {
        try {
          const cnt = await vault.readFile(f);
          const pp = parseFrontmatter(cnt);
          if (!pp) continue;
          const fm = pp.data as TravelPlaceFrontmatter;
          if (fm.经度 == null || fm.纬度 == null) continue;
          this.places.push({ file: f, fm, lon: fm.经度, lat: fm.纬度 });
        } catch {
          continue;
        }
      }

      const totalVisits = this.places.reduce((sum, p) => sum + (p.fm.到访次数 || 0), 0);
      const statsEl = this.container.querySelector('.magic-travel-stats') as HTMLElement;
      if (statsEl)
        statsEl.textContent = `🗺️ 旅行地图 · 已记录 ${this.places.length} 个地点，共 ${totalVisits} 次到访`;

      this.renderRightPanel();
    })();

    this._rendering = false;
  }

  private buildLayout(ct: HTMLElement): void {
    const layout = ct.createDiv();
    layout.style.cssText = 'display:flex;gap:12px;padding:12px 20px 20px;flex:1;min-height:400px;';

    // 左侧 50% — 地图
    const leftPanel = layout.createDiv();
    leftPanel.style.cssText =
      'flex:0 0 50%;min-width:0;display:flex;flex-direction:column;position:relative;';

    // 工具栏
    const toolbar = leftPanel.createDiv();
    toolbar.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap;gap:4px;';

    const leftActions = toolbar.createDiv();
    leftActions.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const backBtn = leftActions.createEl('button', { text: '← 返回' });
    backBtn.style.cssText =
      'font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);cursor:pointer;transition:all 0.15s;';
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.borderColor = 'var(--interactive-accent)';
      backBtn.style.color = 'var(--interactive-accent)';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.borderColor = 'var(--background-modifier-border)';
      backBtn.style.color = 'var(--text-muted)';
    });
    backBtn.addEventListener('click', () => {
      if (this.onNavigateHome) this.onNavigateHome();
    });

    // 视图切换
    const viewWrap = leftActions.createDiv();
    viewWrap.className = 'magic-travel-view-switcher';
    viewWrap.style.cssText =
      'display:flex;gap:2px;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:1px;';
    const viewBtns: { v: MapViewType; label: string }[] = [
      { v: 'standard', label: '🗺️' },
      { v: 'satellite', label: '🛰️' },
      { v: 'terrain', label: '🏔️' },
    ];
    for (const vb of viewBtns) {
      const btn = viewWrap.createEl('button', { text: vb.label });
      const isActive = this.currentView === vb.v;
      btn.style.cssText = `font-size:12px;padding:4px 8px;border:none;border-radius:4px;cursor:pointer;transition:all 0.15s;background:${isActive ? 'var(--interactive-accent)' : 'transparent'};color:${isActive ? 'var(--text-on-accent)' : 'var(--text-muted)'};`;
      btn.addEventListener('click', () => this.switchView(vb.v));
      btn.dataset.view = vb.v;
    }

    const rightActions = toolbar.createDiv();
    rightActions.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const resetBtn = rightActions.createEl('button', { text: '🎯' });
    resetBtn.title = '重置到默认地点';
    resetBtn.style.cssText =
      'font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;transition:all 0.15s;';
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.borderColor = 'var(--interactive-accent)';
      resetBtn.style.color = 'var(--interactive-accent)';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.borderColor = 'var(--background-modifier-border)';
      resetBtn.style.color = 'var(--text-muted)';
    });
    resetBtn.addEventListener('click', () => this.resetView());

    const addBtn = rightActions.createEl('button', { text: '+ 添加' });
    addBtn.style.cssText =
      'font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--interactive-accent);background:transparent;color:var(--interactive-accent);cursor:pointer;transition:all 0.15s;';
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'var(--interactive-accent)';
      addBtn.style.color = 'var(--text-on-accent)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'transparent';
      addBtn.style.color = 'var(--interactive-accent)';
    });
    addBtn.addEventListener('click', () => this.showAddPlaceDialog());

    // 统计
    const stats = leftPanel.createDiv();
    stats.className = 'magic-travel-stats';
    stats.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px;flex-shrink:0;';
    stats.textContent = '🗺️ 旅行地图 · 加载中...';

    // 地图容器 + 3D 视觉
    const mapCard = leftPanel.createDiv();
    mapCard.style.cssText =
      'flex:1;min-height:300px;position:relative;border-radius:16px;overflow:hidden;background:var(--background-primary);';
    mapCard.className = 'magic-travel-map-card';

    // 3D 视觉阴影层
    const shadowLayer = mapCard.createDiv();
    shadowLayer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:5;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.25),0 2px 8px rgba(0,0,0,0.15),0 0 0 1px rgba(255,255,255,0.05)inset;transition:box-shadow 0.3s ease;';
    mapCard.addEventListener('mouseenter', () => {
      shadowLayer.style.boxShadow =
        '0 12px 40px rgba(0,0,0,0.35),0 4px 12px rgba(0,0,0,0.2),0 0 0 1px rgba(255,255,255,0.1)inset';
    });
    mapCard.addEventListener('mouseleave', () => {
      shadowLayer.style.boxShadow =
        '0 8px 32px rgba(0,0,0,0.25),0 2px 8px rgba(0,0,0,0.15),0 0 0 1px rgba(255,255,255,0.05)inset';
    });

    const mapDiv = mapCard.createDiv();
    mapDiv.style.cssText = 'width:100%;height:100%;';
    mapDiv.className = 'magic-travel-map';

    // 右侧 50%
    const rightPanel = layout.createDiv();
    rightPanel.style.cssText =
      'flex:0 0 50%;min-width:0;display:flex;flex-direction:column;gap:12px;overflow-y:auto;';
    this.rightPanelEl = rightPanel;
    this.renderRightPanel();
  }

  // === Leaflet 初始化 ===

  private initLeaflet(): void {
    const mapDiv = this.container.querySelector('.magic-travel-map') as HTMLElement;
    if (!mapDiv) return;

    const s = this.plugin.magicSettings;
    const defaultLat = s.travelResetLat ?? 29.562943;
    const defaultLng = s.travelResetLng ?? 106.551294;

    const map = L.map(mapDiv, {
      center: [defaultLat, defaultLng],
      zoom: 12,
      minZoom: 3, // 🔑 缩放下限：世界级视图，不能再小
      maxZoom: 18, // 🔑 缩放上限：高德瓦片最大级别（街道级）
      zoomControl: true,
      attributionControl: false,
      // 🔑 限制拖拽范围：世界经纬度边界，不能把地图拖出视野
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0, // 硬边界，到边缘完全停止
      // 🔑 关键：禁用所有动画，确保最跟手
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    });
    this.leafletMap = map;

    // 添加当前视图瓦片
    this.addTileLayers(this.currentView);

    // 标记层
    this.markerLayer = L.layerGroup().addTo(map);

    // 加载地点标记
    setTimeout(() => this.scanVaultAndMark(), 100);

    // 更新统计
    const statsEl = this.container.querySelector('.magic-travel-stats') as HTMLElement;
    if (statsEl) statsEl.textContent = `🗺️ 旅行地图 · 已记录 ${this.places.length} 个地点`;
  }

  private addTileLayers(view: MapViewType): void {
    if (!this.leafletMap) return;

    // 清除旧瓦片
    this.tileLayers.forEach((l) => l.remove());
    this.tileLayers = [];

    switch (view) {
      case 'standard': {
        // 高德矢量地图（style=7 已包含标注，无需叠加 style=8）
        const base = L.tileLayer(
          'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
          { maxZoom: 18, subdomains: '1234' },
        );
        base.addTo(this.leafletMap);
        this.tileLayers.push(base);
        break;
      }
      case 'satellite': {
        // 卫星影像（无标注，需叠加 style=8）
        const sat = L.tileLayer(
          'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
          { maxZoom: 18, subdomains: '1234' },
        );
        sat.addTo(this.leafletMap);
        this.tileLayers.push(sat);
        // 标注层
        const label = L.tileLayer(
          'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
          { maxZoom: 18, subdomains: '1234' },
        );
        label.addTo(this.leafletMap);
        this.tileLayers.push(label);
        break;
      }
      case 'terrain': {
        // 地形图 — OpenTopoMap（开源地形等高线瓦片）
        const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          maxZoom: 17,
          subdomains: 'abc',
        });
        terrain.addTo(this.leafletMap);
        this.tileLayers.push(terrain);
        break;
      }
    }
  }

  // === 视图切换 ===

  private switchView(view: MapViewType): void {
    if (view === this.currentView || !this.leafletMap) return;
    this.currentView = view;
    this.addTileLayers(view);
    // 更新按钮高亮状态
    const viewWrap = this.container.querySelector('.magic-travel-view-switcher');
    if (viewWrap) {
      const btns = viewWrap.querySelectorAll('button');
      btns.forEach((btn: HTMLButtonElement) => {
        const isActive = btn.dataset.view === view;
        btn.style.background = isActive ? 'var(--interactive-accent)' : 'transparent';
        btn.style.color = isActive ? 'var(--text-on-accent)' : 'var(--text-muted)';
      });
    }
    new Notice(
      `已切换到${view === 'standard' ? '标准' : view === 'satellite' ? '卫星' : '地形'}视图`,
    );
  }

  // === 重置视角 ===

  private resetView(): void {
    if (!this.leafletMap) return;
    const s = this.plugin.magicSettings;
    const lat = s.travelResetLat ?? 29.562943;
    const lng = s.travelResetLng ?? 106.551294;
    this.leafletMap.flyTo([lat, lng], 12, { duration: 1 });
    new Notice(`🎯 已重置到 ${s.travelResetLabel || '默认地点'}`);
  }

  // === Vault 扫描 + 标记 ===

  private async scanVaultAndMark(): Promise<void> {
    if (!this.leafletMap || !this.markerLayer) return;

    // 🔑 让出主线程，让 UI 先响应（删除/加载不卡）
    await new Promise((r) => setTimeout(r, 0));

    this.markerLayer.clearLayers();
    this.placeFiles.clear();

    const vault = this.plugin.vaultService;
    const allFiles = vault.listMarkdownFiles('');
    const placeMap = new Map<string, { lat: number; lng: number; files: TFile[] }>();

    // 🔑 分批读取文件，每 50 个让出一次主线程
    for (let idx = 0; idx < allFiles.length; idx++) {
      const f = allFiles[idx];
      try {
        const cnt = await vault.readFile(f);
        const pp = parseFrontmatter(cnt);
        const fm = (pp?.data ?? {}) as TravelPlaceFrontmatter;
        if (!fm.地点) continue;
        const places = Array.isArray(fm.地点) ? fm.地点 : [fm.地点];
        for (const place of places) {
          const name = String(place).trim();
          if (!name) continue;
          if (!placeMap.has(name)) placeMap.set(name, { lat: 0, lng: 0, files: [] });
          placeMap.get(name)!.files.push(f);
          if (!this.placeFiles.has(name)) this.placeFiles.set(name, []);
          this.placeFiles.get(name)!.push(f);
        }
      } catch {
        continue;
      }
      // 每 50 个文件让出主线程
      if (idx % 50 === 49) await new Promise((r) => setTimeout(r, 0));
    }

    const gaodeKey = this.plugin.magicSettings.gaodeApiKey;
    if (gaodeKey) {
      const uncached: string[] = [];
      for (const [place, data] of placeMap) {
        if (this.placeCache.has(place)) {
          const c = this.placeCache.get(place)!;
          data.lat = c.lat;
          data.lng = c.lng;
        } else {
          uncached.push(place);
        }
      }
      for (let i = 0; i < uncached.length; i += 20) {
        const batch = uncached.slice(i, i + 20);
        const url = `https://restapi.amap.com/v3/geocode/geo?batch=true&address=${encodeURIComponent(batch.join('|'))}&key=${gaodeKey}`;
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          const json = await resp.json();
          if (json.geocodes && Array.isArray(json.geocodes)) {
            for (let j = 0; j < batch.length; j++) {
              const gc = json.geocodes[j];
              if (gc && gc.location) {
                const [lng, lat] = gc.location.split(',').map(Number);
                this.placeCache.set(batch[j], { lat, lng });
                const data = placeMap.get(batch[j])!;
                data.lat = lat;
                data.lng = lng;
              }
            }
          }
        } catch {
          continue;
        }
      }
      this.savePlaceCache();
    }

    // 添加标记
    for (const [place, data] of placeMap) {
      if (data.lat === 0 && data.lng === 0) continue;
      this.addMarker(data.lat, data.lng, place, data.files);
    }
    for (const p of this.places) {
      this.addMarker(p.lat, p.lon, p.fm.城市 || p.fm.标题 || p.file.basename, [p.file]);
    }

    this.renderRightPanel();
  }

  // 🔑 快速刷新标记（不扫描 vault，仅用 places 和 placeCache 重建标记）
  private refreshMarkersOnly(): void {
    if (!this.markerLayer) return;
    this.markerLayer.clearLayers();
    for (const [placeName, data] of this.placeCache) {
      if (data.lat === 0 && data.lng === 0) continue;
      const files = this.placeFiles.get(placeName) || [];
      this.addMarker(data.lat, data.lng, placeName, files);
    }
    for (const p of this.places) {
      this.addMarker(p.lat, p.lon, p.fm.城市 || p.fm.标题 || p.file.basename, [p.file]);
    }
  }

  /** 🔑 外部文件变化时的轻量刷新 — 不销毁地图，仅重读旅行文件夹并更新标记/面板 */
  async onExternalFileChange(): Promise<void> {
    if (this._destroyed || !this.leafletMap || this._lightRefreshing) return;
    this._lightRefreshing = true;
    try {
      // 让出主线程，让 UI 先响应
      await new Promise((r) => setTimeout(r, 0));

      // 重新读取旅行记忆文件夹（仅此文件夹，不扫描全 vault）
      const vault = this.plugin.vaultService;
      const allFiles = vault.listMarkdownFiles('旅行记忆');
      this.places = [];

      for (let idx = 0; idx < allFiles.length; idx++) {
        const f = allFiles[idx];
        try {
          const cnt = await vault.readFile(f);
          const pp = parseFrontmatter(cnt);
          if (!pp) continue;
          const fm = pp.data as TravelPlaceFrontmatter;
          if (fm.经度 == null || fm.纬度 == null) continue;
          this.places.push({ file: f, fm, lon: fm.经度, lat: fm.纬度 });
        } catch {
          continue;
        }
        // 每 50 个文件让出主线程
        if (idx % 50 === 49) await new Promise((r) => setTimeout(r, 0));
      }

      // 更新统计
      const totalVisits = this.places.reduce((sum, p) => sum + (p.fm.到访次数 || 0), 0);
      const statsEl = this.container.querySelector('.magic-travel-stats') as HTMLElement;
      if (statsEl)
        statsEl.textContent = `🗺️ 旅行地图 · 已记录 ${this.places.length} 个地点，共 ${totalVisits} 次到访`;

      // 刷新标记 + 右侧面板（不销毁地图）
      this.refreshMarkersOnly();
      this.renderRightPanel();
    } finally {
      this._lightRefreshing = false;
    }
  }

  private addMarker(lat: number, lng: number, label: string, files: TFile[]): void {
    if (!this.markerLayer) return;

    const marker = L.circleMarker([lat, lng], {
      radius: 7,
      fillColor: '#ff4444',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
    });

    // 弹出窗口
    const popupContent = document.createElement('div');
    popupContent.style.cssText = 'min-width:180px;';
    const title = popupContent.createEl('div', { text: `📍 ${label}` });
    title.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:4px;';
    const count = popupContent.createEl('div', { text: `${files.length} 个文件` });
    count.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:6px;';
    const list = popupContent.createEl('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    for (const f of files) {
      const link = list.createEl('div', { text: f.basename });
      link.style.cssText =
        'padding:2px 4px;cursor:pointer;font-size:12px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      link.addEventListener('mouseenter', () => {
        link.style.backgroundColor = 'var(--background-modifier-hover)';
      });
      link.addEventListener('mouseleave', () => {
        link.style.backgroundColor = 'transparent';
      });
      link.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(f.path, '', false);
      });
    }

    marker.bindPopup(popupContent, {
      closeButton: true,
      className: 'magic-travel-popup',
    });
    marker.bindTooltip(label, { permanent: false, direction: 'top' });
    marker.addTo(this.markerLayer);
  }

  private savePlaceCache(): void {
    const obj: Record<string, { lat: number; lng: number }> = {};
    for (const [k, v] of this.placeCache) obj[k] = v;
    this.plugin.magicSettings.placeCache = obj;
    this.plugin.saveSettingsSilent();
  }

  // === 样式注入 ===

  private injectStyles(): void {
    if (document.getElementById('magic-travel-leaflet-styles')) return;

    const style = document.createElement('style');
    style.id = 'magic-travel-leaflet-styles';
    style.textContent = `
      .magic-travel-map-card {
        perspective: 800px;
      }
      .magic-travel-map .leaflet-container {
        background: var(--background-primary);
      }
      .magic-travel-map .leaflet-popup-content-wrapper {
        background: var(--background-secondary);
        color: var(--text-normal);
        border: 1px solid var(--background-modifier-border);
        border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      }
      .magic-travel-map .leaflet-popup-tip {
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
      }
      .magic-travel-map .leaflet-control-zoom a {
        background: var(--background-secondary);
        color: var(--text-normal);
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        margin: 2px;
        width: 28px;
        height: 28px;
        line-height: 26px;
        font-size: 16px;
      }
      .magic-travel-map .leaflet-control-zoom a:hover {
        background: var(--background-modifier-hover);
      }
    `;
    document.head.appendChild(style);
  }

  // === 右侧面板 ===

  private renderRightPanel(): void {
    if (!this.rightPanelEl) return;
    this.rightPanelEl.empty();

    // 地点列表
    const placeCard = this.rightPanelEl.createDiv();
    placeCard.style.cssText =
      'background:var(--background-secondary);border-radius:12px;border:1px solid var(--background-modifier-border);padding:10px 12px;flex-shrink:0;';
    const header = placeCard.createDiv();
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    header.createEl('span', { text: '📍 地点列表' }).style.cssText =
      'font-size:12px;font-weight:600;color:var(--text-normal);';
    const countBadge = header.createEl('span', { text: `${this.placeCache.size}` });
    countBadge.style.cssText =
      'font-size:10px;background:var(--interactive-accent);color:var(--text-on-accent);padding:1px 6px;border-radius:10px;';

    const listWrap = placeCard.createDiv();
    listWrap.style.cssText = 'max-height:200px;overflow-y:auto;';
    if (this.placeCache.size === 0) {
      listWrap.createDiv({ text: '暂无地点数据' }).style.cssText =
        'text-align:center;font-size:11px;color:var(--text-faint);padding:16px;';
    } else {
      const sorted = [...this.placeCache.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [place, coord] of sorted) {
        const item = listWrap.createDiv({ text: place });
        item.style.cssText =
          'padding:5px 8px;cursor:pointer;border-radius:4px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background 0.1s;';
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--background-modifier-hover)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });
        item.addEventListener('click', () => {
          if (this.leafletMap) {
            this.leafletMap.flyTo([coord.lat, coord.lng], 14, { duration: 1.5 });
          }
        });
      }
    }

    // 操作说明
    const detailCard = this.rightPanelEl.createDiv();
    detailCard.style.cssText =
      'flex:1;background:var(--background-secondary);border-radius:12px;border:1px solid var(--background-modifier-border);padding:12px;overflow-y:auto;';
    detailCard.createDiv({ text: '🗺️ 操作说明' }).style.cssText =
      'font-size:13px;font-weight:600;margin-bottom:10px;color:var(--interactive-accent);';
    const tips = [
      '🖱️ 拖动 — 平移地图（像PS拖拽画布）',
      '🔍 滚轮 — 缩放',
      '🗺️ 🛰️ 🏔️ — 切换标准/卫星/地形视图',
      '🎯 — 重置到默认地点',
    ];
    for (const tip of tips) {
      detailCard.createDiv({ text: tip }).style.cssText =
        'font-size:11px;color:var(--text-muted);padding:3px 0;';
    }

    // 旅行记忆文件
    if (this.places.length > 0) {
      detailCard.createEl('hr').style.cssText =
        'border:none;border-top:1px solid var(--background-modifier-border);margin:10px 0;';
      detailCard.createDiv({ text: '📁 旅行记忆文件' }).style.cssText =
        'font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-normal);';
      for (const p of this.places) {
        const fileRow = detailCard.createDiv();
        fileRow.style.cssText =
          'display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;transition:background 0.1s;';
        fileRow.addEventListener('mouseenter', () => {
          fileRow.style.backgroundColor = 'var(--background-modifier-hover)';
        });
        fileRow.addEventListener('mouseleave', () => {
          fileRow.style.backgroundColor = 'transparent';
        });

        // 文件名（点击打开）
        const nameEl = fileRow.createDiv({ text: p.fm.城市 || p.fm.标题 || p.file.basename });
        nameEl.style.cssText =
          'flex:1;cursor:pointer;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameEl.addEventListener('click', () => {
          this.plugin.app.workspace.openLinkText(p.file.path, '', false);
        });

        // 定位按钮（在地图上定位）
        const locateBtn = fileRow.createEl('button', { text: '📍' });
        locateBtn.style.cssText =
          'flex-shrink:0;font-size:12px;padding:2px 6px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;';
        locateBtn.title = '在地图上定位';
        locateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.leafletMap) {
            this.leafletMap.flyTo([p.lat, p.lon], 14, { duration: 1.5 });
            new Notice(`📍 已定位到 ${p.fm.城市 || p.fm.标题 || p.file.basename}`);
          }
        });

        // 删除按钮
        const delBtn = fileRow.createEl('button', { text: '🗑' });
        delBtn.style.cssText =
          'flex-shrink:0;font-size:12px;padding:2px 6px;border:none;border-radius:4px;background:transparent;color:var(--text-error);cursor:pointer;';
        delBtn.title = '删除此地点文件';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const name = p.fm.城市 || p.fm.标题 || p.file.basename;
          // 简单确认：直接删除（Obsidian 可撤销）
          try {
            await this.plugin.app.vault.trash(p.file);
            new Notice(`🗑 已删除：${name}`);
            // 🔑 本地移除，不重新扫描全 vault（快速响应）
            this.places = this.places.filter((x) => x.file.path !== p.file.path);
            this.refreshMarkersOnly();
            this.renderRightPanel();
          } catch (err) {
            new Notice('删除失败：' + (err as Error).message);
          }
        });
      }
    }
  }

  // === 添加地点 ===

  private showAddPlaceDialog(): void {
    const modal = new AddPlaceModal(
      this.plugin.app,
      this.plugin.magicSettings.gaodeApiKey,
      async (city: string, lon: number, lat: number) => {
        const vault = this.plugin.vaultService;
        const fileName = `${city}-${Date.now()}.md`;
        const today = window.moment().format('YYYY-MM-DD');
        const content = `---\n标题: "${city}"\n城市: "${city}"\n经度: ${lon}\n纬度: ${lat}\n封面: ""\n到访次数: 0\n到访记录: []\n创建日期: ${today}\n标签: []\n---\n\n# ${city}\n\n## 旅行笔记\n\n`;
        await vault.createMarkdownFile('旅行记忆/' + fileName, content);
        new Notice(`已添加地点: ${city}`);
        // 🔑 本地添加，不重新扫描全 vault
        this.places.push({
          file: vault.getFile('旅行记忆/' + fileName) as TFile,
          fm: { 城市: city, 标题: city, 到访次数: 0 },
          lon,
          lat,
        });
        this.refreshMarkersOnly();
        this.renderRightPanel();
      },
    );
    modal.open();
  }

  // === 清理 ===

  destroy(): void {
    this._destroyed = true;
    this._rendering = false;
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
    this.tileLayers = [];
    this.markerLayer = null;
    this.rightPanelEl = null;
  }
}

class AddPlaceModal extends Modal {
  private cb: (city: string, lon: number, lat: number) => void;
  private gaodeKey: string;
  private city = '';
  private lon = 0;
  private lat = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private resultsEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(app: App, gaodeKey: string, cb: (city: string, lon: number, lat: number) => void) {
    super(app);
    this.gaodeKey = gaodeKey;
    this.cb = cb;
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.style.minWidth = '400px';
    el.createEl('h3', { text: '添加地点' }).style.cssText = 'margin:0 0 12px;font-size:15px;';

    // 地名搜索框
    const searchSetting = new Setting(el).setName('地名搜索').setDesc('输入地名后自动查询经纬度');
    searchSetting.addText((text) => {
      text.inputEl.style.width = '280px';
      text.setPlaceholder('如：北京、上海、故宫、西湖...');
      text.onChange((v) => {
        this.city = v;
        // 🔑 防抖：输入停止 500ms 后自动搜索
        if (this.searchTimer) clearTimeout(this.searchTimer);
        if (v.trim().length < 2) {
          if (this.resultsEl) this.resultsEl.empty();
          if (this.statusEl) this.statusEl.textContent = '';
          return;
        }
        this.searchTimer = setTimeout(() => this.searchPlace(v.trim()), 500);
      });
      // 回车立即搜索
      text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && this.city.trim().length >= 2) {
          if (this.searchTimer) clearTimeout(this.searchTimer);
          this.searchPlace(this.city.trim());
        }
      });
      setTimeout(() => text.inputEl.focus(), 50);
    });

    // 搜索状态
    this.statusEl = el.createDiv();
    this.statusEl.style.cssText =
      'font-size:11px;color:var(--text-muted);margin:4px 0;min-height:16px;';

    // 搜索结果列表
    this.resultsEl = el.createDiv();
    this.resultsEl.style.cssText =
      'max-height:200px;overflow-y:auto;margin-bottom:8px;border:1px solid var(--background-modifier-border);border-radius:8px;display:none;';

    // 手动输入经纬度（折叠区域）
    const manualToggle = el.createEl('details');
    manualToggle.style.cssText = 'margin-bottom:8px;';
    const summary = manualToggle.createEl('summary', { text: '手输经纬度（可选）' });
    summary.style.cssText = 'font-size:11px;color:var(--text-muted);cursor:pointer;padding:4px 0;';
    const manualBody = manualToggle.createDiv();
    manualBody.style.cssText = 'padding:8px 0 0 16px;';

    new Setting(manualBody).setName('经度').addText((text) => {
      text.inputEl.style.width = '200px';
      text.setPlaceholder('-180 ~ 180');
      text.onChange((v) => {
        this.lon = parseFloat(v) || 0;
      });
    });
    new Setting(manualBody).setName('纬度').addText((text) => {
      text.inputEl.style.width = '200px';
      text.setPlaceholder('-90 ~ 90');
      text.onChange((v) => {
        this.lat = parseFloat(v) || 0;
      });
    });

    // 按钮
    const btnRow = el.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    const ok = btnRow.createEl('button', { text: '添加' });
    ok.style.cssText =
      'padding:6px 20px;border-radius:6px;border:none;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:13px;';
    ok.addEventListener('click', () => {
      if (!this.city.trim()) {
        new Notice('请输入地名');
        return;
      }
      if (this.lon === 0 && this.lat === 0) {
        new Notice('请先搜索地名并选择结果，或手动输入经纬度');
        return;
      }
      this.cb(this.city.trim(), this.lon, this.lat);
      this.close();
    });
    const cancel = btnRow.createEl('button', { text: '取消' });
    cancel.style.cssText =
      'padding:6px 20px;border-radius:6px;border:1px solid var(--background-modifier-border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;';
    cancel.addEventListener('click', () => this.close());
  }

  private async searchPlace(keyword: string): Promise<void> {
    if (!this.statusEl || !this.resultsEl) return;

    if (!this.gaodeKey) {
      this.statusEl.textContent = '⚠️ 请先在设置中配置高德 API Key';
      this.statusEl.style.color = 'var(--text-error)';
      return;
    }

    this.statusEl.textContent = '🔍 搜索中...';
    this.statusEl.style.color = 'var(--text-muted)';
    this.resultsEl.style.display = 'none';
    this.resultsEl.empty();

    try {
      const results: { name: string; lat: number; lng: number; address: string; type: string }[] =
        [];

      // 先用 geocode/geo 做精确地理编码（城市名/地址直接转坐标）
      const geoUrl = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(keyword)}&key=${this.gaodeKey}&extensions=base`;
      const geoResp = await fetch(geoUrl, { signal: AbortSignal.timeout(10000) });
      const geoJson = await geoResp.json();
      if (geoJson.status === '1' && geoJson.geocodes && geoJson.geocodes.length > 0) {
        for (const gc of geoJson.geocodes) {
          if (gc.location) {
            const [lng, lat] = gc.location.split(',').map(Number);
            results.push({
              name: gc.formatted_address || keyword,
              lat,
              lng,
              address: gc.formatted_address || '',
              type: gc.level || '地址',
            });
          }
        }
      }

      // 如果 geocode 没结果，再用 place/text 做模糊搜索（POI搜索）
      if (results.length === 0) {
        const searchUrl = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(keyword)}&key=${this.gaodeKey}&offset=10&extensions=base`;
        const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
        const searchJson = await searchResp.json();
        if (searchJson.status === '1' && searchJson.pois && searchJson.pois.length > 0) {
          for (const poi of searchJson.pois) {
            if (!poi.location) continue;
            const [lng, lat] = poi.location.split(',').map(Number);
            results.push({
              name: poi.name,
              lat,
              lng,
              address: poi.address || poi.adname || '',
              type: poi.type || '',
            });
          }
        }
      }

      if (results.length > 0) {
        this.statusEl.textContent = `找到 ${results.length} 个结果，点击选择：`;
        this.statusEl.style.color = 'var(--text-accent)';
        this.resultsEl.style.display = 'block';

        for (const r of results) {
          const item = this.resultsEl.createDiv();
          item.style.cssText =
            'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--background-modifier-border);transition:background 0.1s;';
          const name = item.createDiv({ text: r.name });
          name.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-normal);';
          const addr = item.createDiv({ text: `${r.address || ''} · ${r.type || ''}` });
          addr.style.cssText = 'font-size:10px;color:var(--text-muted);margin-top:2px;';
          const coord = item.createDiv({ text: `📍 ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` });
          coord.style.cssText = 'font-size:10px;color:var(--text-faint);margin-top:2px;';
          item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'var(--background-modifier-hover)';
          });
          item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
          });
          item.addEventListener('click', () => {
            this.city = r.name;
            this.lon = r.lng;
            this.lat = r.lat;
            const siblings = this.resultsEl!.querySelectorAll('div');
            siblings.forEach((s) => {
              (s as HTMLElement).style.background = 'transparent';
              (s as HTMLElement).style.borderLeft = 'none';
            });
            item.style.background = 'var(--background-modifier-hover)';
            item.style.borderLeft = '3px solid var(--interactive-accent)';
            this.statusEl!.textContent = `✅ 已选择：${r.name} (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)})`;
            this.statusEl!.style.color = 'var(--text-on-accent)';
          });
        }
      } else {
        this.statusEl.textContent = '❌ 未找到匹配地点，请尝试其他关键词或手动输入经纬度';
        this.statusEl.style.color = 'var(--text-error)';
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '网络错误';
      this.statusEl.textContent = `❌ 搜索失败：${msg}`;
      this.statusEl.style.color = 'var(--text-error)';
    }
  }

  onClose(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.contentEl.empty();
  }
}
