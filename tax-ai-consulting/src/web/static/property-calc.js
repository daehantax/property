/**
 * 재산세 계산기 — 주택분 (property-calc.html)
 *
 * calcPropertyTax 기반. 고지서식 상세의 과세표준·재산세 본세·도시지역분·지방교육세
 * 항목을 누르면 산식 팝업(현재 값 대입)을 보여준다.
 */

import { calcPropertyTax, calcFireSafetyTax } from '../../core/property-tax.js';
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
  const fireBase = moneyVal($('inFireBase'));
  const fireMul  = Number($('inFireMul').value) || 1;
  const fireTax  = fireBase > 0 ? calcFireSafetyTax(fireBase, fireMul) : 0;

  const r = calcPropertyTax(type, gongsi);
  const b = r.breakdown;
  const totalAll = r.total + fireTax;
  const ratioPct = `${(b.fairMarketRatio * 100).toFixed(0)}%`;

  const rows = [];
  const row = (label, amount, opts = {}) => rows.push(`
    <tr class="${opts.total ? 'total' : ''}">
      <td class="rowlabel">${opts.fx ? `<button class="fx-btn" data-fx="${opts.fx}">${label}</button>` : label}
        ${opts.note ? `<div style="font-size:13px;color:#5f7180;font-weight:400">${opts.note}</div>` : ''}</td>
      <td class="num">${won(amount)}</td>
    </tr>`);

  row('공시가격', gongsi);
  row(`과세표준 (공시가격 × 공정시장가액비율 ${ratioPct})`, b.taxBase, { fx: 'taxbase' });
  row('재산세 본세', r.propertyTax, {
    fx: 'main',
    note: b.specialRate ? '1세대1주택 특례세율 (공시 9억 이하)' : '표준세율',
  });
  row('도시지역분 (과세표준 × 0.14%)', r.dosiTax, { fx: 'dosi' });
  if (fireTax > 0) {
    row(`지역자원시설세 소방분${fireMul > 1 ? ` (${fireMul}배 중과)` : ''}`, fireTax, {
      fx: 'fire', note: `소방분 과세표준 ${won(fireBase)} 기준`,
    });
  }
  row('지방교육세 (재산세 본세 × 20%)', r.pEduTax, { fx: 'edu' });
  row('고지서 합계 (연간)', totalAll, { total: true });

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">고지서 합계 (연간)</div>
      <div class="amount">${won(totalAll)}</div>
      <div class="sub">본세 ${won(r.propertyTax)} + 도시지역분 ${won(r.dosiTax)}${fireTax > 0 ? ` + 소방분 ${won(fireTax)}` : ''} + 지방교육세 ${won(r.pEduTax)}
        ${share < 1 ? ` · 본인 부담분(${Math.round(share * 100)}%) ${won(totalAll * share)}` : ''}</div>
    </div>
    <div class="notice-wrap"><table class="notice">
      <tr><th>구분 <span style="font-weight:400;font-size:13px;color:#5f7180">(밑줄 항목 클릭 = 산식 보기)</span></th><th class="num">금액</th></tr>
      ${rows.join('')}
    </table></div>
    ${share < 1 ? `<p style="font-size:13.5px;color:#566573;margin:8px 0 0">공동명의 본인 부담분:
      ${won(totalAll)} × ${Math.round(share * 100)}% = <b>${won(totalAll * share)}</b>
      (재산세는 물건별 과세 — 전체 세액을 지분비율로 나눠 납부)</p>` : ''}
    <p style="font-size:13.5px;color:#566573;margin:8px 0 0">납부: 7월(½)·9월(½) 분납, 세액 20만 원 이하는 7월 일시 납부.
      종부세 계산은 <a href="aggr-home.html">보유세 계산기</a>에서.</p>
    <div class="lawref"><b>근거 법령</b><br>${r.lawRef.join('<br>')}${fireTax > 0 ? '<br>지방세법 §146(지역자원시설세 소방분)·§146④⑤(화재위험건축물 중과)' : ''}</div>
    <div class="disclaimer">※ 참고용 계산입니다. 실제 고지서는 <b>과세표준상한제</b>(2024~, 직전연도 과세표준 기반)와
      <b>세부담상한제</b>(주택 105~130%·2028년까지 병행, 건축물·법인주택 150%)로 세액이 이보다 낮아질 수 있고,
      지방세특례제한법 감면이 있으면 추가로 달라집니다. (기준: 2026.5.10 시행분)</div>
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
        <p><b>과세표준상한제 (§110의2, 2024~)</b> — 실제 과세표준은 위 값과
        「직전연도 과세표준 상당액 + (해당연도 과세표준 × 상한율 0~5%)」 중 <b>작은 값</b>입니다.
        직전연도 자료가 필요해 이 계산기에는 반영하지 않으므로, 공시가격이 급등한 해에는 고지서가 이보다 낮을 수 있습니다.</p>
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
        <div class="fx-formula">지방교육세 = 재산세 본세 × 20%
