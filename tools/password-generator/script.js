document.addEventListener('DOMContentLoaded', () => {
    const passwordDisplay = document.getElementById('password-display');
    const lengthSlider = document.getElementById('length-slider');
    const lengthDisplay = document.getElementById('length-display');
    const uppercaseCheck = document.getElementById('uppercase-check');
    const lowercaseCheck = document.getElementById('lowercase-check');
    const numbersCheck = document.getElementById('numbers-check');
    const symbolsCheck = document.getElementById('symbols-check');
    const generateBtn = document.getElementById('generate-btn');
    const copyBtn = document.getElementById('copy-btn');

    const charSets = {
        uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lowercase: 'abcdefghijklmnopqrstuvwxyz',
        numbers: '0123456789',
        symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
    };

    // 更新長度顯示
    lengthSlider.addEventListener('input', () => {
        lengthDisplay.textContent = lengthSlider.value;
    });

    // 產生密碼的函式
    const generatePassword = () => {
        const length = parseInt(lengthSlider.value);
        let availableChars = '';
        let password = '';

        if (uppercaseCheck.checked) availableChars += charSets.uppercase;
        if (lowercaseCheck.checked) availableChars += charSets.lowercase;
        if (numbersCheck.checked) availableChars += charSets.numbers;
        if (symbolsCheck.checked) availableChars += charSets.symbols;

        if (availableChars.length === 0) {
            passwordDisplay.textContent = '請至少選擇一種字元';
            return;
        }

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * availableChars.length);
            password += availableChars[randomIndex];
        }

        passwordDisplay.textContent = password;
    };

    // 複製密碼的函式
    const copyPassword = () => {
        const password = passwordDisplay.textContent;
        if (password && password !== '請至少選擇一種字元') {
            navigator.clipboard.writeText(password).then(() => {
                copyBtn.textContent = '已複製!';
                setTimeout(() => {
                    copyBtn.textContent = '複製';
                }, 1500);
            });
        }
    };

    generateBtn.addEventListener('click', generatePassword);
    copyBtn.addEventListener('click', copyPassword);

    // 初始載入時產生一個密碼
    generatePassword();
}); 