import { LIMITS, clamp, copy, sizeText, openImage, canvasOf, release, defaultState, geometry, render, encode, toBlob, filename, download, sampleFile, mapRect, sourceToOutput, outputToSource, checkAbort } from './core.js';
import { createZip } from './zip.js';

const $ = id => document.getElementById(id);
const mode = document.body.dataset.imageMode;
const multi = mode === 'studio' || mode === 'batch';
let activeTab = mode === 'studio' ? 'crop' : mode === 'batch' ? 'resize' : mode;
let entries = [], selectedId = null, nextId = 1, source = null, encodedPreview = null;
let loading = false, uploading = false, batchBusy = false, zipBusy = false, computing = false;
let selection = null, showSource = false, drag = null, cropRatio = 'free';
let selectionVersion = 0, renderVersion = 0, renderTimer, renderController, batchController;
let lastEditKey = '', lastEditTime = 0;
const canvas = $('photo-canvas'), ctx = canvas.getContext('2d');
const current = () => entries.find(entry => entry.id === selectedId);
const busy = () => uploading || loading || batchBusy || zipBusy;
const announce = (message = '', error = false) => { $('photo-status').textContent = message; $('photo-status').classList.toggle('error', error); };
const errorText = message => { $('validation-error').textContent = message; $('validation-error').hidden = !message; };
const actualCrop = () => { const g = geometry(source, current().state); return { x: g.x / source.width, y: g.y / source.height, w: g.cw / source.width, h: g.ch / source.height }; };

