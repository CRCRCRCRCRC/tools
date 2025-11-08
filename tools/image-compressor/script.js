document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const editorSection = document.getElementById('editor-section');
    const uploadSection = document.querySelector('.upload-section');

    const originalCanvas = document.getElementById('original-canvas');
    const compressedCanvas = document.getElementById('compressed-canvas');
    const originalCtx = originalCanvas.getContext('2d');
    const compressedCtx = compressedCanvas.getContext('2d');

    const originalSizeSpan = document.getElementById('original-size');
    const originalDimensionsSpan = document.getElementById('original-dimensions');
    const compressedSizeSpan = document.getElementById('compressed-size');
    const compressionRatioSpan = document.getElementById('compression-ratio');

    const formatSelect = document.getElementById('format-select');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const maxWidthInput = document.getElementById('max-width');
    const maxHeightInput = document.getElementById('max-height');
    const downloadBtn = document.getElementById('download-btn');
    const resetBtn = document.getElementById('reset-btn');

    let originalImage = null;
    let originalFile = null;

    // 點擊上傳區域
    dropZone.addEventListener('click', () => fileInput.click());

    // 拖曳事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFile(file);
        }
    });

    // 檔案選擇
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFile(file);
        }
    });

    // 貼上圖片
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                handleFile(file);
                break;
            }
        }
    });

    function handleFile(file) {
        originalFile = file;
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                displayOriginalImage();
                compressImage();
                uploadSection.style.display = 'none';
                editorSection.style.display = 'block';
            };
            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    }

    function displayOriginalImage() {
        originalCanvas.width = originalImage.width;
        originalCanvas.height = originalImage.height;
        originalCtx.drawImage(originalImage, 0, 0);

        originalSizeSpan.textContent = formatFileSize(originalFile.size);
        originalDimensionsSpan.textContent = `${originalImage.width} × ${originalImage.height}`;
    }

    function compressImage() {
        const quality = qualitySlider.value / 100;
        const format = formatSelect.value;
        const maxWidth = parseInt(maxWidthInput.value) || null;
        const maxHeight = parseInt(maxHeightInput.value) || null;

        let width = originalImage.width;
        let height = originalImage.height;

        // 計算縮放尺寸
        if (maxWidth || maxHeight) {
            const widthRatio = maxWidth ? maxWidth / width : Infinity;
            const heightRatio = maxHeight ? maxHeight / height : Infinity;
            const ratio = Math.min(widthRatio, heightRatio, 1);

            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }

        compressedCanvas.width = width;
        compressedCanvas.height = height;
        compressedCtx.drawImage(originalImage, 0, 0, width, height);

        // 轉換為 Blob 並計算大小
        compressedCanvas.toBlob((blob) => {
            compressedSizeSpan.textContent = formatFileSize(blob.size);
            const ratio = ((1 - blob.size / originalFile.size) * 100).toFixed(1);
            compressionRatioSpan.textContent = `${ratio}%`;
        }, format, quality);
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // 監聽設定變更
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = qualitySlider.value;
        compressImage();
    });

    formatSelect.addEventListener('change', compressImage);
    maxWidthInput.addEventListener('input', compressImage);
    maxHeightInput.addEventListener('input', compressImage);

    // 下載按鈕
    downloadBtn.addEventListener('click', () => {
        const quality = qualitySlider.value / 100;
        const format = formatSelect.value;

        compressedCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const extension = format.split('/')[1];
            a.download = `compressed_${Date.now()}.${extension}`;
            a.click();

            URL.revokeObjectURL(url);
        }, format, quality);
    });

    // 重置按鈕
    resetBtn.addEventListener('click', () => {
        uploadSection.style.display = 'block';
        editorSection.style.display = 'none';
        fileInput.value = '';
        maxWidthInput.value = '';
        maxHeightInput.value = '';
        qualitySlider.value = 80;
        qualityValue.textContent = '80';
    });
});
