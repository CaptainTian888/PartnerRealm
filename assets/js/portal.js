/** 稳链同创 — 对外门户页渲染 */
import { store } from './store.js';
import { $, $$, esc } from './util.js';

async function boot() {
  let site;
  try {
    // 门户展示仓库线上数据，不叠加后台草稿
    await store.load({ withDraft: false });
    site = store.get('site');
  } catch (err) {
    console.error(err);
    $('#main').insertAdjacentHTML(
      'afterbegin',
      `<div class="container"><p class="load-error">数据加载失败：${esc(err.message)}</p></div>`
    );
    return;
  }

  document.title = `${site.brand.legalName || site.brand.name} | ${site.brand.name}`;

  applyBrand(site);
  bindText(site);
  renderStats(site);
  renderAbout(site);
  renderPhilosophy(site);
  renderContact(site);
  initNav();
  initReveal();
}

/** logo 路径可在后台改，这里覆盖 HTML 里的默认值 */
function applyBrand(site) {
  const mark = site.brand.logoMark;
  const full = site.brand.logo;
  if (mark) {
    $('#brandLogo').src = mark;
    $$('.site-footer__brand img').forEach((img) => { img.src = mark; });
  }
  // 首屏用图形标：完整组合标自带「稳链同创」字样，会和 h1 主标题重复
  if (mark) $('#heroLogo').src = mark;

  $('#brandLogo').alt = site.brand.name || '';

  const icon = document.querySelector('link[rel="icon"]');
  if (icon && site.brand.favicon) icon.href = site.brand.favicon;
}

/** 把 data-bind="a.b.c" 的节点填上 site.json 对应的值 */
function bindText(site) {
  for (const node of $$('[data-bind]')) {
    const value = node.dataset.bind.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), site);
    if (value === undefined || value === null || value === '') {
      if (node.dataset.bind === 'footer.icp') node.remove();
      continue;
    }
    node.textContent = value;
  }
  const primary = $('#heroPrimary');
  const secondary = $('#heroSecondary');
  primary.textContent = site.hero.primaryCta.text;
  primary.href = site.hero.primaryCta.href;
  secondary.textContent = site.hero.secondaryCta.text;
  secondary.href = site.hero.secondaryCta.href;
}

function renderStats(site) {
  const stats = site.stats || [];
  const host = $('#heroStats');
  if (!stats.length) { host.remove(); return; }
  host.innerHTML = stats
    .map(
      (s) => `
      <li class="stat">
        <span class="stat__value" data-count="${esc(s.value)}">0<em>${esc(s.suffix || '')}</em></span>
        <span class="stat__label">${esc(s.label)}</span>
      </li>`
    )
    .join('');
  animateCounters();
}

function animateCounters() {
  const nodes = $$('.stat__value[data-count]');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((n) => {
      n.firstChild.nodeValue = Number(n.dataset.count).toLocaleString('zh-CN');
    });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      countUp(entry.target, Number(entry.target.dataset.count) || 0);
    }
  }, { threshold: 0.4 });
  nodes.forEach((n) => io.observe(n));
}

function countUp(node, target) {
  const suffix = node.querySelector('em');
  const duration = 1100;
  const start = performance.now();
  node.textContent = '0';
  if (suffix) node.append(suffix);
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.firstChild.nodeValue = Math.round(target * eased).toLocaleString('zh-CN');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderAbout(site) {
  $('#aboutText').innerHTML = (site.about.paragraphs || [])
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
  $('#aboutHighlights').innerHTML = (site.about.highlights || [])
    .map(
      (h) => `
      <li class="highlight reveal">
        <span class="highlight__icon" aria-hidden="true">${esc(h.icon || '◆')}</span>
        <h3>${esc(h.title)}</h3>
        <p>${esc(h.desc)}</p>
      </li>`
    )
    .join('');
}

/** 经营理念：品牌名四个字各作一条准则 */
function renderPhilosophy(site) {
  const p = site.philosophy || {};
  $('#creedList').innerHTML = (p.items || [])
    .map(
      (item, i) => `
      <li class="creed__item reveal">
        <span class="creed__char" aria-hidden="true">${esc(item.char || String(i + 1))}</span>
        <div class="creed__body">
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.desc)}</p>
        </div>
      </li>`
    )
    .join('');

  const statement = $('#creedStatement');
  if (p.statement) statement.textContent = p.statement;
  else statement.remove();
}

function renderContact(site) {
  const c = site.contact;
  const items = [
    { label: '公司主体', value: c.company },
    { label: '合作邮箱', value: c.email, href: c.email ? `mailto:${c.email}` : '' },
    { label: '联系电话', value: c.phone },
    { label: '办公地址', value: c.address },
    { label: '工作时间', value: c.workTime },
  ].filter((x) => x.value);

  $('#contactList').innerHTML = items
    .map(
      (x) => `
      <li>
        <span class="contact-label">${esc(x.label)}</span>
        ${x.href ? `<a href="${esc(x.href)}">${esc(x.value)}</a>` : `<span>${esc(x.value)}</span>`}
      </li>`
    )
    .join('');
}

function initNav() {
  const header = $('#siteHeader');
  const toggle = $('#navToggle');
  const nav = $('#siteNav');

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起导航' : '展开导航');
  });

  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 滚动高亮当前小节
  const sections = $$('main section[id]');
  const links = new Map($$('#siteNav a').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const link = links.get(entry.target.id);
        if (link) link.classList.toggle('is-active', entry.isIntersecting);
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  sections.forEach((s) => spy.observe(s));
}

function initReveal() {
  const nodes = $$('.reveal');
  if (!nodes.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((n) => n.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        setTimeout(() => entry.target.classList.add('is-visible'), i * 60);
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );
  nodes.forEach((n) => io.observe(n));
}

boot();
