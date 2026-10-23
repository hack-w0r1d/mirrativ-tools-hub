document.getElementById('year').textContent = new Date().getFullYear();

(() => {
  'use strict';

  const STORAGE_KEY = 'mirrativToolsHub.favorites';
  const STAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.4 1.3-6.6-4.9-4.6 6.6-.8z"/>' +
    '</svg>';
  const SPARK_COLORS = ['#ffd89b', '#ffb454', '#fff1d0', '#ffc6a0'];
  const SPARK_COUNT = 10;
  const BURST_DELAY = 1100; // 星の演出を見せてから移動を始めるまでの待ち時間(ms)
  const LINE_TOP = 24; // CSS: .line-section::before の top
  const HALF_GAP = 18; // CSS: .portal の margin-bottom(36px)の半分
  const VANISH_DURATION = 420; // タグ切り替え：カードが消えるのにかかる時間(ms)
  const VANISH_SPREAD = 160; // 星がばらばらのタイミングで消える幅(ms)
  const BORN_DURATION = 1200; // タグ切り替え：カードが生まれるのにかかる時間(ms)
  const BORN_SPREAD = 500; // 星がばらばらのタイミングで生まれる幅(ms)

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const list = document.querySelector('.line-section');
  const portals = Array.from(list.querySelectorAll('.portal[data-id]'));
  const ghost = list.querySelector('.portal:not([data-id])');
  const cards = portals.map((s) => s.querySelector('.portal__card'));
  const tagButtons = Array.from(list.querySelectorAll('.tag'));
  const tagsOf = new Map();

  const toolbar = document.getElementById('toolbar');
  const filterBar = document.getElementById('filter-bar');
  const filterTags = document.getElementById('filter-tags');
  const filterCount = document.getElementById('filter-count');

  let favorites = loadFavorites();
  let activeTags = [];
  let reorderTimer = null;
  let centerLocked = false;
  let lockTimer = null;
  let swapTimer = null; // 消える演出のあと、表示を入れ替えるタイマー
  let busyTimer = null;
  let filterBusy = false; // タグ切り替えの演出中
  let pendingScroll = false;
  let pinFirst = false; // タグ切り替え後、ユーザーが操作するまで先頭のカードを強調する
  const filterAnims = new WeakMap();

  /* ---------- Storage ---------- */
  function loadFavorites() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)));
    } catch (e) {
      /* 保存できない環境（プライベートモード等）では、そのセッション内のみ有効 */
    }
  }

  /* ---------- Helpers ---------- */
  function restartClass(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // リフローを挟んでアニメーションを再始動
    el.classList.add(className);
  }

  function markEntering(el) {
    restartClass(el, 'is-entering');
    setTimeout(() => el.classList.remove('is-entering'), 500);
  }

  /* ---------- Favorites ---------- */
  function syncFavoriteUI(portal) {
    const isFav = favorites.has(portal.dataset.id);
    const title = portal.querySelector('.portal__title').textContent.trim();
    const button = portal.querySelector('.fav-btn');
    portal.classList.toggle('is-fav', isFav);
    button.setAttribute('aria-pressed', String(isFav));
    button.setAttribute(
      'aria-label',
      isFav ? `お気に入りから外す：${title}` : `お気に入りに追加：${title}`
    );
  }

  function toggleFavorite(portal) {
    const id = portal.dataset.id;
    const button = portal.querySelector('.fav-btn');
    if (favorites.has(id)) {
      favorites.delete(id);
      syncFavoriteUI(portal);
      saveFavorites();
      button.classList.add('is-cooling'); // ポインターが離れるまでホバー色を出さない
      scheduleReorder(250, portal, false); // 解除時は追従スクロールなし
    } else {
      favorites.add(id);
      button.classList.remove('is-cooling');
      syncFavoriteUI(portal); // その場で暖かい光のデザインに変わる
      saveFavorites();
      celebrate(portal, button);
      scheduleReorder(BURST_DELAY, portal, true); // 演出のあとで優先位置へ移動し、移動先までスクロール
    }
  }

  function scheduleReorder(delay, mover, follow) {
    clearTimeout(reorderTimer);
    reorderTimer = setTimeout(
      () => reorder(true, mover, follow),
      reduceMotion.matches ? 0 : delay
    );
  }

  function celebrate(portal, button) {
    if (reduceMotion.matches) return;
    const card = portal.querySelector('.portal__card');
    restartClass(button, 'is-burst');
    restartClass(card, 'is-warmed');

    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const spark = document.createElement('span');
      const angle = (Math.PI * 2 * i) / SPARK_COUNT + (Math.random() - 0.5) * 0.6;
      const distance = 22 + Math.random() * 24;
      spark.className = 'spark';
      spark.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
      spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * distance - 8}px`);
      spark.style.setProperty('--size', `${5 + Math.random() * 6}px`);
      spark.style.setProperty('--delay', `${Math.random() * 0.15}s`);
      spark.addEventListener('animationend', () => spark.remove());
      button.appendChild(spark);
    }

    // 演出用のクラスは残さない（DOM を動かしたときにアニメーションが再生されるのを防ぐ）
    setTimeout(() => {
      button.classList.remove('is-burst');
      card.classList.remove('is-warmed');
    }, 1300);
  }

  // DOM を動かす前に、再生中・再生済みの演出を片付ける（動かすとCSSアニメーションが最初から再生されるため）
  function stripEffects(portal) {
    const button = portal.querySelector('.fav-btn');
    portal.querySelector('.portal__card').classList.remove('is-warmed');
    button.classList.remove('is-burst');
    button.querySelectorAll('.spark').forEach((spark) => spark.remove());
  }

  // 並び替え：基本は動かすカード1枚だけを移動し、他のカードは触らない
  function applyOrder(sorted, mover) {
    if (mover && sorted.includes(mover)) {
      const index = sorted.indexOf(mover);
      stripEffects(mover);
      list.insertBefore(mover, sorted[index + 1] || ghost);
    }
    const now = Array.from(list.querySelectorAll('.portal[data-id]'));
    if (!sorted.every((s, i) => s === now[i])) {
      sorted.forEach((s) => {
        stripEffects(s);
        list.insertBefore(s, ghost);
      });
    }
  }

  // 移動先が画面の上に外れる場合は、移動するカードが見えるようにページを移動先へスクロール
  function followMover(mover) {
    if (!mover || mover.hidden) return;
    const top = mover.getBoundingClientRect().top;
    if (top < 80) {
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 120), behavior: 'smooth' });
    }
  }

  // 並び替え・自動スクロール中は「中央のカードが光る」判定を止める（通過するカードが次々に光って見えるため）
  function lockCenter(ms) {
    centerLocked = true;
    cards.forEach((c) => c.classList.remove('is-centered'));
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      centerLocked = false;
    }, ms);
  }

  // 縦線のうち、お気に入りカードの横にあたる部分を暖色にする（高さを CSS 変数で渡す）
  function updateFavLine() {
    let end = 0;
    portals.forEach((portal) => {
      if (portal.hidden || !portal.classList.contains('is-fav')) return;
      end = Math.max(end, portal.offsetTop + portal.offsetHeight);
    });
    list.style.setProperty('--warm-end', end ? `${end - LINE_TOP + HALF_GAP}px` : '0px');
  }

  // お気に入りを上に、それ以外は元の掲載順。Coming soon は常に最後尾
  function reorder(animate, mover, follow) {
    const current = Array.from(list.querySelectorAll('.portal[data-id]'));
    const sorted = portals.slice().sort((a, b) => {
      const favDiff = Number(favorites.has(b.dataset.id)) - Number(favorites.has(a.dataset.id));
      return favDiff || Number(a.dataset.order) - Number(b.dataset.order);
    });
    if (sorted.every((s, i) => s === current[i])) {
      updateFavLine();
      updateCenter();
      return;
    }

    // タグ切り替えの演出中はカードが拡大・移動しているため、位置の計測ができない
    const shouldAnimate = animate && !reduceMotion.matches && !filterBusy;
    const before = new Map();
    if (shouldAnimate) {
      portals.forEach((s) => {
        if (!s.hidden) before.set(s, s.getBoundingClientRect().top);
      });
    }
    const visibleBefore = current.filter((s) => !s.hidden);

    const active = document.activeElement;
    applyOrder(sorted, mover);
    if (active && active !== document.body && document.contains(active)) {
      active.focus({ preventScroll: true });
    }
    updateFavLine();

    if (shouldAnimate) {
      const visibleAfter = sorted.filter((s) => !s.hidden);
      const from = visibleBefore.indexOf(mover);
      const to = visibleAfter.indexOf(mover);
      const distance = from < 0 || to < 0 ? 0 : Math.abs(from - to);
      const travel = Math.min(1300, 750 + distance * 70);

      lockCenter(travel + 400);
      if (follow) followMover(mover);

      sorted.forEach((s) => {
        if (!before.has(s)) return;
        const delta = before.get(s) - s.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        const isMover = s === mover;
        const anim = s.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
          {
            duration: isMover ? travel : 520,
            easing: isMover ? 'cubic-bezier(0.5, 0, 0.2, 1)' : 'cubic-bezier(0.2, 0.8, 0.2, 1)'
          }
        );
        if (isMover) {
          s.classList.add('is-moving');
          anim.onfinish = () => s.classList.remove('is-moving');
          anim.oncancel = () => s.classList.remove('is-moving');
        }
      });
    }
    updateCenter();
  }

  /* ---------- Tag filter（複数選択：選んだタグをすべて持つツールを表示） ---------- */
  function renderFilterBar(count) {
    filterBar.hidden = activeTags.length === 0;
    filterTags.textContent = '';
    activeTags.forEach((tag) => {
      const chip = document.createElement('span');
      const label = document.createElement('span');
      const remove = document.createElement('button');
      chip.className = 'filter-chip';
      label.textContent = tag;
      remove.type = 'button';
      remove.className = 'filter-chip__remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `タグ「${tag}」を解除`);
      remove.addEventListener('click', () => {
        chip.classList.add('is-leaving'); // バーの入れ替えはカードが消えたあとなので、タップの手応えだけ先に返す
        toggleTag(tag, false);
      });
      chip.append(label, remove);
      filterTags.appendChild(chip);
    });
    filterCount.textContent = `${count}件`;
  }

  function syncTagButtons() {
    tagButtons.forEach((button) => {
      const on = activeTags.includes(button.textContent.trim());
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  // 表示・非表示とフィルターバーを、いまの選択状態に合わせる（演出なしの即時切り替え）
  function applyFilter(skipCenter) {
    let count = 0;
    portals.forEach((portal) => {
      const tags = tagsOf.get(portal);
      const show = activeTags.every((tag) => tags.includes(tag));
      portal.hidden = !show;
      if (show) count += 1;
    });
    if (ghost) ghost.hidden = activeTags.length > 0;

    syncTagButtons();
    renderFilterBar(count);
    updateFavLine();
    if (!skipCenter) updateCenter();
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  /* ---------- タグ切り替えの演出：星が消えて、また生まれる ---------- */
  function playFilterAnim(el, keyframes, options) {
    const prev = filterAnims.get(el);
    if (prev) prev.cancel();
    const anim = el.animate(keyframes, options);
    filterAnims.set(el, anim);
    return anim;
  }

  function filterTargets() {
    return ghost ? portals.concat(ghost) : portals;
  }

  // いま見えているカードを、星が瞬くようにばらばらのタイミングで儚く消す
  function vanishCards() {
    filterTargets().forEach((el) => {
      if (el.hidden) return;
      const current = getComputedStyle(el).opacity; // 生まれている途中でも、いまの明るさから消え始める
      playFilterAnim(
        el,
        [
          { opacity: current, transform: 'scale(1)', filter: 'blur(0px) brightness(1)' },
          { opacity: current, transform: 'scale(1)', filter: 'blur(0px) brightness(1.5)', offset: 0.2 },
          { opacity: 0, transform: 'scale(0.94) translateY(-8px)', filter: 'blur(8px) brightness(1.8)' }
        ],
        {
          duration: VANISH_DURATION,
          delay: Math.random() * VANISH_SPREAD,
          easing: 'linear', // きらっと光った直後から、すぐに薄れ始める
          fill: 'forwards'
        }
      );
    });
  }

  // 絞り込み後のカードを、星が生まれるようにばらばらのタイミングでじわっと現す
  function birthCards() {
    filterTargets().forEach((el) => {
      if (el.hidden) {
        const prev = filterAnims.get(el);
        if (prev) prev.cancel();
        return;
      }
      playFilterAnim(
        el,
        [
          { opacity: 0, transform: 'scale(0.94) translateY(10px)', filter: 'blur(8px) brightness(1.8)' },
          { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0px) brightness(1)' }
        ],
        {
          duration: BORN_DURATION,
          delay: Math.random() * BORN_SPREAD,
          easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)',
          fill: 'backwards'
        }
      );
    });
  }

  // カードが消えきったところで、表示を入れ替えて、新しいカードを生む
  function swapCards() {
    swapTimer = null;
    applyFilter(true);
    if (!reduceMotion.matches) birthCards();

    // 切り替え後は先頭のカードを強調する（ページ上部へ戻る場合も、すでに先頭が見えている場合も）。
    // 画面中央に最も近いカードを選ぶと、フィルターバーの分だけ下にずれて2番目になってしまうため
    const first = list.querySelector('.portal[data-id]:not([hidden])');
    pinFirst = Boolean(first) && (pendingScroll || isInViewport(first));
    updateCenter();

    if (pendingScroll) {
      pendingScroll = false;
      toolbar.scrollIntoView({
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
        block: 'start'
      });
    }
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      filterBusy = false;
    }, BORN_DURATION + BORN_SPREAD + 100);
  }

  function requestFilterChange(scrollToBar) {
    syncTagButtons(); // タップの手応えはすぐ返す
    if (scrollToBar) pendingScroll = true;
    if (reduceMotion.matches) {
      swapCards();
      return;
    }
    filterBusy = true;
    clearTimeout(busyTimer);
    if (swapTimer) return; // すでに消えている最中なら、入れ替えの時点の選択がそのまま反映される
    vanishCards();
    swapTimer = setTimeout(swapCards, VANISH_DURATION + VANISH_SPREAD + 50);
  }

  // タグの追加・解除（カード側の再タップも、フィルターバーの×も、同じ演出になる）
  function toggleTag(tag, scrollToBar) {
    const index = activeTags.indexOf(tag);
    const adding = index < 0;
    if (adding) {
      activeTags.push(tag);
    } else {
      activeTags.splice(index, 1);
    }
    requestFilterChange(adding && scrollToBar);
  }

  /* ---------- Scroll: 画面中央に近いカードを浮かせて光らせる ---------- */
  let ticking = false;

  function updateCenter() {
    if (centerLocked) return;
    if (reduceMotion.matches) {
      cards.forEach((c) => c.classList.remove('is-centered'));
      return;
    }
    if (pinFirst) {
      const first = list.querySelector('.portal[data-id]:not([hidden]) .portal__card');
      cards.forEach((card) => card.classList.toggle('is-centered', card === first));
      return;
    }
    const viewport = window.innerHeight;
    const mid = viewport / 2;
    let best = null;
    let bestDist = viewport * 0.3; // 中央から離れすぎたカードは対象外

    cards.forEach((card) => {
      if (card.closest('.portal').hidden) return;
      const rect = card.getBoundingClientRect();
      const dist = Math.abs((rect.top + rect.bottom) / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    });
    cards.forEach((card) => card.classList.toggle('is-centered', card === best));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateCenter();
    });
  }

  /* ---------- Init ---------- */
  portals.forEach((portal, index) => {
    portal.dataset.order = String(index);
    tagsOf.set(
      portal,
      Array.from(portal.querySelectorAll('.tag')).map((t) => t.textContent.trim())
    );

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fav-btn';
    button.innerHTML = STAR_SVG;
    button.addEventListener('click', () => toggleFavorite(portal));
    button.addEventListener('pointerleave', () => button.classList.remove('is-cooling'));
    portal.querySelector('.portal__card').appendChild(button);
    syncFavoriteUI(portal);
    markEntering(portal);
  });
  if (ghost) markEntering(ghost);

  tagButtons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => toggleTag(button.textContent.trim(), true));
  });

  // ユーザーが自分でスクロール・操作したら、通常の「画面中央のカードを強調」に戻す
  // （ここでは再計算しない：タグを押した瞬間に強調が2番目へ動くのを防ぐ。スクロールすれば scroll で再計算される）
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) => {
    window.addEventListener(type, () => { pinFirst = false; }, { passive: true });
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    updateFavLine();
    onScroll();
  });
  window.addEventListener('load', updateFavLine);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(updateFavLine);
  }

  reorder(false, null, false);
  applyFilter();
})();
