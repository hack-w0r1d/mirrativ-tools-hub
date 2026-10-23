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
  const HALF_GAP = 18; // CSS: .station の margin-bottom(36px)の半分

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const list = document.querySelector('.line-section');
  const stations = Array.from(list.querySelectorAll('.station[data-id]'));
  const ghost = list.querySelector('.station:not([data-id])');
  const cards = stations.map((s) => s.querySelector('.station__card'));
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
  function syncFavoriteUI(station) {
    const isFav = favorites.has(station.dataset.id);
    const title = station.querySelector('.station__title').textContent.trim();
    const button = station.querySelector('.fav-btn');
    station.classList.toggle('is-fav', isFav);
    button.setAttribute('aria-pressed', String(isFav));
    button.setAttribute(
      'aria-label',
      isFav ? `お気に入りから外す：${title}` : `お気に入りに追加：${title}`
    );
  }

  function toggleFavorite(station) {
    const id = station.dataset.id;
    const button = station.querySelector('.fav-btn');
    if (favorites.has(id)) {
      favorites.delete(id);
      syncFavoriteUI(station);
      saveFavorites();
      button.classList.add('is-cooling'); // ポインターが離れるまでホバー色を出さない
      scheduleReorder(250, station, false); // 解除時は軌跡の演出なし
    } else {
      favorites.add(id);
      button.classList.remove('is-cooling');
      syncFavoriteUI(station); // その場で暖かい光のデザインに変わる
      saveFavorites();
      celebrate(station, button);
      scheduleReorder(BURST_DELAY, station, true); // 演出のあとで優先位置へ移動
    }
  }

  function scheduleReorder(delay, mover, withTrail) {
    clearTimeout(reorderTimer);
    reorderTimer = setTimeout(
      () => reorder(true, mover, withTrail),
      reduceMotion.matches ? 0 : delay
    );
  }

  function celebrate(station, button) {
    if (reduceMotion.matches) return;
    const card = station.querySelector('.station__card');
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
  function stripEffects(station) {
    const button = station.querySelector('.fav-btn');
    station.querySelector('.station__card').classList.remove('is-warmed');
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
    const now = Array.from(list.querySelectorAll('.station[data-id]'));
    if (!sorted.every((s, i) => s === now[i])) {
      sorted.forEach((s) => {
        stripEffects(s);
        list.insertBefore(s, ghost);
      });
    }
  }

  // 移動するカードが追い越したカードを、移動の出発点に近い順に返す
  function getPassedStations(mover, visibleBefore, visibleAfter) {
    if (!mover || mover.hidden) return [];
    const from = visibleBefore.indexOf(mover);
    const to = visibleAfter.indexOf(mover);
    if (from < 0 || to < 0 || to >= from) return [];
    return visibleBefore.slice(to, from).reverse();
  }

  // 追い越されたカードに、通過のタイミングに合わせて順に暖かい光を1回ずつ残す
  function leaveTrail(passed, travel) {
    const count = passed.length;
    passed.forEach((station, k) => {
      const card = station.querySelector('.station__card');
      const progress = count === 1 ? 0.5 : k / (count - 1);
      const delay = Math.round(travel * (0.15 + 0.7 * progress));
      card.style.setProperty('--trail-delay', `${delay}ms`);
      restartClass(card, 'is-trail');
      setTimeout(() => {
        card.classList.remove('is-trail');
        card.style.removeProperty('--trail-delay');
      }, delay + 2200);
    });
  }

  // 移動先が画面の上に外れる場合は、軌跡が見えるようにページを移動先へスクロール
  function followMover(mover) {
    if (!mover || mover.hidden) return;
    const top = mover.getBoundingClientRect().top;
    if (top < 80) {
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 120), behavior: 'smooth' });
    }
  }

  // 並び替えの演出中は「中央のカードが光る」判定を止める（軌跡の光と重なって二重に光って見えるため）
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
    stations.forEach((station) => {
      if (station.hidden || !station.classList.contains('is-fav')) return;
      end = Math.max(end, station.offsetTop + station.offsetHeight);
    });
    list.style.setProperty('--warm-end', end ? `${end - LINE_TOP + HALF_GAP}px` : '0px');
  }

  // お気に入りを上に、それ以外は元の掲載順。Coming soon は常に最後尾
  function reorder(animate, mover, withTrail) {
    const current = Array.from(list.querySelectorAll('.station[data-id]'));
    const sorted = stations.slice().sort((a, b) => {
      const favDiff = Number(favorites.has(b.dataset.id)) - Number(favorites.has(a.dataset.id));
      return favDiff || Number(a.dataset.order) - Number(b.dataset.order);
    });
    if (sorted.every((s, i) => s === current[i])) {
      updateFavLine();
      updateCenter();
      return;
    }

    const shouldAnimate = animate && !reduceMotion.matches;
    const before = new Map();
    if (shouldAnimate) {
      stations.forEach((s) => {
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
      const passed = withTrail ? getPassedStations(mover, visibleBefore, visibleAfter) : [];
      const travel = Math.min(1300, 750 + distance * 70);

      lockCenter(travel + (withTrail ? 2400 : 400));
      if (withTrail) followMover(mover);

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

      leaveTrail(passed, travel);
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
      remove.addEventListener('click', () => toggleTag(tag, false));
      chip.append(label, remove);
      filterTags.appendChild(chip);
    });
    filterCount.textContent = `${count}件`;
  }

  function applyFilter() {
    let count = 0;
    stations.forEach((station) => {
      const tags = tagsOf.get(station);
      const show = activeTags.every((tag) => tags.includes(tag));
      const wasHidden = station.hidden;
      station.hidden = !show;
      if (show) {
        count += 1;
        if (wasHidden) markEntering(station);
      }
    });
    if (ghost) {
      const wasHidden = ghost.hidden;
      ghost.hidden = activeTags.length > 0;
      if (!ghost.hidden && wasHidden) markEntering(ghost);
    }

    tagButtons.forEach((button) => {
      const on = activeTags.includes(button.textContent.trim());
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });

    renderFilterBar(count);
    updateFavLine();
    updateCenter();
  }

  function toggleTag(tag, scrollToBar) {
    const index = activeTags.indexOf(tag);
    const adding = index < 0;
    if (adding) {
      activeTags.push(tag);
    } else {
      activeTags.splice(index, 1);
    }
    applyFilter();
    if (adding && scrollToBar) {
      toolbar.scrollIntoView({
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  }

  /* ---------- Scroll: 画面中央に近いカードを浮かせて光らせる ---------- */
  let ticking = false;

  function updateCenter() {
    if (centerLocked) return;
    if (reduceMotion.matches) {
      cards.forEach((c) => c.classList.remove('is-centered'));
      return;
    }
    const viewport = window.innerHeight;
    const mid = viewport / 2;
    let best = null;
    let bestDist = viewport * 0.3; // 中央から離れすぎたカードは対象外

    cards.forEach((card) => {
      if (card.closest('.station').hidden) return;
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
  stations.forEach((station, index) => {
    station.dataset.order = String(index);
    tagsOf.set(
      station,
      Array.from(station.querySelectorAll('.tag')).map((t) => t.textContent.trim())
    );

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fav-btn';
    button.innerHTML = STAR_SVG;
    button.addEventListener('click', () => toggleFavorite(station));
    button.addEventListener('pointerleave', () => button.classList.remove('is-cooling'));
    station.querySelector('.station__card').appendChild(button);
    syncFavoriteUI(station);
    markEntering(station);
  });
  if (ghost) markEntering(ghost);

  tagButtons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => toggleTag(button.textContent.trim(), true));
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
