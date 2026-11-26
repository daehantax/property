/**
 * 공통 상단 내비게이션 (세목별 2단 구성)
 *
 * 모든 페이지의 <nav class="topnav" data-page="..."> 를 이 스크립트가 채운다.
 *   1단: 세목 그룹 (양도 · 상속 · 증여 · 취득 · 보유 · 세법 동향)
 *   2단: 현재 그룹에 속한 도구 (계산기·판정기)
 * 도구를 추가하려면 GROUPS 에 항목 하나만 넣으면 모든 페이지의 메뉴와
 * index.html 의 「세목별 도구 모음」 이 함께 갱신된다.
 *
 * 페이지 식별: <nav data-page="transfer-heavy"> 처럼 파일명(확장자 제외)을 넣는다.
 * index.html 의 계산기 탭은 index.html#gift 처럼 해시로 구분한다.
 *
 * 1단 세목 버튼을 누르면 index.html#hub-<세목키> 로 이동해, 본문에 그 세목의
 * 하위 메뉴(도구 카드)만 보여 준다. (#groupView 가 있는 index.html 에서만 표시)
 */
(function () {
  // 도구 하나가 여러 화면(탭)으로 이뤄지면 tabs 에 적는다.
  //  - 판정기처럼 별도 페이지인 탭: 각 페이지 상단에 탭 줄(.nav-subtabs)을 그려 한 도구처럼 오간다.
  //  - index.html#해시 탭: 메인 계산기 안의 탭 줄(calculators.js)이 맡으므로 여기서는 활성 표시에만 쓴다.
  const JUDGE_TABS = [
    { href: 'transfer-heavy.html', label: '다주택 중과', desc: '주택수 산정 → 2주택·3주택 중과 여부' },
    { href: 'single-exempt.html', label: '1세대1주택 비과세', desc: '보유·거주요건, 상생임대, 일시적 2주택' },
    { href: 'local-house.html', label: '수도권+지방 2주택 특례', desc: '상속·농어촌·세컨드홈 등 1세대1주택 특례와 종부세 특례' },
    { href: 'marriage-exempt.html', label: '혼인·합가', desc: '혼인 합가 특례(10년)·혼인 2주택' },
    { href: 'redev-exempt.html', label: '재건축·재개발', desc: '조합원입주권 비과세·대체주택 특례' },
  ];
  const GROUPS = [
    {
      key: 'transfer', label: '양도', icon: '📤', color: '#1a5276',
      desc: '양도소득세 계산과 비과세·중과 판정',
      tools: [
        { href: 'index.html#transfer', label: '양도소득세 계산기', desc: '주택·토지·건물 · 달력으로 보유기간 · 필요경비 항목 · 개정안 비교',
          tabs: [{ href: 'index.html#transfer-reform' }, { href: 'index.html#single-ltr' }] },
        { href: 'transfer-heavy.html', label: '비과세·중과 판정기', desc: '다주택 중과 · 1세대1주택 · 수도권+지방 2주택 · 혼인 · 재건축을 한곳에서',
          tabs: JUDGE_TABS },
        { href: 'redev-transfer.html', label: '재건축·재개발 양도세', desc: '입주권·신축주택·청산금·대체주택 양도세 계산',
          tabs: [
            { href: 'redev-transfer.html', label: '재건축·재개발 양도세 계산기' },
            { href: 'clearance-transfer.html', label: '개포래미안 청산금 (2019년 양도분)' },
          ] },
        { href: 'regulated-areas.html', label: '규제지역 연혁', desc: '조정대상지역·투기과열지구·토지거래허가구역 연도별 지정·해제' },
      ],
    },
    {
      key: 'inherit', label: '상속', icon: '📜', color: '#6c3483',
      desc: '상속세 계산과 상속주택 판정',
      tools: [
        { href: 'inherit-tax.html', label: '상속세 계산기', desc: '상속공제(일괄·배우자·금융·동거주택)·세대생략 할증·상속인별 안분' },
        { href: 'local-house.html', label: '상속주택 비과세·중과 판정', desc: '상속주택이 있는 세대의 1세대1주택 특례·중과 주택수 제외' },
        { href: 'rental-lessor.html', label: '사전증여 10년 합산 점검', desc: '상속 개시 시 사전증여 합산 체크리스트' },
      ],
    },
    {
      key: 'gift', label: '증여', icon: '🎁', color: '#0e6655',
      desc: '증여세 계산과 증여 vs 양도 비교',
      tools: [
        { href: 'index.html#gift', label: '증여세 계산기', desc: '증여재산공제·세대생략 할증·신고세액공제' },
        { href: 'scenarios.html', label: '증여 vs 양도 시나리오', desc: '부담부증여·분산증여·공동명의 전환 10종 비교 · 상담 보고서(Word·PDF)' },
      ],
    },
    {
      key: 'acquire', label: '취득', icon: '🏠', color: '#b9770e',
      desc: '취득세 계산과 중과 판정',
      tools: [
        { href: 'acq-heavy.html', label: '취득세 계산기', desc: '매매·증여·상속·신축 세액 계산 · 다주택 8%·12% 중과 · 법인 · 일시적 2주택 · 고급주택' },
        { href: 'regulated-areas.html', label: '규제지역 연혁', desc: '취득일 당시 조정대상지역 여부 확인' },
      ],
    },
    {
      key: 'hold', label: '보유', icon: '🏢', color: '#154360',
      desc: '재산세·종합부동산세 계산, 임대사업자 점검',
      tools: [
        { href: 'jongbu.html', label: '종합부동산세 계산기', desc: '단독 · 부부 공동명의 특례 비교 · 다주택(합산배제·상속·지방 저가주택) · 개편안 비교',
          tabs: [
            { href: 'jongbu.html', label: '통합 계산 (주택 목록)' },
            { href: 'aggr-single.html', label: '단독명의' },
            { href: 'aggr-couple.html', label: '부부 공동명의' },
            { href: 'index.html#aggr', label: '간편계산' },
            { href: 'index.html#aggr-reform', label: '2026 개편안 비교' },
          ] },
        { href: 'property-calc.html', label: '재산세 계산기', desc: '1세대1주택 특례·표준세율·도시지역분',
          tabs: [{ href: 'index.html#property' }] },
        { href: 'rental-lessor.html', label: '주택임대사업자 체크리스트', desc: '말소 전후 특례·2026 개편안 대응·저가양도 판정' },
      ],
    },
    {
      key: 'law', label: '세법 동향', icon: '📰', color: '#4a235a',
      desc: '개정·시행령·판결·예규 타임라인과 계산 엔진 세법 검증표',
      tools: [
        { href: 'law-updates.html', label: '세법 동향 · 엔진 검증', desc: '계산기에 영향 주는 발표·법령·판결과 엔진 반영 여부' },
      ],
    },
  ];

  const BRAND = '부동산 세무 도구';
  const BASIS = '2026.5.10 시행 기준';

  // 현재 페이지(파일명 + 해시)로 활성 그룹·도구를 찾는다
  function currentPage(nav) {
    const file = nav.dataset.page || (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const hash = location.hash.replace(/^#/, '');
    return { file, hash };
  }
  function hrefMatches(href, page) {
    if (!href) return false;
    const [f, h] = href.replace(/\.html/, '').split('#');
    if (f !== page.file) return false;
    return h ? h === page.hash : true;
  }
  // 도구의 대표 주소나 그 도구에 속한 탭 주소 중 하나라도 현재 페이지면 그 도구가 활성
  function toolMatches(tool, page) {
    return hrefMatches(tool.href, page) || (tool.tabs || []).some((t) => hrefMatches(t.href, page));
  }
  const HUB_PREFIX = 'hub-';
  const hubKey = (hash) => (hash.startsWith(HUB_PREFIX) ? hash.slice(HUB_PREFIX.length) : null);

  function findActive(page) {
    // 0순위: 세목 하위 메뉴 화면(index.html#hub-transfer) → 그 세목, 도구는 선택 없음
    const hk = page.file === 'index' ? hubKey(page.hash) : null;
    if (hk) {
      const g = GROUPS.find((x) => x.key === hk);
      if (g) return { g, t: null };
    }
    // index.html 첫 화면(해시 없음)은 전체 도구 모음(홈) → 활성 도구 없음
    if (page.file === 'index' && !page.hash) return { g: null, t: null };
    // 같은 페이지가 여러 세목에 걸려 있으면(예: 규제지역 연혁) 먼저 나오는 세목을 활성으로 본다
    for (const g of GROUPS) for (const t of g.tools) if (toolMatches(t, page)) return { g, t };
    return { g: null, t: null };
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function render(nav) {
    const page = currentPage(nav);
    const { g: active, t: activeTool } = findActive(page);
    const openKey = nav.dataset.open || (active && active.key);
    const open = GROUPS.find((x) => x.key === openKey) || active || GROUPS[0];

    nav.innerHTML = `
      <div class="nav-top">
        <a class="brand" href="index.html">${BRAND} <small>${BASIS}</small></a>
        <button class="nav-toggle" aria-label="메뉴" aria-expanded="false">☰ 메뉴</button>
      </div>
      <div class="nav-groups" role="tablist">
        ${GROUPS.map((g) => `
          <button class="nav-group${g === open ? ' on' : ''}${g === active ? ' here' : ''}" data-key="${g.key}"
                  role="tab" aria-selected="${g === open}" style="--gc:${g.color}">
            <span class="ic">${g.icon}</span>${g.label}
          </button>`).join('')}
      </div>
      <div class="nav-tools" id="navTools"></div>`;

    // 여러 페이지로 이뤄진 도구(판정기 등)면 본문 위에 탭 줄을 그려 한 도구처럼 오가게 한다
    document.querySelectorAll('.nav-subtabs').forEach((el) => el.remove());
    const pageTabs = activeTool && (activeTool.tabs || []).filter((t) => t.label);
    if (pageTabs && pageTabs.length > 1 && page.file !== 'index') {
      const bar = document.createElement('div');
      bar.className = 'nav-subtabs';
      bar.style.setProperty('--gc', active.color);
      bar.innerHTML = `<div class="in"><b>${esc(activeTool.label)}</b>${pageTabs.map((t) =>
        `<a href="${t.href}" class="${hrefMatches(t.href, page) ? 'on' : ''}" title="${esc(t.desc || '')}">${esc(t.label)}</a>`).join('')}</div>`;
      nav.insertAdjacentElement('afterend', bar);
    }

    const toolsEl = nav.querySelector('#navTools');
    const renderTools = (g) => {
      toolsEl.style.setProperty('--gc', g.color);
      toolsEl.innerHTML = `
        <span class="nav-desc"><b>${g.icon} ${g.label}</b> ${esc(g.desc)}</span>
        ${g.tools.map((t) => t.soon
          ? `<span class="nav-tool soon" title="${esc(t.desc)}">${esc(t.label)}</span>`
          : `<a class="nav-tool${t === activeTool ? ' active' : ''}" href="${t.href}" title="${esc(t.desc)}">${esc(t.label)}</a>`).join('')}`;
    };
    renderTools(open);

    // 세목 버튼 → 그 세목의 하위 메뉴 화면(index.html#hub-<키>)으로 이동.
    // 메뉴 줄만 바뀌고 본문은 종전 페이지 그대로 남던 문제를 막는다.
    nav.querySelectorAll('.nav-group').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = `#${HUB_PREFIX}${btn.dataset.key}`;
        if (document.getElementById('groupView')) {
          if (location.hash === target) window.scrollTo({ top: 0, behavior: 'smooth' });
          else location.hash = target;   // hashchange → 메뉴·본문 갱신
        } else {
          location.href = `index.html${target}`;
        }
      });
    });
    nav.querySelector('.nav-toggle').addEventListener('click', (e) => {
      const on = nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', on);
    });
    // 같은 페이지 안에서 해시가 바뀌면(메인 계산기 탭 전환) 활성 표시 갱신
    if (!nav.dataset.bound) {
      nav.dataset.bound = '1';
      window.addEventListener('hashchange', () => render(nav));
    }
  }

  // index.html 「세목별 도구 모음」 — <div class="tool-hub"> 가 있으면 채운다
  function renderHub(el) {
    el.innerHTML = GROUPS.map((g) => `
      <section class="hub-sec" style="--gc:${g.color}">
        <h3><span class="ic">${g.icon}</span>${g.label}<small>${esc(g.desc)}</small></h3>
        <div class="hub-list">
          ${g.tools.map((t) => t.soon
            ? `<span class="hub-item soon"><b>${esc(t.label)}</b><span>${esc(t.desc)}</span></span>`
            : `<a class="hub-item" href="${t.href}"><b>${esc(t.label)}</b><span>${esc(t.desc)}</span></a>`).join('')}
        </div>
      </section>`).join('');
  }

  // index.html 세목 하위 메뉴 화면 — #hub-<키> 이면 #groupView 에 그 세목 도구 카드를 그리고
  // 계산기 영역(#calcArea)을 숨긴다. 그 밖의 해시(계산기 탭)면 계산기를 다시 보여 준다.
  function renderGroupView() {
    const view = document.getElementById('groupView');
    if (!view) return;
    const calc = document.getElementById('calcArea');
    const home = document.getElementById('homeView');
    const hash = location.hash.replace(/^#/, '');
    const g = GROUPS.find((x) => x.key === hubKey(hash));
    if (home) home.hidden = !!hash;            // 해시 없음 = 홈(전체 도구 모음)
    if (!g) {
      view.hidden = true;
      view.innerHTML = '';
      if (calc) calc.hidden = !hash;           // 계산기 탭 해시일 때만 계산기 표시
      return;
    }
    view.style.setProperty('--gc', g.color);
    view.innerHTML = `
      <div class="group-head">
        <h1><span class="ic">${g.icon}</span>${esc(g.label)} <small>${esc(g.desc)}</small></h1>
      </div>
      <div class="group-cards">
        ${g.tools.map((t) => `<a class="group-card" href="${t.href}"><b>${esc(t.label)}</b><span>${esc(t.desc)}</span>${
          (t.tabs || []).filter((x) => x.label).length > 1
            ? `<span class="tabs">${t.tabs.filter((x) => x.label).map((x) => `<i>${esc(x.label)}</i>`).join('')}</span>` : ''
        }<em>열기 →</em></a>`).join('')}
      </div>`;
    view.hidden = false;
    if (calc) calc.hidden = true;
  }

  // 외부 조회 사이트 링크 모음 — 모든 페이지 본문(.container) 맨 아래에 그린다.
  // 모두 새 창(target="_blank")에서 열린다. 주소를 바꾸려면 href 만 고치면 된다.
  const LINKS = [
    { href: "https://www.realtyprice.kr/notice/gsindividual/search.htm", label: "개별공시지가" },
    { href: "https://www.realtyprice.kr/notice/gsstandard/search.htm", label: "표준공시지가" },
    { href: "https://www.eum.go.kr/web/ar/lu/luLandDet.jsp", label: "토지이용계획확인서" },
    { href: "https://www.realtyprice.kr/notice/hpindividual/search.htm", label: "개별단독주택가격" },
    { href: "https://www.realtyprice.kr/notice/hpstandard/search.htm", label: "표준단독주택가격" },
    { href: "https://www.realtyprice.kr/notice/town/nfSiteLink.htm", label: "공동주택가격(국교부,2006이후)" },
    { href: "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBSFAAM12F001", label: "공동주택가격(국세청,2006이전)", hint: "홈택스(모바일 화면) · 2005년 이전 고시분" },
    { href: "https://rt.molit.go.kr/", label: "국토교통부실거래가(매매사례가액)" },
    { href: "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBSFAAM15F001", label: "건물기준시가(양도)", hint: "홈택스(모바일 화면) · 자동계산" },
    { href: "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBSFAAM16F001", label: "건물기준시가 (상속,증여)", hint: "홈택스(모바일 화면) · 자동계산" },
    { href: "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBSFAAM13F001", label: "상업용건물, 오피스텔 기준시가", hint: "홈택스(모바일 화면)" },
    { href: "https://www.wetax.go.kr/tcp/loi/J030401M01.do", label: "골프회원권 기준시가", hint: "위택스 시가표준액 조회 → 「회원권」 선택 (국세청 고시는 2009년 이후 중단)" },
    { href: "https://www.wetax.go.kr/tcp/loi/J030401M01.do", label: "회원권 시가표준액", hint: "위택스 시가표준액 조회 → 「회원권」 선택" },
    { href: "https://www.wetax.go.kr/tcp/loi/J030401M01.do", label: "건축물 시가표준액", hint: "위택스 시가표준액 조회 (서울 소재는 서울시 이택스)" },
  ];
  function renderLinks() {
    const box = document.querySelector('.container');
    if (!box || box.querySelector('.link-box')) return;
    const sec = document.createElement('section');
    sec.className = 'link-box';
    sec.innerHTML = `
      <h3>Link <small>공시가격·기준시가·시가표준액 조회 (새 창에서 열림)</small></h3>
      <ul class="link-list">
        ${LINKS.map((l) => `<li><a href="${l.href}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>${
          l.hint ? `<span>${esc(l.hint)}</span>` : ''}</li>`).join('')}
      </ul>`;
    box.appendChild(sec);
  }

  function init() {
    document.querySelectorAll('nav.topnav').forEach(render);
    document.querySelectorAll('.tool-hub').forEach(renderHub);
    renderGroupView();
    renderLinks();
    window.addEventListener('hashchange', renderGroupView);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TAX_NAV_GROUPS = GROUPS;
})();
