document.addEventListener('DOMContentLoaded', () => {
    const participantsInput = document.getElementById('participants-input');
    const totalCountSpan = document.getElementById('total-count');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const drawBtn = document.getElementById('draw-btn');
    const resetBtn = document.getElementById('reset-btn');
    const resultSection = document.getElementById('result-section');
    const resultDisplay = document.getElementById('result-display');
    const copyResultBtn = document.getElementById('copy-result-btn');
    const drawAgainBtn = document.getElementById('draw-again-btn');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history');

    let currentMode = 'single';
    let participants = [];
    let history = JSON.parse(localStorage.getItem('lotteryHistory')) || [];

    // 更新參與者計數
    participantsInput.addEventListener('input', updateParticipantCount);
    updateParticipantCount();

    function updateParticipantCount() {
        participants = participantsInput.value
            .split('\n')
            .map(p => p.trim())
            .filter(p => p !== '');
        totalCountSpan.textContent = participants.length;
    }

    // 切換模式
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;

            // 隱藏所有模式內容
            document.querySelectorAll('.mode-content').forEach(content => {
                content.style.display = 'none';
            });

            // 顯示當前模式
            document.getElementById(`${currentMode}-mode`).style.display = 'block';
        });
    });

    // 抽籤
    drawBtn.addEventListener('click', draw);
    drawAgainBtn.addEventListener('click', draw);

    function draw() {
        updateParticipantCount();

        if (participants.length === 0) {
            alert('請輸入參與者名單');
            return;
        }

        let result = null;

        switch (currentMode) {
            case 'single':
                result = drawSingle();
                break;
            case 'multiple':
                result = drawMultiple();
                break;
            case 'group':
                result = drawGroup();
                break;
        }

        if (result) {
            displayResult(result);
            saveToHistory(result);
        }
    }

    function drawSingle() {
        const winner = participants[Math.floor(Math.random() * participants.length)];
        return {
            mode: 'single',
            winners: [winner]
        };
    }

    function drawMultiple() {
        const count = parseInt(document.getElementById('draw-count').value);
        const noRepeat = document.getElementById('no-repeat').checked;

        if (count < 1) {
            alert('抽取人數必須大於 0');
            return null;
        }

        if (noRepeat && count > participants.length) {
            alert(`不重複模式下，抽取人數不能超過參與者總數（${participants.length}）`);
            return null;
        }

        const winners = [];
        const available = [...participants];

        for (let i = 0; i < count; i++) {
            if (noRepeat) {
                const index = Math.floor(Math.random() * available.length);
                winners.push(available.splice(index, 1)[0]);
            } else {
                winners.push(available[Math.floor(Math.random() * available.length)]);
            }
        }

        return {
            mode: 'multiple',
            winners: winners
        };
    }

    function drawGroup() {
        const groupCount = parseInt(document.getElementById('group-count').value);
        const evenGroups = document.getElementById('even-groups').checked;

        if (groupCount < 2) {
            alert('組數必須大於 1');
            return null;
        }

        if (groupCount > participants.length) {
            alert(`組數不能超過參與者總數（${participants.length}）`);
            return null;
        }

        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const groups = [];

        if (evenGroups) {
            const baseSize = Math.floor(shuffled.length / groupCount);
            const remainder = shuffled.length % groupCount;

            let index = 0;
            for (let i = 0; i < groupCount; i++) {
                const size = baseSize + (i < remainder ? 1 : 0);
                groups.push(shuffled.slice(index, index + size));
                index += size;
            }
        } else {
            for (let i = 0; i < groupCount; i++) {
                groups.push([]);
            }
            shuffled.forEach((person, index) => {
                groups[index % groupCount].push(person);
            });
        }

        return {
            mode: 'group',
            groups: groups
        };
    }

    function displayResult(result) {
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });

        let html = '';

        if (result.mode === 'single') {
            html = `
                <div class="winner-single">
                    <div class="winner-icon">🎉</div>
                    <div class="winner-name">${escapeHtml(result.winners[0])}</div>
                </div>
            `;
        } else if (result.mode === 'multiple') {
            html = `
                <div class="winner-multiple">
                    <div class="winner-title">抽中的幸運兒 🎊</div>
                    <div class="winner-list">
                        ${result.winners.map(w => `<div class="winner-item">${escapeHtml(w)}</div>`).join('')}
                    </div>
                </div>
            `;
        } else if (result.mode === 'group') {
            html = `
                <div class="group-results">
                    ${result.groups.map((group, index) => `
                        <div class="group-item">
                            <div class="group-title">第 ${index + 1} 組（${group.length} 人）</div>
                            <div class="group-members">
                                ${group.map(m => `<div class="group-member">${escapeHtml(m)}</div>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        resultDisplay.innerHTML = html;
    }

    function saveToHistory(result) {
        const entry = {
            timestamp: new Date().toLocaleString('zh-TW'),
            mode: result.mode,
            data: result
        };

        history.unshift(entry);
        if (history.length > 20) {
            history = history.slice(0, 20);
        }

        localStorage.setItem('lotteryHistory', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        if (history.length === 0) {
            historyList.innerHTML = '<p class="placeholder">尚無歷史記錄</p>';
            return;
        }

        historyList.innerHTML = history.map(entry => {
            let modeText = '';
            let resultText = '';

            if (entry.mode === 'single') {
                modeText = '單人抽籤';
                resultText = entry.data.winners[0];
            } else if (entry.mode === 'multiple') {
                modeText = '多人抽籤';
                resultText = entry.data.winners.join('、');
            } else if (entry.mode === 'group') {
                modeText = '分組';
                resultText = `共 ${entry.data.groups.length} 組`;
            }

            return `
                <div class="history-item">
                    <div class="history-item-header">
                        ${entry.timestamp} | ${modeText}
                    </div>
                    <div class="history-item-content">${escapeHtml(resultText)}</div>
                </div>
            `;
        }).join('');
    }

    // 複製結果
    copyResultBtn.addEventListener('click', () => {
        const text = resultDisplay.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyResultBtn.textContent;
            copyResultBtn.textContent = '已複製！';
            setTimeout(() => {
                copyResultBtn.textContent = originalText;
            }, 1500);
        });
    });

    // 重置
    resetBtn.addEventListener('click', () => {
        resultSection.style.display = 'none';
    });

    // 清空歷史
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('確定要清空所有歷史記錄嗎？')) {
            history = [];
            localStorage.removeItem('lotteryHistory');
            renderHistory();
        }
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 初始渲染
    renderHistory();
});
