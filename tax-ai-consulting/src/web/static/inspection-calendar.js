/**
 * 점검 달력 페이지 — 사업장별 정기·수시 점검 일정 관리
 * 엔진(src/core/inspection-calendar.js)을 브라우저에서 직접 실행.
 * 사업장·일정은 localStorage에 저장(서버 미전송).
 */

import {
  CATEGORIES, KINDS, FREQUENCIES, WEEKDAYS,
  monthMatrix, recurrences, entriesInMonth, summarize, overdue,
} from '../../core/inspection-calendar.js';

const $ = (id) => document.getElementById(id);
const STORE = 'insp-cal-v1';
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

let store = loadStore();
let view = (() => { const t = new Date(); return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 }; })();
const hidden = new Set(); // 숨긴 카테고리

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && s.sites && s.sites.length) return s;
  } catch { /* ignore */ }
  const id = uid();
  return { sites: [{ id, name: '기본 사업장' }], activeId: id, entries: { [id]: [] } };
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { /* ignore */ } }

const activeSite = () => store.sites.find((s) => s.id === store.activeId) || store.sites[0];
function entries() {
  const id = store.activeId;
  if (!store.entries[id]) store.entries[id] = [];
  return store.entries[id];
}

/* ── 사업장 관리 ── */
function renderSites() {
  $('siteSel').innerHTML = store.sites.map((s) => `<option value="${s.id}" ${s.id === store.activeId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}
$('siteSel').addEventListener('change', () => { store.activeId = $('siteSel').value; save(); renderAll(); });
$('addSite').addEventListener('click', () => {
  const name = prompt('추가할 사업장 이름을 입력하세요');
  if (!name || !name.trim()) return;
  const id = uid();
  store.sites.push({ id, name: name.trim() });
  store.entries[id] = [];
  store.activeId = id;
  save(); renderAll();
});
$('renameSite').addEventListener('click', () => {
  const s = activeSite();
  const name = prompt('사업장 이름을 수정하세요', s.name);
  if (!name || !name.trim()) return;
  s.name = name.trim(); save(); renderSites();
});
$('delSite').addEventListener('click', () => {
  if (store.sites.length <= 1) { alert('마지막 사업장은 삭제할 수 없습니다.'); return; }
  const s = activeSite();
  if (!confirm(`'${s.name}' 사업장과 일정을 삭제할까요?`)) return;
  delete store.entries[s.id];
  store.sites = store.sites.filter((x) => x.id !== s.id);
  store.activeId = store.sites[0].id;
  save(); renderAll();
});

/* ── 폼 옵션 ── */
$('fKind').innerHTML = KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('');
$('fCat').innerHTML = CATEGORIES.map((c) => `<option value="${c.key}">${c.label}</option>`).join('');
$('fFreq').innerHTML = FREQUENCIES.map((f) => `<option value="${f.key}">${f.label}</option>`).join('');
$('fDate').value = todayISO();

function syncFreqBox() {
  const isRegular = $('fKind').value === 'regular';
  const spec = FREQUENCIES.find((f) => f.key === $('fFreq').value);
  const repeats = isRegular && spec && spec.months !== null;
  $('fFreq').disabled = !isRegular;
  $('repBox').style.display = repeats ? 'block' : 'none';
}
$('fKind').addEventListener('change', () => { if ($('fKind').value === 'spot') $('fFreq').value = 'once'; syncFreqBox(); });
$('fFreq').addEventListener('change', syncFreqBox);

$('addEntry').addEventListener('click', () => {
  const date = $('fDate').value;
  if (!date) { alert('날짜를 선택하세요.'); return; }
  const kind = $('fKind').value;
  const cat = $('fCat').value;
  const title = ($('fTitle').value || '').trim() || CAT[cat].label;
  const memo = ($('fMemo').value || '').trim();
  const freq = kind === 'regular' ? $('fFreq').value : 'once';
  const count = Math.max(1, Number($('fCount').value) || 1);
  const dates = recurrences(date, freq, count);
  for (const dISO of dates) {
    entries().push({ id: uid(), date: dISO, kind, cat, title, memo, done: false });
  }
  save();
  $('fTitle').value = ''; $('fMemo').value = '';
  view = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
  renderAll();
});

/* ── 달력 ── */
function renderLegend() {
  $('legend').innerHTML = CATEGORIES.map((c) => `<span class="lg ${hidden.has(c.key) ? 'off' : ''}" data-cat="${c.key}"><span class="dot" style="background:${c.color}"></span>${c.short}</span>`).join('');
  $('legend').querySelectorAll('.lg').forEach((el) => el.addEventListener('click', () => {
    const k = el.dataset.cat;
    if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
    renderAll();
  }));
}

function visibleEntries() { return entries().filter((e) => !hidden.has(e.cat)); }

function pill(e) {
  const c = CAT[e.cat];
  return `<span class="pill ${e.done ? 'done' : ''}" data-id="${e.id}" title="${escapeHtml(e.title)}${e.memo ? ' — ' + escapeHtml(e.memo) : ''}" style="background:${c.bg};color:${c.color};border-left-color:${c.color}"><span class="k">${e.kind === 'spot' ? '수시' : '정기'}</span> ${escapeHtml(e.title)}</span>`;
}

function renderCalendar() {
  $('ymLabel').textContent = `${view.year}년 ${view.month}월`;
  $('dow').innerHTML = WEEKDAYS.map((w, i) => `<th class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</th>`).join('');
  const weeks = monthMatrix(view.year, view.month);
  const vis = visibleEntries();
  const today = todayISO();
  $('calBody').innerHTML = weeks.map((week) => `<tr>${week.map((dISO, i) => {
    if (!dISO) return '<td class="blank"></td>';
    const dnum = Number(dISO.slice(8, 10));
    const dayEntries = vis.filter((e) => e.date === dISO);
    const cls = [i === 0 ? 'sun' : i === 6 ? 'sat' : '', dISO === today ? 'today' : ''].filter(Boolean).join(' ');
    return `<td class="${cls}"><span class="dnum">${dnum}</span><button class="add" data-add="${dISO}">＋</button>${dayEntries.map(pill).join('')}</td>`;
  }).join('')}</tr>`).join('');

  $('calBody').querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    $('fDate').value = b.dataset.add;
    $('fTitle').focus();
  }));
  $('calBody').querySelectorAll('.pill').forEach((p) => p.addEventListener('click', () => toggleDone(p.dataset.id)));
}

/* ── 이 달 목록·집계 ── */
function renderSide() {
  const monthEntries = entriesInMonth(entries(), view.year, view.month).slice().sort((a, b) => a.date.localeCompare(b.date));
  const s = summarize(entries());
  const od = overdue(entries(), todayISO()).length;
  $('sum').innerHTML = `
    <div><b>${s.total}</b><span>전체</span></div>
    <div><b>${s.done}</b><span>완료</span></div>
    <div><b>${s.pending}</b><span>예정</span></div>
    <div class="over"><b>${od}</b><span>지연</span></div>`;

  if (!monthEntries.length) {
    $('mlist').innerHTML = `<div class="mlist-empty">${view.month}월 등록된 점검이 없습니다.<br>날짜의 ＋ 또는 위 폼에서 추가하세요.</div>`;
    return;
  }
  $('mlist').innerHTML = monthEntries.map((e) => {
    const c = CAT[e.cat];
    return `<div class="mi ${e.done ? 'done' : ''}">
      <input type="checkbox" data-done="${e.id}" ${e.done ? 'checked' : ''}>
      <div class="info">
        <div class="tt">${escapeHtml(e.title)}</div>
        <div class="meta">${e.date} · <span class="tag" style="background:${c.bg};color:${c.color};border-left-color:${c.color}">${KIND[e.kind].label}·${c.short}</span>${e.memo ? ' · ' + escapeHtml(e.memo) : ''}</div>
      </div>
      <button class="del" data-del="${e.id}" title="삭제">✕</button>
    </div>`;
  }).join('');
  $('mlist').querySelectorAll('[data-done]').forEach((cb) => cb.addEventListener('change', () => toggleDone(cb.dataset.done)));
  $('mlist').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeEntry(b.dataset.del)));
}

function toggleDone(id) {
  const e = entries().find((x) => x.id === id);
  if (!e) return;
  e.done = !e.done; save(); renderCalendar(); renderSide();
}
function removeEntry(id) {
  store.entries[store.activeId] = entries().filter((x) => x.id !== id);
  save(); renderAll();
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ── 네비 ── */
$('prevM').addEventListener('click', () => { view.month--; if (view.month < 1) { view.month = 12; view.year--; } renderCalendar(); renderSide(); });
$('nextM').addEventListener('click', () => { view.month++; if (view.month > 12) { view.month = 1; view.year++; } renderCalendar(); renderSide(); });
$('todayBtn').addEventListener('click', () => { const t = new Date(); view = { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 }; renderCalendar(); renderSide(); });

function renderAll() { renderSites(); renderLegend(); renderCalendar(); renderSide(); }

syncFreqBox();
renderAll();
