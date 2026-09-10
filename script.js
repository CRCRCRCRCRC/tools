const search = document.getElementById('tool-search');
const filters = [...document.querySelectorAll('.filter')];
const cards = [...document.querySelectorAll('.tool-card')];
const emptyState = document.getElementById('empty-state');
const status = document.getElementById('search-status');
let category = 'all';

function filterTools() {
    const query = search.value.trim().toLocaleLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    let count = 0;
    cards.forEach(card => {
        const text = (card.textContent + ' ' + card.dataset.keywords).toLocaleLowerCase();
        const visible = (category === 'all' || card.dataset.category === category) && terms.every(term => text.includes(term));
        card.hidden = !visible;
        if (visible) count++;
    });
    emptyState.hidden = count !== 0;
    status.textContent = '顯示 ' + count + ' 個工具';
}
filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category;
    filters.forEach(filter => {
        const selected = filter === button;
        filter.classList.toggle('active', selected);
        filter.setAttribute('aria-pressed', String(selected));
    });
    filterTools();
}));
search.addEventListener('input', filterTools);
document.getElementById('reset-search').addEventListener('click', () => {
    search.value = '';
    filters[0].click();
    search.focus();
});
document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        search.focus();
    }
});
filterTools();