(도시지역분·지역자원시설세는 과세표준에서 제외 — §151①6)</div>
        <div class="fx-now">이번 계산: ${won(r.propertyTax)} × 20% = <b>${won(r.pEduTax)}</b></div>`,
    },
    fire: {
      title: '지역자원시설세 소방분 (지방세법 §146③)',
      html: `
        <p>고지서 ③번 세목. 과세표준은 <b>건축물 부분</b>의 시가표준액 × 공정시장가액비율로,
        주택 공시가격과 다릅니다(고지서 기재값 입력).</p>
        <table>
          <tr><th class="num">과세표준</th><th class="num">세율</th></tr>
          <tr><td class="num">600만 이하</td><td class="num">0.04%</td></tr>
          <tr><td class="num">1,300만 이하</td><td class="num">2,400원 + 초과분 0.05%</td></tr>
          <tr><td class="num">2,600만 이하</td><td class="num">5,900원 + 초과분 0.06%</td></tr>
          <tr><td class="num">3,900만 이하</td><td class="num">13,700원 + 초과분 0.08%</td></tr>
          <tr><td class="num">6,400만 이하</td><td class="num">24,100원 + 초과분 0.1%</td></tr>
          <tr><td class="num">6,400만 초과</td><td class="num">49,100원 + 초과분 0.12%</td></tr>
        </table>
        <p>화재위험건축물(주유소·유흥장 등)은 <b>2배</b>, 대형 화재위험건축물(고층 등)은 <b>3배</b> 중과 (§146④·⑤).</p>
        <div class="fx-now">이번 계산: 과세표준 ${won(fireBase)}${fireMul > 1 ? ` × ${fireMul}배` : ''} → <b>${won(fireTax)}</b></div>`,
    },
  };
}

bindMoneyInputs(document);
bindFxButtons($('btResult'), () => fxMap, showFx);
$('calcBtn').addEventListener('click', calculate);

/* ── 1세대 1주택 세율 특례 — 주택 수 산정 제외 체크리스트 (지방세법 시행령 §110조의2①) ── */

const EXCLUDE_APPLY = [   // 위택스·구청에 「주택수 산정제외」 신청해야 제외 (매년 6.1~12.31)
  { t: '상속주택', d: '과세기준일(6.1) 현재 상속개시일부터 5년이 지나지 않은 주택 (지분 상속 포함)' },
  { t: '혼인 전부터 각자 소유한 주택', d: '혼인 전 부부가 각자 소유하던 주택 — 혼인일부터 5년이 지나지 않은 경우' },
  { t: '사원용 주택 (종업원 제공)', d: '사용자 소유 주택을 종업원에게 무상 또는 저가로 제공 — 종업원이 친족 등 특수관계인이면 제외 불가' },
  { t: '미분양 주택 (주택 건설사업자)', d: '사업자등록을 한 자가 건축해 소유 중인 미분양 주택 — 재산세 납세의무 최초 성립일부터 5년 이내' },
  { t: '대물변제 주택 (시공자)', d: '주택 시공자가 공사대금으로 받은 미분양 주택 — 납세의무 최초 성립일부터 5년 이내' },
  { t: '인구감소지역 주택', d: '1주택자가 2024.1.4~2026.12.31에 취득한 인구감소지역 소재 공시가격 4억 이하 주택 (수도권·광역시 제외, 접경지역·광역시 군지역은 가능)' },
  { t: '비수도권 준공 후 미분양 주택', d: '1주택자가 2024.1.10 이후 취득한 수도권 밖 준공 후 미분양 주택 — 전용 85㎡·취득가액 6억 이하' },
];
const EXCLUDE_AUTO = [    // 신청 없이 자동 제외
  { t: '가정어린이집', d: '세대원이 영유아보육법 인가·고유번호를 받아 가정어린이집(국공립 위탁 포함)으로 운영하는 주택' },
  { t: '기숙사', d: '건축법 시행령상 기숙사' },
  { t: '노인복지주택 (임대형)', d: '노인복지법에 따라 임대 목적으로 제공하는 노인복지주택' },
  { t: '문화유산 주택', d: '지정문화유산·국가등록문화유산 및 보호구역 안의 부동산에 해당하는 주택' },
];

function ckRow(item, idx, group) {
  return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 4px;border-bottom:1px solid #eef2f4">
      <input type="checkbox" id="ck-${group}-${idx}" class="ck-item" style="width:20px;height:20px;margin-top:2px;flex-shrink:0">
      <input type="number" min="1" value="1" id="ckn-${group}-${idx}" class="ck-num" disabled
        style="width:58px;text-align:center;padding:4px;flex-shrink:0" title="이 유형의 주택 수">
      <label for="ck-${group}-${idx}" style="margin:0;display:block;cursor:pointer;font-size:15px;color:#2c3e50">
        <b>${item.t}</b>
        <span style="display:block;font-weight:400;font-size:13.5px;color:#5f7180;line-height:1.55">${item.d}</span>
      </label>
    </div>`;
}

