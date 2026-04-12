// ── Accordion ─────────────────────────────────
document.querySelectorAll('.faq-question').forEach(button => {
  button.addEventListener('click', () => {
    const item = button.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ── Search ────────────────────────────────────
const searchInput = document.getElementById('helpSearch');
const searchBtn = document.getElementById('searchBtn');
const noResults = document.getElementById('searchNoResults');
const categoryCards = document.querySelectorAll('.category-card');
const faqItems = document.querySelectorAll('.faq-item');

const searchableContent = [
  { keywords: ['account', 'create', 'sign up', 'register', 'start'], target: 'getting-started' },
  { keywords: ['deposit', 'payment', 'fund', 'add money', 'pay'], target: 'deposits' },
  { keywords: ['plan', 'growth', 'invest', 'savings', 'return'], target: 'plans' },
  { keywords: ['withdraw', 'withdrawal', 'cash out', 'take out'], target: 'withdrawals' },
  { keywords: ['security', 'password', 'kyc', 'verify', 'safe', 'protect'], target: 'security' },
  { keywords: ['dashboard', 'balance', 'track', 'history', 'transaction'], target: 'dashboard' },
];

function runSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    noResults.classList.remove('visible');
    categoryCards.forEach(card => card.style.opacity = '1');
    return;
  }

  let matched = false;
  categoryCards.forEach(card => card.style.opacity = '0.3');

  searchableContent.forEach(item => {
    if (item.keywords.some(kw => query.includes(kw) || kw.includes(query))) {
      const target = document.querySelector(`[data-category="${item.target}"]`);
      if (target) {
        target.style.opacity = '1';
        matched = true;
      }
    }
  });

  noResults.classList.toggle('visible', !matched);
  if (matched) {
    document.querySelector('.help-categories').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

searchBtn.addEventListener('click', runSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') runSearch();
});
searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) {
    noResults.classList.remove('visible');
    categoryCards.forEach(card => card.style.opacity = '1');
  }
});