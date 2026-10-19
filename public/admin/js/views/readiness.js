import { api, esc, ic, fmtDT } from '../core.js';

// جاهزية الموقع: كل قسم وحالته الفعلية والخطوة التالية
const TONE = { ok: ['g', 'جاهز', 'check'], warn: ['y', 'يحتاج مراجعة', 'alert'], todo: ['r', 'مطلوب', 'close'] };

export async function render(view) {
  const r = await api('/readiness');
  const ring = 2 * Math.PI * 34;
  view.innerHTML = `
  <section class="card rd-head"><div class="card-b">
    <svg class="rd-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34"/><circle class="v" cx="40" cy="40" r="34" style="stroke-dasharray:${ring};stroke-dashoffset:${ring * (1 - r.score / 100)}"/></svg>
    <div class="rd-score"><b>${r.score}%</b><span>جاهزية الموقع</span></div>
    <div class="rd-counts"><span class="badge g">${r.counts.ok} جاهز</span><span class="badge y">${r.counts.warn} مراجعة</span><span class="badge r">${r.counts.todo} مطلوب</span></div>
    <span class="grow"></span><span class="muted small">فُحص ${fmtDT(r.checkedAt)}</span><button class="btn sec sm" data-re>${ic('refresh', 16)}إعادة الفحص</button>
  </div></section>
  <nav class="rd-nav">${r.groups.map((g) => { const bad = g.items.filter((i) => i.status !== 'ok').length; return `<a href="#rd-${g.key}" class="${bad ? '' : 'done'}">${esc(g.title)}${bad ? `<span class="count">${bad}</span>` : ic('check', 14)}</a>`; }).join('')}</nav>
  ${r.groups.map((g, gi) => `<section class="card rd-group" id="rd-${g.key}"><div class="card-h"><span class="rd-n">${gi + 1}</span><div><h3>${esc(g.title)}</h3><p class="muted small" style="margin:0">${esc(g.why)}</p></div></div>
    <div class="list">${g.items.map((i) => { const [t, label, icon] = TONE[i.status]; return `<div class="rd-item ${i.status}">
      <span class="rd-ic ${t}">${ic(icon, 14)}</span>
      <div class="grow"><div class="rd-t"><b>${esc(i.title)}</b><span class="badge ${t}">${label}</span></div>${i.detail ? `<p class="muted small">${esc(i.detail)}</p>` : ''}
        ${i.steps?.length ? `<ol class="rd-steps">${i.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}</div>
      ${i.link ? `<a class="btn ghost sm" href="${esc(i.link)}">افتح ${ic('arrow', 14)}</a>` : ''}</div>`; }).join('')}</div></section>`).join('')}`;
  view.querySelector('[data-re]').onclick = () => render(view);
  view.querySelectorAll('.rd-nav a').forEach((a) => a.onclick = (e) => { e.preventDefault(); view.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
