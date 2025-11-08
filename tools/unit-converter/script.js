document.addEventListener('DOMContentLoaded', () => {
    const fromValue = document.getElementById('from-value');
    const toValue = document.getElementById('to-value');
    const fromUnit = document.getElementById('from-unit');
    const toUnit = document.getElementById('to-unit');
    const swapBtn = document.getElementById('swap-btn');
    const quickReference = document.getElementById('quick-reference');
    const tabBtns = document.querySelectorAll('.tab-btn');

    // 單位定義（以基準單位為 1）
    const units = {
        length: {
            name: '長度',
            base: 'meter',
            units: {
                kilometer: { name: '公里', factor: 1000 },
                meter: { name: '公尺', factor: 1 },
                centimeter: { name: '公分', factor: 0.01 },
                millimeter: { name: '毫米', factor: 0.001 },
                mile: { name: '英里', factor: 1609.344 },
                yard: { name: '碼', factor: 0.9144 },
                foot: { name: '英尺', factor: 0.3048 },
                inch: { name: '英寸', factor: 0.0254 }
            }
        },
        weight: {
            name: '重量',
            base: 'kilogram',
            units: {
                ton: { name: '公噸', factor: 1000 },
                kilogram: { name: '公斤', factor: 1 },
                gram: { name: '公克', factor: 0.001 },
                milligram: { name: '毫克', factor: 0.000001 },
                pound: { name: '磅', factor: 0.453592 },
                ounce: { name: '盎司', factor: 0.0283495 }
            }
        },
        temperature: {
            name: '溫度',
            base: 'celsius',
            units: {
                celsius: { name: '攝氏 (°C)', factor: 1 },
                fahrenheit: { name: '華氏 (°F)', factor: 1 },
                kelvin: { name: '克耳文 (K)', factor: 1 }
            }
        },
        area: {
            name: '面積',
            base: 'squareMeter',
            units: {
                squareKilometer: { name: '平方公里', factor: 1000000 },
                squareMeter: { name: '平方公尺', factor: 1 },
                squareCentimeter: { name: '平方公分', factor: 0.0001 },
                hectare: { name: '公頃', factor: 10000 },
                acre: { name: '英畝', factor: 4046.86 },
                squareFoot: { name: '平方英尺', factor: 0.092903 },
                ping: { name: '坪', factor: 3.30579 }
            }
        },
        volume: {
            name: '體積',
            base: 'liter',
            units: {
                cubicMeter: { name: '立方公尺', factor: 1000 },
                liter: { name: '公升', factor: 1 },
                milliliter: { name: '毫升', factor: 0.001 },
                gallon: { name: '加侖 (美)', factor: 3.78541 },
                quart: { name: '夸脫', factor: 0.946353 },
                pint: { name: '品脫', factor: 0.473176 },
                cup: { name: '杯', factor: 0.236588 }
            }
        },
        time: {
            name: '時間',
            base: 'second',
            units: {
                year: { name: '年', factor: 31536000 },
                month: { name: '月', factor: 2592000 },
                week: { name: '週', factor: 604800 },
                day: { name: '天', factor: 86400 },
                hour: { name: '小時', factor: 3600 },
                minute: { name: '分鐘', factor: 60 },
                second: { name: '秒', factor: 1 },
                millisecond: { name: '毫秒', factor: 0.001 }
            }
        },
        data: {
            name: '數據大小',
            base: 'byte',
            units: {
                terabyte: { name: 'TB (兆位元組)', factor: 1099511627776 },
                gigabyte: { name: 'GB (十億位元組)', factor: 1073741824 },
                megabyte: { name: 'MB (百萬位元組)', factor: 1048576 },
                kilobyte: { name: 'KB (千位元組)', factor: 1024 },
                byte: { name: 'Byte (位元組)', factor: 1 },
                bit: { name: 'Bit (位元)', factor: 0.125 }
            }
        },
        speed: {
            name: '速度',
            base: 'meterPerSecond',
            units: {
                kilometerPerHour: { name: '公里/小時', factor: 0.277778 },
                meterPerSecond: { name: '公尺/秒', factor: 1 },
                milePerHour: { name: '英里/小時', factor: 0.44704 },
                knot: { name: '節', factor: 0.514444 }
            }
        }
    };

    let currentCategory = 'length';

    // 初始化
    loadCategory(currentCategory);

    // 切換分類
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            loadCategory(currentCategory);
        });
    });

    function loadCategory(category) {
        const categoryData = units[category];
        const unitKeys = Object.keys(categoryData.units);

        // 清空並填充選項
        fromUnit.innerHTML = '';
        toUnit.innerHTML = '';

        unitKeys.forEach(key => {
            const option1 = document.createElement('option');
            option1.value = key;
            option1.textContent = categoryData.units[key].name;
            fromUnit.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = key;
            option2.textContent = categoryData.units[key].name;
            toUnit.appendChild(option2);
        });

        // 設定預設選項
        fromUnit.selectedIndex = 0;
        toUnit.selectedIndex = Math.min(1, unitKeys.length - 1);

        // 更新快速參考
        updateQuickReference(category);

        // 轉換
        convert();
    }

    function convert() {
        const category = currentCategory;
        const categoryData = units[category];
        const fromUnitKey = fromUnit.value;
        const toUnitKey = toUnit.value;
        const value = parseFloat(fromValue.value);

        if (isNaN(value)) {
            toValue.value = '';
            return;
        }

        let result;

        // 溫度需要特殊處理
        if (category === 'temperature') {
            result = convertTemperature(value, fromUnitKey, toUnitKey);
        } else {
            // 先轉換為基準單位，再轉換為目標單位
            const baseValue = value * categoryData.units[fromUnitKey].factor;
            result = baseValue / categoryData.units[toUnitKey].factor;
        }

        toValue.value = result.toFixed(6).replace(/\.?0+$/, '');
    }

    function convertTemperature(value, from, to) {
        let celsius;

        // 先轉換為攝氏
        if (from === 'celsius') {
            celsius = value;
        } else if (from === 'fahrenheit') {
            celsius = (value - 32) * 5 / 9;
        } else if (from === 'kelvin') {
            celsius = value - 273.15;
        }

        // 再從攝氏轉換為目標單位
        if (to === 'celsius') {
            return celsius;
        } else if (to === 'fahrenheit') {
            return celsius * 9 / 5 + 32;
        } else if (to === 'kelvin') {
            return celsius + 273.15;
        }
    }

    function updateQuickReference(category) {
        const categoryData = units[category];
        const unitKeys = Object.keys(categoryData.units);

        let html = `<h3>${categoryData.name}快速參考（以 1 ${categoryData.units[categoryData.base].name}為基準）</h3>`;
        html += '<table class="reference-table"><thead><tr><th>單位</th><th>換算</th></tr></thead><tbody>';

        unitKeys.forEach(key => {
            const unit = categoryData.units[key];
            let conversion;

            if (category === 'temperature') {
                if (key === 'celsius') {
                    conversion = '0°C = 32°F = 273.15K';
                } else if (key === 'fahrenheit') {
                    conversion = '32°F = 0°C = 273.15K';
                } else {
                    conversion = '273.15K = 0°C = 32°F';
                }
            } else {
                conversion = `1 ${categoryData.units[categoryData.base].name} = ${(1 / unit.factor).toFixed(8).replace(/\.?0+$/, '')} ${unit.name}`;
            }

            html += `<tr><td>${unit.name}</td><td>${conversion}</td></tr>`;
        });

        html += '</tbody></table>';
        quickReference.innerHTML = html;
    }

    // 交換單位
    swapBtn.addEventListener('click', () => {
        const tempIndex = fromUnit.selectedIndex;
        fromUnit.selectedIndex = toUnit.selectedIndex;
        toUnit.selectedIndex = tempIndex;
        convert();
    });

    // 監聽輸入變化
    fromValue.addEventListener('input', convert);
    fromUnit.addEventListener('change', convert);
    toUnit.addEventListener('change', convert);
});
