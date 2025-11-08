document.addEventListener('DOMContentLoaded', () => {
    const minValueInput = document.getElementById('min-value');
    const maxValueInput = document.getElementById('max-value');
    const countInput = document.getElementById('count');
    const integerOnlyCheckbox = document.getElementById('integer-only');
    const uniqueOnlyCheckbox = document.getElementById('unique-only');
    const sortResultsCheckbox = document.getElementById('sort-results');
    const generateBtn = document.getElementById('generate-btn');
    const resultDisplay = document.getElementById('result-display');
    const statsDiv = document.getElementById('stats');
    const copyBtn = document.getElementById('copy-btn');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history');

    let currentResults = [];
    let history = JSON.parse(localStorage.getItem('randomNumberHistory')) || [];

    // 更新 unique only 選項可用性
    integerOnlyCheckbox.addEventListener('change', () => {
        if (!integerOnlyCheckbox.checked) {
            uniqueOnlyCheckbox.checked = false;
            uniqueOnlyCheckbox.disabled = true;
        } else {
            uniqueOnlyCheckbox.disabled = false;
        }
    });

    // 生成隨機數
    generateBtn.addEventListener('click', generate);

    function generate() {
        const min = parseFloat(minValueInput.value);
        const max = parseFloat(maxValueInput.value);
        const count = parseInt(countInput.value);
        const integerOnly = integerOnlyCheckbox.checked;
        const uniqueOnly = uniqueOnlyCheckbox.checked;
        const sortResults = sortResultsCheckbox.checked;

        // 驗證輸入
        if (isNaN(min) || isNaN(max)) {
            alert('請輸入有效的最小值和最大值');
            return;
        }

        if (min >= max) {
            alert('最小值必須小於最大值');
            return;
        }

        if (count < 1 || count > 1000) {
            alert('生成數量必須介於 1 到 1000 之間');
            return;
        }

        if (uniqueOnly && integerOnly) {
            const range = Math.floor(max) - Math.ceil(min) + 1;
            if (count > range) {
                alert(`在不重複模式下，數量不能超過範圍內的整數數量（${range}）`);
                return;
            }
        }

        // 生成隨機數
        currentResults = [];

        if (uniqueOnly && integerOnly) {
            // 不重複整數
            const available = [];
            for (let i = Math.ceil(min); i <= Math.floor(max); i++) {
                available.push(i);
            }

            for (let i = 0; i < count; i++) {
                const index = Math.floor(Math.random() * available.length);
                currentResults.push(available.splice(index, 1)[0]);
            }
        } else {
            // 一般模式
            for (let i = 0; i < count; i++) {
                let num;
                if (integerOnly) {
                    num = Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min);
                } else {
                    num = Math.random() * (max - min) + min;
                }
                currentResults.push(num);
            }
        }

        // 排序（如果需要）
        if (sortResults) {
            currentResults.sort((a, b) => a - b);
        }

        // 顯示結果
        displayResults();

        // 儲存到歷史
        saveToHistory();
    }

    function displayResults() {
        const formatted = integerOnlyCheckbox.checked
            ? currentResults.join(', ')
            : currentResults.map(n => n.toFixed(4)).join(', ');

        resultDisplay.textContent = formatted;
        resultDisplay.classList.add('has-content');

        // 顯示統計
        displayStats();

        // 顯示複製按鈕
        copyBtn.style.display = 'block';
    }

    function displayStats() {
        const sum = currentResults.reduce((a, b) => a + b, 0);
        const avg = sum / currentResults.length;
        const min = Math.min(...currentResults);
        const max = Math.max(...currentResults);

        document.getElementById('sum').textContent = integerOnlyCheckbox.checked
            ? sum.toFixed(0)
            : sum.toFixed(4);

        document.getElementById('average').textContent = avg.toFixed(4);
        document.getElementById('min').textContent = integerOnlyCheckbox.checked
            ? min.toFixed(0)
            : min.toFixed(4);

        document.getElementById('max').textContent = integerOnlyCheckbox.checked
            ? max.toFixed(0)
            : max.toFixed(4);

        statsDiv.style.display = 'grid';
    }

    function saveToHistory() {
        const entry = {
            timestamp: new Date().toLocaleString('zh-TW'),
            range: `${minValueInput.value} ~ ${maxValueInput.value}`,
            count: currentResults.length,
            results: currentResults.slice(0, 50), // 只儲存前 50 個
            integerOnly: integerOnlyCheckbox.checked
        };

        history.unshift(entry);
        if (history.length > 20) {
            history = history.slice(0, 20);
        }

        localStorage.setItem('randomNumberHistory', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        if (history.length === 0) {
            historyList.innerHTML = '<p class="placeholder">尚無歷史記錄</p>';
            return;
        }

        historyList.innerHTML = history.map(entry => {
            const formatted = entry.integerOnly
                ? entry.results.join(', ')
                : entry.results.map(n => n.toFixed(4)).join(', ');

            const preview = entry.results.length > 10
                ? formatted.split(', ').slice(0, 10).join(', ') + '...'
                : formatted;

            return `
                <div class="history-item">
                    <div class="history-item-header">
                        ${entry.timestamp} | 範圍：${entry.range} | 數量：${entry.count}
                    </div>
                    <div class="history-item-content">${preview}</div>
                </div>
            `;
        }).join('');
    }

    // 複製按鈕
    copyBtn.addEventListener('click', () => {
        const text = resultDisplay.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '已複製！';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 1500);
        });
    });

    // 清空歷史
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('確定要清空所有歷史記錄嗎？')) {
            history = [];
            localStorage.removeItem('randomNumberHistory');
            renderHistory();
        }
    });

    // 初始渲染
    renderHistory();
});