function renderChecklist() {
  $('ckListApply').innerHTML = EXCLUDE_APPLY.map((x, i) => ckRow(x, i, 'a')).join('');
  $('ckListAuto').innerHTML = EXCLUDE_AUTO.map((x, i) => ckRow(x, i, 'b')).join('');

  const update = () => {
    let excl = 0;
    document.querySelectorAll('.ck-item').forEach((cb) => {
      const num = document.getElementById('ckn' + cb.id.slice(2));
      num.disabled = !cb.checked;
      if (cb.checked) excl += Math.max(Number(num.value) || 1, 1);
    });
    const total = Math.max(Number($('ckTotal').value) || 0, 0);
    const count = Math.max(total - excl, 0);
    $('ckExcl').textContent = excl;
    $('ckCount').textContent = count;
    const v = $('ckVerdict');
    if (total === 0) { v.textContent = ''; return; }
    if (count === 1) {
      v.style.color = '#145a32';
      v.textContent = '→ 1세대 1주택: 특례 대상 (공시 9억 이하면 특례세율 + 공정시장가액비율 43~45%)';
    } else if (count === 0) {
      v.style.color = '#b9770e';
      v.textContent = '→ 산정 주택 수 0 — 보유 주택 수 입력을 확인하세요';
    } else {
      v.style.color = '#943126';
      v.textContent = `→ 산정 주택 수 ${count}채: 특례 미적용 (표준세율 · 공정시장가액비율 60%)`;
    }
  };

  document.querySelectorAll('.ck-item, .ck-num').forEach((el) => {
    el.addEventListener('change', update);
    el.addEventListener('input', update);
  });
  $('ckTotal').addEventListener('input', update);
  update();
}
renderChecklist();
