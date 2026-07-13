/**
 * GitHub Pages용 정적 앱 — 계산 엔진을 브라우저에서 직접 실행한다.
 *
 * 서버 버전(src/web/server.js)과의 차이:
 *   - 계산·보고서 생성이 전부 클라이언트에서 수행됨 (서버 불필요)
 *   - PDF: 브라우저 인쇄(→ "PDF로 저장")
 *   - Word: HTML 기반 .doc 파일 다운로드 (MS 워드에서 열림)
 *   - AI 기능(정밀 보고서·심화 검토)은 API 키가 필요하므로
 *     로컬 서버(npm run web)에서만 제공 — 여기서는 안내만 표시
 */

import * as scenarios from '../../scenario/index.js';
import { SCENARIO_FORMS, buildDefaults, coerceInputs } from '../form-specs.js';
import { buildWebReport } from '../web-report.js';
import { renderReportHtml } from '../report-html.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('ko-KR');

const KOREAN_UNIT = (n) => {
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
  return s ? s + '원' : n.toLocaleString('ko-KR') + '원';
};

function fieldHtml(f) {
  if (f.type === 'select') {
    const opts = f.options.map((o) =>
      `<option value="${o.value}" ${o.value === f.default ? 'selected' : ''}>${o.label}</option>`).join('');
    return `<label>${f.label}</label><select data-name="${f.name}" data-type="select">${opts}</select>`;
  }
  if (f.type === 'person') {
    return `<label>${f.label}</label>
      <div class="person-row">
        <div><input data-name="${f.name}" data-type="person-price" data-kind="money" value="${fmt(f.default.price)}">
          <div class="sub">가액(원)</div><div class="money-hint"></div></div>
        <div><input data-name="${f.name}" data-type="person-age" value="${f.default.age}">
          <div class="sub">나이(만)</div></div>
      </div>`;
  }
  if (f.type === 'rate') {
    return `<label>${f.label}</label>
      <input data-name="${f.name}" data-type="rate" value="${Math.round(f.default * 100)}">`;
  }
  const isMoney = f.type === 'money';
  return `<label>${f.label}</label>
    <input data-name="${f.name}" data-type="${f.type}" ${isMoney ? 'data-kind="money"' : ''}
           value="${isMoney ? fmt(f.default) : f.default}">
    ${isMoney ? '<div class="money-hint"></div>' : ''}`;
}

function renderForm() {
  const sc = SCENARIO_FORMS.find((s) => s.id === Number($('scenario').value));
  $('fields').innerHTML = sc.fields.map(fieldHtml).join('');
  document.querySelectorAll('[data-kind="money"]').forEach((inp) => {
    const hint = inp.nextElementSibling?.classList?.contains('money-hint')
      ? inp.nextElementSibling
      : inp.parentElement.querySelector('.money-hint');
    const update = () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? fmt(raw) : '';
      if (hint) hint.textContent = raw ? KOREAN_UNIT(raw) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
}

function collectInputs() {
  const inputs = {};
  document.querySelectorAll('#fields [data-name]').forEach((el) => {
    const name = el.dataset.name;
    const type = el.dataset.type;
    const numeric = (v) => Number(String(v).replace(/[^\d.-]/g, '')) || 0;
    if (type === 'person-price') {
      inputs[name] = inputs[name] || {};
      inputs[name].price = numeric(el.value);
    } else if (type === 'person-age') {
      inputs[name] = inputs[name] || {};
      inputs[name].age = numeric(el.value);
    } else if (type === 'rate') {
      inputs[name] = numeric(el.value) / 100;
    } else if (type === 'select') {
      inputs[name] = Number(el.value);
    } else {
      inputs[name] = numeric(el.value);
    }
  });
  return { scenarioId: Number($('scenario').value), inputs };
}

function setStatus(msg, isErr = false) {
  $('status').textContent = msg;
  $('status').className = isErr ? 'err' : '';
}

let currentHtml = null;
let currentScenarioId = null;

function generate() {
  setStatus('계산 중…');
  try {
    const { scenarioId, inputs: raw } = collectInputs();
    const { inputs, errors } = coerceInputs(scenarioId, raw);
    if (errors.length) throw new Error(errors.join(' / '));
    const calculation = scenarios[`runScenario${scenarioId}`](inputs);
    const markdown = buildWebReport(calculation);
    currentHtml = renderReportHtml(markdown);
    currentScenarioId = scenarioId;
    $('placeholder').style.display = 'none';
    const frame = $('report');
    frame.style.display = 'block';
    frame.srcdoc = currentHtml;
    ['docBtn', 'printBtn'].forEach((id) => { $(id).disabled = false; });
    setStatus('보고서가 생성되었습니다. 인쇄 버튼에서 "PDF로 저장"을 선택하면 PDF가 됩니다.');
  } catch (e) {
    setStatus('오류: ' + e.message, true);
  }
}

/** HTML 기반 .doc 다운로드 (MS 워드에서 열림) */
function downloadDoc() {
  if (!currentHtml) return;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const blob = new Blob(['﻿', currentHtml], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `세금보고서-시나리오${currentScenarioId}-${stamp}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(a.download + ' 저장 완료 (MS 워드에서 열어 편집하세요).');
}

$('runBtn').addEventListener('click', generate);
$('docBtn').addEventListener('click', downloadDoc);
$('printBtn').addEventListener('click', () => {
  const frame = $('report');
  frame.contentWindow.focus();
  frame.contentWindow.print();
});
$('scenario').addEventListener('change', renderForm);

$('scenario').innerHTML = SCENARIO_FORMS
  .map((s) => `<option value="${s.id}">${s.id}. ${s.title}</option>`).join('');
renderForm();
// 기본값 확인용 (콘솔)
console.log('시나리오 폼 로드 완료:', SCENARIO_FORMS.length, buildDefaults(1) ? 'defaults ok' : '');