function updateButtons() {
    const entry = current(), blocked = busy();
    $('edit-controls').disabled = !source || blocked;
    $('save-image').disabled = !entry?.result || computing || blocked;
    $('undo-edit').disabled = !entry?.past.length || blocked;
    $('redo-edit').disabled = !entry?.future.length || blocked;
    $('reset-edit').disabled = !source || blocked;
    for (const id of ['choose-photos', 'add-photos', 'demo-photo']) $(id).disabled = blocked;
    for (const id of ['apply-all', 'process-all', 'clear-queue']) $(id).disabled = !entries.length || blocked;
    $('cancel-batch').hidden = !batchBusy;
    const finished = entries.filter(item => item.result).length;
    $('save-zip').disabled = !finished || blocked;
    $('save-zip').textContent = finished ? `下載 ZIP（${finished}）` : '下載 ZIP';
    document.querySelectorAll('.edit-tabs button, .queue-select, .remove-photo').forEach(button => { button.disabled = blocked; });
    $('show-source').disabled = $('show-edited').disabled = blocked;
    if (entry) {
        for (const id of ['resize-width', 'resize-height', 'resize-lock', 'resize-x', 'resize-y']) $(id).disabled = !entry.state.resize.enabled;
    }
}
function tabs() {
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== activeTab; });
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === activeTab)));
}
function queue() {
    $('queue-count').textContent = String(entries.length);
    const list = $('photo-list'); list.replaceChildren();
    for (const entry of entries) {
        const row = document.createElement('div'); row.className = 'queue-row' + (entry.id === selectedId ? ' active' : '');
        const button = document.createElement('button'); button.className = 'queue-select'; button.setAttribute('aria-pressed', String(entry.id === selectedId));
        const img = document.createElement('img'); img.src = entry.thumb; img.alt = '';
        const info = document.createElement('span'); info.className = 'queue-info';
        const name = document.createElement('span'); name.className = 'queue-name'; name.textContent = entry.file.name; name.title = entry.file.name;
        const state = document.createElement('span'); state.className = 'queue-state' + (entry.error ? ' error' : '');
        state.textContent = entry.error || (entry.result ? `${entry.result.width} × ${entry.result.height} · ${sizeText(entry.result.blob.size)}${entry.result.metTarget ? '' : ' · 未達目標'}` : '待處理');
        info.append(name, state); button.append(img, info); button.addEventListener('click', () => { if (!busy()) selectEntry(entry.id); });
        const remove = document.createElement('button'); remove.className = 'remove-photo'; remove.textContent = '×'; remove.setAttribute('aria-label', `移除 ${entry.file.name}`);
        remove.addEventListener('click', () => removeEntry(entry.id)); row.append(button, remove); list.append(row);
    }
    updateButtons();
}
function setValue(id, value) { if (document.activeElement !== $(id)) $(id).value = String(value); }
function syncControls() {
    const entry = current(); if (!entry) return;
    const s = entry.state;
    $('crop-ratio').value = cropRatio;
    for (const [id, value] of [['crop-x', s.crop.x * entry.width], ['crop-y', s.crop.y * entry.height], ['crop-width', s.crop.w * entry.width], ['crop-height', s.crop.h * entry.height]]) setValue(id, Math.round(value));
    $('crop-x').max = entry.width - 1; $('crop-y').max = entry.height - 1; $('crop-width').max = entry.width; $('crop-height').max = entry.height;
    $('flip-x').setAttribute('aria-pressed', String(s.flipX)); $('flip-y').setAttribute('aria-pressed', String(s.flipY));
    $('resize-enabled').checked = s.resize.enabled; $('resize-lock').checked = s.resize.lock; $('resize-smoothing').checked = s.smoothing;
    let g; try { g = geometry(entry, s); } catch {}
    setValue('resize-width', g?.width ?? s.resize.width); setValue('resize-height', g?.height ?? s.resize.height);
    for (const [id, numerator, denominator] of [['resize-x', g?.width, g?.baseWidth], ['resize-y', g?.height, g?.baseHeight]]) {
        const value = g ? numerator / denominator * 100 : 100;
        $(id).min = Math.min(10, value); $(id).max = Math.max(300, Math.ceil(value));
        setValue(id, value); $(id + '-value').value = `${Number(value.toFixed(1))}%`;
    }
    $('blur-mode').value = s.blur.mode; $('blur-radius').value = s.blur.radius; $('blur-value').value = s.blur.radius;
    $('region-actions').hidden = s.blur.mode !== 'regions';
    $('region-list').replaceChildren();
    s.blur.regions.forEach((region, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'region-chip'; button.textContent = `區域 ${index + 1} ×`; button.setAttribute('aria-label', `移除模糊區域 ${index + 1}`);
        button.addEventListener('click', () => edit(state => state.blur.regions.splice(index, 1))); $('region-list').append(button);
    });
    setValue('target-kb', s.targetKB || ''); $('auto-reduce').checked = s.autoReduce;
    $('output-format').value = s.format; $('output-quality').value = Math.round(s.quality * 100); $('quality-value').value = `${Math.round(s.quality * 100)}%`;
    $('quality-field').hidden = s.format === 'image/png';
    $('selected-name').textContent = entry.file.name;
    $('source-dimensions').textContent = `${entry.width.toLocaleString()} × ${entry.height.toLocaleString()}`;
    $('before-size').textContent = sizeText(entry.file.size);
    updateButtons();
}
function drawOutline(rect, shade = false) {
    const x = rect.x * canvas.width, y = rect.y * canvas.height, w = rect.w * canvas.width, h = rect.h * canvas.height;
    if (shade) {
        ctx.fillStyle = '#17271bcc';
        ctx.fillRect(0, 0, canvas.width, y); ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
        ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, canvas.width - x - w, h);
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, canvas.width / 500); ctx.setLineDash([8, 5]);
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    if (shade) {
        ctx.fillStyle = '#fff'; const handle = Math.max(5, canvas.width / 120);
        for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) ctx.fillRect(px - handle / 2, py - handle / 2, handle, handle);
    }
}
function drawPreview() {
    const entry = current(); if (!source || !entry) return;
    const s = entry.state, original = showSource || selection === 'crop';
    let buffer;
    try {
        if (original) {
            const scale = Math.min(1, 1200 / Math.max(source.width, source.height));
            canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
            ctx.drawImage(source.image, 0, 0, canvas.width, canvas.height);
            if (selection === 'crop') drawOutline(drag?.rect || s.crop, true);
        } else {
            buffer = encodedPreview || render(source, s, 1200);
            canvas.width = buffer.width; canvas.height = buffer.height;
            if (s.format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            ctx.drawImage(buffer, 0, 0);
            if (selection === 'blur') {
                const crop = actualCrop();
                for (const rect of s.blur.regions) drawOutline(mapRect(rect, p => sourceToOutput(p, crop, s)));
                if (drag?.rect) drawOutline(drag.rect);
            }
        }
        const g = geometry(entry, s), size = original ? entry : entry.result || g;
        $('display-dimensions').textContent = `${size.width.toLocaleString()} × ${size.height.toLocaleString()} px`;
        canvas.setAttribute('aria-label', `${original ? '原圖' : '編輯結果'}，${size.width} × ${size.height} 像素`);
    } catch (error) { errorText(error.message); }
    finally { if (buffer && buffer !== encodedPreview) release(buffer); }
    canvas.classList.toggle('selecting', Boolean(selection));
    $('selection-hint').textContent = selection === 'crop' ? '拖曳框選，或輸入裁切座標。按「編輯結果」查看成品。' : selection === 'blur' ? '拖曳新增模糊區域。按 Esc 結束框選。' : '';
    $('selection-hint').hidden = !selection;
    $('show-source').setAttribute('aria-pressed', String(showSource)); $('show-source').classList.toggle('selected', showSource);
    $('show-edited').setAttribute('aria-pressed', String(!showSource)); $('show-edited').classList.toggle('selected', !showSource);
}
async function resultPreview(result, signal) {
    const url = URL.createObjectURL(result.blob);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('無法顯示匯出預覽。')); image.src = url; });
        checkAbort(signal);
        const scale = Math.min(1, 1200 / Math.max(result.width, result.height));
        const preview = canvasOf(Math.max(1, Math.round(result.width * scale)), Math.max(1, Math.round(result.height * scale)));
        preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height); image.src = '';
        return preview;
    } finally { URL.revokeObjectURL(url); }
}
function showSummary(entry) {
    const r = entry.result; if (!r) return;
    $('after-size').textContent = sizeText(r.blob.size);
    const percent = (1 - r.blob.size / entry.file.size) * 100;
    $('size-change').textContent = percent >= 0 ? `減少 ${percent.toFixed(1)}%` : `增加 ${Math.abs(percent).toFixed(1)}%`;
    $('result-extra').textContent = `${r.width.toLocaleString()} × ${r.height.toLocaleString()} px` + (r.blob.type !== 'image/png' ? ` · 品質 ${Math.round(r.quality * 100)}%` : '') + (!r.metTarget ? ' · 未達目標容量，請允許縮小尺寸或提高目標。' : '');
}
function stopRender() { clearTimeout(renderTimer); renderController?.abort(); renderVersion++; computing = false; }
function schedule() {
    stopRender();
    const entry = current(); if (!entry || !source) return;
    release(encodedPreview); encodedPreview = null;
    try { geometry(entry, entry.state); } catch (error) {
        entry.result = null; errorText(error.message); $('after-size').textContent = '尺寸無效'; $('size-change').textContent = $('result-extra').textContent = ''; updateButtons(); return;
    }
    errorText(''); drawPreview(); computing = true;
    $('after-size').textContent = '計算中…'; $('size-change').textContent = $('result-extra').textContent = '';
    const version = renderVersion, snapshot = copy(entry.state), sourceSnapshot = source;
    renderController = new AbortController(); const signal = renderController.signal;
    updateButtons();
    renderTimer = setTimeout(async () => {
        let full;
        try {
            checkAbort(signal); full = render(sourceSnapshot, snapshot);
            const result = await encode(full, snapshot, signal); checkAbort(signal);
            const total = entries.reduce((sum, other) => sum + (other.id !== entry.id ? other.result?.blob.size || 0 : 0), 0);
            if (total + result.blob.size > LIMITS.totalBytes) throw new Error('處理結果超過 200 MB，請移除部分圖片。');
            const preview = await resultPreview(result, signal);
            if (version !== renderVersion || current()?.id !== entry.id) { release(preview); return; }
            entry.result = result; entry.error = ''; encodedPreview = preview; showSummary(entry); drawPreview();
        } catch (error) {
            if (error.name !== 'AbortError' && version === renderVersion) { entry.error = error.message; entry.result = null; errorText(error.message); $('after-size').textContent = '無法匯出'; }
        } finally {
            release(full);
            if (version === renderVersion) { computing = false; queue(); }
        }
    }, 260);
}
function edit(mutator, key = 'button') {
    const entry = current(); if (!entry || busy()) return;
    const before = copy(entry.state);
    try { mutator(entry.state); }
    catch (error) { entry.state = before; errorText(error.message); syncControls(); return; }
    const now = performance.now();
    if (key === 'button' || key !== lastEditKey || now - lastEditTime > 600) { entry.past.push(before); if (entry.past.length > 30) entry.past.shift(); }
    lastEditKey = key; lastEditTime = now;
    entry.future = []; entry.result = null; entry.error = '';
    announce(); syncControls(); queue(); schedule();
}
function history(direction) {
    const entry = current(); if (!entry || busy()) return;
    const from = direction === 'undo' ? entry.past : entry.future, to = direction === 'undo' ? entry.future : entry.past;
    if (!from.length) return;
    to.push(copy(entry.state)); entry.state = from.pop(); entry.result = null; entry.error = ''; lastEditKey = '';
    selection = null; cropRatio = 'free'; syncControls(); queue(); schedule();
}
async function selectEntry(id) {
    if (batchBusy || zipBusy) return;
    stopRender(); const version = ++selectionVersion;
    source?.close(); source = null; release(encodedPreview); encodedPreview = null;
    selectedId = id; loading = true; selection = null; showSource = false; drag = null; cropRatio = 'free'; lastEditKey = '';
    queue(); const entry = current();
    if (!entry) { loading = false; updateButtons(); return; }
    $('photo-drop').hidden = true; $('photo-loaded').hidden = false; $('add-photos').hidden = false;
    try {
        const opened = await openImage(entry.file);
        if (version !== selectionVersion) { opened.close(); return; }
        source = opened; syncControls();
        if (entry.result) { encodedPreview = await resultPreview(entry.result); if (version !== selectionVersion) { release(encodedPreview); encodedPreview = null; return; } showSummary(entry); drawPreview(); }
        else schedule();
    } catch (error) { if (version === selectionVersion) { entry.error = error.message; announce(error.message, true); } }
    finally { if (version === selectionVersion) { loading = false; queue(); } }
}
function disposeEntry(entry) { URL.revokeObjectURL(entry.thumb); entry.result = null; }
function clearAll() {
    stopRender(); selectionVersion++; source?.close(); source = null; release(encodedPreview); encodedPreview = null;
    entries.forEach(disposeEntry); entries = []; selectedId = null; selection = null; drag = null;
    $('photo-drop').hidden = false; $('photo-loaded').hidden = true; $('add-photos').hidden = true; $('batch-status').textContent = ''; $('batch-progress').hidden = true; errorText(''); announce(); queue();
}
async function removeEntry(id) {
    if (busy()) return;
    const entry = entries.find(item => item.id === id); if (!entry) return;
    disposeEntry(entry); entries = entries.filter(item => item.id !== id);
    if (!entries.length) clearAll(); else if (id === selectedId) await selectEntry(entries[0].id); else queue();
}
async function addFiles(files) {
    if (busy() || !files.length) return;
    uploading = true; stopRender(); updateButtons();
    let firstNew = null, added = 0; const errors = [];
    for (const file of Array.from(files).slice(0, multi ? files.length : 1)) {
        let opened, thumbCanvas;
        try {
            if (multi && entries.length >= LIMITS.files) throw new Error('最多 40 張圖片。');
            if (multi && entries.reduce((sum, e) => sum + e.file.size, 0) + file.size > LIMITS.totalBytes) throw new Error('圖片合計不可超過 200 MB。');
            opened = await openImage(file);
            const scale = Math.min(1, 96 / Math.max(opened.width, opened.height));
            thumbCanvas = canvasOf(Math.max(1, Math.round(opened.width * scale)), Math.max(1, Math.round(opened.height * scale)));
            thumbCanvas.getContext('2d').drawImage(opened.image, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const thumb = URL.createObjectURL(await toBlob(thumbCanvas, 'image/png'));
            if (!multi) clearAll();
            const entry = { id: nextId++, file, width: opened.width, height: opened.height, thumb, state: defaultState(opened.width, opened.height, mode), result: null, error: '', past: [], future: [] };
            entries.push(entry); firstNew ??= entry.id; added++;
        } catch (error) { errors.push(`${file.name}：${error.message}`); }
        finally { opened?.close(); release(thumbCanvas); }
    }
    uploading = false;
    if (firstNew && (!selectedId || !multi)) await selectEntry(firstNew);
    else if (current()) { queue(); if (!current().result) schedule(); }
    else updateButtons();
    announce(errors.length ? `${added ? `已加入 ${added} 張。` : ''}${errors.join(' ')}` : '', errors.length > 0);
}
function applyToAll() {
    const entry = current(); if (!entry || busy()) return;
    try { geometry(entry, entry.state); } catch (error) { errorText(error.message); return; }
    const state = copy(entry.state);
    for (const other of entries) if (other.id !== entry.id) { other.past.push(copy(other.state)); if (other.past.length > 30) other.past.shift(); other.state = copy(state); other.future = []; other.result = null; other.error = ''; }
    queue(); announce('已套用至全部圖片。鎖定比例時，各張會保留自己的比例。');
}
async function processAll() {
    if (!entries.length || busy()) return;
    stopRender(); batchBusy = true; batchController = new AbortController(); const signal = batchController.signal;
    source?.close(); source = null;
    $('batch-progress').hidden = false; $('batch-progress').max = entries.length; $('batch-progress').value = 0;
    let done = 0, failures = 0;
    queue();
    try {
        for (const entry of entries) {
            checkAbort(signal);
            $('batch-status').textContent = `處理 ${done + 1} / ${entries.length}：${entry.file.name}`;
            let opened, full;
            try {
                if (!entry.result) {
                    opened = await openImage(entry.file); checkAbort(signal); full = render(opened, entry.state);
                    const result = await encode(full, entry.state, signal); checkAbort(signal);
                    if (entries.reduce((sum, item) => sum + (item.result?.blob.size || 0), 0) + result.blob.size > LIMITS.totalBytes) throw new Error('結果合計超過 200 MB，請分批處理。');
                    entry.result = result;
                }
                entry.error = '';
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                entry.error = error.message; entry.result = null; failures++;
            } finally { opened?.close(); release(full); }
            done++; $('batch-progress').value = done; queue();
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        $('batch-status').textContent = `完成 ${done - failures} / ${entries.length}${failures ? `，${failures} 張失敗` : ''}。`;
    } catch (error) {
        $('batch-status').textContent = error.name === 'AbortError' ? `已取消，保留已完成的 ${entries.filter(entry => entry.result).length} 張。` : error.message;
    } finally {
        batchBusy = false; const id = selectedId; queue(); if (id) await selectEntry(id);
    }
}

// Inputs use the same non-destructive settings for individual and batch editing.
$('photo-input').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; addFiles(files); });
for (const id of ['choose-photos', 'add-photos']) $(id).addEventListener('click', () => $('photo-input').click());
$('demo-photo').addEventListener('click', async () => { try { await addFiles([await sampleFile()]); } catch (error) { announce(error.message, true); } });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { if (busy()) return; activeTab = button.dataset.tab; selection = null; drag = null; tabs(); drawPreview(); }));
$('show-source').addEventListener('click', () => { if (busy()) return; selection = null; showSource = true; drawPreview(); });
$('show-edited').addEventListener('click', () => { if (busy()) return; selection = null; showSource = false; drawPreview(); });
$('undo-edit').addEventListener('click', () => history('undo')); $('redo-edit').addEventListener('click', () => history('redo'));
$('reset-edit').addEventListener('click', () => { const entry = current(); if (!entry) return; selection = null; cropRatio = 'free'; edit(s => Object.assign(s, defaultState(entry.width, entry.height, mode))); });
$('select-crop').addEventListener('click', () => { selection = 'crop'; showSource = false; drawPreview(); canvas.focus(); });
$('reset-crop').addEventListener('click', () => { cropRatio = 'free'; selection = null; edit(s => { s.crop = { x: 0, y: 0, w: 1, h: 1 }; }); });
for (const [id, delta] of [['rotate-left', 270], ['rotate-right', 90]]) $(id).addEventListener('click', () => { selection = null; showSource = false; edit(s => { s.rotation = (s.rotation + delta) % 360; }); });
for (const [id, key] of [['flip-x', 'flipX'], ['flip-y', 'flipY']]) $(id).addEventListener('click', () => { selection = null; showSource = false; edit(s => { s[key] = !s[key]; }); });
for (const [id, key, side] of [['crop-x', 'x', 'width'], ['crop-y', 'y', 'height'], ['crop-width', 'w', 'width'], ['crop-height', 'h', 'height']]) {
    $(id).addEventListener('input', () => { cropRatio = 'free'; selection = 'crop'; edit(s => { s.crop[key] = $(id).value === '' ? NaN : Number($(id).value) / current()[side]; }, id); });
}
$('crop-ratio').addEventListener('change', () => {
    cropRatio = $('crop-ratio').value; if (cropRatio === 'free' || !current()) return;
    const entry = current(), ratio = cropRatio === 'original' ? entry.width / entry.height : Number(cropRatio);
    selection = 'crop'; showSource = false;
    edit(s => {
        let w = entry.width, h = w / ratio; if (h > entry.height) { h = entry.height; w = h * ratio; }
        s.crop = { x: (1 - w / entry.width) / 2, y: (1 - h / entry.height) / 2, w: w / entry.width, h: h / entry.height };
    });
});
$('resize-enabled').addEventListener('change', () => edit(s => {
    const g = geometry(current(), { ...s, resize: { ...s.resize, enabled: false } });
    s.resize.enabled = $('resize-enabled').checked; s.resize.width = g.width; s.resize.height = g.height;
}));
for (const axis of ['width', 'height']) $('resize-' + axis).addEventListener('input', () => edit(s => { s.resize[axis] = Number($('resize-' + axis).value); s.resize.anchor = axis; }, 'resize-' + axis));
$('resize-lock').addEventListener('change', () => edit(s => {
    const g = geometry(current(), s); s.resize.width = g.width; s.resize.height = g.height;
    s.resize.lock = $('resize-lock').checked;
}));
for (const [id, axis, base] of [['resize-x', 'width', 'baseWidth'], ['resize-y', 'height', 'baseHeight']]) $(id).addEventListener('input', () => edit(s => {
    const g = geometry(current(), { ...s, resize: { ...s.resize, enabled: false } });
    s.resize[axis] = Math.max(1, Math.round(g[base] * Number($(id).value) / 100)); s.resize.anchor = axis;
}, id));
$('resize-smoothing').addEventListener('change', () => edit(s => { s.smoothing = $('resize-smoothing').checked; }));
$('blur-radius').addEventListener('input', () => edit(s => { s.blur.radius = Number($('blur-radius').value); }, 'blur-radius'));
$('blur-mode').addEventListener('change', () => { selection = $('blur-mode').value === 'regions' ? 'blur' : null; showSource = false; edit(s => { s.blur.mode = $('blur-mode').value; }); });
$('select-blur').addEventListener('click', () => { selection = 'blur'; showSource = false; drawPreview(); canvas.focus(); });
$('clear-regions').addEventListener('click', () => edit(s => { s.blur.regions = []; }));
$('target-kb').addEventListener('input', () => edit(s => { s.targetKB = Number($('target-kb').value); }, 'target-kb'));
$('auto-reduce').addEventListener('change', () => edit(s => { s.autoReduce = $('auto-reduce').checked; }));
$('output-format').addEventListener('change', () => edit(s => { s.format = $('output-format').value; }));
$('output-quality').addEventListener('input', () => edit(s => { s.quality = Number($('output-quality').value) / 100; }, 'quality'));
$('save-image').addEventListener('click', () => { const entry = current(); if (!busy() && !computing && entry?.result) download(entry.result.blob, filename(entry.file.name, entry.result)); });
$('clear-queue').addEventListener('click', () => { if (!busy()) clearAll(); });
$('apply-all').addEventListener('click', applyToAll); $('process-all').addEventListener('click', processAll);
$('cancel-batch').addEventListener('click', () => batchController?.abort());
$('save-zip').addEventListener('click', async () => {
    if (busy()) return;
    const files = entries.filter(entry => entry.result).map(entry => ({ name: filename(entry.file.name, entry.result), blob: entry.result.blob }));
    zipBusy = true; updateButtons(); announce('正在打包…');
    try { download(await createZip(files), 'toolbox-images.zip'); announce(`已打包 ${files.length} 張圖片。`); }
    catch (error) { announce(error.message, true); }
    finally { zipBusy = false; updateButtons(); }
});
function pointer(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) };
}
canvas.addEventListener('pointerdown', event => {
    if (!selection || !source || busy() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); const start = pointer(event); drag = { start, rect: null, pointerId: event.pointerId }; canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const end = pointer(event), a = drag.start; let w = Math.abs(end.x - a.x), h = Math.abs(end.y - a.y);
    const sx = end.x >= a.x ? 1 : -1, sy = end.y >= a.y ? 1 : -1;
    if (selection === 'crop' && cropRatio !== 'free') {
        const ratio = cropRatio === 'original' ? source.width / source.height : Number(cropRatio);
        h = w * source.width / (ratio * source.height);
        const maxHeight = sy > 0 ? 1 - a.y : a.y;
        if (h > maxHeight) { h = maxHeight; w = h * ratio * source.height / source.width; }
    }
    drag.rect = { x: sx > 0 ? a.x : a.x - w, y: sy > 0 ? a.y : a.y - h, w, h };
    drawPreview();
});
canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = drag.rect; drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!rect || rect.w * canvas.width < 2 || rect.h * canvas.height < 2) { drawPreview(); return; }
    if (selection === 'crop') edit(s => { s.crop = rect; });
    else if (selection === 'blur') {
        if (current().state.blur.regions.length >= 30) { announce('最多可設定 30 個模糊區域。', true); return; }
        const region = mapRect(rect, p => outputToSource(p, actualCrop(), current().state));
        edit(s => { s.blur.regions.push(region); if (!s.blur.radius) s.blur.radius = 12; });
    }
});
canvas.addEventListener('pointercancel', () => { drag = null; drawPreview(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { drag = null; selection = null; drawPreview(); } });
const previewPanel = document.querySelector('.photo-preview'); let dragDepth = 0;
previewPanel.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; previewPanel.classList.add('drag-over'); });
previewPanel.addEventListener('dragover', event => event.preventDefault());
previewPanel.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; previewPanel.classList.remove('drag-over'); } });
previewPanel.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; previewPanel.classList.remove('drag-over'); addFiles(event.dataTransfer.files); });
document.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
document.addEventListener('drop', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
document.addEventListener('paste', event => { const files = [...(event.clipboardData?.items || [])].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean); if (files.length) { event.preventDefault(); addFiles(files); } });
window.addEventListener('pagehide', () => { stopRender(); batchController?.abort(); entries.forEach(entry => URL.revokeObjectURL(entry.thumb)); });
tabs(); updateButtons();
