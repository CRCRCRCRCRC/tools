// Run with Node.js 22+: node tests/browser-smoke.mjs
// Uses a local Chrome installation; no npm dependencies or build step required.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { imageToolsCases } from './image-tools.cases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(existsSync);
assert.ok(chromePath, 'Set CHROME_PATH to a Chrome/Chromium executable.');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'toolbox-check-'));
const downloads = path.join(temporary, 'downloads');
await mkdir(downloads);
const artifacts = process.env.SCREENSHOT_DIR || temporary;
await mkdir(artifacts, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
    try {
        let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (!relative.startsWith('/project-site/')) { response.writeHead(404).end(); return; }
        relative = relative.slice('/project-site/'.length);
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        const data = await readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        response.end(data);
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/project-site/`;
const profile = path.join(temporary, 'chrome-profile');
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
chrome.stderr.on('data', chunk => { chromeLog += chunk.toString(); });
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try { const result = await check(); if (result) return result; } catch {}
        await delay(100);
    }
    throw new Error('Timed out: ' + label + (label === 'Chrome startup' ? '\n' + chromeLog : ''));
}
try {
    const port = await until(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0], 'Chrome startup');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    const errors = [];
    const missing = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id);
            if (task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
        }
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) missing.push(message.params.response.url);
    });
    function cdp(method, params = {}) {
        return new Promise((resolve, reject) => {
            const callId = ++id;
            const timer = setTimeout(() => { pending.delete(callId); reject(new Error('CDP timeout: ' + method)); }, 20000);
            pending.set(callId, { resolve, reject, timer });
            socket.send(JSON.stringify({ id: callId, method, params }));
        });
    }
    async function evaluate(expression) {
        const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const input = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    async function navigate(relative = '') {
        await cdp('Page.navigate', { url: base + relative });
        await until(() => evaluate(`location.href === ${JSON.stringify(base + relative)} && document.readyState === 'complete'`), 'page load: ' + relative);
    }
    async function viewport(width, height = 1000) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    }
    async function screenshot(name, full = false) {
        await evaluate('document.fonts.ready');
        const metrics = await cdp('Page.getLayoutMetrics');
        const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full,
            ...(full ? { clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } } : {}) });
        await writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'));
    }
    async function noOverflow(label) {
        assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, 'Horizontal overflow: ' + label);
    }
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await viewport(1440);
    await navigate();
    assert.equal(await evaluate('document.querySelectorAll(".tool-card").length'), 12);
    await noOverflow('home desktop');
    await screenshot('home-desktop', true);
    await click('[data-category="image"].filter');
    assert.equal(await evaluate('document.querySelectorAll(".tool-card:not([hidden])").length'), 7);
    await input('#tool-search', '  stretch  ');
    assert.equal(await evaluate('document.querySelectorAll(".tool-card:not([hidden])").length'), 1);
    await input('#tool-search', 'no-such-tool');
    assert.equal(await evaluate('document.querySelector("#empty-state").hidden'), false);
    await click('#reset-search');
    assert.equal(await evaluate('document.querySelectorAll(".tool-card:not([hidden])").length'), 12);
    await viewport(390, 844);
    await noOverflow('home mobile');
    await screenshot('home-mobile', true);
    console.log('PASS: homepage search, categories, empty state, mobile layout, project subpath.');

    await viewport(1440);
    await navigate('tools/image-stretcher/index.html');
    assert.equal(await evaluate('document.querySelector("#download-image").disabled'), true);
    await screenshot('image-empty-desktop', true);
    await click('#load-sample');
    await until(() => evaluate('!document.querySelector("#download-image").disabled'), 'sample image');
    assert.equal(await evaluate('document.querySelector("#width-input").value'), '800');
    await input('#width-input', 1200);
    assert.equal(await evaluate('document.querySelector("#height-input").value'), '600');
    await click('[data-width="1"][data-height="0.5"]');
    assert.equal(await evaluate('document.querySelector("#height-input").value'), '300');
    await click('#lock-ratio');
    await input('#width-input', 400);
    assert.equal(await evaluate('document.querySelector("#height-input").value'), '300');
    await click('#lock-ratio');
    for (const value of ['', 0, -1, 1.5, 8193]) {
        await input('#width-input', value);
        assert.equal(await evaluate('document.querySelector("#download-image").disabled'), true, 'Invalid width: ' + value);
    }
    await input('#width-input', 8192);
    await input('#height-input', 8192);
    assert.equal(await evaluate('document.querySelector("#download-image").disabled'), true, 'Total pixel limit');
    await click('#reset-image');
    assert.equal(await evaluate('document.querySelector("#width-input").value'), '800');
    await input('#width-scale', 150);
    assert.equal(await evaluate('document.querySelector("#width-input").value'), '1200');
    await input('#height-scale', 50);
    assert.equal(await evaluate('document.querySelector("#height-input").value'), '300');
    await click('#view-original');
    await until(() => evaluate('document.querySelector("#preview-dimensions").textContent.includes("800")'), 'original view');
    await click('#view-result');
    await screenshot('image-loaded-desktop', true);
    await viewport(390, 844);
    await noOverflow('image loaded mobile');
    await screenshot('image-loaded-mobile', true);
    console.log('PASS: sample, independent dimensions, ratio lock, presets, sliders, validation, reset, comparison.');

    // Create a transparent fixture. Export must stretch pixels and preserve alpha in PNG/WebP.
    const fixtureData = await evaluate(`(() => { const c=document.createElement('canvas'); c.width=80; c.height=40; const x=c.getContext('2d'); x.fillStyle='#ff0000'; x.fillRect(0,0,40,30); x.fillStyle='#0000ff'; x.fillRect(40,0,40,30); return c.toDataURL('image/png').split(',')[1]; })()`);
    const fixture = path.join(temporary, 'transparent.png');
    await writeFile(fixture, Buffer.from(fixtureData, 'base64'));
    const doc = await cdp('DOM.getDocument');
    const node = await cdp('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file-input' });
    await cdp('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [fixture] });
    await until(() => evaluate('document.querySelector("#file-name").textContent === "transparent.png" && !document.querySelector("#download-image").disabled'), 'file upload');
    await input('#width-input', 160);
    await input('#height-input', 20);
    for (const [format, extension] of [['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
        await evaluate(`(() => {const e=document.querySelector('#export-format');e.value=${JSON.stringify(format)};e.dispatchEvent(new Event('change'));})()`);
        await click('#download-image');
        const output = path.join(downloads, `transparent_160x20.${extension}`);
        await until(() => existsSync(output), 'download ' + extension);
        await until(() => evaluate('!document.querySelector("#download-image").disabled'), 'export completion');
        const bytes = await readFile(output);
        assert.ok(bytes.length > 50);
        const pixelData = await evaluate(`(async () => {const i=new Image(); i.src='data:${format};base64,${bytes.toString('base64')}'; await i.decode(); const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {width:i.width,height:i.height,transparent:[...x.getImageData(80,19,1,1).data],red:[...x.getImageData(20,5,1,1).data],blue:[...x.getImageData(140,5,1,1).data]};})()`);
        assert.equal(pixelData.width, 160);
        assert.equal(pixelData.height, 20);
        assert.ok(pixelData.red[0] > 240 && pixelData.red[2] < 20, 'Red pixels stretch correctly');
        assert.ok(pixelData.blue[2] > 240 && pixelData.blue[0] < 20, 'Blue pixels stretch correctly');
        if (extension === 'jpg') assert.ok(pixelData.transparent.slice(0, 3).every(x => x > 240), 'JPEG white background');
        else assert.equal(pixelData.transparent[3], 0, 'Transparent background');
    }
    await evaluate(`(() => {const data=new DataTransfer();data.items.add(new File(['broken'],'bad.png',{type:'image/png'}));const e=document.querySelector('#file-input');e.files=data.files;e.dispatchEvent(new Event('change'));})()`);
    await until(() => evaluate('document.querySelector("#image-status").classList.contains("error")'), 'corrupt file error');
    assert.equal(await evaluate('document.querySelector("#file-name").textContent'), 'transparent.png');
    assert.equal(await evaluate('document.querySelector("#download-image").disabled'), false);
    // Exercise paste and drop without relying on an OS clipboard.
    await evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${fixtureData}')).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'pasted.png',{type:'image/png'}));document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()`);
    await until(() => evaluate('document.querySelector("#file-name").textContent === "pasted.png"'), 'paste');
    await evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${fixtureData}')).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'dropped.png',{type:'image/png'}));document.querySelector('.preview-panel').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`);
    await until(() => evaluate('document.querySelector("#file-name").textContent === "dropped.png"'), 'drop');
    console.log('PASS: file upload, PNG/JPG/WebP downloads, exact dimensions, stretched pixels, transparency, corrupt file, paste, drag/drop.');

    await imageToolsCases({ cdp, evaluate, click, input, navigate, viewport, screenshot, noOverflow, until, temporary, downloads });

    const routes = ['word-counter', 'markdown-editor', 'code-tester', 'password-generator', 'qr-code-tool', 'random-roulette'];
    for (const route of routes) {
        await navigate(`tools/${route}/index.html`);
        for (const width of [320, 390, 768, 1440]) { await viewport(width); await noOverflow(route + ' at ' + width); }
        assert.ok(await evaluate('document.querySelector(".site-nav .brand").href.endsWith("/project-site/index.html")'));
        if (route === 'word-counter') {
            await input('#text-input', 'Hello 世界 123');
            assert.equal(await evaluate('document.querySelector("#chinese-chars").textContent'), '2');
            assert.equal(await evaluate('document.querySelector("#numbers").textContent'), '3');
        }
        if (route === 'markdown-editor') {
            await input('#markdown-input', '# Hello\n\n**World**');
            assert.equal(await evaluate('document.querySelector("#preview-pane h1")?.textContent'), 'Hello');
        }
        if (route === 'password-generator') {
            await click('#generate-btn');
            assert.equal(await evaluate('document.querySelector("#password-display").textContent.length'), 16);
        }
        if (route === 'qr-code-tool') {
            await input('#qr-text', 'https://example.com');
            assert.ok(await evaluate('!!document.querySelector("#qrcode-display canvas")'));
        }
        if (route === 'random-roulette') await screenshot('roulette-desktop');
    }
    assert.deepEqual(errors, [], 'Browser runtime exceptions');
    assert.deepEqual(missing.filter(url => url.startsWith(base)), [], 'Missing local assets');
    console.log('PASS: all six existing tools, 320/390/768/1440 px layouts, browser runtime, local assets.');
    console.log('Screenshots and verified downloads: ' + temporary);
} finally {
    socket?.close();
    chrome.kill();
    server.close();
}
