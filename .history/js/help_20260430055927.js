// ── FAQ Accordion ─────────────────────────────
document.querySelectorAll('.faq-question').forEach(button => {
  button.addEventListener('click', () => {
    const item   = button.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

document.querySelectorAll('.category-card').forEach(card => {
  card.style.cursor = 'pointer';

  card.addEventListener('click', () => {
    const isOpen   = card.classList.contains('expanded');
    const articles = card.querySelector('.category-articles');

    document.querySelectorAll('.category-card').forEach(c => {
      c.classList.remove('expanded');
      const a = c.querySelector('.category-articles');
      if (a) a.style.maxHeight = null;
    });

    if (!isOpen && articles) {
      card.classList.add('expanded');
      articles.style.maxHeight = articles.scrollHeight + "px";
      setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    }
  });
});

const searchInput   = document.getElementById('helpSearch');
const searchBtn     = document.getElementById('searchBtn');
const noResults     = document.getElementById('searchNoResults');
const categoryCards = document.querySelectorAll('.category-card');

const searchableContent = [
  { keywords: ['account', 'create', 'sign up', 'register', 'start', 'login', 'log in', 'profile'], target: 'getting-started' },
  { keywords: ['deposit', 'payment', 'fund', 'add money', 'pay', 'paystack', 'momo', 'mobile money'], target: 'deposits' },
  { keywords: ['plan', 'growth', 'invest', 'savings', 'return', 'starter', 'fixed', 'premium', 'activate'], target: 'plans' },
  { keywords: ['withdraw', 'withdrawal', 'cash out', 'take out', 'transfer', 'bank'], target: 'withdrawals' },
  { keywords: ['security', 'password', 'kyc', 'verify', 'safe', 'protect', 'id', 'reset', 'ghana card'], target: 'security' },
  { keywords: ['dashboard', 'balance', 'track', 'history', 'transaction', 'chart', 'profit'], target: 'dashboard' },
];

function runSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    noResults.classList.remove('visible');
    categoryCards.forEach(card => card.style.opacity = '1');
    return;
  }

  let matched = false;
  categoryCards.forEach(card => card.style.opacity = '0.3');

  searchableContent.forEach(item => {
    if (item.keywords.some(kw => q.includes(kw) || kw.includes(q))) {
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
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) {
    noResults.classList.remove('visible');
    categoryCards.forEach(card => card.style.opacity = '1');
  }
});