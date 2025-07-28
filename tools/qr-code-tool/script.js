document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const qrTextInput = document.getElementById('qr-text');
    const qrcodeDisplay = document.getElementById('qrcode-display');
    const downloadBtn = document.getElementById('download-btn');
    const uploadBox = document.getElementById('upload-box');
    const qrFileInput = document.getElementById('qr-file-input');
    const resultDisplay = document.getElementById('result-display');

    // --- QR Code Generation ---
    const generateQRCode = () => {
        const text = qrTextInput.value.trim();
        qrcodeDisplay.innerHTML = ''; // 清空舊的 QR Code
        if (text) {
            // 每次都建立一個新的 QRCode 實例，確保狀態是乾淨的
            new QRCode(qrcodeDisplay, {
                text: text,
                width: 256,
                height: 256,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            downloadBtn.style.display = 'inline-block';
        } else {
            downloadBtn.style.display = 'none';
        }
    };

    qrTextInput.addEventListener('input', generateQRCode);

    // --- QR Code Download ---
    downloadBtn.addEventListener('click', () => {
        // 從 canvas 取得 data URL 以下載更高品質的圖片
        const canvas = qrcodeDisplay.querySelector('canvas');
        if (canvas) {
            downloadBtn.href = canvas.toDataURL('image/png');
            downloadBtn.download = 'qrcode.png';
        }
    });

    // --- QR Code Decoding ---
    const decodeQRCode = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert',
                });

                if (code) {
                    resultDisplay.textContent = code.data;
                } else {
                    resultDisplay.textContent = '辨識失敗，請確認圖片是否清晰且包含有效的 QR Code。';
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    // --- Event Listeners for Decoding ---
    uploadBox.addEventListener('click', () => qrFileInput.click());
    qrFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            decodeQRCode(e.target.files[0]);
        }
    });

    uploadBox.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    decodeQRCode(blob);
                }
                e.preventDefault();
                return;
            }
        }
    });

    // Drag and Drop functionality
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.style.backgroundColor = '#e2e6ea';
    });
    uploadBox.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadBox.style.backgroundColor = '#f8f9fa';
    });
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.style.backgroundColor = '#f8f9fa';
        if (e.dataTransfer.files.length > 0) {
            decodeQRCode(e.dataTransfer.files[0]);
        }
    });
});
