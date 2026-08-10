/**
 * Annotation Tool — SuperStories ecosystem canonical
 * Multi-role: Client (external feedback) / Developer (Peter → Claude Code)
 *
 * Storage: production API at annotations.superstories.com when configured,
 *          localStorage as fallback.
 *
 * Config via window.SS_ANNOTATIONS (set before this script loads):
 *   { api: 'https://annotations.superstories.com', project: 'connirae' }
 *
 * No API key in frontend — API uses Origin header for browser auth.
 *
 * REMOVE this script + the SS_ANNOTATIONS config before final production deployment.
 */

(function () {
    'use strict';

    const config = window.SS_ANNOTATIONS || {};
    const PROJECT = config.project || 'default';
    const API_URL = config.api || null;
    const API_KEY = config.key || '';
    const PAGE = window.location.pathname || '/index.html';
    const STORAGE_KEY = `ss-annotations-${PROJECT}`;
    const NAME_STORE = `ss-annotation-name-${PROJECT}`;

    const TARGETS = {
        client:    { label: 'Client',    color: '#C48A2C' },
        developer: { label: 'Developer', color: '#1F5FB4' }
    };

    let annotations = [];
    let annotationMode = false;
    let panelOpen = false;
    let currentTarget = 'client';
    let currentPriority = 'medium';
    let userName = localStorage.getItem(NAME_STORE) || '';
    let pendingClick = null;

    const storage = {
        async load() {
            if (API_URL) {
                try {
                    const headers = {};
                    if (API_KEY) headers['X-Annotation-Key'] = API_KEY;
                    const res = await fetch(`${API_URL}/annotations?project=${PROJECT}&page=${PAGE}`, { headers });
                    if (res.ok) { annotations = await res.json(); return; }
                } catch (e) { console.warn('Annotation API unavailable, using localStorage'); }
            }
            const stored = localStorage.getItem(STORAGE_KEY);
            annotations = stored ? JSON.parse(stored) : [];
            annotations = annotations.filter(a => a.page === PAGE);
        },
        async save(annotation) {
            if (API_URL) {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (API_KEY) headers['X-Annotation-Key'] = API_KEY;
                    const res = await fetch(`${API_URL}/annotations`, {
                        method: 'POST', headers, body: JSON.stringify(annotation)
                    });
                    if (res.ok) { const saved = await res.json(); annotations.push(saved); return saved; }
                } catch (e) { console.warn('Annotation API unavailable, saving locally'); }
            }
            annotation.id = Date.now();
            annotation.status = 'open';
            annotation.created_at = new Date().toISOString();
            annotations.push(annotation);
            this._saveLocal();
            return annotation;
        },
        async resolve(id) {
            if (API_URL) {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (API_KEY) headers['X-Annotation-Key'] = API_KEY;
                    const res = await fetch(`${API_URL}/annotations/${id}`, {
                        method: 'PUT', headers, body: JSON.stringify({ status: 'resolved' })
                    });
                    if (res.ok) {
                        const updated = await res.json();
                        const idx = annotations.findIndex(a => a.id === id);
                        if (idx !== -1) annotations[idx] = updated;
                        return;
                    }
                } catch (e) { /* fallthrough */ }
            }
            const ann = annotations.find(a => a.id === id);
            if (ann) { ann.status = 'resolved'; ann.resolved_in = new Date().toISOString().split('T')[0]; }
            this._saveLocal();
        },
        async remove(id) {
            if (API_URL) {
                try {
                    const headers = {};
                    if (API_KEY) headers['X-Annotation-Key'] = API_KEY;
                    const res = await fetch(`${API_URL}/annotations/${id}`, { method: 'DELETE', headers });
                    if (res.ok) { annotations = annotations.filter(a => a.id !== id); return; }
                } catch (e) { /* fallthrough */ }
            }
            annotations = annotations.filter(a => a.id !== id);
            this._saveLocal();
        },
        _saveLocal() {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            const otherPages = all.filter(a => a.page !== PAGE);
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...otherPages, ...annotations]));
        }
    };

    function detectBlock(el) {
        let current = el;
        while (current && current !== document.body) {
            if (current.dataset && current.dataset.block) return current.dataset.block;
            if (current.id) return current.id;
            const cls = current.className;
            if (typeof cls === 'string') {
                const m = cls.match(/\b(hero|nav|footer|section-[\w-]+|card-[\w-]+)\b/i);
                if (m) return m[1].toLowerCase();
            }
            current = current.parentElement;
        }
        return 'general';
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #ss-toolbar { position: fixed; bottom: 20px; right: 20px; z-index: 9999;
                display: flex; align-items: center; gap: 8px;
                background: #0f172a; color: #fff; padding: 8px 14px; border-radius: 999px;
                font-family: var(--ss-ann-font, -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);
                font-size: 12px; font-weight: 600; box-shadow: 0 4px 18px rgba(0,0,0,.22); }
            #ss-toolbar button { background: none; border: none; color: inherit;
                font-size: 15px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
                font-family: inherit; font-weight: inherit; transition: background .15s; }
            #ss-toolbar button:hover { background: rgba(255,255,255,.12); }
            #ss-toolbar .ss-active { background: ${TARGETS.client.color}; color: #fff; }
            #ss-toolbar .ss-count { min-width: 18px; text-align: center; font-variant-numeric: tabular-nums; }
            #ss-mode-bar { position: fixed; bottom: 64px; right: 20px; z-index: 9999;
                display: none; align-items: center; gap: 6px; background: #fff;
                border: 1px solid #0f172a; padding: 6px 12px; border-radius: 999px;
                font-family: var(--ss-ann-font, -apple-system,sans-serif);
                font-size: 10px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700;
                box-shadow: 0 2px 12px rgba(0,0,0,.1); }
            #ss-mode-bar.visible { display: flex; }
            #ss-mode-bar button { border: 1px solid #e2e8f0; background: #fff; color: #475569;
                padding: 4px 10px; border-radius: 999px; cursor: pointer;
                font-family: inherit; font-size: inherit; font-weight: inherit;
                text-transform: inherit; letter-spacing: inherit; transition: all .15s; }
            #ss-mode-bar button.ss-sel-client { background: ${TARGETS.client.color}; color: #fff; border-color: ${TARGETS.client.color}; }
            #ss-mode-bar button.ss-sel-developer { background: ${TARGETS.developer.color}; color: #fff; border-color: ${TARGETS.developer.color}; }
            #ss-mode-bar button.ss-sel-pri { background: #0f172a; color: #fff; border-color: #0f172a; }
            #ss-mode-bar .ss-sep { color: #cbd5e1; margin: 0 2px; }
            #ss-overlay { display: none; position: fixed; inset: 0; z-index: 9990; cursor: crosshair; }
            body.ss-annotating #ss-overlay { display: block; }
            body.ss-annotating { cursor: crosshair; }
            #ss-form { display: none; position: fixed; z-index: 10000; background: #fff;
                border: 1px solid #0f172a; border-radius: 8px; padding: 16px; width: 280px;
                box-shadow: 0 8px 32px rgba(0,0,0,.15);
                font-family: var(--ss-ann-font, -apple-system,sans-serif); font-size: 14px; }
            #ss-form label { display: block; margin-bottom: 10px; }
            #ss-form label span { display: block; font-size: 10px; text-transform: uppercase;
                letter-spacing: .1em; color: #64748b; margin-bottom: 3px; font-weight: 700; }
            #ss-form input, #ss-form textarea { width: 100%; border: 1px solid #cbd5e1;
                border-radius: 6px; padding: 7px 9px; font-family: inherit; font-size: 13px;
                background: #fff; color: #0f172a; outline: none; resize: vertical; box-sizing: border-box; }
            #ss-form input:focus, #ss-form textarea:focus { border-color: ${TARGETS.client.color}; }
            #ss-form-actions { display: flex; gap: 8px; }
            #ss-form-actions button { flex: 1; padding: 7px; border: 1px solid #0f172a;
                border-radius: 6px; background: #fff; color: #0f172a;
                font-family: inherit; font-size: 11px; font-weight: 700;
                text-transform: uppercase; letter-spacing: .05em; cursor: pointer; transition: all .15s; }
            #ss-form-save { background: #0f172a !important; color: #fff !important; }
            #ss-form-save:hover { opacity: .85; }
            .ss-pin { position: absolute; z-index: 9998; width: 24px; height: 24px;
                border-radius: 50%; font-family: var(--ss-ann-font, -apple-system,sans-serif);
                font-size: 11px; font-weight: 700; display: flex; align-items: center;
                justify-content: center; cursor: pointer; transform: translate(-50%, -50%);
                box-shadow: 0 2px 8px rgba(0,0,0,.25); transition: transform .15s; color: #fff; }
            .ss-pin:hover { transform: translate(-50%, -50%) scale(1.2); }
            .ss-pin-client { background: ${TARGETS.client.color}; }
            .ss-pin-developer { background: ${TARGETS.developer.color}; }
            .ss-bubble { position: absolute; z-index: 9999; background: #fff;
                border: 1px solid #0f172a; border-radius: 8px; padding: 14px; width: 260px;
                box-shadow: 0 4px 16px rgba(0,0,0,.12);
                font-family: var(--ss-ann-font, -apple-system,sans-serif);
                font-size: 13px; line-height: 1.5; display: none; transform: translate(-50%, 16px); }
            .ss-bubble.visible { display: block; }
            .ss-bubble-meta { font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
                margin-bottom: 6px; font-weight: 700; }
            .ss-bubble-client .ss-bubble-meta { color: ${TARGETS.client.color}; }
            .ss-bubble-developer .ss-bubble-meta { color: ${TARGETS.developer.color}; }
            .ss-bubble-text { color: #0f172a; }
            .ss-bubble-actions { display: flex; gap: 12px; margin-top: 10px; }
            .ss-bubble-actions button { font-size: 10px; text-transform: uppercase;
                letter-spacing: .08em; font-weight: 700; color: #64748b; background: none;
                border: none; cursor: pointer; padding: 0; }
            .ss-bubble-actions button:hover { color: #0f172a; }
            #ss-panel { position: fixed; top: 0; right: 0; width: 340px; height: 100vh;
                background: #fff; border-left: 1px solid #0f172a; overflow-y: auto; z-index: 10001;
                font-family: var(--ss-ann-font, -apple-system,sans-serif); font-size: 13px;
                box-shadow: -4px 0 24px rgba(0,0,0,.1); }
            #ss-panel-header { padding: 14px 16px; border-bottom: 1px solid #e2e8f0;
                display: flex; justify-content: space-between; align-items: center;
                font-size: 11px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
            #ss-panel-close { background: none; border: none; cursor: pointer; font-size: 18px; color: #0f172a; }
            .ss-panel-group { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
            .ss-panel-group-title { font-size: 10px; text-transform: uppercase;
                letter-spacing: .1em; margin-bottom: 8px; font-weight: 700; }
            .ss-panel-item { padding: 8px 0; border-bottom: 1px solid #f5f7fa; }
            .ss-panel-item-meta { font-size: 9px; text-transform: uppercase;
                letter-spacing: .1em; color: #94a3b8; font-weight: 700; }
            .ss-panel-item-text { margin-top: 3px; color: #0f172a; line-height: 1.45; }
        `;
        document.head.appendChild(style);
    }

    function createUI() {
        const overlay = document.createElement('div');
        overlay.id = 'ss-overlay';
        document.body.appendChild(overlay);

        const toolbar = document.createElement('div');
        toolbar.id = 'ss-toolbar';
        toolbar.innerHTML = `
            <button id="ss-toggle" title="Toggle annotations (Alt+A)">✎</button>
            <span class="ss-count" id="ss-count">0</span>
            <button id="ss-export" title="Export annotations as markdown">↓</button>
            <button id="ss-panel-btn" title="Open panel (Alt+P)">☰</button>
        `;
        document.body.appendChild(toolbar);

        const modeBar = document.createElement('div');
        modeBar.id = 'ss-mode-bar';
        modeBar.innerHTML = `
            <button class="ss-sel-client" data-target="client">Client</button>
            <button data-target="developer">Developer</button>
            <span class="ss-sep">·</span>
            <button data-priority="high">H</button>
            <button class="ss-sel-pri" data-priority="medium">M</button>
            <button data-priority="low">L</button>
        `;
        document.body.appendChild(modeBar);

        const form = document.createElement('div');
        form.id = 'ss-form';
        form.innerHTML = `
            <label><span>Your name</span><input type="text" id="ss-form-name" placeholder="Name" value="${userName}"></label>
            <label><span>Note</span><textarea id="ss-form-note" rows="3" placeholder="Your annotation..."></textarea></label>
            <div id="ss-form-actions">
                <button id="ss-form-save">Save</button>
                <button id="ss-form-cancel">Cancel</button>
            </div>
        `;
        document.body.appendChild(form);

        document.getElementById('ss-toggle').addEventListener('click', toggleMode);

        modeBar.querySelectorAll('[data-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTarget = btn.dataset.target;
                modeBar.querySelectorAll('[data-target]').forEach(b => {
                    b.classList.remove('ss-sel-client', 'ss-sel-developer');
                });
                btn.classList.add('ss-sel-' + currentTarget);
            });
        });

        modeBar.querySelectorAll('[data-priority]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPriority = btn.dataset.priority;
                modeBar.querySelectorAll('[data-priority]').forEach(b => b.classList.remove('ss-sel-pri'));
                btn.classList.add('ss-sel-pri');
            });
        });

        document.getElementById('ss-panel-btn').addEventListener('click', togglePanel);
        document.getElementById('ss-export').addEventListener('click', exportAnnotations);

        overlay.addEventListener('click', (e) => {
            document.querySelectorAll('.ss-bubble').forEach(b => b.classList.remove('visible'));
            pendingClick = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY };
            const formEl = document.getElementById('ss-form');
            formEl.style.display = 'block';
            formEl.style.left = Math.min(e.clientX, window.innerWidth - 300) + 'px';
            formEl.style.top = (e.clientY + 20) + 'px';
            document.getElementById('ss-form-note').value = '';
            document.getElementById('ss-form-note').focus();
        });

        document.getElementById('ss-form-save').addEventListener('click', async () => {
            const note = document.getElementById('ss-form-note').value.trim();
            const name = document.getElementById('ss-form-name').value.trim();
            if (!note) return;
            userName = name; localStorage.setItem(NAME_STORE, userName);
            const block = detectBlock(document.elementFromPoint(
                pendingClick.x - window.scrollX, pendingClick.y - window.scrollY
            ) || document.body);
            await storage.save({
                project: PROJECT, page: PAGE, block,
                target: currentTarget, priority: currentPriority,
                text: note, name: userName,
                x: pendingClick.x, y: pendingClick.y
            });
            document.getElementById('ss-form').style.display = 'none';
            renderPins(); updateCount();
        });

        document.getElementById('ss-form-cancel').addEventListener('click', () => {
            document.getElementById('ss-form').style.display = 'none';
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.ss-pin') && !e.target.closest('.ss-bubble')) {
                document.querySelectorAll('.ss-bubble').forEach(b => b.classList.remove('visible'));
            }
        });
    }

    function toggleMode() {
        annotationMode = !annotationMode;
        document.getElementById('ss-toggle').classList.toggle('ss-active', annotationMode);
        document.body.classList.toggle('ss-annotating', annotationMode);
        document.getElementById('ss-mode-bar').classList.toggle('visible', annotationMode);
    }

    function updateCount() {
        const open = annotations.filter(a => a.status !== 'resolved');
        document.getElementById('ss-count').textContent = open.length;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || ''; return div.innerHTML;
    }

    function renderPins() {
        document.querySelectorAll('.ss-pin, .ss-bubble').forEach(el => el.remove());
        const open = annotations.filter(a => a.status !== 'resolved');
        open.forEach((ann, i) => {
            const pin = document.createElement('div');
            pin.className = `ss-pin ss-pin-${ann.target || 'client'}`;
            pin.textContent = i + 1;
            pin.style.left = ann.x + 'px'; pin.style.top = ann.y + 'px';

            const bubble = document.createElement('div');
            bubble.className = `ss-bubble ss-bubble-${ann.target || 'client'}`;
            bubble.style.left = ann.x + 'px'; bubble.style.top = (ann.y + 12) + 'px';
            const targetLabel = (TARGETS[ann.target] || TARGETS.client).label;
            bubble.innerHTML = `
                <div class="ss-bubble-meta">${targetLabel} · ${ann.block || 'general'} · ${ann.priority || 'medium'} · ${escapeHtml(ann.name) || 'Anonymous'}</div>
                <div class="ss-bubble-text">${escapeHtml(ann.text)}</div>
                <div class="ss-bubble-actions">
                    <button class="ss-resolve-btn">Resolve</button>
                    <button class="ss-delete-btn">Delete</button>
                </div>
            `;

            pin.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.ss-bubble').forEach(b => b.classList.remove('visible'));
                bubble.classList.toggle('visible');
            });

            bubble.querySelector('.ss-resolve-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await storage.resolve(ann.id);
                renderPins(); updateCount();
                if (panelOpen) renderPanel();
            });

            bubble.querySelector('.ss-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await storage.remove(ann.id);
                renderPins(); updateCount();
                if (panelOpen) renderPanel();
            });

            document.body.appendChild(pin); document.body.appendChild(bubble);
        });
    }

    function togglePanel() {
        panelOpen = !panelOpen;
        if (panelOpen) renderPanel();
        else { const p = document.getElementById('ss-panel'); if (p) p.remove(); }
    }

    function renderPanel() {
        let panel = document.getElementById('ss-panel');
        if (panel) panel.remove();
        panel = document.createElement('div'); panel.id = 'ss-panel';

        const open = annotations.filter(a => a.status !== 'resolved');
        const resolved = annotations.filter(a => a.status === 'resolved');
        const clientOpen = open.filter(a => a.target === 'client');
        const devOpen = open.filter(a => a.target === 'developer');
        const order = { high: 0, medium: 1, low: 2 };
        clientOpen.sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
        devOpen.sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));

        panel.innerHTML = `
            <div id="ss-panel-header">
                <span>Annotations · ${open.length} open</span>
                <button id="ss-panel-close">✕</button>
            </div>
            ${renderGroup('Client', clientOpen, TARGETS.client.color)}
            ${renderGroup('Developer', devOpen, TARGETS.developer.color)}
            ${resolved.length ? `<div class="ss-panel-group" style="color:#94a3b8">${resolved.length} resolved</div>` : ''}
        `;

        document.body.appendChild(panel);
        document.getElementById('ss-panel-close').addEventListener('click', () => {
            panelOpen = false; panel.remove();
        });
    }

    function renderGroup(label, items, color) {
        if (!items.length) {
            return `<div class="ss-panel-group">
                <div class="ss-panel-group-title" style="color:${color}">${label} (0)</div>
                <div style="color:#94a3b8;font-size:12px">No open annotations</div>
            </div>`;
        }
        const rows = items.map(a => `
            <div class="ss-panel-item">
                <div class="ss-panel-item-meta">${a.block || 'general'} · ${a.priority || 'medium'} · ${escapeHtml(a.name) || 'Anonymous'}</div>
                <div class="ss-panel-item-text">${escapeHtml(a.text)}</div>
            </div>
        `).join('');
        return `<div class="ss-panel-group">
            <div class="ss-panel-group-title" style="color:${color}">${label} (${items.length})</div>
            ${rows}
        </div>`;
    }

    function exportAnnotations() {
        const open = annotations.filter(a => a.status !== 'resolved');
        let md = `# Annotations — ${PROJECT}\n\n`;
        md += `Page: ${PAGE}\nExported: ${new Date().toISOString().split('T')[0]}\n\n`;
        ['client', 'developer'].forEach(target => {
            const items = open.filter(a => a.target === target);
            if (!items.length) return;
            md += `## ${TARGETS[target].label}\n\n`;
            items.forEach((a, i) => {
                md += `### ${i + 1}. ${a.name || 'Anonymous'} [${a.priority || 'medium'}] — ${a.block || 'general'}\n`;
                md += `${a.text}\n\n`;
            });
        });
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `annotations-${PROJECT}.md`; link.click();
        URL.revokeObjectURL(url);
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'a') { e.preventDefault(); toggleMode(); }
        if (e.altKey && e.key === 'p') { e.preventDefault(); togglePanel(); }
        if (e.key === 'Escape') {
            document.getElementById('ss-form').style.display = 'none';
            if (annotationMode) toggleMode();
        }
    });

    async function init() {
        injectStyles(); createUI();
        await storage.load(); renderPins(); updateCount();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
})();
