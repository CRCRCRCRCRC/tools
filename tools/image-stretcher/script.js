(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const fileInput = $('file-input');
    const settings = $('image-settings');
    const widthInput = $('width-input');
    const heightInput = $('height-input');
    const widthScale = $('width-scale');
    const heightScale = $('height-scale');
    const lockRatio = $('lock-ratio');
    const preview = $('preview-canvas');
    const previewContext = preview.getContext('2d');
    const downloadButton = $('download-image');
    const status = $('image-status');
    const MAX_SIDE = 8192;
    const MAX_PIXELS = 24000000;
    const MAX_SOURCE_PIXELS = 50000000;
    const MAX_FILE_BYTES = 50 * 1024 * 1024;
    let source = null;
    let sourceName = '';
    let targetWidth = 0;
    let targetHeight = 0;
    let showOriginal = false;
    let loading = false;
    let exporting = false;
    let validDimensions = false;
    let loadVersion = 0;
    let previewFrame = 0;
    const downloadUrls = new Set();

    function announce(message, error = false) {
        status.textContent = message;
        status.classList.toggle('error', error);
    }

    function updateAvailability() {
        settings.disabled = !source || loading || exporting;
        downloadButton.disabled = !source || !validDimensions || loading || exporting;
        $('reset-image').disabled = !source || loading || exporting;
        $('change-file').disabled = exporting;
        $('choose-file').disabled = exporting;
        $('load-sample').disabled = exporting;
        $('download-hint').textContent = !source ? '選擇圖片後，就能開始調整'
            : loading ? '正在讀取圖片…'
            : exporting ? '正在產生圖片，請稍候…'
            : !validDimensions ? '請先修正圖片尺寸'
            : '圖片不會上傳，下載後即可使用';
    }

    function syncSliders() {
        [[widthScale, $('width-percent'), targetWidth / source.naturalWidth],
         [heightScale, $('height-percent'), targetHeight / source.naturalHeight]].forEach(([slider, output, ratio]) => {
            const percentage = ratio * 100;
            // Pixel inputs can describe values outside the default 10–300% slider range.
            slider.min = percentage < 10 ? Math.max(0.01, Math.floor(percentage * 100) / 100) : 10;
            slider.max = Math.max(300, Math.ceil(percentage));
            slider.step = percentage < 10 ? 0.01 : 1;
            slider.value = String(percentage);
            output.value = Number(percentage.toFixed(1)) + '%';
        });
    }

    function validateDimensions() {
        const width = Number(widthInput.value);
        const height = Number(heightInput.value);
        const widthValid = widthInput.value !== '' && Number.isInteger(width) && width >= 1 && width <= MAX_SIDE;
        const heightValid = heightInput.value !== '' && Number.isInteger(height) && height >= 1 && height <= MAX_SIDE;
        let error = '';
        if (!widthValid || !heightValid) error = '寬度與高度請輸入 1–8,192 之間的整數。';
        else if (width * height > MAX_PIXELS) error = '總像素超過 2,400 萬，請降低寬度或高度。';
        widthInput.setAttribute('aria-invalid', String(!widthValid || width * height > MAX_PIXELS));
        heightInput.setAttribute('aria-invalid', String(!heightValid || width * height > MAX_PIXELS));
        $('dimension-error').textContent = error;
        $('dimension-error').hidden = !error;
        validDimensions = !error && Boolean(source);
        if (validDimensions) {
            targetWidth = width;
            targetHeight = height;
            $('output-size').textContent = width.toLocaleString() + ' × ' + height.toLocaleString() + ' px';
            syncSliders();
            schedulePreview();
        } else {
            $('output-size').textContent = '請修正尺寸';
            $('preview-help').textContent = '尺寸無效，目前保留上一次有效的預覽。';
        }
        updateAvailability();
        return validDimensions;
    }

    function setDimensions(width, height) {
        widthInput.value = String(width);
        heightInput.value = String(height);
        validateDimensions();
    }

    function inputDimension(axis) {
        if (!source) return;
        announce('');
        const input = axis === 'width' ? widthInput : heightInput;
        const value = Number(input.value);
        if (lockRatio.checked && input.value !== '' && Number.isInteger(value) && value > 0 && value <= MAX_SIDE) {
            if (axis === 'width') heightInput.value = String(Math.max(1, Math.round(value * source.naturalHeight / source.naturalWidth)));
            else widthInput.value = String(Math.max(1, Math.round(value * source.naturalWidth / source.naturalHeight)));
        }
        validateDimensions();
    }

    function schedulePreview() {
        cancelAnimationFrame(previewFrame);
        previewFrame = requestAnimationFrame(renderPreview);
    }

    function renderPreview() {
        if (!source || !previewContext) return;
        const width = showOriginal ? source.naturalWidth : targetWidth;
        const height = showOriginal ? source.naturalHeight : targetHeight;
        if (!width || !height) return;
        // The preview stays lightweight; export uses the exact requested dimensions.
        const scale = Math.min(1, 1600 / width, 1200 / height);
        preview.width = Math.max(1, Math.round(width * scale));
        preview.height = Math.max(1, Math.round(height * scale));
        preview.style.aspectRatio = width + ' / ' + height;
        previewContext.imageSmoothingEnabled = $('image-smoothing').checked;
        previewContext.imageSmoothingQuality = 'high';
        if (!showOriginal && $('export-format').value === 'image/jpeg') {
            previewContext.fillStyle = '#ffffff';
            previewContext.fillRect(0, 0, preview.width, preview.height);
        }
        previewContext.drawImage(source, 0, 0, preview.width, preview.height);
        $('preview-dimensions').textContent = width.toLocaleString() + ' × ' + height.toLocaleString() + ' px';
        preview.setAttribute('aria-label', (showOriginal ? '原始圖片' : '調整後圖片') + '，' + width + ' × ' + height + ' 像素');
        if (validDimensions) {
            $('preview-help').textContent = showOriginal ? '正在查看原圖，下載仍使用調整後的尺寸。' : '預覽會自動縮放以完整顯示，下載使用指定尺寸。';
        }
    }

    function selectView(original) {
        showOriginal = original;
        $('view-original').classList.toggle('selected', original);
        $('view-result').classList.toggle('selected', !original);
        $('view-original').setAttribute('aria-pressed', String(original));
        $('view-result').setAttribute('aria-pressed', String(!original));
        schedulePreview();
    }

    function fittedOriginal() {
        const scale = Math.min(1, MAX_SIDE / source.naturalWidth, MAX_SIDE / source.naturalHeight,
            Math.sqrt(MAX_PIXELS / (source.naturalWidth * source.naturalHeight)));
        return [
            Math.max(1, Math.floor(source.naturalWidth * scale)),
            Math.max(1, Math.floor(source.naturalHeight * scale))
        ];
    }

    async function loadFile(file) {
        if (!file || exporting) return;
        const supportedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/x-ms-bmp'];
        const supported = supportedTypes.includes(file.type) || (!file.type && /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || ''));
        if (!supported) {
            announce('請選擇 PNG、JPG、WebP、GIF 或 BMP 圖片。', true);
            return;
        }
        if (!file.size || file.size > MAX_FILE_BYTES) {
            announce(file.size ? '圖片超過 50 MB，請選擇較小的檔案。' : '這個檔案是空的，請重新選擇圖片。', true);
            return;
        }
        const version = ++loadVersion;
        loading = true;
        updateAvailability();
        announce('正在讀取圖片…');
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('無法讀取這張圖片，請確認檔案完整，或轉成 PNG／JPG 後重試。'));
                img.src = url;
            });
            if (version !== loadVersion) return;
            if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > MAX_SOURCE_PIXELS) {
                throw new Error('來源圖片超過 5,000 萬像素或尺寸無效，請先縮小圖片後重試。');
            }
            source = img;
            sourceName = file.name || 'clipboard-image.png';
            $('file-name').textContent = sourceName;
            $('file-name').title = sourceName;
            $('file-size').textContent = img.naturalWidth.toLocaleString() + ' × ' + img.naturalHeight.toLocaleString() + ' · ' +
                (file.size >= 1048576 ? (file.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(file.size / 1024)) + ' KB');
            $('drop-zone').hidden = true;
            $('loaded-preview').hidden = false;
            $('change-file').hidden = false;
            $('empty-preview-tag').hidden = true;
            lockRatio.checked = false;
            $('export-format').value = 'image/png';
            $('quality-field').hidden = true;
            $('image-smoothing').checked = true;
            const [width, height] = fittedOriginal();
            setDimensions(width, height);
            selectView(false);
            announce(width !== img.naturalWidth || height !== img.naturalHeight
                ? '圖片已載入；已等比例縮小至可匯出的尺寸範圍。'
                : '圖片已載入。試著拉動滑桿，或直接輸入寬度與高度。');
        } catch (error) {
            if (version === loadVersion) announce(error.message || '讀取圖片失敗，請重新選擇。', true);
        } finally {
            URL.revokeObjectURL(url);
            if (version === loadVersion) {
                loading = false;
                updateAvailability();
            }
        }
    }

    async function loadSample() {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e8eddb';
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = '#e9b971';
        ctx.beginPath();
        ctx.arc(620, 145, 65, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b7c8a7';
        ctx.beginPath();
        ctx.moveTo(0, 400); ctx.lineTo(220, 125); ctx.lineTo(610, 600); ctx.lineTo(0, 600);
        ctx.fill();
        ctx.fillStyle = '#86a080';
        ctx.beginPath();
        ctx.moveTo(225, 600); ctx.lineTo(570, 250); ctx.lineTo(800, 465); ctx.lineTo(800, 600);
        ctx.fill();
        ctx.fillStyle = '#3c6550';
        ctx.beginPath();
        ctx.moveTo(0, 480); ctx.bezierCurveTo(250, 350, 530, 640, 800, 420);
        ctx.lineTo(800, 600); ctx.lineTo(0, 600);
        ctx.fill();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        canvas.width = canvas.height = 1;
        if (blob) await loadFile(new File([blob], 'toolbox-landscape.png', { type: 'image/png' }));
        else announce('無法建立範例圖片，請選擇自己的圖片。', true);
    }

    async function downloadImage() {
        if (loading || exporting || !source || !validateDimensions()) return;
        exporting = true;
        updateAvailability();
        announce('正在產生下載檔案…');
        const canvas = document.createElement('canvas');
        const width = targetWidth;
        const height = targetHeight;
        try {
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('瀏覽器無法建立圖片，請降低輸出尺寸後重試。');
            const format = $('export-format').value;
            if (format === 'image/jpeg') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
            }
            ctx.imageSmoothingEnabled = $('image-smoothing').checked;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(source, 0, 0, width, height);
            const blob = await new Promise((resolve, reject) => canvas.toBlob(
                result => result ? resolve(result) : reject(new Error('產生圖片失敗，請降低輸出尺寸後重試。')),
                format, Number($('export-quality').value) / 100
            ));
            const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
            const stem = sourceName.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'image';
            const url = URL.createObjectURL(blob);
            downloadUrls.add(url);
            const link = document.createElement('a');
            link.href = url;
            link.download = stem + '_' + width + 'x' + height + '.' + extension;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => {
                URL.revokeObjectURL(url);
                downloadUrls.delete(url);
            }, 60000);
            announce(blob.type !== format ? '此瀏覽器不支援所選格式，已改以 PNG 下載。'
                : '圖片已準備完成：' + width + ' × ' + height + ' px，請查看瀏覽器的下載項目。');
        } catch (error) {
            announce(error.message || '下載失敗，請降低輸出尺寸後重試。', true);
        } finally {
            canvas.width = canvas.height = 1;
            exporting = false;
            updateAvailability();
        }
    }

    $('choose-file').addEventListener('click', () => fileInput.click());
    $('change-file').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        loadFile(file);
    });
    $('load-sample').addEventListener('click', loadSample);
    widthInput.addEventListener('input', () => inputDimension('width'));
    heightInput.addEventListener('input', () => inputDimension('height'));
    widthScale.addEventListener('input', () => {
        if (!source) return;
        widthInput.value = String(Math.max(1, Math.round(source.naturalWidth * Number(widthScale.value) / 100)));
        inputDimension('width');
    });
    heightScale.addEventListener('input', () => {
        if (!source) return;
        heightInput.value = String(Math.max(1, Math.round(source.naturalHeight * Number(heightScale.value) / 100)));
        inputDimension('height');
    });
    lockRatio.addEventListener('change', () => {
        if (lockRatio.checked) inputDimension('width');
    });
    document.querySelectorAll('.preset-grid button').forEach(button => {
        button.addEventListener('click', () => {
            if (!source) return;
            lockRatio.checked = false;
            setDimensions(Math.max(1, Math.round(source.naturalWidth * Number(button.dataset.width))),
                Math.max(1, Math.round(source.naturalHeight * Number(button.dataset.height))));
            selectView(false);
            announce(validDimensions ? '已套用快速變換，可繼續微調寬度與高度。' : '');
        });
    });
    $('reset-image').addEventListener('click', () => {
        if (!source) return;
        lockRatio.checked = false;
        setDimensions(...fittedOriginal());
        selectView(false);
        announce(targetWidth === source.naturalWidth && targetHeight === source.naturalHeight
            ? '已還原圖片的原始尺寸。' : '已還原為可匯出範圍內的原始比例。');
    });
    $('view-result').addEventListener('click', () => selectView(false));
    $('view-original').addEventListener('click', () => selectView(true));
    $('export-format').addEventListener('change', () => {
        $('quality-field').hidden = $('export-format').value === 'image/png';
        schedulePreview();
    });
    $('export-quality').addEventListener('input', () => {
        $('quality-value').value = $('export-quality').value + '%';
    });
    $('image-smoothing').addEventListener('change', schedulePreview);
    downloadButton.addEventListener('click', downloadImage);

    const previewPanel = document.querySelector('.preview-panel');
    let dragDepth = 0;
    previewPanel.addEventListener('dragenter', event => {
        event.preventDefault();
        dragDepth++;
        previewPanel.classList.add('drag-over');
    });
    previewPanel.addEventListener('dragover', event => event.preventDefault());
    previewPanel.addEventListener('dragleave', event => {
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) previewPanel.classList.remove('drag-over');
    });
    previewPanel.addEventListener('drop', event => {
        event.preventDefault();
        dragDepth = 0;
        previewPanel.classList.remove('drag-over');
        loadFile(event.dataTransfer.files[0]);
    });
    // Keep dropped files from navigating away from the tool.
    document.addEventListener('dragover', event => {
        if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
    });
    document.addEventListener('drop', event => {
        if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
    });
    document.addEventListener('paste', event => {
        const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
        if (item) {
            event.preventDefault();
            loadFile(item.getAsFile());
        }
    });
    window.addEventListener('pagehide', () => {
        downloadUrls.forEach(url => URL.revokeObjectURL(url));
        downloadUrls.clear();
    });
    if (!previewContext) announce('此瀏覽器無法顯示圖片預覽，請使用支援 Canvas 的瀏覽器。', true);
    updateAvailability();
})();
