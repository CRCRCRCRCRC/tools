document.addEventListener('DOMContentLoaded', () => {
    const htmlCode = document.getElementById('html-code');
    const cssCode = document.getElementById('css-code');
    const jsCode = document.getElementById('js-code');
    const runBtn = document.getElementById('run-btn');

    runBtn.addEventListener('click', () => {
        const html = htmlCode.value;
        const css = cssCode.value;
        const js = jsCode.value;

        const resultPageContent = `
            <!DOCTYPE html>
            <html lang="zh-Hant">
            <head>
                <meta charset="UTF-8">
                <title>測試結果</title>
                <style>
                    ${css}
                </style>
            </head>
            <body>
                ${html}
                <script>
                    ${js}
                </script>
            </body>
            </html>
        `;

        const newTab = window.open();
        newTab.document.open();
        newTab.document.write(resultPageContent);
        newTab.document.close();
    });
}); 