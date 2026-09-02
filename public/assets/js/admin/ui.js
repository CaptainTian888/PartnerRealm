/**
 * 稳链同创 — 后台通用组件
 * 表格、表单弹窗、确认框、筛选栏都在这里，各业务模块只描述字段。
 */
import { esc, el, $, $$ } from '../util.js';

/** 弹窗容器 */
function host() {
  return document.getElementById('modalHost');
}

function openModal(node, { size = 'md' } = {}) {
  const overlay = el('div', { class: 'modal-overlay' });
  const box = el('div', { class: `modal modal--${size}`, role: 'dialog', 'aria-modal': 'true' });
  box.append(node);
  overlay.append(box);
  host().append(overlay);
  document.body.classList.add('is-locked');
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const close = () => {
    overlay.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  return { overlay, box, close };
}

/** 确认框 */
export function confirmDialog({ title, message, confirmText = '确定', tone = 'danger' }) {
  return new Promise((resolve) => {
    const node = el('div', { class: 'confirm' }, [
      el('h3', { text: title }),
      el('p', { text: message }),
    ]);
    const actions = el('div', { class: 'modal__actions' });
    const cancel = el('button', { class: 'btn btn--ghost', type: 'button', text: '取消' });
    const ok = el('button', { class: `btn btn--${tone}`, type: 'button', text: confirmText });
    actions.append(cancel, ok);
    node.append(actions);

    const { close } = openModal(node, { size: 'sm' });
    cancel.onclick = () => { close(); resolve(false); };
    ok.onclick = () => { close(); resolve(true); };
  });
}

/** 只读详情弹窗 */
export function detailDialog({ title, subtitle = '', html, size = 'lg' }) {
  const node = el('div', { class: 'form' });
  node.append(
    el('header', { class: 'modal__head' }, [
      el('h3', { text: title }),
      subtitle ? el('p', { text: subtitle }) : null,
    ]),
    el('div', { class: 'form__body', html })
  );
  const actions = el('div', { class: 'modal__actions' });
  const close = el('button', { class: 'btn btn--primary', type: 'button', text: '关闭' });
  actions.append(close);
  node.append(actions);

  const handle = openModal(node, { size });
  close.onclick = handle.close;
  return handle;
}

/**
 * 表单弹窗。
 * fields: [{ name, label, type, options, required, placeholder, hint, min, max, step, cols, columns }]
 * type: text | textarea | number | date | select | tags | checkbox | rows
 */
export function openForm({ title, subtitle = '', fields, values = {}, size = 'md', submitText = '保存' }) {
  return new Promise((resolve) => {
    const form = el('form', { class: 'form', novalidate: 'novalidate' });
    form.append(
      el('header', { class: 'modal__head' }, [
        el('h3', { text: title }),
        subtitle ? el('p', { text: subtitle }) : null,
      ])
    );

    const body = el('div', { class: 'form__body' });
    for (const field of fields) {
      body.append(renderField(field, values[field.name]));
    }
    form.append(body);

    const actions = el('div', { class: 'modal__actions' });
    const cancel = el('button', { class: 'btn btn--ghost', type: 'button', text: '取消' });
    const submit = el('button', { class: 'btn btn--primary', type: 'submit', text: submitText });
    actions.append(cancel, submit);
    form.append(actions);

    const { close, box } = openModal(form, { size });
    cancel.onclick = () => { close(); resolve(null); };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const result = {};
      let firstInvalid = null;
      for (const field of fields) {
        const wrap = box.querySelector(`[data-field="${field.name}"]`);
        const value = readField(field, wrap);
        if (field.required && (value === '' || value === null || (Array.isArray(value) && !value.length))) {
          wrap.classList.add('is-invalid');
          firstInvalid = firstInvalid || wrap;
          continue;
        }
        wrap.classList.remove('is-invalid');
        result[field.name] = value;
      }
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const input = firstInvalid.querySelector('input, textarea, select');
        if (input) input.focus();
        return;
      }
      close();
      resolve(result);
    });

    setTimeout(() => {
      const first = box.querySelector('input, textarea, select');
      if (first) first.focus();
    }, 60);
  });
}

