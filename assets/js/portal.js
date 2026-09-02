/** 稳链同创 — 对外门户页渲染 */
import { store } from './store.js';
import { DICT, labelOf, toneOf } from './config.js';
import { $, $$, esc, fmtDate, periodProgress, money } from './util.js';

async function boot() {
  try {
    // 门户展示仓库线上数据，不叠加后台草稿
    await store.load({ withDraft: false });
  } catch (err) {
    console.error(err);
    document.querySelector('#main').insertAdjacentHTML(
      'afterbegin',
      `<div class="container"><p class="load-error">数据加载失败：${esc(err.message)}</p></div>`
    );
    return;
  }

  const site = store.get('site');
  document.title = `${site.brand.name} | 合作伙伴管理平台`;

  bindText(site);
  renderStats(site);
  renderAbout(site);
  renderCapabilities(site);
  renderPartners();
  renderProjects();
  renderContact(site);
  initNav();
  initReveal();
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
  $('#heroStats').innerHTML = (site.stats || [])
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
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.firstChild.nodeValue = Math.round(target * eased).toLocaleString('zh-CN');
    if (p < 1) requestAnimationFrame(step);
  }
  node.textContent = '0';
  if (suffix) node.append(suffix);
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

function renderCapabilities(site) {
  $('#capGrid').innerHTML = (site.capabilities.items || [])
    .map(
      (c, i) => `
      <li class="cap-card reveal">
        <span class="cap-card__index">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.desc)}</p>
      </li>`
    )
    .join('');
}

function renderPartners() {
  const partners = store.list('partners').filter((p) => p.visibleOnPortal !== false);
  const host = $('#partnerGrid');
  if (!partners.length) {
    host.innerHTML = '<li class="empty">暂无公开展示的合作伙伴</li>';
    return;
  }
  host.innerHTML = partners
    .map((p) => {
      const projectCount = store.list('projects').filter((x) => x.partnerId === p.id).length;
      return `
      <li class="partner-card reveal">
        <div class="partner-card__top">
          <span class="partner-card__logo" aria-hidden="true">${esc((p.shortName || p.name).slice(0, 2))}</span>
          <span class="tag tag--${toneOf(DICT.partnerStatus, p.status)}">${esc(labelOf(DICT.partnerStatus, p.status))}</span>
        </div>
        <h3>${esc(p.shortName || p.name)}</h3>
        <p class="partner-card__meta">${esc(p.type)} · ${esc(p.industry)} · ${esc(p.region)}</p>
        <p class="partner-card__intro">${esc(p.intro)}</p>
        <ul class="partner-card__tags">${(p.tags || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <footer class="partner-card__foot">
          <span>合作起始 ${fmtDate(p.since)}</span>
          <span>${projectCount} 个项目</span>
        </footer>
      </li>`;
    })
    .join('');
}

function renderProjects() {
  const shown = store
    .list('projects')
    .filter((p) => ['planning', 'ongoing', 'delivering'].includes(p.status))
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  const host = $('#projectList');
  if (!shown.length) {
    host.innerHTML = '<li class="empty">暂无进行中的项目</li>';
    return;
  }
  host.innerHTML = shown
    .map((p) => {
      const cycle = periodProgress(p.startDate, p.endDate);
      return `
      <li class="project-row reveal">
        <div class="project-row__head">
          <div>
            <span class="project-row__code">${esc(p.code)}</span>
            <h3>${esc(p.name)}</h3>
            <p class="project-row__partner">合作方 ${esc(store.partnerName(p.partnerId))}</p>
          </div>
          <span class="tag tag--${toneOf(DICT.projectStatus, p.status)}">${esc(labelOf(DICT.projectStatus, p.status))}</span>
        </div>
        <p class="project-row__desc">${esc(p.desc)}</p>
        <div class="project-row__meters">
          <div class="meter">
            <div class="meter__head"><span>项目进度</span><b>${Number(p.progress) || 0}%</b></div>
            <div class="meter__track"><i style="width:${Math.max(0, Math.min(100, Number(p.progress) || 0))}%"></i></div>
          </div>
          <div class="meter">
            <div class="meter__head"><span>周期已过</span><b>${cycle === null ? '—' : cycle + '%'}</b></div>
            <div class="meter__track meter__track--alt"><i style="width:${cycle === null ? 0 : cycle}%"></i></div>
          </div>
        </div>
        <footer class="project-row__foot">
          <span>周期 ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</span>
          <span>规模 ${money(p.budget, p.currency)}</span>
        </footer>
      </li>`;
    })
    .join('');
}

function renderContact(site) {
  const c = site.contact;
  const items = [
    { label: '合作邮箱', value: c.email, href: c.email ? `mailto:${c.email}` : '' },
    { label: '联系电话', value: c.phone, href: '' },
    { label: '办公地址', value: c.address, href: '' },
    { label: '工作时间', value: c.workTime, href: '' },
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
