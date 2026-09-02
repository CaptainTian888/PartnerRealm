/** 后台 — 门户内容：首页文案与联系方式 */
import { store } from '../store.js';
import { esc, el, toast } from '../util.js';
import { openForm, panel, confirmDialog } from './ui.js';

export default function renderSite(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderSite(host, ctx); };
  const site = store.get('site');

  host.append(
    block('品牌与首屏', rerender, [
      ['品牌名称', site.brand.name],
      ['品牌标语', site.brand.tagline],
      ['首屏小标题', site.hero.eyebrow],
      ['首屏主标题', site.hero.title],
      ['首屏副文案', site.hero.subtitle],
    ], () => editHero(site, rerender))
  );

  host.append(
    block('关于我们', rerender, [
      ['标题', site.about.title],
      ['副标题', site.about.subtitle],
      ['正文段落', `${(site.about.paragraphs || []).length} 段`],
      ['特色亮点', `${(site.about.highlights || []).length} 项`],
    ], () => editAbout(site, rerender))
  );

  host.append(
    block('业务板块', rerender, [
      ['标题', site.capabilities.title],
      ['副标题', site.capabilities.subtitle],
      ['板块数量', `${(site.capabilities.items || []).length} 个`],
    ], () => editCapabilities(site, rerender))
  );

  host.append(
    block('首屏数据', rerender,
      (site.stats || []).map((s) => [s.label, `${s.value}${s.suffix || ''}`]),
      () => editStats(site, rerender))
  );

  host.append(
    block('联系方式', rerender, [
      ['标题', site.contact.title],
      ['副标题', site.contact.subtitle],
      ['邮箱', site.contact.email],
      ['电话', site.contact.phone],
      ['地址', site.contact.address],
      ['工作时间', site.contact.workTime],
    ], () => editContact(site, rerender))
  );

  host.append(
    block('页脚', rerender, [
      ['版权信息', site.footer.copyright],
      ['备案号', site.footer.icp || '（未填写）'],
    ], () => editFooter(site, rerender))
  );
}

function block(title, rerender, pairs, onEdit) {
  const list = el(
    'dl',
    { class: 'detail__grid detail__grid--wide' },
    pairs.map(([k, v]) => el('div', {}, [el('dt', { text: k }), el('dd', { text: v || '—' })]))
  );
  const editBtn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '编辑', onclick: onEdit });
  return panel(title, list, editBtn);
}

function save(message, done) {
  store.markDirty('site');
  toast(message, 'ok');
  done();
}

async function editHero(site, done) {
  const r = await openForm({
    title: '品牌与首屏',
    fields: [
      { name: 'brandName', label: '品牌名称', required: true },
      { name: 'brandNameEn', label: '英文名' },
      { name: 'tagline', label: '品牌标语', cols: 2 },
      { name: 'description', label: '站点描述（SEO）', type: 'textarea', cols: 2, rows: 2 },
      { name: 'eyebrow', label: '首屏小标题' },
      { name: 'title', label: '首屏主标题', required: true },
      { name: 'subtitle', label: '首屏副文案', type: 'textarea', cols: 2, rows: 2 },
      { name: 'primaryText', label: '主按钮文字' },
      { name: 'primaryHref', label: '主按钮链接' },
      { name: 'secondaryText', label: '次按钮文字' },
      { name: 'secondaryHref', label: '次按钮链接' },
    ],
    values: {
      brandName: site.brand.name, brandNameEn: site.brand.nameEn, tagline: site.brand.tagline,
      description: site.brand.description,
      eyebrow: site.hero.eyebrow, title: site.hero.title, subtitle: site.hero.subtitle,
      primaryText: site.hero.primaryCta.text, primaryHref: site.hero.primaryCta.href,
      secondaryText: site.hero.secondaryCta.text, secondaryHref: site.hero.secondaryCta.href,
    },
    size: 'lg',
  });
  if (!r) return;
  Object.assign(site.brand, { name: r.brandName, nameEn: r.brandNameEn, tagline: r.tagline, description: r.description });
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

async function editCapabilities(site, done) {
  const r = await openForm({
    title: '业务板块',
    fields: [
      { name: 'title', label: '标题', required: true },
      { name: 'subtitle', label: '副标题' },
      {
        name: 'items', label: '板块列表', type: 'rows', rowLabel: '板块',
        columns: [
          { name: 'title', label: '板块名称' },
          { name: 'desc', label: '板块说明' },
        ],
      },
    ],
    values: site.capabilities,
    size: 'lg',
  });
  if (!r) return;
  Object.assign(site.capabilities, r);
  save('业务板块已更新', done);
}

async function editStats(site, done) {
  const r = await openForm({
    title: '首屏数据',
    subtitle: '展示在首页顶部的四个数字',
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
