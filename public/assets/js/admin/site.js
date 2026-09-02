/** 后台 — 门户内容：首页文案、经营理念与联系方式 */
import { store } from '../store.js';
import { write } from './actions.js';
import { el } from '../util.js';
import { openForm, panel } from './ui.js';

export default function renderSite(host) {
  const site = store.get('site') || {};
  const brand = site.brand || {};
  const hero = site.hero || {};
  const about = site.about || {};
  const philosophy = site.philosophy || {};
  const contact = site.contact || {};
  const footer = site.footer || {};

  host.append(
    block('品牌与首屏', [
      ['品牌名称', brand.name],
      ['公司全称', brand.legalName],
      ['英文名', brand.nameEn],
      ['品牌标语', brand.tagline],
      ['首屏小标题', hero.eyebrow],
      ['首屏主标题', hero.title],
      ['首屏副文案', hero.subtitle],
    ], () => editHero(site))
  );

  host.append(
    block('站点标识', [
      ['完整组合标', brand.logo],
      ['图形标', brand.logoMark],
    ], () => editLogo(site), logoPreview(brand))
  );

  host.append(
    block('关于我们', [
      ['标题', about.title],
      ['副标题', about.subtitle],
      ['正文段落', `${(about.paragraphs || []).length} 段`],
      ['特色亮点', `${(about.highlights || []).length} 项`],
    ], () => editAbout(site))
  );

  host.append(
    block('经营理念', [
      ['标题', philosophy.title],
      ['副标题', philosophy.subtitle],
      ['准则条目', `${(philosophy.items || []).length} 条`],
      ['结语', philosophy.statement],
    ], () => editPhilosophy(site))
  );

  host.append(
    block('首屏数据', (site.stats || []).map((s) => [s.label, `${s.value}${s.suffix || ''}`]),
      () => editStats(site))
  );

  host.append(
    block('联系方式', [
      ['标题', contact.title],
      ['副标题', contact.subtitle],
      ['公司主体', contact.company],
      ['邮箱', contact.email],
      ['电话', contact.phone],
      ['工作时间', contact.workTime],
    ], () => editContact(site))
  );

  host.append(
    block('页脚', [
      ['版权信息', footer.copyright],
      ['备案号', footer.icp || '（未填写）'],
    ], () => editFooter(site))
  );
}

function block(title, pairs, onEdit, extraBody) {
  const list = el(
    'dl',
    { class: 'detail__grid detail__grid--wide' },
    pairs.map(([k, v]) => el('div', {}, [el('dt', { text: k }), el('dd', { text: v || '—' })]))
  );
  const body = extraBody ? el('div', {}, [extraBody, list]) : list;
  const editBtn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '编辑', onclick: onEdit });
  return panel(title, body, editBtn);
}

function logoPreview(brand) {
  return el('div', { class: 'logo-preview' }, [
    el('figure', { class: 'logo-preview__light' }, [
      el('img', { src: brand.logo || '', alt: '完整组合标' }),
      el('figcaption', { text: '完整标 · 浅色底' }),
    ]),
    el('figure', { class: 'logo-preview__dark' }, [
      el('img', { src: brand.logoMark || '', alt: '图形标' }),
      el('figcaption', { text: '图形标 · 深色底' }),
    ]),
  ]);
}

async function editLogo(site) {
  const brand = site.brand || {};
  const r = await openForm({
    title: '站点标识',
    subtitle: '换图标：把新图片放进 public/assets/img/ 并重新部署，然后在这里填写路径',
    fields: [
      { name: 'logo', label: '完整组合标路径', cols: 2, placeholder: 'assets/img/logo.png', hint: '用于后台登录页，建议透明底 PNG' },
      { name: 'logoMark', label: '图形标路径', cols: 2, placeholder: 'assets/img/logo-mark.png', hint: '用于页头、侧栏、页脚、首屏，建议正方形透明底' },
    ],
    values: brand,
  });
  if (!r) return;
  await write(() => store.saveSite('brand', { ...brand, ...r }), '站点标识已更新');
}

