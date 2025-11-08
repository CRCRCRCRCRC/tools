document.addEventListener('DOMContentLoaded', () => {
    const eventNameInput = document.getElementById('event-name');
    const targetDatetimeInput = document.getElementById('target-datetime');
    const addBtn = document.getElementById('add-btn');
    const countdownList = document.getElementById('countdown-list');
    const emptyState = document.getElementById('empty-state');

    let countdowns = JSON.parse(localStorage.getItem('countdowns')) || [];
    let updateInterval = null;

    // 設定最小日期時間為現在
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    targetDatetimeInput.min = now.toISOString().slice(0, 16);

    // 新增倒數
    addBtn.addEventListener('click', addCountdown);

    eventNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCountdown();
    });

    function addCountdown() {
        const name = eventNameInput.value.trim();
        const targetDate = targetDatetimeInput.value;

        if (!name || !targetDate) {
            alert('請填寫事件名稱和目標日期時間');
            return;
        }

        const countdown = {
            id: Date.now(),
            name: name,
            targetDate: new Date(targetDate).toISOString()
        };

        countdowns.push(countdown);
        saveCountdowns();
        renderCountdowns();

        // 清空輸入
        eventNameInput.value = '';
        targetDatetimeInput.value = '';
    }

    function deleteCountdown(id) {
        countdowns = countdowns.filter(c => c.id !== id);
        saveCountdowns();
        renderCountdowns();
    }

    function saveCountdowns() {
        localStorage.setItem('countdowns', JSON.stringify(countdowns));
    }

    function renderCountdowns() {
        if (countdowns.length === 0) {
            emptyState.style.display = 'block';
            countdownList.innerHTML = '';
            if (updateInterval) {
                clearInterval(updateInterval);
                updateInterval = null;
            }
            return;
        }

        emptyState.style.display = 'none';
        countdownList.innerHTML = '';

        countdowns.forEach(countdown => {
            const card = createCountdownCard(countdown);
            countdownList.appendChild(card);
        });

        // 開始更新倒數
        if (!updateInterval) {
            updateInterval = setInterval(updateAllCountdowns, 1000);
        }
        updateAllCountdowns();
    }

    function createCountdownCard(countdown) {
        const card = document.createElement('div');
        card.className = 'countdown-card';
        card.dataset.id = countdown.id;

        const targetDate = new Date(countdown.targetDate);
        const formattedDate = formatDate(targetDate);

        card.innerHTML = `
            <button class="delete-btn" onclick="deleteCountdown(${countdown.id})">×</button>
            <h3>${escapeHtml(countdown.name)}</h3>
            <div class="target-date">目標時間：${formattedDate}</div>
            <div class="expired-message" style="display: none;">🎉 時間到！</div>
            <div class="time-display">
                <div class="time-unit">
                    <span class="time-value" data-unit="days">0</span>
                    <div class="time-label">天</div>
                </div>
                <div class="time-unit">
                    <span class="time-value" data-unit="hours">0</span>
                    <div class="time-label">時</div>
                </div>
                <div class="time-unit">
                    <span class="time-value" data-unit="minutes">0</span>
                    <div class="time-label">分</div>
                </div>
                <div class="time-unit">
                    <span class="time-value" data-unit="seconds">0</span>
                    <div class="time-label">秒</div>
                </div>
            </div>
        `;

        return card;
    }

    function updateAllCountdowns() {
        const now = new Date();

        countdowns.forEach(countdown => {
            const card = document.querySelector(`[data-id="${countdown.id}"]`);
            if (!card) return;

            const targetDate = new Date(countdown.targetDate);
            const diff = targetDate - now;

            if (diff <= 0) {
                // 時間到了
                card.classList.add('expired');
                card.querySelector('.expired-message').style.display = 'block';
                card.querySelector('[data-unit="days"]').textContent = '0';
                card.querySelector('[data-unit="hours"]').textContent = '0';
                card.querySelector('[data-unit="minutes"]').textContent = '0';
                card.querySelector('[data-unit="seconds"]').textContent = '0';
            } else {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                card.querySelector('[data-unit="days"]').textContent = days;
                card.querySelector('[data-unit="hours"]').textContent = String(hours).padStart(2, '0');
                card.querySelector('[data-unit="minutes"]').textContent = String(minutes).padStart(2, '0');
                card.querySelector('[data-unit="seconds"]').textContent = String(seconds).padStart(2, '0');
            }
        });
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}/${month}/${day} ${hours}:${minutes}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 全域函數供按鈕調用
    window.deleteCountdown = deleteCountdown;

    // 初始渲染
    renderCountdowns();
});
