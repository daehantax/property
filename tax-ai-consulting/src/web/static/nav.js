/**
 * 공통 상단 내비게이션 (세목별 2단 구성)
 *
 * 모든 페이지의 <nav class="topnav" data-page="..."> 를 이 스크립트가 채운다.
 *   1단: 세목 그룹 (양도 · 상속 · 증여 · 취득 · 보유 · 상담 시나리오 · 세법 동향)
 *   2단: 현재 그룹에 속한 도구 (계산기·판정기)
 * 도구를 추가하려면 GROUPS 에 항목 하나만 넣으면 모든 페이지의 메뉴와
 * index.html 의 「세목별 도구 모음」 이 함께 갱신된다.
 *
 * 페이지 식별: <nav data-page="transfer-heavy"> 처럼 파일명(확장자 제외)을 넣는다.
 * index.html 의 계산기 탭은 index.html#gift 처럼 해시로 구분한다.
 */
(function () {
  const GROUPS = [
    {
      key: 'transfer', label: '양도', icon: '📤', color: '#1a5276',
      desc: '양도소득세 계산과 중과·비과세 판정',
      tools: [
        { href: 'index.html#transfer', label: '양도소득세 계산기', desc: '보유·거주기간, 장특공, 12억 비과세 반영' },
        { href: 'index.html#transfer-reform', label: '양도세 개정안 비교', desc: '현행 vs 2026 세제개편안(2027~2029년 양도분)' },
        { href: 'index.html#single-ltr', label: '1주택 장기거주공제 비교', desc: '장특공 → 장기거주소득공제 전환 단계별 비교' },
        { href: 'transfer-heavy.html', label: '양도세 중과 판정기', desc: '주택수 산정 → 2주택·3주택 중과 여부' },
        { href: 'single-exempt.html', label: '1세대1주택 비과세 판정기', desc: '보유·거주요건, 상생임대, 일시적 2주택' },
        { href: 'redev-exempt.html', label: '재건축·재개발 비과세 판정기', desc: '조합원입주권 비과세·대체주택 특례' },
        { href: 'marriage-exempt.html', label: '혼인 비과세 판정기', desc: '혼인 합가 특례(10년)·혼인 2주택' },
        { href: 'local-house.html', label: '지방주택 판정기', desc: '수도권 1채 + 지방 1채 세대의 1세대1주택' },
      ],
    },
    {
      key: 'inherit', label: '상속', icon: '📜', color: '#6c3483',
      desc: '상속주택이 있는 세대의 주택수·특례 판정',
      tools: [
        { href: 'transfer-heavy.html', label: '상속주택 중과 제외 판정', desc: '상속주택의 주택수 제외 → 양도세 중과 판정' },
        { href: 'acq-heavy.html', label: '상속주택 취득세 판정', desc: '상속 5년 내 주택수 제외 → 취득세 중과 판정' },
        { href: 'local-house.html', label: '상속 지방주택 1세대1주택', desc: '상속으로 받은 지방주택의 §155②·§8④ 특례' },
        { href: 'rental-lessor.html', label: '사전증여 10년 합산 점검', desc: '상속 개시 시 사전증여 합산 체크리스트' },
        { soon: true, label: '상속세 계산기', desc: '상속공제·세율·세액공제 (준비중)' },
      ],
    },
    {
      key: 'gift', label: '증여', icon: '🎁', color: '#0e6655',
      desc: '증여세 계산과 증여 vs 양도 비교',
      tools: [
        { href: 'index.html#gift', label: '증여세 계산기', desc: '증여재산공제·세대생략 할증·신고세액공제' },
        { href: 'scenarios.html', label: '증여 vs 양도 시나리오', desc: '부담부증여·분산증여·공동명의 전환 10종 비교' },
        { href: 'rental-lessor.html', label: '저가양도·부담부증여 체크', desc: '토지거래허가구역 저가양도 판정' },
      ],
    },
    {
      key: 'acquire', label: '취득', icon: '🏠', color: '#b9770e',
      desc: '취득세 중과 판정',
      tools: [
        { href: 'acq-heavy.html', label: '취득세 중과 판정기', desc: '취득 후 주택수 × 조정지역 → 8%·12% 중과' },
      ],
    },
    {
      key: 'hold', label: '보유', icon: '🏢', color: '#154360',
      desc: '재산세·종합부동산세 계산, 임대사업자 점검',
      tools: [
        { href: 'aggr-home.html', label: '보유세 계산기 허브', desc: '보유 형태별 종부세·재산세 계산기 모음' },
        { href: 'aggr-single.html', label: '종부세 · 단독명의', desc: '1세대1주택 12억 공제, 장기보유·연령 세액공제' },
        { href: 'aggr-couple.html', label: '종부세 · 부부 공동명의', desc: '인별 9억 공제 계산 + 특례 신청 비교' },
        { href: 'property-calc.html', label: '재산세 계산기', desc: '1세대1주택 특례·표준세율·도시지역분' },
        { href: 'index.html#property', label: '재산세 간편계산', desc: '메인 계산기 탭' },
        { href: 'index.html#aggr', label: '종부세 간편계산', desc: '메인 계산기 탭' },
        { href: 'index.html#aggr-reform', label: '종부세 개편안 비교', desc: '2026 세제개편안 연도별 종부세 변화' },
        { href: 'rental-lessor.html', label: '주택임대사업자 체크리스트', desc: '말소 전후 특례·2026 개편안 대응' },
      ],
    },
    {
      key: 'scenario', label: '상담 시나리오', icon: '💬', color: '#7b241c',
      desc: '상담 보고서 생성 (Word·PDF)',
      tools: [
        { href: 'scenarios.html', label: '상담 시나리오 10종', desc: '증여 vs 양도, 부담부증여, 분산증여, 공동명의 전환' },
      ],
    },
    {
      key: 'law', label: '세법 동향', icon: '📰', color: '#4a235a',
      desc: '개정·시행령·판결·예규 타임라인',
      tools: [
        { href: 'law-updates.html', label: '세법 동향 일지', desc: '계산기에 영향 주는 발표·법령·판결 기록' },
      ],
    },
  ];

  const BRAND = '🏢 부동산 세무 도구';
  const BASIS = '2026.5.10 시행 기준';

  // 현재 페이지(파일명 + 해시)로 활성 그룹·도구를 찾는다
  function currentPage(nav) {
    const file = nav.dataset.page || (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const hash = location.hash.replace(/^#/, '');
    return { file, hash };
  }
  function toolMatches(tool, page) {
    if (!tool.href) return false;
    const [f, h] = tool.href.replace(/\.html/, '').split('#');
    if (f !== page.file) return false;
    return h ? h === page.hash : true;
  }
  function findActive(page) {
    // 1순위: 파일+해시 정확히 일치, 2순위: 파일만 일치 (index.html 첫 진입 → 증여 탭이 기본이므로 증여)
    for (const g of GROUPS) for (const t of g.tools) if (t.href && t.href.includes('#') && toolMatches(t, page)) return { g, t };
    if (page.file === 'index' && !page.hash) {
      const g = GROUPS.find((x) => x.key === 'gift');
      return { g, t: g.tools[0] };
    }
    for (const g of GROUPS) for (const t of g.tools) if (t.href && !t.href.includes('#') && toolMatches(t, page)) return { g, t };
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
            <span class="ic">${g.icon}</span>${g.label}<span class="cnt">${g.tools.length}</span>
          </button>`).join('')}
      </div>
      <div class="nav-tools" id="navTools"></div>`;

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

    nav.querySelectorAll('.nav-group').forEach((btn) => {
      btn.addEventListener('click', () => {
        const g = GROUPS.find((x) => x.key === btn.dataset.key);
        nav.querySelectorAll('.nav-group').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-selected', b === btn); });
        renderTools(g);
      });
    });
    nav.querySelector('.nav-toggle').addEventListener('click', (e) => {
      const on = nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', on);
    });
    // 같은 페이지 안에서 해시가 바뀌면(메인 계산기 탭 전환) 활성 표시 갱신
    window.addEventListener('hashchange', () => render(nav), { once: true });
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

  function init() {
    document.querySelectorAll('nav.topnav').forEach(render);
    document.querySelectorAll('.tool-hub').forEach(renderHub);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TAX_NAV_GROUPS = GROUPS;
})();
