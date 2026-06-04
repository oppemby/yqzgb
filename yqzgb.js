class MoyuApp {
  constructor(container, roche) {
    this.container = container;
    this.roche = roche;
    this.sheets = [];
    this.activeSheetId = null;
    this.currentData = [];
    this.isGenerating = false;
    this.sidebarOpen = false;
    
    this.colors = ['#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#f3e8ff', '#ffe4e6', '#ffedd5', '#ecfdf5', '#e0f2fe', '#fae8ff', '#f3f4f6'];
    
    this.injectStyles();
  }

  async init() {
    this.sheets = (await this.roche.storage.get("moyu-sheets")) || [];
    this.sheets = this.sheets.map(sheet => ({
      ...sheet,
      customWorldbook: sheet.customWorldbook || "",
      mountedChars: Array.isArray(sheet.mountedChars) ? sheet.mountedChars : [],
      mountedConvs: Array.isArray(sheet.mountedConvs) ? sheet.mountedConvs : [],
      mountedWbs: Array.isArray(sheet.mountedWbs) ? sheet.mountedWbs : [],
      tableContextLimit: this.normalizeContextLimit(sheet.tableContextLimit ?? sheet.contextLimit ?? 30),
      generateCount: this.normalizeGenerateCount(sheet.generateCount ?? 3)
    }));
    if (this.sheets.length === 0) {
      this.sheets.push({
        id: crypto.randomUUID(),
        name: "默认吃瓜组",
        context: "你是一个高强度冲浪的群聊吃瓜群众。发言要像朋友群里接话、吐槽、拱火，不要像各说各话。",
        customWorldbook: "", 
        mountedChars: [],
        mountedConvs: [],
        mountedWbs: [],
        tableContextLimit: 30,
        generateCount: 3
      });
      await this.saveSheets();
    }
    this.activeSheetId = this.sheets[0].id;
    await this.loadSheetData();
    this.render();
  }

  destroy() {
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl);
    }
  }

  injectStyles() {
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = `
      /* 释放高度限制，允许被原生页面滚动 */
      .roche-plugin-moyu-docs {
        display: block; 
        width: 100%;
        min-height: 100vh; 
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: var(--color-text, #333);
        background: var(--color-bg, #f5f5f5);
        position: relative;
      }
      .moyu-dark .roche-plugin-moyu-docs {
        color: #eee;
        background: #1e1e1e;
      }
      
      @media (min-width: 769px) {
        .roche-plugin-moyu-docs { display: flex; align-items: flex-start; }
      }
      
      /* --- 侧边栏 --- */
      .moyu-sidebar {
        width: 260px;
        flex: 0 0 260px;
        max-width: 82vw;
        border-right: 1px solid rgba(128, 128, 128, 0.2);
        display: flex;
        flex-direction: column;
        background: rgba(255, 255, 255, 0.95); /* 加强背景不透明度 */
        backdrop-filter: blur(10px);
        z-index: 1000; /* 保证在最顶层 */
      }
      .moyu-dark .moyu-sidebar {
        background: rgba(30, 30, 30, 0.95);
      }
      
      @media (min-width: 769px) {
        .moyu-sidebar { position: sticky; top: 0; height: 100vh; }
      }
      
      .moyu-sidebar-header {
        /* 加入安全区 Padding，防止和系统状态栏/原生标题打架 */
        padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px 16px 16px;
        font-size: 18px;
        font-weight: 600;
        border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .moyu-sheet-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }
      .moyu-sheet-item {
        padding: 12px 14px;
        border-radius: 10px;
        cursor: pointer;
        margin-bottom: 6px;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 500;
      }
      .moyu-sheet-item:hover { background: rgba(128, 128, 128, 0.1); }
      .moyu-sheet-item.active {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }
      
      /* --- 主内容区 --- */
      .moyu-main {
        width: 100%;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      @media (min-width: 769px) {
        .moyu-main { flex: 1; }
      }

      /* 统一的粘性吸顶容器 - 阻挡帖子飞上去的关键 */
      .moyu-sticky-top {
        position: sticky;
        top: 0;
        z-index: 101; /* 必须高于帖子的层级 */
        background: #fff; /* 必须是纯色实心，才能盖住底部划上来的帖子 */
        display: flex;
        flex-direction: column;
        box-shadow: 0 1px 3px rgba(0,0,0,0.03); 
      }
      .moyu-dark .moyu-sticky-top { 
        background: #121212; 
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      
      .moyu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        /* 同样加入顶栏安全区 Padding，给刘海留足空间 */
        padding: calc(env(safe-area-inset-top, 0px) + 10px) 18px 10px 18px;
        min-height: 64px;
        box-sizing: border-box;
        border-bottom: 1px solid rgba(128, 128, 128, 0.1);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-weight: 600;
      }
      .moyu-header-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
      .moyu-header-btn {
        width: 40px; height: 40px; border-radius: 999px; background: transparent; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; color: inherit; transition: background 0.2s, transform 0.2s;
      }
      .moyu-header-btn:hover { background: rgba(128,128,128,0.1); }
      .moyu-header-btn:active { transform: scale(0.96); }
      .moyu-header-btn svg { width: 24px; height: 24px; fill: currentColor; }
      .moyu-header-copy { min-width: 0; display: flex; flex-direction: column; }
      .moyu-header-title { font-size: 17px; line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 56vw; }
      .moyu-header-subtitle { margin-top: 2px; font-size: 11px; line-height: 1.1; color: #9ca3af; font-weight: 500; }
      .moyu-header-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .moyu-header-action {
        width: 38px; height: 38px; border-radius: 999px; border: none; background: transparent; color: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; transition: transform 0.2s, background 0.2s;
      }
      .moyu-header-action:hover { background: rgba(128,128,128,0.1); }
      .moyu-header-action:active { transform: scale(0.96); }
      .moyu-header-action svg { width: 20px; height: 20px; fill: currentColor; }
      
      .moyu-toolbar {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .moyu-btn {
        padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(128, 128, 128, 0.3); background: transparent; cursor: pointer; font-size: 14px; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: inherit; font-weight: 500;
      }
      .moyu-btn svg { width: 18px; height: 18px; fill: currentColor; }
      .moyu-btn:hover { background: rgba(128, 128, 128, 0.1); }
      .moyu-btn.primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }
      .moyu-btn.primary:hover { background: #2563eb; }
      .moyu-btn.magic { color: #8b5cf6; border-color: rgba(139, 92, 246, 0.5); }
      .moyu-btn.magic:hover { background: rgba(139, 92, 246, 0.1); }
      
      .moyu-fab-group {
        position: fixed;
        right: 22px;
        bottom: 22px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 130;
      }
      .moyu-fab {
        width: 56px; height: 56px; border-radius: 999px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 18px 34px rgba(0,0,0,0.22); transition: transform 0.2s, box-shadow 0.2s;
      }
      .moyu-fab:hover { transform: translateY(-2px); box-shadow: 0 22px 40px rgba(0,0,0,0.24); }
      .moyu-fab:active { transform: scale(0.96); }
      .moyu-fab svg { width: 26px; height: 26px; fill: currentColor; }
      .moyu-fab-primary { background: #111; }
      .moyu-fab-magic { background: #111; }
      
      /* 网格内容区：无需层级，自然排布在顶栏下方即可 */
      .moyu-grid-container {
        padding: 12px 12px 120px; 
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        grid-auto-rows: max-content; 
        align-items: start;
        gap: 1px;
        background: transparent;
      }
      
      .moyu-card {
        border-radius: 0;
        padding: 10px;
        min-height: 128px;
        box-shadow: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: transform 0.2s;
        color: #222;
        position: relative;
        z-index: 1; /* 保证卡片本身基础层级 */
      }
      .moyu-card:hover { transform: none; box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35); }
      .moyu-card-header { display: flex; justify-content: space-between; align-items: flex-start; }
      .moyu-card-author { font-weight: 700; display: flex; align-items: center; gap: 6px; font-size: 12px; }
      .moyu-card-time { font-size: 10px; opacity: 0.55; }
      .moyu-card-content { font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
      
      .moyu-card-content strong { font-weight: bold; color: #000; }
      .moyu-card-content em { font-style: italic; opacity: 0.8; }
      .moyu-card-content a { color: #2563eb; text-decoration: underline; }
      
      .moyu-card-footer { display: flex; justify-content: flex-end; margin-top: 8px; }
      .moyu-card-delete { opacity: 0; transition: opacity 0.2s; padding: 4px; border:none; background:transparent; color: #ef4444; cursor: pointer; border-radius: 4px;}
      .moyu-card-delete svg { width: 16px; height: 16px; fill: currentColor; }
      .moyu-card:hover .moyu-card-delete { opacity: 1; }
      .moyu-card-delete:hover { background: rgba(239, 68, 68, 0.1); }

      .moyu-stream-indicator { display: inline-block; width: 8px; height: 16px; background: #3b82f6; animation: blink 1s infinite; vertical-align: middle; margin-left: 4px; }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

      /* Modals */
      .moyu-modal-overlay {
        position: fixed; 
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000; /* 最顶层 */
        backdrop-filter: blur(4px);
      }
      .moyu-modal {
        background: #fff; border-radius: 16px; width: 600px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }
      .moyu-dark .moyu-modal { background: #1e1e1e; border: 1px solid #333; }
      .moyu-modal-header { padding: 20px 24px; border-bottom: 1px solid rgba(128, 128, 128, 0.2); font-size: 20px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;}
      .moyu-modal-body { padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 20px; }
      .moyu-modal-footer { padding: 16px 24px; border-top: 1px solid rgba(128, 128, 128, 0.2); display: flex; justify-content: flex-end; gap: 12px; background: rgba(128,128,128,0.02); border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;}
      
      .moyu-input, .moyu-textarea { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(128, 128, 128, 0.3); background: transparent; color: inherit; font-family: inherit; box-sizing: border-box; font-size: 14px; transition: border-color 0.2s; }
      .moyu-input:focus, .moyu-textarea:focus { border-color: #3b82f6; outline: none; }
      .moyu-textarea { min-height: 120px; resize: vertical; }
      .moyu-label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 15px; }
      .moyu-hint { font-size: 12px; color: gray; margin-top: 4px; line-height: 1.4; }
      .moyu-checkbox-group { max-height: 180px; overflow-y: auto; border: 1px solid rgba(128,128,128,0.2); border-radius: 8px; padding: 12px; background: rgba(128,128,128,0.02); }
      .moyu-checkbox-item { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer; }
      .moyu-checkbox-item:last-child { margin-bottom: 0; }
      .moyu-checkbox-item input { width: 16px; height: 16px; cursor: pointer; }
      .moyu-wb-category { border-bottom: 1px solid rgba(128,128,128,0.12); padding-bottom: 8px; margin-bottom: 8px; }
      .moyu-wb-category:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
      .moyu-wb-category-name { font-weight: 700; }
      .moyu-wb-entry { padding-left: 26px; font-size: 13px; opacity: 0.92; }
      .moyu-wb-count { margin-left: auto; font-size: 11px; color: #9ca3af; }
      
      .moyu-sidebar-overlay { 
        display: none; 
        position: fixed; 
        top:0; left:0; right:0; bottom:0; 
        background: rgba(0,0,0,0.4); 
        z-index: 999; 
      }
      
      @media (max-width: 768px) {
        .moyu-sidebar {
          position: fixed;
          top: 0;
          bottom: 0;
          left: -280px;
          height: auto;
          box-shadow: 2px 0 10px rgba(0,0,0,0.1);
          transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1000;
        }
        .moyu-sidebar.open { left: 0; }
        .moyu-sidebar.open + .moyu-sidebar-overlay { display: block; }
        
        .moyu-toolbar { 
          padding: 10px 12px; gap: 8px; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; 
        }
        .moyu-btn { white-space: nowrap; padding: 8px 12px; }
        .moyu-grid-container { padding: 8px 8px 100px; gap: 1px; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); }
        .moyu-fab-group { right: 16px; bottom: 18px; }
        .moyu-fab { width: 54px; height: 54px; }
      }
      @media (min-width: 769px) {
        .moyu-btn-menu { display: none !important; }
        .moyu-toolbar { display: none; }
      }
    `;
    document.head.appendChild(this.styleEl);
  }

  icons = {
    back: '<svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    magic: '<svg viewBox="0 0 24 24"><path d="M2.81 14.12L5.64 11.3l2.82 2.82-2.83 2.82-2.82-2.82zm14.14-11.3l2.82 2.82-2.83 2.83-2.82-2.82 2.83-2.83zM12 4l1.41 4.59L18 10l-4.59 1.41L12 16l-1.41-4.59L6 10l4.59-1.41L12 4zm0 2.83L11.19 9 9 9.81 11.19 10.6 12 12.83l.81-2.23L15 9.81 12.81 9 12 6.83z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22l-1.92 3.32c-.12.21-.07.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>'
  };

  async saveSheets() {
    await this.roche.storage.set("moyu-sheets", this.sheets);
  }

  async loadSheetData() {
    if (!this.activeSheetId) return;
    this.currentData = (await this.roche.storage.get(`moyu-sheet-data-${this.activeSheetId}`)) || [];
  }

  async saveSheetData() {
    if (!this.activeSheetId) return;
    await this.roche.storage.set(`moyu-sheet-data-${this.activeSheetId}`, this.currentData);
  }

  getActiveSheet() {
    return this.sheets.find(s => s.id === this.activeSheetId) || null;
  }

  normalizeContextLimit(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 50;
    return Math.min(200, Math.max(1, Math.round(number)));
  }

  normalizeGenerateCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 3;
    return Math.min(12, Math.max(1, Math.round(number)));
  }

  async loadWorldbookTree() {
    try {
      if (this.roche.worldbook?.getCategoryTree) {
        return await this.roche.worldbook.getCategoryTree();
      }

      const categories = await this.roche.worldbook.list();
      const entries = this.roche.worldbook.getEntries
        ? await this.roche.worldbook.getEntries()
        : [];

      return (categories || []).map(category => ({
        ...category,
        entries: (entries || []).filter(entry => entry.categoryId === category.id)
      }));
    } catch (e) {
      console.warn("[MoyuDocs] Failed to load worldbook tree:", e);
      return [];
    }
  }

  renderWorldbookOptions(tree, selectedIds) {
    const selected = new Set(selectedIds || []);
    return (tree || []).map(category => {
      const entries = category.entries || [];
      const entryHtml = entries.map(entry => `
        <label class="moyu-checkbox-item moyu-wb-entry" title="${this.escapeHtml(entry.title || entry.name || '')}">
          <input type="checkbox" value="${this.escapeHtml(entry.id)}" class="chk-wb" data-kind="entry" ${selected.has(category.id) || selected.has(entry.id) ? 'checked' : ''}>
          <span>${this.escapeHtml(entry.title || entry.name || 'Untitled Entry')}</span>
        </label>
      `).join('');

      return `
        <div class="moyu-wb-category">
          <label class="moyu-checkbox-item" title="${this.escapeHtml(category.name || category.title || '')}">
            <input type="checkbox" value="${this.escapeHtml(category.id)}" class="chk-wb" data-kind="category" ${selected.has(category.id) ? 'checked' : ''}>
            <span class="moyu-wb-category-name">${this.escapeHtml(category.name || category.title || 'Untitled Category')}</span>
            <span class="moyu-wb-count">${entries.length}</span>
          </label>
          ${entryHtml || '<div class="moyu-hint" style="padding-left:26px;">No entries</div>'}
        </div>
      `;
    }).join('');
  }

  async buildWorldbookContext(selectedIds) {
    const selected = new Set(selectedIds || []);
    if (selected.size === 0) return "";

    const tree = await this.loadWorldbookTree();
    const parts = [];

    for (const category of tree) {
      const entries = category.entries || [];
      const selectedEntries = entries.filter(entry => selected.has(category.id) || selected.has(entry.id));
      if (selectedEntries.length === 0) continue;

      parts.push(`\n[Worldbook: ${category.name || category.title || category.id}]`);
      selectedEntries.forEach(entry => {
        parts.push(`【${entry.title || entry.name || entry.id}】\n${entry.content || ''}`);
      });
    }

    return parts.join("\n");
  }

  getRandomColor() {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  }

  formatTime(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  parseMarkdown(str) {
    if (!str) return '';
    let html = this.escapeHtml(str);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  extractContentFromValue(value) {
    if (value == null) return "";
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map(item => this.extractContentFromValue(item)).join("");
    }
    if (typeof value !== 'object') return "";

    let text = "";
    if (value.choices) text += this.extractContentFromValue(value.choices);
    if (value.delta) text += this.extractContentFromValue(value.delta);
    if (value.message) text += this.extractContentFromValue(value.message);
    if (typeof value.content === 'string') text += value.content;
    if (typeof value.textDelta === 'string') text += value.textDelta;
    if (typeof value.text === 'string') text += value.text;
    return text;
  }

  extractStreamText(chunk) {
    if (typeof chunk !== 'string') {
      return this.extractContentFromValue(chunk);
    }

    const raw = String(chunk);
    const lines = raw.split(/\r?\n/);
    let parsedText = "";
    let sawStructuredChunk = false;
    let plainText = "";

    for (const line of lines) {
      let piece = line.trim();
      if (!piece) continue;

      if (piece.startsWith('data:')) {
        sawStructuredChunk = true;
        piece = piece.slice(5).trim();
      }
      if (!piece || piece === '[DONE]') continue;

      const looksJson = piece.startsWith('{') || piece.startsWith('[');
      if (looksJson) sawStructuredChunk = true;

      try {
        parsedText += this.extractContentFromValue(JSON.parse(piece));
        continue;
      } catch (e) {
      }

      if (!looksJson && !piece.startsWith('event:')) {
        plainText += piece;
      }
    }

    if (parsedText) return parsedText;
    if (sawStructuredChunk) return "";
    return plainText || raw;
  }

  formatChineseError(error) {
    const message = error?.message || String(error || "");
    if (/failed to fetch|network|load failed|fetch/i.test(message)) {
      return "网络请求失败，请检查 API 地址、代理或网络连接";
    }
    if (/timeout/i.test(message)) {
      return "请求超时，请稍后重试或检查模型配置";
    }
    if (/unauthorized|forbidden|401|403/i.test(message)) {
      return "鉴权失败，请检查 API Key 或权限";
    }
    if (/quota|rate limit|429/i.test(message)) {
      return "请求过于频繁或额度不足，请稍后再试";
    }
    return message || "未知错误";
  }

  parseGeneratedRows(text, maxCount) {
    const count = this.normalizeGenerateCount(maxCount);
    const cleaned = String(text || "")
      .replace(/```[\s\S]*?```/g, block => block.replace(/```[a-z]*|```/gi, ""))
      .trim();
    if (!cleaned) return [];

    const lines = cleaned
      .split(/\r?\n+/)
      .map(line => line.replace(/^\s*(?:[-*]|\d+[.、)]|\d+\s*[:：])\s*/, '').trim())
      .filter(Boolean);

    const source = lines.length > 0 ? lines : [cleaned];
    return source.slice(0, count).map(line => {
      const match = line.match(/^(?:【|\[)?(.{1,16}?)(?:】|\])?\s*[:：]\s*(.+)$/s);
      if (match && match[2]?.trim()) {
        return {
          authorName: match[1].trim(),
          content: match[2].trim()
        };
      }
      return {
        authorName: "神秘群众",
        content: line.trim()
      };
    }).filter(row => row.content);
  }

  waitForPaint() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  extractBufferedStreamText(raw, state, force = false) {
    state.buffer = `${state.buffer || ""}${raw || ""}`;
    let output = "";

    if (/\r?\n/.test(state.buffer)) {
      const lines = state.buffer.split(/\r?\n/);
      state.buffer = force ? "" : (lines.pop() || "");
      lines.forEach(line => {
        output += this.extractStreamText(line);
      });
    }

    if (!output && state.buffer) {
      const direct = this.extractStreamText(state.buffer);
      if (direct) {
        output += direct;
        state.buffer = "";
      }
    }

    if (force && state.buffer) {
      output += this.extractStreamText(state.buffer);
      state.buffer = "";
    }

    return output;
  }

  render() {
    this.container.innerHTML = `
      <div class="roche-plugin-moyu-docs">
        <div class="moyu-sidebar" id="moyu-sidebar">
          <div class="moyu-sidebar-header">
            <span>摸鱼文档 🐟</span>
            <button class="moyu-btn" id="moyu-btn-new-sheet" style="padding: 4px;" title="新建文档">${this.icons.add}</button>
          </div>
          <div class="moyu-sheet-list" id="moyu-sheet-list"></div>
        </div>
        <div class="moyu-sidebar-overlay" id="moyu-overlay"></div>
        
        <div class="moyu-main">
          
          <div class="moyu-sticky-top">
            <div class="moyu-header">
              <div class="moyu-header-left">
                <button class="moyu-header-btn" id="moyu-btn-back" title="Back">${this.icons.back}</button>
                <div class="moyu-header-copy">
                  <div class="moyu-header-title">${this.escapeHtml(this.getActiveSheet()?.name || 'MOYU DOCS')}</div>
                  <div class="moyu-header-subtitle">Gossip Spreadsheet</div>
                </div>
              </div>
              <div class="moyu-header-actions">
                <button class="moyu-header-action" id="moyu-btn-settings-top" title="上下文配置">${this.icons.settings}</button>
                <button class="moyu-header-action" id="moyu-btn-export" title="导出">${this.icons.download}</button>
                <button class="moyu-header-action" id="moyu-btn-delete-sheet" title="删除文档组">${this.icons.trash}</button>
              </div>
            </div>
            <div class="moyu-toolbar">
              <button class="moyu-btn moyu-btn-menu" id="moyu-btn-menu" title="文档列表">${this.icons.menu}</button>
              <button class="moyu-btn" id="moyu-btn-new-sheet-top" title="新建表格">${this.icons.add} 新表格</button>
            </div>
          </div>

          <div class="moyu-grid-container" id="moyu-grid-container">
            <!-- Masonry/Grid items will go here -->
          </div>

          <div class="moyu-fab-group">
            <button class="moyu-fab moyu-fab-magic" id="moyu-btn-npc" title="召唤吃瓜群众">${this.icons.magic}</button>
            <button class="moyu-fab moyu-fab-primary" id="moyu-btn-post" title="记录一笔">${this.icons.add}</button>
          </div>

        </div>
      </div>
    `;

    this.container.querySelector('#moyu-btn-back').onclick = () => {
       this.roche.ui?.closeApp?.();
    };
    this.container.querySelector('#moyu-btn-settings-top').onclick = () => this.showSettingsModal();

    const sidebar = this.container.querySelector('#moyu-sidebar');
    const overlay = this.container.querySelector('#moyu-overlay');
    this.container.querySelector('#moyu-btn-menu').onclick = () => {
      this.sidebarOpen = true;
      sidebar.classList.add('open');
    };
    overlay.onclick = () => {
      this.sidebarOpen = false;
      sidebar.classList.remove('open');
    };

    const listEl = this.container.querySelector('#moyu-sheet-list');
    this.sheets.forEach(sheet => {
      const el = document.createElement('div');
      el.className = `moyu-sheet-item ${sheet.id === this.activeSheetId ? 'active' : ''}`;
      el.innerHTML = `
        <span style="display:flex; align-items:center;">${this.icons.book}</span>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(sheet.name)}</span>
      `;
      el.onclick = async () => {
        if (this.isGenerating) {
          this.roche.ui.toast("AI 正在生成中，请稍后切换");
          return;
        }
        this.activeSheetId = sheet.id;
        this.sidebarOpen = false;
        sidebar.classList.remove('open');
        await this.loadSheetData();
        this.render();
      };
      listEl.appendChild(el);
    });

    this.renderGrid();

    this.container.querySelector('#moyu-btn-new-sheet').onclick = () => this.showNewSheetModal();
    this.container.querySelector('#moyu-btn-new-sheet-top').onclick = () => this.showNewSheetModal();
    this.container.querySelector('#moyu-btn-post').onclick = () => this.showPostModal();
    this.container.querySelector('#moyu-btn-npc').onclick = () => this.generateNPCGossip();
    this.container.querySelector('#moyu-btn-export').onclick = () => this.exportTxt();
    this.container.querySelector('#moyu-btn-delete-sheet').onclick = () => this.deleteSheet();
  }

  renderGrid() {
    const container = this.container.querySelector('#moyu-grid-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (this.currentData.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: gray; padding: 60px; font-size: 16px;">这片墙空空如也，快来贴上你的第一张瓜田便利贴吧！</div>`;
      return;
    }

    this.currentData.forEach(row => {
      const card = document.createElement('div');
      card.className = 'moyu-card';
      if (!row.color) {
        row.color = this.getRandomColor();
      }
      card.style.backgroundColor = row.color;
      
      const authorInitial = row.authorName ? row.authorName.charAt(0) : '?';
      
      card.innerHTML = `
        <div class="moyu-card-header">
          <div class="moyu-card-author">
            <span style="display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:rgba(0,0,0,0.1); color:#000; font-size:10px; font-weight:bold; flex:0 0 auto;">
              ${this.escapeHtml(authorInitial)}
            </span>
            ${this.escapeHtml(row.authorName)}
          </div>
          <div class="moyu-card-time">${this.formatTime(row.createdAt)}</div>
        </div>
        <div class="moyu-card-content">${this.parseMarkdown(row.content)}${row.isStreaming ? '<span class="moyu-stream-indicator"></span>' : ''}</div>
        ${row.isStreaming ? '' : `
          <div class="moyu-card-footer">
            <button class="moyu-card-delete" title="删除" onclick="window.moyuDeleteCard('${row.id}')">${this.icons.trash}</button>
          </div>
        `}
      `;
      container.appendChild(card);
    });

    window.moyuDeleteCard = async (id) => {
      if (await this.roche.ui.confirm({ title: "删除记录", message: "确定撕掉这张便利贴吗？" })) {
        this.currentData = this.currentData.filter(d => d.id !== id);
        await this.saveSheetData();
        this.renderGrid();
      }
    };
    
    setTimeout(() => {
      if (container.lastElementChild && typeof container.lastElementChild.scrollIntoView === 'function') {
        container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100);
  }

  bindWorldbookTreeCheckboxes(modal) {
    const categoryBlocks = Array.from(modal.querySelectorAll('.moyu-wb-category'));

    const updateCategoryState = (block) => {
      const categoryInput = block.querySelector('.chk-wb[data-kind="category"]');
      const entryInputs = Array.from(block.querySelectorAll('.chk-wb[data-kind="entry"]'));
      if (!categoryInput || entryInputs.length === 0) return;

      const checkedCount = entryInputs.filter(input => input.checked).length;
      categoryInput.checked = checkedCount === entryInputs.length;
      categoryInput.indeterminate = checkedCount > 0 && checkedCount < entryInputs.length;
    };

    categoryBlocks.forEach(block => {
      const categoryInput = block.querySelector('.chk-wb[data-kind="category"]');
      const entryInputs = Array.from(block.querySelectorAll('.chk-wb[data-kind="entry"]'));

      if (categoryInput) {
        categoryInput.addEventListener('change', () => {
          entryInputs.forEach(input => {
            input.checked = categoryInput.checked;
          });
          categoryInput.indeterminate = false;
        });
      }

      entryInputs.forEach(input => {
        input.addEventListener('change', () => updateCategoryState(block));
      });

      updateCategoryState(block);
    });
  }

  showModal(title, bodyHtml, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'moyu-modal-overlay';
    
    const isDark = document.body.classList.contains('dark') || document.documentElement.classList.contains('dark');
    if(isDark) overlay.classList.add('moyu-dark');

    const modal = document.createElement('div');
    modal.className = 'moyu-modal';
    
    modal.innerHTML = `
      <div class="moyu-modal-header">${title} <button class="moyu-btn-close" style="border:none;background:transparent;cursor:pointer;font-size:20px;">&times;</button></div>
      <div class="moyu-modal-body">${bodyHtml}</div>
      <div class="moyu-modal-footer">
        <button class="moyu-btn btn-cancel">取消</button>
        <button class="moyu-btn primary btn-confirm">确定保存</button>
      </div>
    `;

    overlay.appendChild(modal);
    this.container.appendChild(overlay); 
    this.bindWorldbookTreeCheckboxes(modal);

    const close = () => {
       if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    
    modal.querySelector('.moyu-btn-close').onclick = close;
    modal.querySelector('.btn-cancel').onclick = close;
    modal.querySelector('.btn-confirm').onclick = async () => {
      try {
        await onConfirm(modal);
        close();
      } catch (e) {
        this.roche.ui.toast("保存失败：" + this.formatChineseError(e));
      }
    };
  }

  showNewSheetModal() {
    this.showModal(
      "新建摸鱼文档",
      `<div>
        <label class="moyu-label">文档组名称</label>
        <input type="text" id="new-sheet-name" class="moyu-input" placeholder="输入超好听的名字...">
      </div>`,
      async (modal) => {
        const name = modal.querySelector('#new-sheet-name').value.trim();
        if (!name) throw new Error("名称不能为空");
        const id = crypto.randomUUID();
        this.sheets.push({
          id, name,
          context: "你是一个高强度冲浪的群聊吃瓜群众。发言要像朋友群里接话、吐槽、拱火，不要像各说各话。",
          customWorldbook: "",
          mountedChars: [], mountedConvs: [], mountedWbs: [],
          tableContextLimit: 30
        });
        await this.saveSheets();
        this.activeSheetId = id;
        await this.loadSheetData();
        this.render();
      }
    );
  }

  async showPostModal() {
    let defaultName = "我";
    try {
      const userPersona = await this.roche.persona.getActiveUserPersona();
      if (userPersona) defaultName = userPersona.handle || userPersona.name;
    } catch(e) {}

    this.showModal(
      "记录一笔大瓜",
      `
      <div>
        <label class="moyu-label">发布者</label>
        <input type="text" id="post-author" class="moyu-input" value="${this.escapeHtml(defaultName)}">
      </div>
      <div>
        <label class="moyu-label">内容 (支持Markdown加粗和链接)</label>
        <textarea id="post-content" class="moyu-textarea" placeholder="在这里写下你的摸鱼记录或吃瓜见闻..."></textarea>
      </div>
      `,
      async (modal) => {
        const author = modal.querySelector('#post-author').value.trim() || "匿名";
        const content = modal.querySelector('#post-content').value.trim();
        if (!content) throw new Error("内容不能为空");

        this.currentData.push({
          id: crypto.randomUUID(),
          authorName: author,
          content: content,
          createdAt: Date.now(),
          color: this.getRandomColor()
        });
        await this.saveSheetData();
        this.renderGrid();
      }
    );
  }

  async showSettingsModal() {
    const sheet = this.sheets.find(s => s.id === this.activeSheetId);
    if (!sheet) return;

    let chars = [], convs = [], wbs = [];
    try { chars = await this.roche.character.list(); } catch(e){}
    try { convs = await this.roche.conversation.list(); } catch(e){}
    try { wbs = await this.loadWorldbookTree(); } catch(e){}

    const charOptions = chars.map(c => `
      <label class="moyu-checkbox-item">
        <input type="checkbox" value="${c.id}" class="chk-char" ${sheet.mountedChars?.includes(c.id) ? 'checked' : ''}>
        ${this.escapeHtml(c.handle || c.name)}
      </label>
    `).join('');

    const convOptions = convs.map(c => `
      <label class="moyu-checkbox-item">
        <input type="checkbox" value="${c.id}" class="chk-conv" ${sheet.mountedConvs?.includes(c.id) ? 'checked' : ''}>
        ${this.escapeHtml(c.title || c.name || '未命名会话')}
      </label>
    `).join('');
    
    const wbOptionsTree = this.renderWorldbookOptions(wbs, sheet.mountedWbs || []);

    this.showModal(
      "配置上下文与挂载信息",
      `
      <div>
        <label class="moyu-label">生成口吻与格式规则</label>
        <textarea id="settings-context" class="moyu-textarea" style="min-height: 80px;" placeholder="例如：像群聊闲聊一样自然，别写说明，别写 JSON...">${this.escapeHtml(sheet.context || '')}</textarea>
        <div class="moyu-hint">这里只写生成风格和格式要求；世界观、人物关系和背景资料写在下面。</div>
      </div>
      
      <div style="margin-top: 16px;">
        <label class="moyu-label">表格专属世界观 / 背景资料</label>
        <textarea id="settings-custom-wb" class="moyu-textarea" style="min-height: 80px;" placeholder="专属于本表格的背景设定，例如：本部门有一个人叫老张，喜欢喝茶...">${this.escapeHtml(sheet.customWorldbook || '')}</textarea>
        <div class="moyu-hint">不受限于全局角色，可直接写入本群组特有的背景资料、NPC清单等。</div>
      </div>

      <div style="margin-top: 16px;">
        <label class="moyu-label">表格历史上下文条数</label>
        <input type="number" id="settings-table-context-limit" class="moyu-input" min="1" max="200" step="1" value="${this.normalizeContextLimit(sheet.tableContextLimit)}">
        <div class="moyu-hint">控制生成时读取当前表格最近多少条记录。数字越大，上下文越长。</div>
      </div>

      <div style="margin-top: 16px;">
        <label class="moyu-label">每次召唤生成条数</label>
        <input type="number" id="settings-generate-count" class="moyu-input" min="1" max="12" step="1" value="${this.normalizeGenerateCount(sheet.generateCount)}">
        <div class="moyu-hint">一次召唤生成多少条表格记录。多条时会像多人同时聊天一样分行写入。</div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 16px;">
        <div>
          <label class="moyu-label">挂载角色 (载入人设)</label>
          <div class="moyu-checkbox-group">${charOptions || '<div class="moyu-hint">暂无可用角色</div>'}</div>
        </div>
        <div>
          <label class="moyu-label">挂载会话 (载入记忆库)</label>
          <div class="moyu-checkbox-group">${convOptions || '<div class="moyu-hint">暂无可用会话</div>'}</div>
        </div>
        <div>
          <label class="moyu-label">挂载全局世界书</label>
          <div class="moyu-checkbox-group">${wbOptionsTree || '<div class="moyu-hint">暂无世界书</div>'}</div>
        </div>
      </div>
      `,
      async (modal) => {
        sheet.context = modal.querySelector('#settings-context').value;
        sheet.customWorldbook = modal.querySelector('#settings-custom-wb').value;
        sheet.tableContextLimit = this.normalizeContextLimit(modal.querySelector('#settings-table-context-limit').value);
        sheet.generateCount = this.normalizeGenerateCount(modal.querySelector('#settings-generate-count').value);
        sheet.mountedChars = Array.from(modal.querySelectorAll('.chk-char:checked')).map(el => el.value);
        sheet.mountedConvs = Array.from(modal.querySelectorAll('.chk-conv:checked')).map(el => el.value);
        sheet.mountedWbs = Array.from(modal.querySelectorAll('.chk-wb:checked')).map(el => el.value);
        
        await this.saveSheets();
        this.roche.ui.toast("配置保存成功 ✨");
      }
    );
  }

  async generateNPCGossip() {
    if (this.isGenerating) return;
    const sheet = this.sheets.find(s => s.id === this.activeSheetId);
    if (!sheet) return;

    this.isGenerating = true;
    const generateCount = this.normalizeGenerateCount(sheet.generateCount);
    const rowIds = Array.from({ length: generateCount }, () => crypto.randomUUID());
    rowIds.forEach((rowId, index) => {
      this.currentData.push({
        id: rowId,
        authorName: `生成中 ${index + 1}`,
        content: "",
        createdAt: Date.now(),
        color: this.getRandomColor(),
        isStreaming: true
      });
    });
    this.renderGrid();

    try {
      let contextText = "";
      const tableRows = this.currentData
        .filter(row => !rowIds.includes(row.id) && !row.isStreaming && row.content)
        .slice(-this.normalizeContextLimit(sheet.tableContextLimit));

      if (tableRows.length > 0) {
        contextText += "\n【当前表格最近记录】\n";
        tableRows.forEach(row => {
          contextText += `- ${row.authorName || '匿名'}：${row.content}\n`;
        });
      }
      
      if (sheet.customWorldbook) {
        contextText += `\n【当前文档的特有世界书/背景信息】\n${sheet.customWorldbook}\n`;
      }
      
      if (sheet.mountedChars && sheet.mountedChars.length > 0) {
        contextText += "\n【参与的角色信息】\n";
        for (const cid of sheet.mountedChars) {
          try {
            const char = await this.roche.character.get(cid);
            if (char) contextText += `- name=${char.name || ''}; handle=${char.handle || ''}; persona=${char.persona || char.bio || ''}\n`;
          } catch(e) {}
        }
      }

      if (sheet.mountedConvs && sheet.mountedConvs.length > 0) {
        contextText += "\n【相关的历史事实与记忆】\n";
        for (const cid of sheet.mountedConvs) {
          try {
            const mem = await this.roche.memory.getLongTerm({ conversationId: cid, limit: 50 });
            if (mem.core?.summary) contextText += `- ${mem.core.summary}\n`;
            if (mem.facts) mem.facts.forEach(f => contextText += `- ${f.summaryText || f.action || f.text}\n`);
          } catch(e) {}
        }
      }
      
      if (sheet.mountedWbs && sheet.mountedWbs.length > 0) {
        const worldbookText = await this.buildWorldbookContext(sheet.mountedWbs);
        if (worldbookText) {
          contextText += `\n【挂载世界书条目】\n${worldbookText}\n`;
        }
      }

      const systemPrompt = `${sheet.context || '你是一个吃瓜群众'}\n\n${contextText}\n\n【输出规则】\n一次输出 ${generateCount} 条不同的中文吃瓜记录，每条一行；如果前面的风格规则写了“一条”，以这里的 ${generateCount} 条为准。\n不要输出 JSON、数组、代码块、解释、字段名或多余前后缀。\n固定格式：发布者：内容\n必须像群聊互动：第一条接着【当前表格最近记录】继续聊；后面的每一条都要回应上一条或前面某条，可以吐槽、追问、补刀、反驳、起哄、递梗，不要各说各话。\n可以使用“楼上”“你这”“别太离谱”“我笑死”“等一下”“所以现在是”等自然接话，但不要机械重复。\n角色信息里的 name 是姓名/身份，handle 是昵称/界面显示名；如果用已有角色发言，发布者优先用 handle。\n如果临时生成 NPC，发布者必须是冲浪感网名/群昵称，符合世界观和背景资料，不要像真实姓名，也不要无关。\n发布者最多 10 个字，内容必须是自然语言。`;

      const response = await this.roche.ai.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `严格输出 ${generateCount} 行，每行都是：发布者：内容。让这些人互相接话聊天，不要各说各的；临时 NPC 用冲浪网名。不要 JSON，不要 Markdown 代码块，不要解释。` }
        ],
        stream: true
      });

      let fullText = "";
      
      const updateRows = (text, isFinal = false) => {
        const parsedRows = this.parseGeneratedRows(text, generateCount);
        rowIds.forEach((id, index) => {
          const idx = this.currentData.findIndex(r => r.id === id);
          if (idx === -1) return;
          const row = parsedRows[index];
          if (row) {
            this.currentData[idx].authorName = row.authorName;
            this.currentData[idx].content = row.content;
          } else if (isFinal) {
            this.currentData[idx].content = "";
          }
        });
        this.renderGrid();
      };

      const processStream = async (iterable) => {
        const stringState = { buffer: "" };
        for await (const chunk of iterable) {
          const delta = typeof chunk === 'string'
            ? this.extractBufferedStreamText(chunk, stringState)
            : this.extractStreamText(chunk);
          
          if (delta) {
            fullText += delta;
            updateRows(fullText);
            await this.waitForPaint();
          }
        }
        const tail = this.extractBufferedStreamText("", stringState, true);
        if (tail) {
          fullText += tail;
          updateRows(fullText);
          await this.waitForPaint();
        }
      };

      if (response.stream) {
        await processStream(response.stream);
      } else if (response[Symbol.asyncIterator]) {
        await processStream(response);
      } else if (response.getReader) {
        const reader = response.getReader();
        const decoder = new TextDecoder();
        const stringState = { buffer: "" };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const delta = this.extractBufferedStreamText(decoder.decode(value, { stream: true }), stringState);
            if (delta) {
              fullText += delta;
              updateRows(fullText);
              await this.waitForPaint();
            }
          }
        }
        const tail = this.extractBufferedStreamText(decoder.decode(), stringState, true);
        if (tail) {
          fullText += tail;
          updateRows(fullText);
          await this.waitForPaint();
        }
      } else if (typeof response.text === 'function') {
        const rawText = await response.text();
        fullText = this.extractStreamText(rawText) || rawText;
        updateRows(fullText);
      } else if (typeof response.text === 'string') {
        fullText = this.extractStreamText(response.text) || response.text;
        updateRows(fullText);
      } else {
        const extracted = this.extractStreamText(response);
        if (extracted) {
          fullText = extracted;
          updateRows(fullText);
        }
      }

      if (!fullText || fullText.trim() === "") {
         fullText = "神秘群众：（欲言又止，可能是吃瓜还没实锤，什么都没说出...）";
      }

      updateRows(fullText, true);
      this.currentData = this.currentData.filter(row => {
        if (!rowIds.includes(row.id)) return true;
        row.isStreaming = false;
        return Boolean(row.content && row.content.trim());
      });
      this.renderGrid();
      
      await this.saveSheetData();

    } catch (e) {
      this.roche.ui.toast("生成失败：" + this.formatChineseError(e));
      this.currentData = this.currentData.filter(r => !rowIds.includes(r.id));
      this.renderGrid();
    } finally {
      this.isGenerating = false;
    }
  }

  exportTxt() {
    const sheet = this.sheets.find(s => s.id === this.activeSheetId);
    if (!sheet) return;

    let content = `=== 摸鱼文档：${sheet.name} ===\n\n`;
    this.currentData.forEach(row => {
      content += `[${this.formatTime(row.createdAt)}] ${row.authorName} :\n${row.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `摸鱼文档-${sheet.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async deleteSheet() {
    if (this.sheets.length <= 1) {
      this.roche.ui.toast("至少保留一个文档组");
      return;
    }
    if (await this.roche.ui.confirm({ title: "永久删除", message: "撕掉整面墙的便利贴？不可恢复哦！" })) {
      await this.roche.storage.delete(`moyu-sheet-data-${this.activeSheetId}`);
      this.sheets = this.sheets.filter(s => s.id !== this.activeSheetId);
      this.activeSheetId = this.sheets[0].id;
      await this.saveSheets();
      await this.loadSheetData();
      this.render();
    }
  }
}

window.RochePlugin.register({
  id: "moyu-docs",
  name: "摸鱼文档",
  version: "1.3.7",
  apps: [
    {
      id: "moyu-docs-app",
      name: "摸鱼文档",
      icon: "table_chart",
      async mount(container, roche) {
        container.classList.remove('roche-plugin-moyu-docs');
        this.app = new MoyuApp(container, roche);
        await this.app.init();
      },
      async unmount(container, roche) {
        if (this.app) {
          this.app.destroy();
        }
        container.replaceChildren();
        container.classList.remove('roche-plugin-moyu-docs');
      }
    }
  ]
});
