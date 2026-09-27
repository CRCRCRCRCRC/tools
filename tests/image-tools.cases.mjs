import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export async function imageToolsCases({ cdp, evaluate, click, input, navigate, viewport, screenshot, noOverflow, until, temporary, downloads }) {
    const ready = () => until(() => evaluate('!document.querySelector("#save-image").disabled'), 'image editor result');
    const change = (id, value) => evaluate(`(() => {const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    async function uploadTo(selector, files) {
        const doc = await cdp('DOM.getDocument');
        const node = await cdp('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
        await cdp('DOM.setFileInputFiles', { nodeId: node.nodeId, files });
    }
    async function upload(files) {
        await uploadTo('#photo-input', files);
        await ready();
    }
    async function fixture(name, width, height, noisy = false) {
        const data = await evaluate(`(() => {const c=document.createElement('canvas');c.width=${width};c.height=${height};const x=c.getContext('2d');
            if(${noisy}) {const d=x.createImageData(c.width,c.height);let seed=7;for(let i=0;i<d.data.length;i+=4){for(let k=0;k<3;k++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d.data[i+k]=seed>>>24;}d.data[i+3]=255;}x.putImageData(d,0,0);}
            else {for(const [color,sx,sy] of [['#ff0000',0,0],['#00ff00',1,0],['#0000ff',0,1],['#ffff00',1,1]]){x.fillStyle=color;x.fillRect(sx*c.width/2,sy*c.height/2,c.width/2,c.height/2);}}
            return c.toDataURL('image/png').split(',')[1];})()`);
        const file = path.join(temporary, name); await writeFile(file, Buffer.from(data, 'base64')); return file;
    }
    async function saved(name) {
        await click('#save-image');
        const file = path.join(downloads, name);
        await until(() => existsSync(file), 'download ' + name);
        return await readFile(file);
    }
    async function pixels(bytes, points, type = 'image/png') {
        return await evaluate(`(async()=>{const i=new Image();i.src='data:${type};base64,${bytes.toString('base64')}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {width:i.width,height:i.height,pixels:${JSON.stringify(points)}.map(([a,b])=>[...x.getImageData(a,b,1,1).data])};})()`);
    }
    async function rectangle(x1, y1, x2, y2) {
        const bounds = await evaluate(`(() => { const b=document.querySelector('#photo-canvas').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`);
        const from = { x: bounds.x + bounds.w * x1, y: bounds.y + bounds.h * y1 }, to = { x: bounds.x + bounds.w * x2, y: bounds.y + bounds.h * y2 };
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...from });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...to });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...to });
    }
    async function point(x, y) {
        const bounds = await evaluate(`(() => { const b=document.querySelector('#photo-canvas').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`);
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: bounds.x + bounds.w * x, y: bounds.y + bounds.h * y });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: bounds.x + bounds.w * x, y: bounds.y + bounds.h * y });
    }

    await viewport(1440);
    await navigate('tools/image-cropper/index.html');
    assert.equal(await evaluate('document.querySelector("#save-image").disabled'), true);
    const pattern = await fixture('crop-pattern.png', 96, 64);
    await upload([pattern]);
    for (const [id, value] of [['crop-x', 24], ['crop-width', 48], ['crop-y', 16], ['crop-height', 32]]) await input('#' + id, value);
    await click('#rotate-right'); await ready();
    assert.ok((await evaluate('document.querySelector("#result-extra").textContent')).includes('32 × 48'));
    const crop = await pixels(await saved('crop-pattern_32x48.png'), [[3, 3], [28, 3], [3, 44], [28, 44]]);
    assert.deepEqual(crop.pixels, [[0, 0, 255, 255], [255, 0, 0, 255], [255, 255, 0, 255], [0, 255, 0, 255]]);
    await click('#flip-x'); await ready();
    assert.equal(await evaluate('document.querySelector("#flip-x").getAttribute("aria-pressed")'), 'true');
    await click('#undo-edit'); await ready();
    assert.equal(await evaluate('document.querySelector("#flip-x").getAttribute("aria-pressed")'), 'false');
    await click('#redo-edit'); await ready();
    assert.equal(await evaluate('document.querySelector("#flip-x").getAttribute("aria-pressed")'), 'true');
    await click('#reset-edit'); await ready();
    await change('crop-ratio', '1'); await ready();
    assert.equal(await evaluate('document.querySelector("#crop-width").value'), '64');
    assert.equal(await evaluate('document.querySelector("#crop-height").value'), '64');
    await change('crop-ratio', 'free'); await click('#select-crop');
    await rectangle(0.1, 0.1, 0.7, 0.8); await ready();
    assert.ok(Number(await evaluate('document.querySelector("#crop-width").value')) < 96);
    await screenshot('crop-desktop');
    console.log('PASS: crop pixel coordinates, rotation pixels, flips, undo/redo, ratio presets, pointer crop.');

    await navigate('tools/image-compressor/index.html');
    const noise = await fixture('compress-noise.png', 256, 256, true);
    await upload([noise]);
    await change('output-format', 'image/png');
    await click('#auto-reduce'); await input('#target-kb', 1); await ready();
    assert.ok((await evaluate('document.querySelector("#result-extra").textContent')).includes('未達目標'));
    await click('#auto-reduce'); await ready();
    assert.equal((await evaluate('document.querySelector("#result-extra").textContent')).includes('未達目標'), false);
    const dimensions = await evaluate('document.querySelector("#result-extra").textContent.match(/(\\d+) × (\\d+)/).slice(1).map(Number)');
    const compressed = await saved(`compress-noise_${dimensions[0]}x${dimensions[1]}.png`);
    assert.ok(compressed.length <= 1024 && compressed.length > 0);
    const compressedPixels = await pixels(compressed, [[0, 0]]);
    assert.equal(compressedPixels.width, dimensions[0]); assert.equal(compressedPixels.height, dimensions[1]);
    await change('output-format', 'image/jpeg'); await input('#target-kb', 4); await ready();
    assert.ok((await evaluate('document.querySelector("#after-size").textContent')).endsWith('KB'));
    await screenshot('compressor-desktop');
    console.log('PASS: compression target, honest unmet target, automatic resizing, exact PNG byte limit, JPEG encoding.');

    await navigate('tools/image-blur/index.html');
    await upload([pattern]); await input('#blur-radius', 8); await ready();
    const whole = await pixels(await saved('crop-pattern_96x64.png'), [[47, 16], [48, 16]]);
    assert.ok(whole.pixels[0][0] > 30 && whole.pixels[0][1] > 30, 'Blur mixes the red/green boundary');
    await change('blur-mode', 'regions'); await ready();
    await click('#select-blur'); await rectangle(0.1, 0.05, 0.9, 0.45); await ready();
    assert.equal(await evaluate('document.querySelectorAll(".region-chip").length'), 1);
    const regionCanvas = await evaluate(`(async()=>{const C=await import('../../assets/image-tools/core.js');
        const c=C.canvasOf(96,64),x=c.getContext('2d');x.fillStyle='#f00';x.fillRect(0,0,48,64);x.fillStyle='#0f0';x.fillRect(48,0,48,64);
        const source={image:c,width:96,height:64}; const s=C.defaultState(96,64,'blur');s.blur.radius=8;s.blur.mode='regions';s.blur.regions=[{x:.1,y:0,w:.8,h:.4}];
        const a=C.render(source,s),ac=a.getContext('2d');const outside=[...ac.getImageData(20,50,1,1).data],inside=[...ac.getImageData(47,10,1,1).data];
        s.rotation=90;const b=C.render(source,s),bc=b.getContext('2d');const rotatedInside=[...bc.getImageData(53,47,1,1).data],rotatedOutside=[...bc.getImageData(13,20,1,1).data];
        C.release(c);C.release(a);C.release(b);return {outside,inside,rotatedInside,rotatedOutside};})()`);
    assert.deepEqual(regionCanvas.outside, [255, 0, 0, 255]); assert.deepEqual(regionCanvas.rotatedOutside, [255, 0, 0, 255]);
    assert.ok(regionCanvas.inside[1] > 30 && regionCanvas.rotatedInside[1] > 30, 'Local blur follows rotation');
    await click('.region-chip'); await ready(); assert.equal(await evaluate('document.querySelectorAll(".region-chip").length'), 0);
    await screenshot('blur-desktop');
    console.log('PASS: whole and selected-region blur, region deletion, unmodified outside pixels, region tracking through rotation.');

    await navigate('tools/chroma-key/index.html');
    await upload([pattern]);
    await input('#chroma-color', '#0000ff');
    await click('#pick-color'); await point(.75, .25);
    assert.equal(await evaluate('document.querySelector("#color-hex").value'), '#00FF00');
    await input('#tolerance', 5); await input('#softness', 0);
    const keyed = await pixels(await saved('crop-pattern_cutout.png'), [[72, 16], [24, 16]]);
    assert.equal(keyed.pixels[0][3], 0, 'Selected green becomes transparent');
    assert.equal(keyed.pixels[1][3], 255, 'Other colors stay opaque');
    await screenshot('chroma-key-desktop', true);
    console.log('PASS: chroma-key eyedropper, tolerance, transparent PNG, preserved foreground.');

    await navigate('tools/image-solid-color/index.html');
    const transparentData = await evaluate(`(() => {const c=document.createElement('canvas');c.width=40;c.height=20;const x=c.getContext('2d');x.clearRect(0,0,40,20);x.fillStyle='#f05a44';x.fillRect(0,0,20,20);return c.toDataURL('image/png').split(',')[1];})()`);
    const transparentShape = path.join(temporary, 'transparent-shape.png');
    await writeFile(transparentShape, Buffer.from(transparentData, 'base64'));
    await upload([transparentShape]);
    await input('#target-color', '#336699');
    const solid = await pixels(await saved('transparent-shape_solid.png'), [[5, 5], [30, 5]]);
    assert.deepEqual(solid.pixels[0], [51, 102, 153, 255], 'Visible pixels use the selected color');
    assert.equal(solid.pixels[1][3], 0, 'Transparency is preserved');
    await click('#preserve-alpha');
    await until(() => evaluate('document.querySelector("#photo-canvas").getContext("2d").getImageData(30,5,1,1).data[3] === 255'), 'opaque pixels');
    await screenshot('solid-color-desktop', true);
    console.log('PASS: solid-color replacement, exact selected RGB, preserved and opaque alpha modes.');

    await navigate('tools/perspective-correction/index.html');
    await uploadTo('#uploadInput', [pattern]);
    await until(() => evaluate('!document.querySelector("#resetBtn").disabled && document.querySelector("#editCanvas").width > 0'), 'perspective image');
    assert.equal(await evaluate('document.querySelector(".tool-intro h1").textContent'), '四點透視校正');
    await screenshot('perspective-desktop', true);

    await navigate('tools/quadrilateral-blur/index.html');
    await uploadTo('#fileInput', [pattern]);
    await until(() => evaluate('!document.querySelector("#addButton").disabled && !document.querySelector("#downloadButton").disabled'), 'quadrilateral blur image');
    await click('#addButton');
    assert.equal(await evaluate('document.querySelector("#deleteButton").disabled'), false);
    await screenshot('quadrilateral-blur-desktop', true);

    await navigate('tools/pixel-color-replacer/index.html');
    await uploadTo('#fileInput', [pattern]);
    await until(() => evaluate('document.querySelector("#canvas").width === 96'), 'pixel replacer image');
    const colorCanvas = await evaluate(`(() => {const b=document.querySelector('#canvas').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: colorCanvas.x + colorCanvas.w * .25, y: colorCanvas.y + colorCanvas.h * .25 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: colorCanvas.x + colorCanvas.w * .25, y: colorCanvas.y + colorCanvas.h * .25 });
    await until(() => evaluate('document.querySelector("#sourceHex").value === "#FF0000"'), 'pixel source color');
    await input('#sourceHex', '#0000FF');
    await until(() => evaluate('document.querySelector("#sourceColorInput").value === "#0000ff"'), 'manual source hex');
    await input('#sourceColorInput', '#ff0000');
    await until(() => evaluate('document.querySelector("#sourceHex").value === "#FF0000"'), 'manual source color');
    await input('#replacementColor', '#123456');
    await until(() => evaluate(`(() => {const d=document.querySelector('#canvas').getContext('2d').getImageData(10,10,1,1).data;return !document.querySelector('#downloadBtn').disabled && d[0]===18 && d[1]===52 && d[2]===86;})()`), 'pixel replacement');
    await click('#downloadBtn');
    const replacedPath = path.join(downloads, 'color-replaced.png');
    await until(() => existsSync(replacedPath), 'pixel replacement download');
    const replaced = await pixels(await readFile(replacedPath), [[10, 10], [70, 10]]);
    assert.deepEqual(replaced.pixels[0], [18, 52, 86, 255]);
    assert.deepEqual(replaced.pixels[1], [0, 255, 0, 255]);
    await click('#expandEnabled');
    await input('#expandRadius', '0.00');
    await until(() => evaluate(`(() => {const d=document.querySelector('#canvas').getContext('2d').getImageData(48,10,1,1).data;return document.querySelector('#expandSlider').min==='0' && d[0]===0 && d[1]===255 && d[2]===0;})()`), 'zero pixel expansion');
    await input('#expandRadius', '1.25');
    await until(() => evaluate(`(() => {const x=document.querySelector('#canvas').getContext('2d');const inner=[...x.getImageData(48,10,1,1).data],edge=[...x.getImageData(49,10,1,1).data];return document.querySelector('#expandRadius').value==='1.25' && inner[0]===18 && edge[0]===5 && edge[1]===204 && edge[2]===22;})()`), 'fractional pixel expansion');
    await screenshot('pixel-color-replacer-desktop', true);
    console.log('PASS: perspective upload, quadrilateral region creation, pixel color replacement/download, two-decimal expansion.');

    await navigate('tools/image-batch/index.html');
    const portrait = await fixture('portrait.png', 64, 96);
    const patternData = (await readFile(pattern)).toString('base64'), portraitData = (await readFile(portrait)).toString('base64');
    await evaluate(`(async()=>{const dt=new DataTransfer();for(const data of [${JSON.stringify(patternData)},${JSON.stringify(portraitData)}]){const b=await(await fetch('data:image/png;base64,'+data)).blob();dt.items.add(new File([b],'同名圖片.png',{type:'image/png'}));}dt.items.add(new File(['broken'],'broken.png',{type:'image/png'}));const e=document.querySelector('#photo-input');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);
    await ready(); assert.equal(await evaluate('document.querySelectorAll(".queue-row").length'), 2);
    assert.ok((await evaluate('document.querySelector("#photo-status").textContent')).includes('broken.png'));
    await click('#resize-enabled'); await click('#resize-lock');
    await input('#resize-width', 80); await input('#resize-height', 40); await change('output-format', 'image/png'); await ready();
    await click('#apply-all'); await click('#process-all');
    await until(() => evaluate('document.querySelector("#batch-status").textContent.includes("完成 2 / 2") && !document.querySelector("#save-zip").disabled'), 'batch completion');
    await click('#save-zip');
    const zipPath = path.join(downloads, 'toolbox-images.zip'); await until(() => existsSync(zipPath), 'ZIP file');
    const zip = JSON.parse(execFileSync('python', ['-c', 'import zipfile,json,sys,base64; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))', zipPath], { encoding: 'utf8', windowsHide: true }));
    assert.equal(Object.keys(zip).length, 2); assert.ok(Object.keys(zip).some(name => name.endsWith('_2.png')));
    for (const [name, encoded] of Object.entries(zip)) { assert.ok(name.startsWith('同名圖片')); const result = await pixels(Buffer.from(encoded, 'base64'), [[0, 0]]); assert.equal(result.width, 80); assert.equal(result.height, 40); }
    await until(() => evaluate('!document.querySelector(".queue-select").disabled'), 'ZIP UI unlocked');
    await click('.queue-row:nth-child(2) .queue-select'); await ready();
    await click('#resize-lock'); await input('#resize-width', 50); await ready();
    assert.equal(await evaluate('document.querySelector("#resize-height").value'), '75');
    await click('.queue-row:first-child .queue-select'); await ready();
    assert.equal(await evaluate('document.querySelector("#resize-width").value'), '80');
    await click('#apply-all');
    await evaluate('document.querySelector("#process-all").click(); document.querySelector("#cancel-batch").click();');
    await until(() => evaluate('document.querySelector("#batch-status").textContent.startsWith("已取消") && document.querySelector("#cancel-batch").hidden'), 'batch cancellation');
    await screenshot('batch-desktop', true);
    console.log('PASS: multi-file queue, corrupt-file recovery, applying settings, independent edits, aspect lock, cancellation, actual ZIP CRC/UTF-8/duplicate filenames.');

    await navigate('tools/image-editor/index.html'); await upload([pattern]);
    for (const [id, value] of [['crop-width', 72], ['crop-height', 48], ['crop-x', 12], ['crop-y', 8]]) await input('#' + id, value);
    await click('#rotate-right'); await click('[data-tab="resize"]');
    await click('#resize-enabled'); await click('#resize-lock'); await input('#resize-width', 200); await input('#resize-height', 100);
    await click('[data-tab="blur"]'); await input('#blur-radius', 4);
    await click('[data-tab="compress"]'); await change('output-format', 'image/jpeg'); await input('#target-kb', 8); await ready();
    const combined = await saved('crop-pattern_200x100.jpg');
    assert.ok(combined.length <= 8 * 1024);
    const composite = await pixels(combined, [[2, 2], [197, 2]], 'image/jpeg');
    assert.equal(composite.width, 200); assert.equal(composite.height, 100);
    assert.ok(composite.pixels[0][2] > composite.pixels[0][0], 'Crop/rotation survive resize and blur');
    assert.ok(composite.pixels[1][0] > composite.pixels[1][2]);
    await screenshot('integrated-desktop', true);
    await viewport(390, 844); await screenshot('integrated-mobile', true);
    await input('#target-kb', -1);
    await until(() => evaluate('!document.querySelector("#validation-error").hidden'), 'invalid target');
    assert.equal(await evaluate('document.querySelector("#save-image").disabled'), true);
    await input('#target-kb', 8); await ready();
    await click('#advanced-tab');
    await until(() => evaluate('document.querySelector("#advanced-frame").contentDocument?.title === "四點透視校正 — 萬能工具箱"'), 'integrated perspective tool');
    await click('[data-advanced-url*="quadrilateral-blur"]');
    await until(() => evaluate('document.querySelector("#advanced-frame").contentDocument?.title === "四點區域模糊 — 萬能工具箱"'), 'integrated quadrilateral tool');
    await click('[data-advanced-url*="chroma-key"]');
    await until(() => evaluate('document.querySelector("#advanced-frame").contentDocument?.title === "色度摳圖 — 萬能工具箱"'), 'integrated chroma-key tool');
    await click('[data-advanced-url*="image-solid-color"]');
    await until(() => evaluate('document.querySelector("#advanced-frame").contentDocument?.title === "圖片統一顏色 — 萬能工具箱"'), 'integrated solid-color tool');
    await click('[data-advanced-url*="quadrilateral-blur"]');
    await until(() => evaluate('document.querySelector("#advanced-frame").contentDocument?.title === "四點區域模糊 — 萬能工具箱"'), 'integrated quadrilateral return');
    await screenshot('integrated-advanced-desktop', true);
    await click('[data-tab="crop"]');
    console.log('PASS: integrated crop → rotation → stretch → blur → compression, exact JPEG output, invalid settings recovery.');

    for (const route of ['image-compressor', 'image-blur', 'image-cropper', 'image-batch', 'image-editor', 'chroma-key', 'image-solid-color']) {
        await navigate(`tools/${route}/index.html`); await click('#demo-photo'); await ready();
        for (const width of [320, 390, 768, 900, 1440]) { await viewport(width); await noOverflow(route + ' at ' + width); }
        if (route === 'image-editor') {
            for (const tab of ['crop', 'resize', 'blur', 'compress']) { await click(`[data-tab="${tab}"]`); await viewport(320); await noOverflow('integrated tab ' + tab); }
            await click('#advanced-tab'); await viewport(320); await noOverflow('integrated advanced tools');
        }
    }
    for (const route of ['perspective-correction', 'quadrilateral-blur', 'pixel-color-replacer']) {
        await navigate(`tools/${route}/index.html`);
        for (const width of [320, 390, 768, 900, 1440]) { await viewport(width); await noOverflow(route + ' at ' + width); }
    }
    console.log('PASS: all ten image tools at 320/390/768/900/1440 px and all integrated tabs.');
}
