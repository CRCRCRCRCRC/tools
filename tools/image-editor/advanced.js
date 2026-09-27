const layout = document.querySelector('.photo-layout');
const advanced = document.getElementById('advanced-tools');
const advancedTab = document.getElementById('advanced-tab');
const frame = document.getElementById('advanced-frame');
const description = document.getElementById('advanced-description');
const openLink = document.getElementById('advanced-open');
const choices = [...document.querySelectorAll('[data-advanced-url]')];

function choose(button) {
    choices.forEach(choice => choice.classList.toggle('selected', choice === button));
    description.textContent = button.dataset.description;
    openLink.href = button.dataset.openUrl;
    if (!frame.src.endsWith(button.dataset.advancedUrl.replace('../', '/tools/'))) frame.src = button.dataset.advancedUrl;
}

advancedTab.addEventListener('click', () => {
    layout.hidden = true;
    advanced.hidden = false;
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    advancedTab.setAttribute('aria-pressed', 'true');
    if (!frame.getAttribute('src')) choose(choices[0]);
});

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    layout.hidden = false;
    advanced.hidden = true;
    advancedTab.setAttribute('aria-pressed', 'false');
}));

choices.forEach(button => button.addEventListener('click', () => choose(button)));