async function editHero(site) {
  const brand = site.brand || {};
  const hero = site.hero || {};
  const r = await openForm({
    title: '品牌与首屏',
    fields: [
      { name: 'brandName', label: '品牌名称', required: true },
      { name: 'legalName', label: '公司全称', required: true },
      { name: 'brandNameEn', label: '英文名' },
      { name: 'tagline', label: '品牌标语' },
      { name: 'description', label: '站点描述（SEO）', type: 'textarea', cols: 2, rows: 2 },
      { name: 'eyebrow', label: '首屏小标题', cols: 2 },
      { name: 'title', label: '首屏主标题', required: true, cols: 2 },
      { name: 'subtitle', label: '首屏副文案', type: 'textarea', cols: 2, rows: 2 },
      { name: 'primaryText', label: '主按钮文字' },
      { name: 'primaryHref', label: '主按钮链接' },
      { name: 'secondaryText', label: '次按钮文字' },
      { name: 'secondaryHref', label: '次按钮链接' },
    ],
    values: {
      brandName: brand.name, legalName: brand.legalName, brandNameEn: brand.nameEn,
      tagline: brand.tagline, description: brand.description,
      eyebrow: hero.eyebrow, title: hero.title, subtitle: hero.subtitle,
      primaryText: (hero.primaryCta || {}).text, primaryHref: (hero.primaryCta || {}).href,
      secondaryText: (hero.secondaryCta || {}).text, secondaryHref: (hero.secondaryCta || {}).href,
    },
    size: 'lg',
  });
  if (!r) return;

  // 这个表单同时改了 brand 与 hero 两个区块，分别提交
  await write(async () => {
    await store.saveSite('brand', {
      ...brand, name: r.brandName, legalName: r.legalName,
      nameEn: r.brandNameEn, tagline: r.tagline, description: r.description,
    });
    await store.saveSite('hero', {
      ...hero, eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle,
      primaryCta: { text: r.primaryText, href: r.primaryHref },
      secondaryCta: { text: r.secondaryText, href: r.secondaryHref },
    });
  }, '首屏内容已更新');
}

async function editAbout(site) {
  const about = site.about || {};
  const r = await openForm({
    title: '关于我们',
    fields: [
      { name: 'title', label: '标题', required: true },
      { name: 'subtitle', label: '副标题' },
      { name: 'paragraphs', label: '正文段落', type: 'textarea', cols: 2, rows: 8, hint: '每空一行算一段' },
      {
        name: 'highlights', label: '特色亮点', type: 'rows', rowLabel: '亮点',
        columns: [
          { name: 'icon', label: '图标符号' },
          { name: 'title', label: '标题' },
          { name: 'desc', label: '描述' },
        ],
      },
    ],
    values: { ...about, paragraphs: (about.paragraphs || []).join('\n\n') },
    size: 'lg',
  });
  if (!r) return;

  await write(() => store.saveSite('about', {
    title: r.title,
    subtitle: r.subtitle,
    paragraphs: r.paragraphs.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
    highlights: r.highlights,
  }), '关于我们已更新');
}

async function editPhilosophy(site) {
  const philosophy = site.philosophy || {};
  const r = await openForm({
    title: '经营理念',
    subtitle: '每条准则用一个大字作视觉锚点，建议保持 3–4 条',
    fields: [
      { name: 'title', label: '标题', required: true },
      { name: 'subtitle', label: '副标题' },
      {
        name: 'items', label: '准则条目', type: 'rows', rowLabel: '准则',
        columns: [
          { name: 'char', label: '大字' },
          { name: 'title', label: '小标题' },
          { name: 'desc', label: '说明' },
        ],
      },
      { name: 'statement', label: '结语', type: 'textarea', cols: 2, rows: 2, hint: '显示在理念区块最下方，留空则不显示' },
    ],
    values: philosophy,
    size: 'lg',
  });
  if (!r) return;
  await write(() => store.saveSite('philosophy', { ...philosophy, ...r }), '经营理念已更新');
}

async function editStats(site) {
  const r = await openForm({
    title: '首屏数据',
    subtitle: '展示在首页顶部的几个数字，全部删除则整行不显示',
    fields: [
      {
        name: 'stats', label: '数据项', type: 'rows', rowLabel: '数据',
        columns: [
          { name: 'label', label: '名称' },
          { name: 'value', label: '数值', type: 'number' },
          { name: 'suffix', label: '后缀' },
        ],
      },
    ],
    values: { stats: site.stats || [] },
  });
  if (!r) return;
  await write(() => store.saveSite('stats', r.stats), '首屏数据已更新');
}

async function editContact(site) {
  const contact = site.contact || {};
  const r = await openForm({
    title: '联系方式',
    subtitle: '留空的项目不会显示在门户上',
    fields: [
      { name: 'title', label: '标题', required: true },
      { name: 'subtitle', label: '副标题' },
      { name: 'company', label: '公司主体', cols: 2 },
      { name: 'email', label: '合作邮箱' },
      { name: 'phone', label: '联系电话' },
      { name: 'workTime', label: '工作时间', cols: 2 },
    ],
    values: contact,
  });
  if (!r) return;
  await write(() => store.saveSite('contact', { ...contact, ...r }), '联系方式已更新');
}

async function editFooter(site) {
  const footer = site.footer || {};
  const r = await openForm({
    title: '页脚',
    fields: [
      { name: 'copyright', label: '版权信息', cols: 2 },
      { name: 'icp', label: '备案号', cols: 2, hint: '留空则不显示' },
    ],
    values: footer,
  });
  if (!r) return;
  await write(() => store.saveSite('footer', { ...footer, ...r }), '页脚已更新');
}
