export const LIMITS = { side: 8192, pixels: 24000000, sourcePixels: 50000000, fileBytes: 50 * 1024 ** 2, totalBytes: 200 * 1024 ** 2, files: 40 };
const types = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/x-ms-bmp'];
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const copy = value => JSON.parse(JSON.stringify(value));
export const sizeText = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
export function checkAbort(signal) { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); }
export function validateFile(file) {
    if (!types.includes(file.type) && !(file.type === '' && /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))) throw new Error('請使用 PNG、JPG、WebP、GIF 或 BMP。');
    if (!file.size || file.size > LIMITS.fileBytes) throw new Error('單張圖片須大於 0 B 且不超過 50 MB。');
}
export async function openImage(file) {
    validateFile(file);
    let image;
    if (typeof createImageBitmap === 'function') {
        image = await createImageBitmap(file).catch(() => { throw new Error('無法讀取圖片，檔案可能已損壞。'); });
    } else {
        const url = URL.createObjectURL(file);
        try {
            image = new Image();
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('無法讀取圖片。')); image.src = url; });
        } finally { URL.revokeObjectURL(url); }
    }
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!width || !height || width * height > LIMITS.sourcePixels) { image.close?.(); throw new Error('來源圖片不可超過 5,000 萬像素。'); }
    return { image, width, height, close: () => image.close?.() };
}
export function canvasOf(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    if (!canvas.getContext('2d')) throw new Error('無法建立畫布，請縮小圖片後重試。');
    return canvas;
}
export function release(canvas) { if (canvas) canvas.width = canvas.height = 1; }
export function defaultState(width, height, mode) {
    const scale = Math.min(1, LIMITS.side / width, LIMITS.side / height, Math.sqrt(LIMITS.pixels / (width * height)));
    return {
        crop: { x: 0, y: 0, w: 1, h: 1 }, rotation: 0, flipX: false, flipY: false,
        resize: { enabled: false, width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), lock: true, anchor: 'width' },
        blur: { radius: mode === 'blur' ? 12 : 0, mode: 'whole', regions: [] },
        format: mode === 'compress' || mode === 'batch' ? 'image/webp' : 'image/png',
        quality: 0.85, targetKB: 0, autoReduce: true, smoothing: true
    };
}
export function geometry(source, state) {
    const c = state.crop;
    if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0 || c.x + c.w > 1.00001 || c.y + c.h > 1.00001) throw new Error('裁切範圍須位於原圖內，寬高至少 1 px。');
    const x = Math.round(c.x * source.width), y = Math.round(c.y * source.height);
    const cw = Math.min(source.width - x, Math.round(c.w * source.width)), ch = Math.min(source.height - y, Math.round(c.h * source.height));
    if (cw < 1 || ch < 1 || ![0, 90, 180, 270].includes(state.rotation)) throw new Error('裁切尺寸或旋轉角度無效。');
    const swapped = state.rotation % 180 !== 0;
    const baseWidth = swapped ? ch : cw, baseHeight = swapped ? cw : ch;
    let width = baseWidth, height = baseHeight;
    if (state.resize.enabled) {
        ({ width, height } = state.resize);
        if (state.resize.lock) {
            if (state.resize.anchor === 'height') width = Math.max(1, Math.round(height * baseWidth / baseHeight));
            else height = Math.max(1, Math.round(width * baseHeight / baseWidth));
        }
    } else {
        const scale = Math.min(1, LIMITS.side / width, LIMITS.side / height, Math.sqrt(LIMITS.pixels / (width * height)));
        width = Math.max(1, Math.floor(width * scale)); height = Math.max(1, Math.floor(height * scale));
    }
    if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= LIMITS.side) || width * height > LIMITS.pixels) throw new Error('輸出每邊限 1–8,192 px，最多 2,400 萬像素。');
    if (!Number.isFinite(state.blur.radius) || state.blur.radius < 0 || state.blur.radius > 60) throw new Error('模糊強度須為 0–60。');
    return { x, y, cw, ch, baseWidth, baseHeight, width, height };
}
// Store blur rectangles in original-image coordinates, so crop/rotation keep them aligned.
export function sourceToOutput(point, crop, state) {
    let x = (point.x - crop.x) / crop.w, y = (point.y - crop.y) / crop.h;
    if (state.rotation === 90) [x, y] = [1 - y, x];
    if (state.rotation === 180) [x, y] = [1 - x, 1 - y];
    if (state.rotation === 270) [x, y] = [y, 1 - x];
    return { x: state.flipX ? 1 - x : x, y: state.flipY ? 1 - y : y };
}
export function outputToSource(point, crop, state) {
    let x = state.flipX ? 1 - point.x : point.x, y = state.flipY ? 1 - point.y : point.y;
    if (state.rotation === 90) [x, y] = [y, 1 - x];
    else if (state.rotation === 180) [x, y] = [1 - x, 1 - y];
    else if (state.rotation === 270) [x, y] = [1 - y, x];
    return { x: crop.x + x * crop.w, y: crop.y + y * crop.h };
}
export function mapRect(rect, map) {
    const points = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h]].map(([x, y]) => map({ x, y }));
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function boxBlur(canvas, radius) {
    const ctx = canvas.getContext('2d'), { width, height } = canvas;
    const image = ctx.getImageData(0, 0, width, height), pixels = image.data;
    const temp = new Uint8ClampedArray(pixels.length), r = Math.max(1, Math.round(radius)), kernel = 2 * r + 1;
    // Premultiply before averaging to avoid dark fringes around transparency.
    for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] *= pixels[i + 3] / 255;
    for (let pass = 0; pass < 2; pass++) {
        const input = pass ? temp : pixels, output = pass ? pixels : temp;
        const rows = pass ? width : height, columns = pass ? height : width;
        const index = (row, column) => (pass ? column * width + row : row * width + column) * 4;
        for (let row = 0; row < rows; row++) {
            const sums = [0, 0, 0, 0];
            for (let k = -r; k <= r; k++) { const at = index(row, clamp(k, 0, columns - 1)); for (let c = 0; c < 4; c++) sums[c] += input[at + c]; }
            for (let column = 0; column < columns; column++) {
                const at = index(row, column);
                for (let c = 0; c < 4; c++) output[at + c] = sums[c] / kernel;
                const old = index(row, clamp(column - r, 0, columns - 1)), next = index(row, clamp(column + r + 1, 0, columns - 1));
                for (let c = 0; c < 4; c++) sums[c] += input[next + c] - input[old + c];
            }
        }
    }
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) for (let c = 0; c < 3; c++) pixels[i + c] *= 255 / pixels[i + 3];
    ctx.putImageData(image, 0, 0);
}
function blurredCopy(canvas, radius) {
    const blurred = canvasOf(canvas.width, canvas.height), ctx = blurred.getContext('2d');
    if ('filter' in ctx) {
        const pad = Math.ceil(radius * 3), padded = canvasOf(canvas.width + pad * 2, canvas.height + pad * 2), p = padded.getContext('2d');
        const w = canvas.width, h = canvas.height;
        p.drawImage(canvas, pad, pad);
        p.drawImage(canvas, 0, 0, w, 1, pad, 0, w, pad); p.drawImage(canvas, 0, h - 1, w, 1, pad, pad + h, w, pad);
        p.drawImage(canvas, 0, 0, 1, h, 0, pad, pad, h); p.drawImage(canvas, w - 1, 0, 1, h, pad + w, pad, pad, h);
        for (const [sx, sy, dx, dy] of [[0, 0, 0, 0], [w - 1, 0, w + pad, 0], [0, h - 1, 0, h + pad], [w - 1, h - 1, w + pad, h + pad]]) p.drawImage(canvas, sx, sy, 1, 1, dx, dy, pad, pad);
        ctx.filter = `blur(${radius}px)`; ctx.drawImage(padded, -pad, -pad); ctx.filter = 'none'; release(padded);
    } else { ctx.drawImage(canvas, 0, 0); boxBlur(blurred, radius); }
    return blurred;
}
export function render(source, state, maxEdge = Infinity) {
    const g = geometry(source, state), scale = Math.min(1, maxEdge / Math.max(g.width, g.height));
    const width = Math.max(1, Math.round(g.width * scale)), height = Math.max(1, Math.round(g.height * scale));
    const canvas = canvasOf(width, height), ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = state.smoothing; ctx.imageSmoothingQuality = 'high';
    ctx.translate(width / 2, height / 2);
    ctx.scale((state.flipX ? -1 : 1) * width / g.baseWidth, (state.flipY ? -1 : 1) * height / g.baseHeight);
    ctx.rotate(state.rotation * Math.PI / 180);
    ctx.drawImage(source.image, g.x, g.y, g.cw, g.ch, -g.cw / 2, -g.ch / 2, g.cw, g.ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state.blur.radius && (state.blur.mode === 'whole' || state.blur.regions.length)) {
        const blurred = blurredCopy(canvas, Math.max(0.1, state.blur.radius * scale));
        ctx.save();
        if (state.blur.mode === 'regions') {
            ctx.beginPath();
            const crop = { x: g.x / source.width, y: g.y / source.height, w: g.cw / source.width, h: g.ch / source.height };
            for (const region of state.blur.regions) {
                const rect = mapRect(region, p => sourceToOutput(p, crop, state));
                ctx.rect(rect.x * width, rect.y * height, rect.w * width, rect.h * height);
            }
            ctx.clip();
        }
        ctx.clearRect(0, 0, width, height); ctx.drawImage(blurred, 0, 0); ctx.restore(); release(blurred);
    }
    return canvas;
}
export async function toBlob(canvas, format, quality, signal) {
    checkAbort(signal);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('匯出失敗，請降低尺寸。')), format, quality));
    checkAbort(signal);
    if (blob.type !== format) throw new Error('瀏覽器不支援此格式，請改用 PNG 或 JPG。');
    return blob;
}
export async function encode(sourceCanvas, state, signal) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(state.format) || !Number.isFinite(state.quality) || state.quality < 0.05 || state.quality > 1) throw new Error('請確認匯出格式與品質。');
    if (!Number.isFinite(state.targetKB) || state.targetKB < 0 || state.targetKB > 51200) throw new Error('目標容量限 1–51,200 KB，留空代表不限制。');
    let canvas = canvasOf(sourceCanvas.width, sourceCanvas.height), blob, quality = state.quality;
    const ctx = canvas.getContext('2d');
    if (state.format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(sourceCanvas, 0, 0);
    const target = state.targetKB * 1024;
    try {
        for (let round = 0; round < 8; round++) {
            checkAbort(signal);
            quality = state.quality;
            blob = await toBlob(canvas, state.format, quality, signal);
            if (!target || blob.size <= target) break;
            if (state.format !== 'image/png') {
                let lo = 0.05, hi = state.quality;
                let best = await toBlob(canvas, state.format, lo, signal), bestQuality = lo;
                if (best.size <= target) {
                    for (let i = 0; i < 7; i++) {
                        const mid = (lo + hi) / 2, test = await toBlob(canvas, state.format, mid, signal);
                        if (test.size <= target) { lo = mid; best = test; bestQuality = mid; } else hi = mid;
                    }
                }
                blob = best; quality = bestQuality;
            }
            if (blob.size <= target || !state.autoReduce || (canvas.width === 1 && canvas.height === 1) || round === 7) break;
            const factor = clamp(Math.sqrt(target / blob.size) * 0.9, 0.1, 0.85);
            const smaller = canvasOf(Math.max(1, Math.floor(canvas.width * factor)), Math.max(1, Math.floor(canvas.height * factor)));
            const small = smaller.getContext('2d'); small.imageSmoothingEnabled = state.smoothing; small.imageSmoothingQuality = 'high';
            small.drawImage(canvas, 0, 0, smaller.width, smaller.height); release(canvas); canvas = smaller;
        }
        return { blob, width: canvas.width, height: canvas.height, quality, metTarget: !target || blob.size <= target };
    } finally { release(canvas); }
}
export function filename(name, result) {
    const stem = name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'image';
    return `${stem}_${result.width}x${result.height}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[result.blob.type]}`;
}
const urls = new Set();
export function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a'); urls.add(url);
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 60000);
}
window.addEventListener('pagehide', () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); });
export async function sampleFile() {
    const canvas = canvasOf(800, 600), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8eddb'; ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#e9b971'; ctx.beginPath(); ctx.arc(620, 145, 65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b7c8a7'; ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(220, 125); ctx.lineTo(610, 600); ctx.lineTo(0, 600); ctx.fill();
    ctx.fillStyle = '#86a080'; ctx.beginPath(); ctx.moveTo(225, 600); ctx.lineTo(570, 250); ctx.lineTo(800, 465); ctx.lineTo(800, 600); ctx.fill();
    ctx.fillStyle = '#3c6550'; ctx.beginPath(); ctx.moveTo(0, 480); ctx.bezierCurveTo(250, 350, 530, 640, 800, 420); ctx.lineTo(800, 600); ctx.lineTo(0, 600); ctx.fill();
    const blob = await toBlob(canvas, 'image/png'); release(canvas);
    return new File([blob], 'landscape.png', { type: 'image/png' });
}
