/**
 * 종부세 계산기 — 1세대 1주택 부부 공동명의 (aggr-couple.html)
 *
 * 인별 과세 원칙: 부부 각자 지분에 각자 9억 공제 후 따로 계산해 합산(부부합계).
 * 특례(종부세법 §10의2 — 1세대1주택 단독명의 방식) 선택 시와 비교해 유리한 쪽을 안내한다.
 * 고지서식 상세의 항목을 누르면 산식 팝업(현재 값 대입)을 보여준다.
 */

import { calcPropertyTax } from '../../core/property-tax.js';
import { calcAggrTax, calcAggrTaxCouple } from '../../core/comprehensive-tax.js';
import {
  won, bindMoneyInputs, moneyVal, initFxDialog, bindFxButtons,
  AGGR_RATE_TABLE_HTML, aggrRateFormula,
} from './notice-ui.js';

const $ = (id) => document.getElementById(id);
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const showFx = initFxDialog();
let fxMap = {};   // 계산할 때마다 현재 값으로 갱신되는 산식 팝업 내용

function calculate() {
  const gongsi = moneyVal($('inGongsi'));
  const shareA = Math.min(Math.max(Number($('inShare').value) || 50, 0), 100) / 100;
  const period = Number($('inPeriod').value) || 0;
  const age    = Number($('inAge').value) || 0;
  const prev   = moneyVal($('inPrev'));

  const p = calcPropertyTax('공동명의1주택', gongsi);
  const c = calcAggrTaxCouple(gongsi, shareA, '비조정지역', p.propertyTax,
    prev > 0 ? { prevYearTotal: prev } : {});
  const A = c.a, B = c.b, ba = A.breakdown, bb = B.breakdown;
  const pctA = Math.round(shareA * 100), pctB = 100 - pctA;

  // 특례(1세대1주택 단독명의 방식): 12억 공제 + 장기보유·연령 세액공제
  const special = calcAggrTax('1세대1주택', '비조정지역', gongsi, period, age, p.propertyTax,
    prev > 0 ? { prevYearTotal: prev } : {});
  const perPersonWins = c.total <= special.total;
  const diff = Math.abs(c.total - special.total);

  const rows = [];
  const row = (label, va, vb, opts = {}) => rows.push(`
    <tr class="${opts.minus ? 'minus' : ''} ${opts.total ? 'total' : ''}">
      <td class="rowlabel">${opts.fx ? `<button class="fx-btn" data-fx="${opts.fx}">${label}</button>` : label}
        ${opts.note ? `<div style="font-size:11.5px;color:#7b8a97;font-weight:400">${opts.note}</div>` : ''}</td>
      <td class="num">${opts.minus && va > 0 ? '△' : ''}${won(va)}</td>
      <td class="num">${opts.minus && vb > 0 ? '△' : ''}${won(vb)}</td>
      <td class="num">${opts.minus && va + vb > 0 ? '△' : ''}${won(va + vb)}</td>
    </tr>`);

  row('지분 공시가격', ba.gongsi, bb.gongsi);
  row('기본공제 (인별 각 9억)', ba.deductAmt, bb.deductAmt, { minus: true });
  row(`과세표준 = (지분 공시가격 − 9억) × ${pct(ba.fairMarketRate)}`, ba.aggrTaxBase, bb.aggrTaxBase);
  const noTax = ba.aggrTaxBase <= 0 && bb.aggrTaxBase <= 0;
  if (!noTax) {
    row('산출세액', ba.aggrTaxBeforeDc, bb.aggrTaxBeforeDc, { fx: 'chulse' });
    row('공제할 재산세액 (이중과세 조정)', ba.propertyTaxDc, bb.propertyTaxDc, { fx: 'jaesan', minus: true });
    row('세액공제 (장기보유·연령)', ba.creditAmt, bb.creditAmt, {
      fx: 'gongje', minus: true, note: '인별 방식에는 없음 — 특례 선택 시만 적용',
    });
    row('세부담상한 초과 차감', ba.capReduction, bb.capReduction, {
      fx: 'sanghan', minus: true,
      note: prev > 0 ? `전년도 보유세 ${won(prev)}를 지분비율로 배분해 적용` : '전년도 보유세 미입력 → 미적용',
    });
  }
  row('종합부동산세 (결정세액)', A.aggrTax, B.aggrTax);
  row('농어촌특별세 (종부세 × 20%)', A.ruralTax, B.ruralTax);
  row('합계 (농특세 포함, 연간)', A.total, B.total, { total: true });

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">부부합계 (종부세 + 농특세, 연간) — 인별 각자 계산 합산</div>
      <div class="amount">${won(c.total)}</div>
      <div class="sub">${noTax
        ? '각자 지분 공시가격이 인별 공제 9억 이하 → 부부 모두 종부세 없음'
        : `본인(${pctA}%) ${won(A.total)} + 배우자(${pctB}%) ${won(B.total)}`}</div>
    </div>
    <div class="notice-wrap"><table class="notice">
      <tr><th>구분 <span style="font-weight:400;font-size:11px;color:#7b8a97">(밑줄 항목 클릭 = 산식 보기)</span></th>
        <th class="num">본인 (${pctA}%)</th><th class="num">배우자 (${pctB}%)</th><th class="num">부부합계</th></tr>
      ${rows.join('')}
    </table></div>

    <div class="compare-box">
      <h4>인별 방식 vs 공동명의 1주택자 특례(§10의2) 비교</h4>
      <table class="notice" style="margin:0 0 8px">
        <tr><th>방식</th><th class="num">연간 세액 (농특세 포함)</th><th>내용</th></tr>
        <tr>
          <td class="rowlabel">인별 방식 (기본)${perPersonWins ? ' <span class="win">✓ 유리</span>' : ''}</td>
          <td class="num"><b>${won(c.total)}</b></td>
          <td style="font-size:12px;color:#566573">각자 9억 공제(합 18억) · 세액공제 없음</td>
        </tr>
        <tr>
          <td class="rowlabel">특례 — 1세대1주택 방식${!perPersonWins ? ' <span class="win">✓ 유리</span>' : ''}</td>
          <td class="num"><b>${won(special.total)}</b></td>
          <td style="font-size:12px;color:#566573">12억 공제 · 장기보유 ${pct(special.breakdown.prdDc)} + 연령 ${pct(special.breakdown.ageDc)} 세액공제</td>
        </tr>
      </table>
      <p style="font-size:12.5px;margin:0;color:#2c3e50">
        ${c.total === special.total
          ? '두 방식의 세액이 같습니다.'
          : `<b class="win">${perPersonWins ? '인별 방식(기본)' : '특례 신청'}</b>이 연 <b>${won(diff)}</b> 유리합니다.`}
        특례는 매년 9.16~9.30에 관할 세무서에 신청하며, 지분율이 큰 배우자(같으면 선택한 1인)가 납세의무자가 됩니다.
      </p>
    </div>

    <p style="font-size:12px;color:#566573;margin:8px 0 0">참고 — 재산세는 물건별 과세로 주택 전체 기준 계산 후 지분비율로 나눠 납부:
      전체 ${won(p.total)} (본세 ${won(p.propertyTax)} + 도시지역분 ${won(p.dosiTax)} + 지방교육세 ${won(p.pEduTax)})
      → 본인 ${won(p.total * shareA)} / 배우자 ${won(p.total * (1 - shareA))} (<a href="property-calc.html">재산세 계산기</a>)</p>
    <div class="lawref"><b>근거 법령</b><br>${c.lawRef.join('<br>')}</div>
    <div class="disclaimer">※ 참고용 계산이며, 실제 신고 전 세무 전문가 확인이 필요합니다. (기준: 2026.5.10 시행분)</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';

  // 산식 팝업 내용 (현재 계산값 대입)
  const personLine = (who, bd) => bd.aggrTaxBase <= 0
    ? `${who}: 과세표준 0원 → 산출세액 0원`
    : `${who}: 과세표준 ${won(bd.aggrTaxBase)} → ${aggrRateFormula(bd.aggrTaxBase)} = ${won(bd.aggrTaxBeforeDc)}`;
  fxMap = {
    chulse: {
      title: '산출세액 — 인별 누진세율 (종부세법 §7·§9)',
      html: `
        <p><b>인별 과세</b>: 부부 각자 자기 지분의 과세표준에 누진세율을 <b>따로</b> 적용합니다.
        합산해서 한 번에 세율을 매기면 누진 구조 때문에 세금이 과대 계산됩니다.</p>
        <div class="fx-formula">각자 과세표준 = (전체 공시가격 × 지분율 − 9억) × 공정시장가액비율 60%
각자 산출세액 = 각자 과세표준 × 세율 − 누진공제</div>
        ${AGGR_RATE_TABLE_HTML}
        <div class="fx-now">${personLine(`본인(${pctA}%)`, ba)}
${personLine(`배우자(${pctB}%)`, bb)}</div>`,
    },
    jaesan: {
      title: '공제할 재산세액 — 이중과세 조정 (종부세법 §9)',
      html: `
        <p>재산세는 주택 전체로 계산(물건별 과세)한 뒤 지분비율로 배분하고,
        각자 자기 몫의 재산세 중 종부세 과세표준과 겹치는 부분을 공제합니다.</p>
        <div class="fx-formula">각자 공제액 = (재산세 × 지분율) × (각자 종부세 과세표준 × 45% × 0.4%)
          ÷ (지분 공시가격 × 45% × 0.4% − 63만)</div>
        <div class="fx-now">주택 전체 재산세: ${won(p.propertyTax)} (본인 몫 ${won(p.propertyTax * shareA)} / 배우자 몫 ${won(p.propertyTax * (1 - shareA))})
본인 공제: ${won(ba.propertyTaxDc)} / 배우자 공제: ${won(bb.propertyTaxDc)}</div>`,
    },
    gongje: {
      title: '세액공제 — 인별 방식에는 없음 (종부세법 §9의2·§10의2)',
      html: `
        <p>장기보유·연령 세액공제는 <b>1세대 1주택 단독명의자(및 특례 신청자)</b>에게만 적용됩니다.
        부부 공동명의 인별 방식에서는 각자 9억 공제(부부 18억)를 받는 대신 세액공제가 없습니다.</p>
        <div class="fx-formula">특례(§10의2) 신청 시 — 1세대1주택 방식으로 전환:
공제 12억 + (산출세액 − 재산세공제) × min(장기보유 + 연령, 80%)</div>
        <div class="fx-now">특례 선택 시 이 주택: 보유 ${period}년 → ${pct(special.breakdown.prdDc)},
만 ${age}세 → ${pct(special.breakdown.ageDc)} → 세액공제 ${won(special.breakdown.creditAmt)}
특례 방식 연간 세액: ${won(special.total)} (아래 비교표 참고)</div>`,
    },
    sanghan: {
      title: '세부담상한 — 전년 대비 150% (종부세법 §10)',
      html: `
        <p>당해연도 보유세(재산세 + 종부세)가 <b>직전연도 보유세 상당액의 150%</b>를 넘지 않도록
        초과분을 종부세에서 차감합니다. 인별 과세이므로 각자 자기 몫 기준으로 적용합니다.</p>
        <div class="fx-formula">각자 상한액 = 전년도 보유세 상당액 × 지분율 × 150%
각자 차감액 = max(각자 당해 재산세 + 종부세 − 각자 상한액, 0)</div>
        ${prev > 0 ? `<div class="fx-now">부부 합산 전년도 보유세: ${won(prev)}
본인 차감: ${won(ba.capReduction)} / 배우자 차감: ${won(bb.capReduction)}</div>`
        : '<div class="fx-now">전년도 보유세 상당액을 입력하지 않아 이번 계산에는 적용하지 않았습니다.</div>'}`,
    },
  };
}

bindMoneyInputs(document);
bindFxButtons($('btResult'), () => fxMap, showFx);
$('calcBtn').addEventListener('click', calculate);
$('inShare').addEventListener('input', () => {
  const a = Math.min(Math.max(Number($('inShare').value) || 0, 0), 100);
  $('spouseShare').textContent = String(Math.round((100 - a) * 10) / 10);
});
