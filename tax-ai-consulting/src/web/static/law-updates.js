/* 세법 동향 일지 — 타임라인 렌더러 (데이터: law-updates-data.js) */
import { LAW_UPDATES } from './law-updates-data.js';

const CAT_COLORS = {
  '법률': '#1a5276', '시행령': '#21618c', '예규·해석': '#6c3483',
  '판결·심판': '#943126', '정부발표': '#b9770e', '규제지역': '#148f77',
};
const STATUS = {
  '반영완료': { color: '#145a32', bg: '#e9f7ef', label: '엔진 반영완료' },
  '검토중': { color: '#943126', bg: '#fdedec', label: '검토 중 (미반영)' },
  '영향없음': { color: '#566573', bg: '#f2f4f4', label: '엔진 영향 없음' },
  '국회심의중': { color: '#b9770e', bg: '#fef9e7', label: '국회 심의 중 (미확정)' },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let catFilter = '전체';
let statusFilter = '전체';

function chips(id, values, current, onPick) {
  $(id).innerHTML = values.map((v) =>
    `<button class="chip ${v === current ? 'on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
  Array.prototype.forEach.call($(id).querySelectorAll('button'), (b) => {
    b.addEventListener('click', () => onPick(b.dataset.v));
  });
}

function render() {
  const cats = ['전체'].concat(Array.from(new Set(LAW_UPDATES.map((u) => u.category))));
  const stats = ['전체'].concat(Array.from(new Set(LAW_UPDATES.map((u) => u.engineStatus))));
  chips('catChips', cats, catFilter, (v) => { catFilter = v; render(); });
  chips('statusChips', stats, statusFilter, (v) => { statusFilter = v; render(); });

  const rows = LAW_UPDATES
    .filter((u) => (catFilter === '전체' || u.category === catFilter))
    .filter((u) => (statusFilter === '전체' || u.engineStatus === statusFilter))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  $('count').textContent = `${rows.length}건`;

  $('timeline').innerHTML = rows.map((u) => {
    const st = STATUS[u.engineStatus] || STATUS['검토중'];
    const cc = CAT_COLORS[u.category] || '#566573';
    return `
    <article class="entry">
      <div class="e-date">${esc(u.date.replace(/-/g, '.'))}</div>
      <div class="e-body">
        <div class="e-tags">
          <span class="cat" style="background:${cc}">${esc(u.category)}</span>
          <span class="st" style="color:${st.color};background:${st.bg};border-color:${st.color}">${st.label}</span>
          ${u.affects.map((t) => `<span class="aff">${esc(t)}</span>`).join('')}
        </div>
        <h3>${esc(u.title)}</h3>
        <p class="e-sum">${esc(u.summary)}</p>
        ${u.engineNote ? `<p class="e-note">🔧 <b>엔진 메모</b> — ${esc(u.engineNote)}</p>` : ''}
        ${u.sources && u.sources.length
          ? `<p class="e-src">출처: ${u.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(' · ')}</p>`
          : ''}
      </div>
    </article>`;
  }).join('') || '<p class="empty">조건에 맞는 항목이 없습니다.</p>';
}

render();
