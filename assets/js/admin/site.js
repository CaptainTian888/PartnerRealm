/** 后台 — 门户内容：首页文案、经营理念与联系方式 */
import { store } from '../store.js';
import { el, toast } from '../util.js';
import { openForm, panel } from './ui.js';

export default function renderSite(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderSite(host, ctx); };
  const site = store.get('site');

  host.append(
    block('品牌与首屏', [
      ['品牌名称', site.brand.name],
      ['公司全称', site.brand.legalName],
      ['英文名', site.brand.nameEn],
      ['品牌标语', site.brand.tagline],
      ['首屏小标题', site.hero.eyebrow],
      ['首屏主标题', site.hero.title],
      ['首屏副文案', site.hero.subtitle],
    ], () => editHero(site, rerender))
  );

  host.append(
    block('站点标识', [
      ['完整组合标', site.brand.logo],
      ['图形标', site.brand.logoMark],
    ], () => editLogo(site, rerender), logoPreview(site))
  );

  host.append(
    block('关于我们', [
      ['标题', site.about.title],
      ['副标题', site.about.subtitle],
      ['正文段落', `${(site.about.paragraphs || []).length} 段`],
      ['特色亮点', `${(site.about.highlights || []).length} 项`],
    ], () => editAbout(site, rerender))
  );

  const ph = site.philosophy || {};
  host.append(
    block('经营理念', [
      ['标题', ph.title],
      ['副标题', ph.subtitle],
      ['准则条目', `${(ph.items || []).length} 条`],
      ['结语', ph.statement],
    ], () => editPhilosophy(site, rerender))
  );

  host.append(
    block('首屏数据', (site.stats || []).map((s) => [s.label, `${s.value}${s.suffix || ''}`]),
      () => editStats(site, rerender))
  );

  host.append(
    block('联系方式', [
      ['标题', site.contact.title],
      ['副标题', site.contact.subtitle],
      ['公司主体', site.contact.company],
      ['邮箱', site.contact.email],
      ['电话', site.contact.phone],
      ['地址', site.contact.address],
      ['工作时间', site.contact.workTime],
    ], () => editContact(site, rerender))
  );

  host.append(
    block('页脚', [
      ['版权信息', site.footer.copyright],
      ['备案号', site.footer.icp || '（未填写）'],
    ], () => editFooter(site, rerender))
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

function logoPreview(site) {
  return el('div', { class: 'logo-preview' }, [
    el('figure', { class: 'logo-preview__light' }, [
      el('img', { src: site.brand.logo || '', alt: '完整组合标' }),
      el('figcaption', { text: '完整标 · 浅色底' }),
    ]),
    el('figure', { class: 'logo-preview__dark' }, [
      el('img', { src: site.brand.logoMark || '', alt: '图形标' }),
      el('figcaption', { text: '图形标 · 深色底' }),
    ]),
  ]);
}

function save(message, done) {
  store.markDirty('site');
  toast(message, 'ok');
  done();
}

async function editLogo(site, done) {
  const r = await openForm({
    title: '站点标识',
    subtitle: '换图标：把新图片放进 assets/img/ 并提交到仓库，然后在这里填写路径',
    fields: [
      { name: 'logo', label: '完整组合标路径', cols: 2, placeholder: 'assets/img/logo.png', hint: '用于首屏与后台登录页，建议透明底 PNG' },
      { name: 'logoMark', label: '图形标路径', cols: 2, placeholder: 'assets/img/logo-mark.png', hint: '用于页头、侧栏、页脚等小尺寸位置，建议正方形透明底' },
    ],
    values: site.brand,
  });
  if (!r) return;
  Object.assign(site.brand, r);
  save('站点标识已更新', done);
}

async function editHero(site, done) {
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
      brandName: site.brand.name, legalName: site.brand.legalName,
      brandNameEn: site.brand.nameEn, tagline: site.brand.tagline,
      description: site.brand.description,
      eyebrow: site.hero.eyebrow, title: site.hero.title, subtitle: site.hero.subtitle,
      primaryText: site.hero.primaryCta.text, primaryHref: site.hero.primaryCta.href,
      secondaryText: site.hero.secondaryCta.text, secondaryHref: site.hero.secondaryCta.href,
    },
    size: 'lg',
  });
  if (!r) return;
  Object.assign(site.brand, {
    name: r.brandName, legalName: r.legalName, nameEn: r.brandNameEn,
    tagline: r.tagline, description: r.description,
  });
  Object.assign(site.hero, {
    eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle,
    primaryCta: { text: r.primaryText, href: r.primaryHref },
    secondaryCta: { text: r.secondaryText, href: r.secondaryHref },
  });
  save('首屏内容已更新', done);
}

async function editAbout(site, done) {
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
    values: { ...site.about, paragraphs: (site.about.paragraphs || []).join('\n\n') },
    size: 'lg',
  });
  if (!r) return;
  site.about.title = r.title;
  site.about.subtitle = r.subtitle;
  site.about.paragraphs = r.paragraphs.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  site.about.highlights = r.highlights;
  save('关于我们已更新', done);
}

async function editPhilosophy(site, done) {
  if (!site.philosophy) site.philosophy = { items: [] };
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
    values: site.philosophy,
    size: 'lg',
  });
  if (!r) return;
  Object.assign(site.philosophy, r);
  save('经营理念已更新', done);
}

async function editStats(site, done) {
  const r = await openForm({
    title: '首屏数据',
    subtitle: '展示在首页顶部的几个数字，留空则整行不显示',
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
    values: { stats: site.stats },
  });
  if (!r) return;
  site.stats = r.stats;
  save('首屏数据已更新', done);
}

async function editContact(site, done) {
  const r = await openForm({
    title: '联系方式',
    fields: [
      { name: 'title', label: '标题', required: true },
      { name: 'subtitle', label: '副标题' },
      { name: 'company', label: '公司主体', cols: 2 },
      { name: 'email', label: '合作邮箱' },
      { name: 'phone', label: '联系电话' },
      { name: 'address', label: '办公地址', cols: 2 },
      { name: 'workTime', label: '工作时间', cols: 2 },
    ],
    values: site.contact,
  });
  if (!r) return;
  Object.assign(site.contact, r);
  save('联系方式已更新', done);
}

async function editFooter(site, done) {
  const r = await openForm({
    title: '页脚',
    fields: [
      { name: 'copyright', label: '版权信息', cols: 2 },
      { name: 'icp', label: '备案号', cols: 2, hint: '留空则不显示' },
    ],
    values: site.footer,
  });
  if (!r) return;
  Object.assign(site.footer, r);
  save('页脚已更新', done);
}
