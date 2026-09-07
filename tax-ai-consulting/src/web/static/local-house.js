/**
 * 지방주택 + 수도권 주택 1세대1주택 판정기 페이지
 * 판정 엔진(src/core/local-house-judge.js)을 브라우저에서 직접 실행.
 */

import { judgeLocalHouse, REGIONS, HOW, DEPOP } from '../../core/local-house-judge.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
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

const YN = (name, def, yes = '예 (조정대상지역)', no = '아니오 (비조정)') => `<select class="${name}"><option value="1" ${def ? 'selected' : ''}>${yes}</option><option value="0" ${def ? '' : 'selected'}>${no}</option></select>`;
const money = (cls, val) => `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;
const date = (cls, val) => `<input type="date" class="${cls}" value="${val}">`;
const opts = (list, sel) => list.map((o) => `<option value="${o.key}" ${o.key === sel ? 'selected' : ''}>${o.label}</option>`).join('');
const chk = (cls, label, def = false) => `<div class="chk"><input type="checkbox" class="${cls}" ${def ? 'checked' : ''}> ${label}</div>`;

function renderFields() {
  $('fields').innerHTML = `
    <div class="grid2">
      <div class="full"><label>먼저 양도할 주택</label>
        <select class="l-sell">
          <option value="metro" selected>수도권 주택(일반주택)을 먼저 양도</option>
          <option value="local">지방주택을 먼저 양도</option>
        </select>
      </div>
      <div><label>양도(예정)일</label>${date('l-sale', '2026-09-01')}</div>
      <div><label>양도가액</label>${money('l-price', 1_100_000_000)}</div>
      <div><label>종부세 귀속연도 (과세기준일 6.1)</label><input class="l-year" inputmode="numeric" value="2026"></div>
      <div><label>소유자 만 나이 (종부세 연령공제)</label><input class="l-age" inputmode="numeric" value="62"></div>
    </div>
    ${chk('l-sole', '두 주택 모두 <b>같은 세대원 1인의 단독 소유</b>입니다 (공동명의·배우자 분산 소유 아님)', true)}

    <div class="sub-box metro">
      <h5>① 수도권 주택 (서울·경기·인천 — 일반주택)</h5>
      <div class="grid2">
        <div><label>취득일</label>${date('m-acq', '2015-03-01')}</div>
        <div><label>취득 당시 조정대상지역</label>${YN('m-adj', false)}</div>
        <div><label>현재(양도 시) 조정대상지역</label>${YN('m-adjnow', true)}</div>
        <div><label>실거주 기간(년)</label><input class="m-live" inputmode="numeric" value="5"></div>
        <div class="full"><label>공시가격 (종부세·재산세용)</label>${money('m-gongsi', 1_000_000_000)}</div>
      </div>
    </div>

    <div class="sub-box local">
      <h5>② 지방주택</h5>
      <div class="grid2">
        <div class="full"><label>소재지 유형</label><select class="s-region">${opts(REGIONS, 'province')}</select></div>
        <div class="full"><label>인구감소지역 구분 (행안부 고시)</label><select class="s-depop">${opts(DEPOP, 'none')}</select></div>
        <div class="full"><label>취득 경위</label><select class="s-how">${opts(HOW, 'buy')}</select></div>
        <div><label>취득일 (상속은 상속개시일)</label>${date('s-acq', '2022-05-01')}</div>
        <div><label>취득 당시 기준시가 (주택+부수토지)</label>${money('s-acqprice', 200_000_000)}</div>
        <div class="full"><label>현재 공시가격 (과세기준일)</label>${money('s-gongsi', 250_000_000)}</div>
      </div>
      ${chk('s-eup', '<b>읍·면 지역</b> 소재 (도시지역 안의 읍은 제외) — §155⑦·§99의4 농어촌주택 요건', true)}
      ${chk('s-samesgg', '수도권 주택과 <b>같은 시·군·구</b>에 있음 — 세컨드홈(§71의2) 제외 사유')}
      ${chk('s-excl', '도시지역·토지거래허가구역·조정대상지역·관광단지 중 하나에 해당 — §99의4 제외지역')}
      ${chk('s-adj', '수도권 주택과 같은 읍·면 또는 연접 읍·면 — §99의4 제외 사유')}
      ${chk('s-hanok', '한옥 (§99의4 가액 기준 4억)')}
      <div id="howBox"></div>
      <div id="localSellBox"></div>
    </div>`;
  bindMoney($('fields'));
  q('.s-how').addEventListener('change', renderHow);
  q('.l-sell').addEventListener('change', renderLocalSell);
  renderHow();
  renderLocalSell();
  $('result').style.display = 'none';
  $('empty').style.display = 'block';
}

function renderHow() {
  const how = val('s-how');
  let html = '';
  if (how === 'inherit') {
    html = `<div class="sub-box"><h5>상속 — §155②·§155⑦ / 종부세 §8④2</h5><div class="grid2">
      <div><label>피상속인 거주 기간(년)</label><input class="s-otherlive" inputmode="numeric" value="6"></div>
      <div><label>본인 상속 지분율(%)</label><input class="s-share" inputmode="numeric" value="100"></div>
    </div><div class="req-note">§155⑦ 농어촌 상속주택: 피상속인이 취득 후 5년 이상 거주. 종부세: 상속개시 5년 이내 또는 지분 40% 이하 또는 지분 공시가격 비수도권 3억(수도권 6억) 이하.</div></div>`;
  } else if (how === 'leaveFarm') {
    html = `<div class="sub-box"><h5>이농주택 — §155⑦</h5><div class="grid2">
      <div><label>이농인 거주 기간(년)</label><input class="s-otherlive" inputmode="numeric" value="5"></div>
    </div><div class="req-note">농·어업에 종사하던 자가 취득 후 5년 이상 거주하다 다른 시·구·읍·면으로 전출하며 남긴 주택.</div></div>`;
  } else if (how === 'returnFarm') {
    html = `<div class="sub-box"><h5>귀농주택 — §155⑦</h5><div class="grid2">
      <div><label>소유 농지 면적(㎡)</label><input class="s-farmland" inputmode="numeric" value="1200"></div>
      <div><label>취득 후 영농·영어 기간(년)</label><input class="s-farmyears" inputmode="numeric" value="3"></div>
    </div><div class="req-note">농지 1,000㎡ 이상 + 대지 660㎡ 이내 + 3년 이상 영농(미달 시 사후관리) + 귀농주택 취득일부터 5년 내 일반주택 양도. 세대 전원 이주 등 세부 요건은 별도 확인.</div></div>`;
  } else if (how === 'unavoidable') {
    html = `<div class="sub-box"><h5>부득이한 사유 — §155⑧</h5><div class="grid2">
      <div class="full"><label>사유 해소일 (비워두면 사유 지속 중)</label><input type="date" class="s-reasonend" value=""></div>
    </div><div class="req-note">취학(고교 이상)·근무상 형편·질병 요양 등으로 수도권 밖 주택을 취득해 1년 이상 거주. 사유 해소일부터 3년 내 일반주택 양도.</div></div>`;
  } else if (how === 'unsold') {
    html = `<div class="sub-box"><h5>준공 후 미분양 — 조특법 §98의9</h5><div class="grid2">
      <div><label>전용면적(㎡)</label><input class="s-area" inputmode="numeric" value="84"></div>
      <div><label>취득가액</label>${money('s-acqamount', 550_000_000)}</div>
    </div><div class="req-note">2024.1.10~2026.12.31 수도권 밖 준공 후 미분양(85㎡·6억 이하)을 1주택자가 취득. 사업주체 확인서 필요.</div></div>`;
  } else if (how === 'hometown') {
    html = `<div class="sub-box"><h5>고향주택 — 조특법 §99의4</h5>
      ${chk('s-smallcity', '인구 20만 이하 시 (가족관계등록부 등 10년 이상 거주한 고향)', true)}
      <div class="req-note">2009.1.1~2028.12.31 취득, 기준시가 3억(한옥 4억) 이하, 일반주택 보유 중 취득, 3년 이상 보유.</div></div>`;
  } else {
    html = `<div class="req-note">일반 매입은 <b>조특법 §99의4</b>(읍·면 농어촌주택 3억 이하), <b>§71의2</b>(인구감소지역 세컨드홈), <b>§155①</b>(일시적 2주택)을 검토합니다.</div>`;
  }
  $('howBox').innerHTML = html;
  bindMoney($('howBox'));
}

function renderLocalSell() {
  const sell = val('l-sell');
  $('localSellBox').innerHTML = sell === 'local' ? `<div class="sub-box"><h5>지방주택 양도 시 §154① 판정용</h5><div class="grid2">
      <div><label>취득 당시 조정대상지역</label>${YN('s-adjacq', false)}</div>
      <div><label>현재 조정대상지역</label>${YN('s-adjnow', false)}</div>
      <div><label>실거주 기간(년)</label><input class="s-live" inputmode="numeric" value="0"></div>
    </div></div>` : '';
}

function bindMoney(scope) {
  scope.querySelectorAll('[data-kind="money"]').forEach((inp) => {
    const hint = inp.nextElementSibling?.classList?.contains('money-hint') ? inp.nextElementSibling : null;
    const update = () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? fmt(raw) : '';
      if (hint) hint.textContent = raw ? KOREAN_UNIT(raw) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
}

const q = (sel) => document.querySelector(sel);
const num = (cls) => Number(String(q('.' + cls)?.value ?? '').replace(/[^\d.-]/g, '')) || 0;
const val = (cls) => q('.' + cls)?.value;
const checked = (cls) => q('.' + cls)?.checked || false;

function checkRow(c) {
  const cls = c.warn ? 'warn' : (c.ok ? 'ok' : 'no');
  const ic = c.warn ? '!' : (c.ok ? '✓' : '✕');
  return `<div class="check ${cls}"><div class="ic">${ic}</div><div><div class="lbl">${c.label}</div><div class="det">${c.detail}</div></div></div>`;
}
function pathBlock(p, appliedKey) {
  const applied = p.key === appliedKey;
  return `<details class="path ${p.ok ? 'ok' : 'no'} ${applied ? 'applied' : ''}" ${applied || p.ok ? 'open' : ''}>
    <summary><span>${p.title}</span><span class="law">${p.law}</span><span class="st">${applied ? '적용' : (p.ok ? '충족' : '미충족')}</span></summary>
    <div class="body">${p.checklist.map(checkRow).join('')}</div></details>`;
}
const reasonsBlock = (list) => list.length ? `<div class="reasons"><b style="font-size:14px;color:#7d6608">참고</b><ul style="padding-left:18px;margin:6px 0 0">${list.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : '';

function renderTransfer(t) {
  const badge = { exempt: '비과세', partial: '부분 비과세', taxable: '과세' }[t.verdict];
  const soldName = t.sold === 'local' ? '지방주택' : '수도권 주택';
  return `<div class="tax-card">
    <h3>양도소득세 — ${soldName} 양도 시 1세대1주택 비과세 <span class="law">소득세법 §89①3 · 시행령 §154·§155 · 조특법</span></h3>
    <div class="verdict ${t.verdict}"><span class="tag">${badge}</span><div class="head">${t.headline}</div></div>
    <h4 class="sec">1세대1주택으로 보는 특례 경로 (${t.paths.filter((p) => p.ok).length}/${t.paths.length} 충족)</h4>
    ${t.paths.map((p) => pathBlock(p, t.applied?.key)).join('')}
    <h4 class="sec">양도주택 §154① 보유·거주·고가</h4>
    ${t.base.map(checkRow).join('')}
    <h4 class="sec">다주택 중과 (비과세 불가 시)</h4>
    <div class="heavy-box ${t.heavy.isHeavy ? 'on' : 'off'}">
      <b>${t.heavy.label}</b><br>다른 주택: ${t.heavy.why} → 중과 주택수 ${t.heavy.houseCount}주택
    </div>
    ${reasonsBlock(t.reasons)}
    <div class="lawref">${t.lawRef.join(' · ')}</div>
  </div>`;
}

function renderJongbu(j) {
  const s = j.compare.special, m = j.compare.multi, g = j.compare.gongsi;
  const badge = j.verdict === 'exempt' ? '1세대1주택자 특례' : '다주택 방식';
  const row = (label, a, b, isTotal = false) => `<tr class="${isTotal ? 'total' : ''}"><td>${label}</td><td class="${j.verdict === 'exempt' ? 'chosen' : ''}">${a}</td><td class="${j.verdict !== 'exempt' ? 'chosen' : ''}">${b}</td></tr>`;
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  return `<div class="tax-card">
    <h3>종합부동산세 — 1세대1주택자 특례 (${j.taxDate} 과세기준일) <span class="law">종부세법 §8④·§9 · 조특법</span></h3>
    <div class="verdict ${j.verdict}"><span class="tag">${badge}</span><div class="head">${j.headline}</div></div>
    <h4 class="sec">주택수 산정 제외 특례 경로 (${j.paths.filter((p) => p.ok).length}/${j.paths.length} 충족)</h4>
    ${j.paths.map((p) => pathBlock(p, j.applied?.key)).join('')}
    <h4 class="sec">공통 요건·절차</h4>
    ${j.common.map(checkRow).join('')}
    <h4 class="sec">종부세 비교 — 특례 적용 vs 미적용 (공시가격 합계 ${won(g.total)})</h4>
    <div class="wrap-x"><table class="cmp">
      <thead><tr><th>항목</th><th>특례 적용 (1세대1주택자)</th><th>미적용 (다주택 방식)</th></tr></thead>
      <tbody>
        ${row('기본공제', won(s.breakdown.deductAmt), won(m.breakdown.deductAmt))}
        ${row('과세표준 (공정시장가액비율 ' + pct(s.breakdown.fairMarketRate) + ')', won(s.breakdown.aggrTaxBase), won(m.breakdown.aggrTaxBase))}
        ${row('산출세액', won(s.breakdown.aggrTaxBeforeDc), won(m.breakdown.aggrTaxBeforeDc))}
        ${row('재산세 공제 (이중과세 조정)', '−' + won(s.breakdown.propertyTaxDc), '−' + won(m.breakdown.propertyTaxDc))}
        ${row(`세액공제 (연령 ${pct(s.breakdown.ageDc)} + 보유 ${pct(s.breakdown.prdDc)}) × 1주택분 ${(j.ratio * 100).toFixed(1)}%`, '−' + won(s.breakdown.credit), '없음')}
        ${row('종합부동산세', won(s.aggrTax), won(m.aggrTax))}
        ${row('농어촌특별세 (20%)', won(s.ruralTax), won(m.ruralTax))}
        ${row('합계', won(s.total), won(m.total), true)}
      </tbody>
    </table></div>
    <div class="muted">특례 적용 시 절감액: <b>${won(j.compare.saving)}</b> · 수도권 주택 보유 ${j.period}년 · 만 ${j.age}세 · 재산세(본세) 합계 ${won(j.compare.propertyTax.total)}</div>
    ${reasonsBlock(j.reasons)}
    <div class="lawref">${j.lawRef.join(' · ')}</div>
  </div>`;
}

function judge() {
  const how = val('s-how');
  const r = judgeLocalHouse({
    sellFirst: val('l-sell'), saleDate: val('l-sale'), salePrice: num('l-price'),
    taxYear: num('l-year') || 2026, age: num('l-age'), soleOwner: checked('l-sole'),
    metro: {
      acquireDate: val('m-acq'), acquiredInAdjust: val('m-adj') === '1', adjustNow: val('m-adjnow') === '1',
      liveYears: num('m-live'), gongsi: num('m-gongsi'),
    },
    local: {
      region: val('s-region'), depop: val('s-depop'), how,
      acquireDate: val('s-acq'), acquirePrice: num('s-acqprice'), gongsi: num('s-gongsi'),
      eupMyeon: checked('s-eup'), sameSgg: checked('s-samesgg'), excludedArea: checked('s-excl'),
      adjacentEupMyeon: checked('s-adj'), hanok: checked('s-hanok'), smallCity: checked('s-smallcity'),
      otherLiveYears: num('s-otherlive'), inheritShare: q('.s-share') ? num('s-share') / 100 : 1,
      farmlandM2: num('s-farmland'), farmYears: num('s-farmyears'),
      reasonEndDate: val('s-reasonend') || null,
      area: num('s-area'), acqAmount: num('s-acqamount'),
      acquiredInAdjust: val('s-adjacq') === '1', adjustNow: val('s-adjnow') === '1', liveYears: num('s-live'),
    },
  });
  $('result').innerHTML = renderTransfer(r.transfer) + renderJongbu(r.jongbu)
    + `<div class="muted">※ 참고용 판정입니다. 세대 판정, 주택 수(입주권·분양권·오피스텔 포함), 3주택 이상, 임대주택 합산배제, 다른 특례와의 중복, 사후관리 요건은 반영되지 않을 수 있어 실제 신고·신청 전 세무 전문가 확인이 필요합니다.</div>`;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

$('judgeBtn').addEventListener('click', judge);
renderFields();
