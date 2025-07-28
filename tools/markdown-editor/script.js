document.addEventListener('DOMContentLoaded', () => {
    const markdownInput = document.getElementById('markdown-input');
    const previewPane = document.getElementById('preview-pane');

    const updatePreview = () => {
        const markdownText = markdownInput.value;
        // 使用 marked.js 解析 Markdown
        const rawHtml = marked.parse(markdownText);
        // 使用 DOMPurify 清理 HTML，防止 XSS 攻擊
        const sanitizedHtml = DOMPurify.sanitize(rawHtml);
        previewPane.innerHTML = sanitizedHtml;
    };

    // 監聽輸入事件
    markdownInput.addEventListener('input', updatePreview);

    // 初始載入時也更新一次，方便看到預設文字的效果
    updatePreview();
}); 