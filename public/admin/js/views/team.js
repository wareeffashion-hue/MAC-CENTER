import { api, esc, ic, can, state, ago, emptyState, options, run, drawer, closeDrawer, formData, checks, confirmBox, branchName, sectionName, staffName, refreshMeta, badge } from '../core.js';

export async function render(view, ctx) {
  const tab = ctx.query.get('tab') || (can('users') ? 'users' : 'routing');
  view.innerHTML = `<div class="bar"><div class="seg">${[['users', 'الموظفون', can('users')], ['routing', 'جدول التوجيه', can('routing') || can('routing.own')]].filter((x) => x[2]).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div></div><div id="pane"></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { location.hash = `#/team?tab=${b.dataset.tab}`; });
  const pane = view.querySelector('#pane');
  return tab === 'routing' ? routing(pane) : users(pane);
}

async function users(pane) {
  const M = state.meta;
  const { items } = await api('/users');
  pane.innerHTML = `<div class="bar"><p class="muted" style="margin:0">كل موظف يرى بيانات فروعه فقط. المدير يرى كل شيء.</p><span class="grow"></span><button class="btn" data-new>${ic('plus')}موظف</button></div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>الدور</th><th>الفروع</th><th>التحقق الثنائي</th><th>آخر دخول</th><th></th></tr></thead><tbody>
  ${items.map((u) => `<tr><td><b>${esc(u.name)}</b> ${u.active ? '' : '<span class="badge r">معطل</span>'}<div class="muted small ltr">${esc(u.email)}</div></td><td>${esc(u.roleName)}</td>
    <td class="small">${u.role === 'admin' ? 'كل الفروع' : u.branchIds.map(branchName).join('، ') || (u.role === 'marketing' ? 'مستوى العلامة' : '<span style="color:var(--red)">بلا فروع</span>')}</td>
    <td>${u.twoFactor ? '<span class="badge g">مفعل</span>' : u.role === 'admin' ? '<span class="badge y">غير مفعل</span>' : '<span class="muted small">—</span>'}</td><td class="small">${u.lastLoginAt ? ago(u.lastLoginAt) : '—'}</td>
    <td><button class="btn sec sm" data-edit="${u.id}">${ic('edit', 14)}</button></td></tr>`).join('')}</tbody></table></div></section>`;
  const after = () => users(pane);
  pane.querySelector('[data-new]').onclick = () => edit(null, after);
  pane.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(items.find((x) => x.id === Number(b.dataset.edit)), after));
}

function edit(u, after) {
  const M = state.meta;
  const d = drawer(u ? esc(u.name) : 'موظف جديد', `<form class="form">
    <div class="form-row"><label class="field"><span>الاسم</span><input name="name" required value="${esc(u?.name || '')}"></label>
      <label class="field"><span>البريد</span><input name="email" type="email" dir="ltr" required value="${esc(u?.email || '')}"></label></div>
    <div class="form-row"><label class="field"><span>الدور</span><select name="role">${options(M.roles, u?.role || 'agent')}</select></label>
      <label class="field"><span>واتساب للتنبيهات والاختبار</span><input name="wa_phone" dir="ltr" placeholder="9665xxxxxxxx"></label></div>
    <div class="field"><span>الفروع المخولة</span>${checks('branchIds', M.allBranches, u?.branchIds || [])}<span class="hint">مدير النظام يرى كل الفروع. التسويق دون فروع = مستوى العلامة.</span></div>
    <label class="field"><span>${u ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور'}</span><input name="password" type="password" autocomplete="new-password" dir="ltr" ${u ? '' : 'required'} minlength="10"><span class="hint">10 أحرف على الأقل.</span></label>
    ${u ? `<label class="switch"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><i></i>الحساب فعال</label>` : ''}
    <div class="form-actions"><button class="btn">${ic('check')}حفظ</button>${u?.twoFactor ? '<button type="button" class="btn danger" data-reset2fa>إعادة ضبط التحقق الثنائي</button>' : ''}</div></form>`);
  const form = d.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = formData(form);
    if (!b.password) delete b.password;
    if (!b.wa_phone) delete b.wa_phone;
    await run(form.querySelector('button'), () => api(u ? `/users/${u.id}` : '/users', { method: u ? 'PUT' : 'POST', body: b }), { ok: 'حفظ الموظف', form });
    await refreshMeta(); closeDrawer(); after();
  };
  d.querySelector('[data-reset2fa]')?.addEventListener('click', async (e) => {
    if (!(await confirmBox('إعادة ضبط التحقق الثنائي', 'سيدخل الموظف بكلمة المرور فقط حتى يعيد الإعداد.', { danger: true }))) return;
    await run(e.target, () => api(`/users/${u.id}/reset-2fa`, { method: 'POST' }), { ok: 'أعيد الضبط' });
    closeDrawer(); after();
  });
}

async function routing(pane) {
  const M = state.meta;
  const { items } = await api('/routing');
  pane.innerHTML = `
  <div class="banner info">${ic('ticket')}<span>تسند التذكرة لأدق قاعدة مطابقة (فرع + قسم + موضوع أولًا). إن غاب المسؤول تذهب للبديل، وإلا لطابور الفرع؛ لا تبقى تذكرة بلا مالك.</span></div>
  <section class="card"><div class="card-h"><h3>القواعد</h3></div>
  ${items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الفرع</th><th>القسم</th><th>الموضوع</th><th>المسؤول</th><th>البديل</th><th></th></tr></thead><tbody>
  ${items.map((r) => `<tr><td>${r.branch_id ? branchName(r.branch_id) : 'كل الفروع'}</td><td>${r.section_id ? sectionName(r.section_id) : '—'}</td><td>${r.topic ? esc(M.topics[r.topic]) : '—'}</td><td>${r.user_id ? esc(staffName(r.user_id)) : '—'}</td><td>${r.backup_user_id ? esc(staffName(r.backup_user_id)) : '—'}</td>
    <td><button class="btn danger sm" data-del="${r.id}">${ic('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('لا توجد قواعد بعد؛ كل التذاكر تذهب لطابور الفرع.', 'ticket')}
  <div class="card-b" style="border-top:1px solid var(--line)"><form class="form-row" data-add style="align-items:end">
    <label class="field"><span>الفرع</span><select name="branch_id">${options(M.branches, '', { blank: can('routing') ? 'كل الفروع' : undefined })}</select></label>
    <label class="field"><span>القسم</span><select name="section_id">${options(M.sections, '', { blank: 'أي قسم' })}</select></label>
    <label class="field"><span>الموضوع</span><select name="topic">${options(M.topics, '', { blank: 'أي موضوع' })}</select></label>
    <label class="field"><span>المسؤول</span><select name="user_id">${options(M.staff.map((u) => ({ id: u.id, name: u.name })), '', { blank: 'اختر' })}</select></label>
    <label class="field"><span>البديل</span><select name="backup_user_id">${options(M.staff.map((u) => ({ id: u.id, name: u.name })), '', { blank: 'بدون' })}</select></label>
    <button class="btn">${ic('plus')}إضافة</button></form></div></section>`;
  const f = pane.querySelector('[data-add]');
  f.onsubmit = async (e) => { e.preventDefault(); await run(f.querySelector('button'), () => api('/routing', { method: 'POST', body: formData(f) }), { ok: 'أضيفت القاعدة' }); routing(pane); };
  pane.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await run(b, () => api(`/routing/${b.dataset.del}`, { method: 'DELETE' }), { ok: 'حذفت' }); routing(pane); });
}