function renderField(field, value) {
  const wrap = el('div', {
    class: `field field--${field.type || 'text'}${field.cols === 2 ? ' field--wide' : ''}`,
    'data-field': field.name,
  });
  wrap.append(el('label', { class: 'field__label', text: field.label + (field.required ? ' *' : '') }));

  const type = field.type || 'text';
  let control;

  if (type === 'textarea') {
    control = el('textarea', { rows: field.rows || 4, placeholder: field.placeholder || '' });
    control.value = value ?? '';
  } else if (type === 'select') {
    control = el('select');
    if (!field.required) control.append(el('option', { value: '', text: field.emptyText || '（未选择）' }));
    for (const opt of field.options || []) {
      const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const node = el('option', { value: o.value, text: o.label });
      if (String(value ?? '') === String(o.value)) node.selected = true;
      control.append(node);
    }
  } else if (type === 'checkbox') {
    control = el('input', { type: 'checkbox' });
    control.checked = value !== false;
    wrap.classList.add('field--inline');
  } else if (type === 'tags') {
    control = el('input', { type: 'text', placeholder: field.placeholder || '用逗号分隔' });
    control.value = Array.isArray(value) ? value.join('，') : (value || '');
  } else if (type === 'rows') {
    return renderRowsField(field, value, wrap);
  } else {
    control = el('input', {
      type,
      placeholder: field.placeholder || '',
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      ...(field.step !== undefined ? { step: field.step } : {}),
    });
    control.value = value ?? '';
  }

  wrap.append(control);
  if (field.hint) wrap.append(el('p', { class: 'field__hint', text: field.hint }));
  return wrap;
}

/** 子表：一组同构对象，如联系人、里程碑 */
function renderRowsField(field, value, wrap) {
  wrap.classList.add('field--wide');
  const list = el('div', { class: 'rows' });
  const columns = field.columns || [];

  const addRow = (row = {}) => {
    const line = el('div', { class: 'rows__line' });
    for (const col of columns) {
      const cell = el('div', { class: 'rows__cell', 'data-col': col.name });
      let input;
      if (col.type === 'select') {
        input = el('select');
        for (const opt of col.options || []) {
          const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
          const node = el('option', { value: o.value, text: o.label });
          if (String(row[col.name] ?? '') === String(o.value)) node.selected = true;
          input.append(node);
        }
      } else {
        input = el('input', { type: col.type || 'text', placeholder: col.label });
        input.value = row[col.name] ?? '';
      }
      cell.append(input);
      line.append(cell);
    }
    const del = el('button', { class: 'rows__del', type: 'button', title: '删除这一行', text: '×' });
    del.onclick = () => line.remove();
    line.append(del);
    if (row.id) line.dataset.rowId = row.id;
    list.append(line);
  };

  (Array.isArray(value) ? value : []).forEach(addRow);

  const head = el('div', { class: 'rows__head' }, columns.map((c) => el('span', { text: c.label })));
  const add = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: `+ 添加${field.rowLabel || '一行'}` });
  add.onclick = () => addRow({});

  wrap.append(head, list, add);
  if (field.hint) wrap.append(el('p', { class: 'field__hint', text: field.hint }));
  return wrap;
}

