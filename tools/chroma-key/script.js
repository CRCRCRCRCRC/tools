import { LIMITS, clamp, openImage, canvasOf, release, sizeText, download } from '../../assets/image-tools/core.js';

const $ = id => document.getElementById(id);
const canvas = $('photo-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
let sourceCanvas = null;
let previewSource = null;
let file = null;
let picker = false;
let showOriginal = false;
let renderTimer = 0;
let transparentRatio = 0;

const settings = { color: '#00b140', tolerance: 30, softness: 18, spill: 45 };
const setStatus = (message = '', error = false) => {
    $('photo-status').textContent = message;
    $('photo-status').classList.toggle('error', error);
};

function hexToRgb(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function smoothstep(from, to, value) {
    if (to <= from) return value <= from ? 0 : 1;
    const amount = clamp((value - from) / (to - from), 0, 1);
    return amount * amount * (3 - 2 * amount);
}

export function applyChroma(imageData, options) {
    const data = imageData.data;
    const [kr, kg, kb] = options.key;
    const threshold = options.tolerance * 2.2;
    const feather = options.softness * 1.15;
    const keyAverage = (kr + kg + kb) / 3;
    const keyChroma = [kr - keyAverage, kg - keyAverage, kb - keyAverage];
    const keyStrength = Math.hypot(...keyChroma) || 1;
    let removed = 0;

    for (let index = 0; index < data.length; index += 4) {
        const dr = data[index] - kr;
        const dg = data[index + 1] - kg;
        const db = data[index + 2] - kb;
        const distance = Math.sqrt(.299 * dr * dr + .587 * dg * dg + .114 * db * db);
        const keep = smoothstep(threshold, threshold + feather, distance);
        const originalAlpha = data[index + 3];
        data[index + 3] = Math.round(originalAlpha * keep);
        removed += (originalAlpha - data[index + 3]) / 255;

        if (options.spill > 0 && keep > 0 && keep < 1) {
            const strength = (options.spill / 100) * (1 - keep) * .75;
            data[index] = clamp(Math.round(data[index] - keyChroma[0] / keyStrength * 90 * strength), 0, 255);
            data[index + 1] = clamp(Math.round(data[index + 1] - keyChroma[1] / keyStrength * 90 * strength), 0, 255);
            data[index + 2] = clamp(Math.round(data[index + 2] - keyChroma[2] / keyStrength * 90 * strength), 0, 255);
        }
    }
    return removed / (data.length / 4);
}

function process(input) {
    const output = canvasOf(input.width, input.height);
    const outputContext = output.getContext('2d', { willReadFrequently: true });
    outputContext.drawImage(input, 0, 0);
    const pixels = outputContext.getImageData(0, 0, output.width, output.height);
    const ratio = applyChroma(pixels, { key: hexToRgb(settings.color), ...settings });
    outputContext.putImageData(pixels, 0, 0);
    return { output, ratio };
}

function drawPreview() {
    if (!previewSource) return;
    canvas.width = previewSource.width;
    canvas.height = previewSource.height;
    if (showOriginal || picker) {
        context.drawImage(previewSource, 0, 0);
    } else {
        const result = process(previewSource);
        context.drawImage(result.output, 0, 0);
        transparentRatio = result.ratio;
        release(result.output);
    }
    $('removed-percent').textContent = `已移除 ${Math.round(transparentRatio * 100)}%`;
}

function schedulePreview() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(drawPreview, 45);
}

function setPicker(active) {
    picker = active && !!sourceCanvas;
    $('pick-color').setAttribute('aria-pressed', String(picker));
    $('picker-hint').hidden = !picker;
    canvas.classList.toggle('picking', picker);
    drawPreview();
}

function useColor(hex) {
    settings.color = hex.toLowerCase();
    $('chroma-color').value = settings.color;
    $('color-hex').value = hex.toUpperCase();
    schedulePreview();
}

async function loadPhoto(nextFile) {
    try {
        setStatus('讀取圖片中…');
        const opened = await openImage(nextFile);
        if (opened.width > LIMITS.side || opened.height > LIMITS.side || opened.width * opened.height > LIMITS.pixels) {
            opened.close();
            throw new Error('圖片尺寸超過限制。');
        }
        release(sourceCanvas);
        release(previewSource);
        sourceCanvas = canvasOf(opened.width, opened.height);
        sourceCanvas.getContext('2d').drawImage(opened.image, 0, 0);
        opened.close();
        const scale = Math.min(1, 1400 / opened.width, 1000 / opened.height, Math.sqrt(1600000 / (opened.width * opened.height)));
        previewSource = canvasOf(Math.max(1, Math.round(opened.width * scale)), Math.max(1, Math.round(opened.height * scale)));
        previewSource.getContext('2d').drawImage(sourceCanvas, 0, 0, previewSource.width, previewSource.height);
        file = nextFile;
        $('photo-drop').hidden = true;
        $('photo-loaded').hidden = false;
        $('change-photo').hidden = false;
        $('edit-controls').disabled = false;
        $('save-image').disabled = false;
        $('reset-edit').disabled = false;
        $('selected-name').textContent = nextFile.name;
        $('source-dimensions').textContent = `${opened.width} × ${opened.height} px`;
        $('display-dimensions').textContent = `${opened.width} × ${opened.height} px`;
        setStatus('');
        drawPreview();
    } catch (error) {
        setStatus(error.message || '無法讀取這張圖片。', true);
    }
}

async function createDemo() {
    const demo = canvasOf(800, 600);
    const ctx = demo.getContext('2d');
    ctx.fillStyle = '#00b140';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#f6d36f';
    ctx.beginPath(); ctx.arc(400, 195, 105, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#70568f';
    ctx.beginPath(); ctx.moveTo(205, 540); ctx.quadraticCurveTo(235, 300, 400, 300); ctx.quadraticCurveTo(565, 300, 595, 540); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3a36f';
    ctx.fillRect(335, 275, 130, 92);
    const blob = await new Promise(resolve => demo.toBlob(resolve, 'image/png'));
    release(demo);
    return new File([blob], '綠幕範例.png', { type: 'image/png' });
}

function sampleAt(event) {
    if (!picker || !previewSource) return;
    const bounds = canvas.getBoundingClientRect();
    const x = clamp(Math.floor((event.clientX - bounds.left) / bounds.width * previewSource.width), 0, previewSource.width - 1);
    const y = clamp(Math.floor((event.clientY - bounds.top) / bounds.height * previewSource.height), 0, previewSource.height - 1);
    const pixel = previewSource.getContext('2d').getImageData(x, y, 1, 1).data;
    useColor(rgbToHex(pixel[0], pixel[1], pixel[2]));
    setPicker(false);
    setStatus(`已選取 ${$('color-hex').value}`);
}

$('choose-photo').addEventListener('click', () => $('photo-input').click());
$('change-photo').addEventListener('click', () => $('photo-input').click());
$('photo-input').addEventListener('change', event => { if (event.target.files[0]) loadPhoto(event.target.files[0]); event.target.value = ''; });
$('demo-photo').addEventListener('click', async () => loadPhoto(await createDemo()));
$('pick-color').addEventListener('click', () => setPicker(!picker));
canvas.addEventListener('pointerdown', sampleAt);
canvas.addEventListener('keydown', event => {
    if (picker && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        sampleAt({ clientX: canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2, clientY: canvas.getBoundingClientRect().top + canvas.getBoundingClientRect().height / 2 });
    }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && picker) setPicker(false); });
$('chroma-color').addEventListener('input', event => useColor(event.target.value));
$('color-hex').addEventListener('change', event => {
    const color = hexToRgb(event.target.value);
    if (color) useColor(rgbToHex(...color));
    else { event.target.value = settings.color.toUpperCase(); setStatus('請輸入六位數色碼，例如 #00B140。', true); }
});
for (const name of ['tolerance', 'softness', 'spill']) {
    $(name).addEventListener('input', event => {
        settings[name] = Number(event.target.value);
        $(`${name}-value`).value = settings[name];
        schedulePreview();
    });
}
function setView(original) {
    showOriginal = original;
    $('show-original').classList.toggle('selected', original);
    $('show-result').classList.toggle('selected', !original);
    $('show-original').setAttribute('aria-pressed', String(original));
    $('show-result').setAttribute('aria-pressed', String(!original));
    drawPreview();
}
$('show-original').addEventListener('click', () => setView(true));
$('show-result').addEventListener('click', () => setView(false));
$('preview-background').addEventListener('change', event => {
    $('photo-stage').classList.toggle('preview-white', event.target.value === 'white');
    $('photo-stage').classList.toggle('preview-black', event.target.value === 'black');
});
$('reset-edit').addEventListener('click', () => {
    useColor('#00B140');
    for (const [name, value] of [['tolerance', 30], ['softness', 18], ['spill', 45]]) {
        settings[name] = value; $(name).value = value; $(`${name}-value`).value = value;
    }
    setPicker(false); setView(false); setStatus('已重設。');
});
$('save-image').addEventListener('click', async () => {
    if (!sourceCanvas || !file) return;
    $('save-image').disabled = true;
    setStatus('正在產生透明 PNG…');
    let result;
    try {
        result = process(sourceCanvas);
        const blob = await new Promise((resolve, reject) => result.output.toBlob(value => value ? resolve(value) : reject(new Error('無法產生圖片。')), 'image/png'));
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'image';
        download(blob, `${base}_cutout.png`);
        setStatus(`已下載 ${sizeText(blob.size)}。`);
    } catch (error) {
        setStatus(error.message || '下載失敗。', true);
    } finally {
        release(result?.output);
        $('save-image').disabled = false;
    }
});

const dropArea = document.querySelector('.photo-preview');
dropArea.addEventListener('dragover', event => { event.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
dropArea.addEventListener('drop', event => { event.preventDefault(); dropArea.classList.remove('drag-over'); if (event.dataTransfer.files[0]) loadPhoto(event.dataTransfer.files[0]); });
document.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
document.addEventListener('drop', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
document.addEventListener('paste', event => {
    const pasted = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile();
    if (pasted) { event.preventDefault(); loadPhoto(pasted); }
});
window.addEventListener('pagehide', () => { release(sourceCanvas); release(previewSource); });
