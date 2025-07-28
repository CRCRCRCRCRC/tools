document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');

    const totalChars = document.getElementById('total-chars');
    const numbers = document.getElementById('numbers');
    const paragraphs = document.getElementById('paragraphs');
    const chineseChars = document.getElementById('chinese-chars');
    const chinesePuncs = document.getElementById('chinese-puncs');
    const englishChars = document.getElementById('english-chars');
    const englishPuncs = document.getElementById('english-puncs');
    const englishWords = document.getElementById('english-words');
    const bytes = document.getElementById('bytes');

    textInput.addEventListener('input', () => {
        const text = textInput.value;

        // 總字數
        totalChars.textContent = text.length;

        // 數字
        numbers.textContent = (text.match(/\d/g) || []).length;

        // 行列（段落）數
        if (text.length === 0) {
            paragraphs.textContent = 0;
        } else {
            paragraphs.textContent = (text.match(/\n/g) || []).length + 1;
        }

        // 中文字數 (Unicode Han Script)
        chineseChars.textContent = (text.match(/\p{Script=Han}/gu) || []).length;

        // 中文標點符號數
        const chinesePuncsRegex = /[’‘"…¡¿«»„‚‹›〝〞""ʹʻʼʽ،՝╴╶╵┆┊—―…·・‧«»〈〉《》「」『』【】〔〕〖〗〘〙〚〛〝〞〟〰〾〿﹐﹑﹒﹔﹕﹖﹗﹙﹚﹛﹜﹝﹞﹟﹠﹡﹣﹨﹪﹫！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝～]/g;
        chinesePuncs.textContent = (text.match(chinesePuncsRegex) || []).length;


        // 英文字數
        englishChars.textContent = (text.match(/[a-zA-Z]/g) || []).length;

        // 英文標點符號數
        const englishPuncsRegex = /[.,!?;:'"()[\]{}]/g;
        englishPuncs.textContent = (text.match(englishPuncsRegex) || []).length;


        // 英文單詞數
        const words = text.match(/[a-zA-Z]+/g) || [];
        englishWords.textContent = words.length;

        // 字節數
        bytes.textContent = new TextEncoder().encode(text).length;
    });
}); 