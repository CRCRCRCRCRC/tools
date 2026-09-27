import { LIMITS, openImage, canvasOf, release, sizeText, download } from '../../assets/image-tools/core.js';

if (new URLSearchParams(location.search).has('embed')) document.body.classList.add('embed');

const $ = id => document.getElementById(id);
const canvas = $('photo-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
let sourceCanvas = null;
let previewSource = null;
let file = null;
let showOriginal = false;
let renderTimer = 0;
let color = '#365e47';

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

function rgbToHex(rgb) {
    return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function applySolidColor(imageData, rgb, preserveAlpha = true) {
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
        data[index] = rgb[0];
        data[index + 1] = rgb[1];
        data[index + 2] = rgb[2];
        if (!preserveAlpha) data[index + 3] = 255;
    }
    return imageData;
}

function process(input) {
    const output = canvasOf(input.width, input.height);
    const outputContext = output.getContext('2d', { willReadFrequently: true });
    outputContext.drawImage(input, 0, 0);
    const pixels = outputContext.getImageData(0, 0, output.width, output.height);
    applySolidColor(pixels, hexToRgb(color), $('preserve-alpha').checked);
    outputContext.putImageData(pixels, 0, 0);
    return output;
}

function drawPreview() {
    if (!previewSource) return;
    canvas.width = previewSource.width;
    canvas.height = previewSource.height;
    if (showOriginal) context.drawImage(previewSource, 0, 0);
    else {
        const result = process(previewSource);
        context.drawImage(result, 0, 0);
        release(result);
    }
    $('result-color').textContent = color.toUpperCase();
    $('result-scope').textContent = $('preserve-alpha').checked ? '所有可見像素' : '整張圖片';
}

function schedulePreview() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(drawPreview, 35);
}

function useColor(nextColor) {
    color = nextColor.toLowerCase();
    $('target-color').value = color;
    $('color-hex').value = color.toUpperCase();
    setStatus('');
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
    ctx.clearRect(0, 0, 800, 600);
    ctx.fillStyle = '#e8a06d';
    ctx.beginPath(); ctx.arc(400, 185, 112, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#687eaa';
    ctx.beginPath(); ctx.moveTo(165, 545); ctx.quadraticCurveTo(205, 285, 400, 300); ctx.quadraticCurveTo(595, 285, 635, 545); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .45;
    ctx.fillStyle = '#e8a06d';
    ctx.beginPath(); ctx.arc(400, 185, 125, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    const blob = await new Promise(resolve => demo.toBlob(resolve, 'image/png'));
    release(demo);
    return new File([blob], '透明圖示範例.png', { type: 'image/png' });
}

$('choose-photo').addEventListener('click', () => $('photo-input').click());
$('change-photo').addEventListener('click', () => $('photo-input').click());
$('photo-input').addEventListener('change', event => { if (event.target.files[0]) loadPhoto(event.target.files[0]); event.target.value = ''; });
$('demo-photo').addEventListener('click', async () => loadPhoto(await createDemo()));
$('target-color').addEventListener('input', event => useColor(event.target.value));
$('color-hex').addEventListener('change', event => {
    const rgb = hexToRgb(event.target.value);
    if (rgb) useColor(rgbToHex(rgb));
    else { event.target.value = color.toUpperCase(); setStatus('請輸入六位數色碼，例如 #365E47。', true); }
});
$('preserve-alpha').addEventListener('change', schedulePreview);
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
    useColor('#365E47');
    $('preserve-alpha').checked = true;
    setView(false);
    setStatus('已重設。');
});
$('save-image').addEventListener('click', async () => {
    if (!sourceCanvas || !file) return;
    $('save-image').disabled = true;
    setStatus('正在產生 PNG…');
    let result;
    try {
        result = process(sourceCanvas);
        const blob = await new Promise((resolve, reject) => result.toBlob(value => value ? resolve(value) : reject(new Error('無法產生圖片。')), 'image/png'));
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'image';
        download(blob, `${base}_solid.png`);
        setStatus(`已下載 ${sizeText(blob.size)}。`);
    } catch (error) {
        setStatus(error.message || '下載失敗。', true);
    } finally {
        release(result);
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