function readField(field, wrap) {
  const type = field.type || 'text';
  if (type === 'rows') {
    const columns = field.columns || [];
    return $$('.rows__line', wrap)
      .map((line) => {
        const row = {};
        if (line.dataset.rowId) row.id = line.dataset.rowId;
        for (const col of columns) {
          const input = line.querySelector(`[data-col="${col.name}"] input, [data-col="${col.name}"] select`);
          let v = input ? input.value.trim() : '';
          if (col.type === 'number') v = v === '' ? 0 : Number(v);
          row[col.name] = v;
        }
        return row;
      })
      .filter((row) => columns.some((c) => row[c.name] !== '' && row[c.name] !== 0 || c.keep));
  }

  const control = wrap.querySelector('input, textarea, select');
  if (!control) return '';
  if (type === 'checkbox') return control.checked;
  if (type === 'tags') {
    return control.value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (type === 'number') {
    const raw = control.value.trim();
    return raw === '' ? 0 : Number(raw);
  }
  return control.value.trim();
}

/**
 * 数据表格。
 * columns: [{ key, label, width, align, render(row) -> html string, sortable }]
 */
export function dataTable({ columns, rows, empty = '暂无数据', onRowClick, rowKey = 'id' }) {
  const table = el('table', { class: 'table' });
  const thead = el('thead');
  thead.append(
    el('tr', {}, columns.map((c) =>
      el('th', {
        class: c.align ? `is-${c.align}` : '',
        style: c.width ? `width:${c.width}` : '',
        text: c.label,
      })
    ))
  );
  table.append(thead);

  const tbody = el('tbody');
  if (!rows.length) {
    tbody.append(el('tr', {}, [el('td', { colspan: columns.length, class: 'table__empty', text: empty })]));
  } else {
    for (const row of rows) {
      const tr = el('tr', { 'data-id': row[rowKey] || '' });
      if (onRowClick) {
        tr.classList.add('is-clickable');
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button, a')) return;
          onRowClick(row);
        });
      }
      for (const c of columns) {
        const td = el('td', { class: c.align ? `is-${c.align}` : '' });
        const content = c.render ? c.render(row) : esc(row[c.key] ?? '—');
        if (content instanceof Node) td.append(content);
        else td.innerHTML = content;
        tr.append(td);
      }
      tbody.append(tr);
    }
  }
  table.append(tbody);
  return el('div', { class: 'table-wrap' }, [table]);
}

/** 状态标签 */
export function tag(label, tone = 'muted') {
  return `<span class="tag tag--${tone}">${esc(label)}</span>`;
}

/** 行内操作按钮组 */
export function rowActions(actions) {
  const wrap = el('div', { class: 'row-actions' });
  for (const a of actions) {
    wrap.append(
      el('button', {
        class: `row-actions__btn${a.danger ? ' is-danger' : ''}`,
        type: 'button',
        text: a.label,
        onclick: (e) => { e.stopPropagation(); a.onClick(); },
      })
    );
  }
  return wrap;
}

/** 页面工具条：左侧筛选，右侧主操作 */
export function toolbar({ filters = [], actions = [] }) {
  const bar = el('div', { class: 'toolbar' });
  const left = el('div', { class: 'toolbar__filters' });
  for (const f of filters) {
    if (f.type === 'search') {
      const input = el('input', { class: 'input input--search', type: 'search', placeholder: f.placeholder || '搜索' });
      input.value = f.value || '';
      input.addEventListener('input', () => f.onChange(input.value));
      left.append(input);
    } else {
      const select = el('select', { class: 'input input--select' });
      select.append(el('option', { value: '', text: f.allLabel || '全部' }));
      for (const opt of f.options) {
        const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        const node = el('option', { value: o.value, text: o.label });
        if (String(f.value ?? '') === String(o.value)) node.selected = true;
        select.append(node);
      }
      select.addEventListener('change', () => f.onChange(select.value));
      left.append(select);
    }
  }
  const right = el('div', { class: 'toolbar__actions' });
  for (const a of actions) {
    right.append(
      el('button', {
        class: `btn ${a.variant ? 'btn--' + a.variant : 'btn--primary'} btn--sm`,
        type: 'button',
        text: a.label,
        onclick: a.onClick,
      })
    );
  }
  bar.append(left, right);
  return bar;
}

/** 指标卡 */
export function statCards(items) {
  return el(
    'div',
    { class: 'stat-cards' },
    items.map((s) =>
      el('div', { class: `stat-card${s.tone ? ' stat-card--' + s.tone : ''}` }, [
        el('span', { class: 'stat-card__label', text: s.label }),
        el('strong', { class: 'stat-card__value', text: s.value }),
        s.hint ? el('span', { class: 'stat-card__hint', text: s.hint }) : null,
      ])
    )
  );
}

/** 区块容器 */
export function panel(title, content, extra) {
  const head = el('header', { class: 'panel__head' }, [el('h2', { text: title })]);
  if (extra) head.append(extra);
  return el('section', { class: 'panel' }, [head, el('div', { class: 'panel__body' }, [content])]);
}
