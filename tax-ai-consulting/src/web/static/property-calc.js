/**
 * 재산세 계산기 — 주택분 (property-calc.html)
 *
 * calcPropertyTax 기반. 고지서식 상세의 과세표준·재산세 본세·도시지역분·지방교육세
 * 항목을 누르면 산식 팝업(현재 값 대입)을 보여준다.
 */

import { calcPropertyTax } from '../../core/property-tax.js';
import { won, bindMoneyInputs, moneyVal, initFxDialog, bindFxButtons } from './notice-ui.js';

const $ = (id) => document.getElementById(id);
const showFx = initFxDialog();
let fxMap = {};   // 계산할 때마다 현재 값으로 갱신되는 산식 팝업 내용

/** 재산세 구간 산식 문자열 (특례/표준) */
function rateFormula(taxBase, special) {
  const r = won;
  if (special) {
    if      (taxBase <= 60_000_000)  return `${r(taxBase)} × 0.05%`;
    else if (taxBase <= 150_000_000) return `30,000원 + (${r(taxBase)} − 6,000만) × 0.1%`;
    else if (taxBase <= 300_000_000) return `120,000원 + (${r(taxBase)} − 1.5억) × 0.2%`;
    else                             return `420,000원 + (${r(taxBase)} − 3억) × 0.35%`;
  }
  if      (taxBase <= 60_000_000)  return `${r(taxBase)} × 0.1%`;
  else if (taxBase <= 150_000_000) return `60,000원 + (${r(taxBase)} − 6,000만) × 0.15%`;
  else if (taxBase <= 300_000_000) return `195,000원 + (${r(taxBase)} − 1.5억) × 0.25%`;
  else                             return `570,000원 + (${r(taxBase)} − 3억) × 0.4%`;
}

const RATE_TABLE_HTML = `
  <table>
    <tr><th class="num">과세표준</th><th class="num">특례세율<br>(1세대1주택 · 공시 9억 이하)</th><th class="num">표준세율</th></tr>
    <tr><td class="num">6,000만 이하</td><td class="num">0.05%</td><td class="num">0.1%</td></tr>
    <tr><td class="num">1.5억 이하</td><td class="num">3만 + 초과분 0.1%</td><td class="num">6만 + 초과분 0.15%</td></tr>
    <tr><td class="num">3억 이하</td><td class="num">12만 + 초과분 0.2%</td><td class="num">19.5만 + 초과분 0.25%</td></tr>
    <tr><td class="num">3억 초과</td><td class="num">42만 + 초과분 0.35%</td><td class="num">57만 + 초과분 0.4%</td></tr>
  </table>`;

