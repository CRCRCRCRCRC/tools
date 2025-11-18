document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('roulette-canvas');
    const ctx = canvas.getContext('2d');
    const optionsInput = document.getElementById('options-input');
    const spinBtn = document.getElementById('spin-btn');

    const colors = ["#007bff", "#28a745", "#dc3545", "#ffc107", "#17a2b8", "#6f42c1", "#fd7e14", "#20c997"];
    let options = [];
    let startAngle = 0;
    let arc = 0;
    let spinTimeout = null;
    let spinAngleStart = 0;
    let spinTime = 0;
    let spinTimeTotal = 0;

    const drawRoulette = () => {
        arc = Math.PI / (options.length / 2);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;

        options.forEach((option, i) => {
            const angle = i * arc;  // 始終從 0 開始繪製
            ctx.fillStyle = colors[i % colors.length];

            ctx.beginPath();
            ctx.arc(250, 250, 250, angle, angle + arc, false);
            ctx.arc(250, 250, 0, angle + arc, angle, true);
            ctx.stroke();
            ctx.fill();

            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.translate(250 + Math.cos(angle + arc / 2) * 200, 250 + Math.sin(angle + arc / 2) * 200);
            ctx.rotate(angle + arc / 2 + Math.PI / 2);
            ctx.font = 'bold 20px Noto Sans TC';
            ctx.fillText(option, -ctx.measureText(option).width / 2, 0);
            ctx.restore();
        });
    };

    const spin = () => {
        spinBtn.disabled = true;
        const spinAngle = Math.random() * 10 + 10; // Random spins
        const finalAngle = startAngle + spinAngle;

        canvas.style.transition = 'transform 5s cubic-bezier(0.25, 0.1, 0.25, 1)';
        canvas.style.transform = `rotate(${finalAngle}rad)`;

        setTimeout(() => {
            // 指針在頂部 (270度)，計算指針指向的選項
            // 公式：(270度 - 旋轉角度) 對應的選項索引
            const degrees = (finalAngle * 180 / Math.PI) % 360;
            const pointerAngle = (270 - degrees + 360) % 360;
            const arcd = arc * 180 / Math.PI;
            const index = Math.floor(pointerAngle / arcd) % options.length;

            alert(`恭喜！您抽中了：${options[index]}`);

            spinBtn.disabled = false;
            // 保持當前旋轉狀態
            canvas.style.transition = 'none';
            startAngle = finalAngle;

        }, 5000);
    };

    const updateOptions = () => {
        options = optionsInput.value.split('\n').filter(opt => opt.trim() !== '');
        if (options.length === 0) {
            options = ['請輸入選項'];
        }
        drawRoulette();
    };

    optionsInput.addEventListener('input', updateOptions);
    spinBtn.addEventListener('click', spin);

    // Initial draw
    updateOptions();
}); 