function calculate() {
  const type   = $('inType').value;
  const gongsi = moneyVal($('inGongsi'));
  const share  = Math.min(Math.max(Number($('inShare').value) || 100, 0), 100) / 100;

  const r = calcPropertyTax(type, gongsi);
  const b = r.breakdown;
  const ratioPct = `${(b.fairMarketRatio * 100).toFixed(0)}%`;

  const rows = [];
  const row = (label, amount, opts = {}) => rows.push(`
    <tr class="${opts.total ? 'total' : ''}">
      <td class="rowlabel">${opts.fx ? `<button class="fx-btn" data-fx="${opts.fx}">${label}</button>` : label}
        ${opts.note ? `<div style="font-size:11.5px;color:#7b8a97;font-weight:400">${opts.note}</div>` : ''}</td>
      <td class="num">${won(amount)}</td>
    </tr>`);

  row('공시가격', gongsi);
  row(`과세표준 (공시가격 × 공정시장가액비율 ${ratioPct})`, b.taxBase, { fx: 'taxbase' });
  row('재산세 본세', r.propertyTax, {
    fx: 'main',
    note: b.specialRate ? '1세대1주택 특례세율 (공시 9억 이하)' : '표준세율',
  });
  row('도시지역분 (과세표준 × 0.14%)', r.dosiTax, { fx: 'dosi' });
  row('지방교육세 (재산세 × 20%)', r.pEduTax, { fx: 'edu' });
  row('재산세 합계 (연간)', r.total, { total: true });

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">재산세 합계 (연간)</div>
      <div class="amount">${won(r.total)}</div>
      <div class="sub">본세 ${won(r.propertyTax)} + 도시지역분 ${won(r.dosiTax)} + 지방교육세 ${won(r.pEduTax)}
        ${share < 1 ? ` · 본인 부담분(${Math.round(share * 100)}%) ${won(r.total * share)}` : ''}</div>
    </div>
    <div class="notice-wrap"><table class="notice">
      <tr><th>구분 <span style="font-weight:400;font-size:11px;color:#7b8a97">(밑줄 항목 클릭 = 산식 보기)</span></th><th class="num">금액</th></tr>
      ${rows.join('')}
    </table></div>
    ${share < 1 ? `<p style="font-size:12px;color:#566573;margin:8px 0 0">공동명의 본인 부담분:
      ${won(r.total)} × ${Math.round(share * 100)}% = <b>${won(r.total * share)}</b>
      (재산세는 물건별 과세 — 전체 세액을 지분비율로 나눠 납부)</p>` : ''}
    <p style="font-size:12px;color:#566573;margin:8px 0 0">납부: 7월(½)·9월(½) 분납, 세액 20만 원 이하는 7월 일시 납부.
      종부세 계산은 <a href="aggr-home.html">보유세 계산기</a>에서.</p>
    <div class="lawref"><b>근거 법령</b><br>${r.lawRef.join('<br>')}</div>
    <div class="disclaimer">※ 참고용 계산이며, 실제 고지서와는 세부담상한 등으로 차이가 날 수 있습니다. (기준: 2026.5.10 시행분)</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';

  fxMap = {
    taxbase: {
      title: '과세표준 — 공정시장가액비율 (지방세법 §110)',
      html: `
        <p>재산세 과세표준 = 공시가격 × 공정시장가액비율.</p>
        <table>
          <tr><th>구분</th><th class="num">비율</th></tr>
          <tr><td>1세대 1주택 · 공시 3억 이하</td><td class="num">43%</td></tr>
          <tr><td>1세대 1주택 · 공시 3~6억</td><td class="num">44%</td></tr>
          <tr><td>1세대 1주택 · 공시 6억 초과</td><td class="num">45%</td></tr>
          <tr><td>다주택·기타</td><td class="num">60%</td></tr>
        </table>
        <div class="fx-now">이번 계산: ${won(gongsi)} × ${ratioPct} = <b>${won(b.taxBase)}</b></div>`,
    },
    main: {
      title: `재산세 본세 — ${b.specialRate ? '특례세율 (지방세법 §111의2)' : '표준세율 (지방세법 §111)'}`,
      html: `
        <p>${b.specialRate
          ? '1세대 1주택이면서 공시가격 9억 이하 → <b>특례세율</b> 적용.'
          : '표준세율 적용' + (type !== '다주택' ? ' (공시가격 9억 초과 → 특례세율 대상 아님).' : '.')}</p>
        ${RATE_TABLE_HTML}
        <div class="fx-now">이번 계산: 과세표준 ${won(b.taxBase)}
→ ${rateFormula(b.taxBase, b.specialRate)} = <b>${won(r.propertyTax)}</b></div>`,
    },
    dosi: {
      title: '도시지역분 (지방세법 §112)',
      html: `
        <div class="fx-formula">도시지역분 = 과세표준 × 0.14% (재산세 도시지역분 — 도시계획구역 내 주택)</div>
        <div class="fx-now">이번 계산: ${won(b.taxBase)} × 0.14% = <b>${won(r.dosiTax)}</b></div>`,
    },
    edu: {
      title: '지방교육세 (지방세법 §151)',
      html: `
        <div class="fx-formula">지방교육세 = 재산세 본세 × 20%</div>
        <div class="fx-now">이번 계산: ${won(r.propertyTax)} × 20% = <b>${won(r.pEduTax)}</b></div>`,
    },
  };
}

bindMoneyInputs(document);
bindFxButtons($('btResult'), () => fxMap, showFx);
$('calcBtn').addEventListener('click', calculate);
