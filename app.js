(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const BUILD = '1.12.0';
  window.STADIUM_ATLAS_RUNTIME = {build:BUILD,ready:false,schools:0,views:0};
  const catalog = window.STADIUMS;
  const expectedBuild = document.documentElement.dataset.appBuild;
  const validCatalog = Array.isArray(catalog) && catalog.length === 164 && catalog.every(item => item && Array.isArray(item.views) && item.views.length === (['syracuse-jma-wireless-dome','unlv-allegiant'].includes(item.id) ? 3 : 2));
  if (expectedBuild !== BUILD || window.STADIUM_ATLAS_CATALOG_BUILD !== BUILD || !validCatalog) {
    let warning = document.getElementById('release-warning');
    if (!warning) {
      warning = document.createElement('section');
      warning.id = 'release-warning';
      warning.setAttribute('role','alert');
      document.body.prepend(warning);
    }
    warning.hidden = false;
    warning.innerHTML = '<strong>The update files need to match.</strong><p id="release-warning-message">Upload index.html, styles.css, app.js, and catalog.js from the same v1.12.0 code ZIP into the same app folder, replacing the older files, then reload.</p>';
    warning.style.cssText = 'display:block;padding:18px;margin:20px;background:#382f18;border:1px solid #dbc477;border-radius:4px;color:#fff3c8;font:14px/1.6 Arial,sans-serif;';
    if (document.getElementById('start-slideshow')) document.getElementById('start-slideshow').disabled = true;
    if (document.getElementById('main')) document.getElementById('main').hidden = true;
    if (document.getElementById('home-view')) document.getElementById('home-view').hidden = true;
    if (document.getElementById('detail-view')) document.getElementById('detail-view').hidden = true;
    const failedDialog = document.getElementById('image-viewer');
    if (failedDialog) { if (failedDialog.open) failedDialog.close(); failedDialog.hidden = true; failedDialog.style.cssText = 'display:none!important'; }
    document.body.classList.remove('viewer-open');
    return;
  }
  // Layout is independent of catalog state and the immersive viewer.
  const layoutSelect = $('#layout-preference');
  const layoutStatus = $('#layout-status');
  const layoutKey = 'stadium-atlas-layout';
  const desktopScreen = window.matchMedia('(min-width: 1100px)');
  const validLayout = value => ['auto','phone','desktop'].includes(value);
  let layoutPreference = 'auto';
  try {
    const savedLayout = window.localStorage.getItem(layoutKey);
    if (validLayout(savedLayout)) layoutPreference = savedLayout;
  } catch {} // Private browsing or blocked storage must never block the app.
  function applyLayout() {
    const effective = layoutPreference === 'auto' ? (desktopScreen.matches ? 'desktop' : 'phone') : layoutPreference;
    document.documentElement.dataset.layoutPreference = layoutPreference;
    document.documentElement.dataset.layout = effective;
    layoutSelect.value = layoutPreference;
    layoutStatus.textContent = layoutPreference === 'auto' ? `Auto · ${effective === 'desktop' ? 'Desktop' : 'Phone'}` : `${layoutPreference === 'desktop' ? 'Desktop' : 'Phone'} layout`;
  }
  layoutSelect.addEventListener('change', () => {
    layoutPreference = validLayout(layoutSelect.value) ? layoutSelect.value : 'auto';
    try { window.localStorage.setItem(layoutKey,layoutPreference); } catch {}
    applyLayout();
  });
  if (desktopScreen.addEventListener) desktopScreen.addEventListener('change', applyLayout);
  else desktopScreen.addListener(applyLayout);
  window.addEventListener('storage', event => {
    if (event.key === layoutKey || event.key === null) {
      layoutPreference = validLayout(event.newValue) ? event.newValue : 'auto';
      applyLayout();
    }
  });
  applyLayout();

  const home = $('#home-view');
  const detail = $('#detail-view');
  const input = $('#stadium-search');
  const board = $('#letter-board');
  const conferenceFilter = $('#conference-filter');
  const divisionFilter = $('#division-filter');
  const dialog = $('#image-viewer');
  const stage = $('#zoom-stage');
  let viewerImage = $('#viewer-image');
  let letter = 'All';
  let query = '';
  let conference = '';
  let classification = '';
  let view = 0;
  let activeStadium = catalog[0];
  let wasDetail = false;
  let homeScroll = 0;
  let viewerHistoryEntry = false;
  let closingViewer = false;
  const selectedViews = new Map();
  const cardList = $('#stadium-list');
  const cardPointers = new Set();
  const blockedCardClicks = new WeakMap();
  let cardGesture = null;
  let lastCardFocus = null;
  $('.skip-link').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); $('#main').scrollIntoView({behavior:'instant'}); });
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const indexOf = item => catalog.indexOf(item) + 1;
  const imageOf = () => activeStadium.views[view];
  // Slideshow selection never changes the gallery's selected stadium or photo.
  const slideshow = {active:false,playing:false,scope:'all',queue:[],position:0,shuffle:false,rounds:[],roundIndex:0,roundOffset:0,delay:5000,from:'#collection',owned:false};
  const slideshowControls = $('#slideshow-controls');
  const slideshowScope = $('#slideshow-scope');
  const slideshowPlay = $('#slideshow-play');
  const quietCaption = $('#slideshow-quiet-caption');
  const stageLabel = stage.getAttribute('aria-label');
  let slideshowTimer = null;
  let slideshowPreload = null;
  let viewerFailed = false;
  let viewerReady = false;
  let viewerDisplayedEntry = null;
  let viewerRequest = null;
  let viewerTransition = null;
  const CROSSFADE_MS = 600;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Requested selection and displayed image stay separate until decoding succeeds.
  const displayedPhoto = () => viewerDisplayedEntry?.item.views[viewerDisplayedEntry.index];
  const viewerEntry = () => slideshow.active ? slideshow.queue[slideshow.position] : {item:activeStadium,index:view};
  const viewerPhoto = () => { const entry = viewerEntry(); return entry?.item.views[entry.index]; };
  const photoKey = entry => `${entry.item.id}/${entry.index}`;
  // Chrome idling has its own clock; it never changes playback or image readiness.
  const SLIDESHOW_UI_IDLE_MS = 3000;
  let slideshowUiTimer = null;
  let slideshowPointerInput = false;
  let slideshowPointerControl = null;
  const revealPointers = new Set();
  let revealClickUntil = 0;
  function clearSlideshowUiTimer() {
    if (slideshowUiTimer !== null) { window.clearTimeout(slideshowUiTimer); slideshowUiTimer = null; }
  }
  function slideshowControlHasFocus() {
    return dialog.contains(document.activeElement) && Boolean(document.activeElement.closest('button,select,input,textarea'));
  }
  function canHideSlideshowControls() {
    return slideshow.active && dialog.open && !closingViewer && !document.hidden && !viewerFailed && viewerDisplayedEntry && slideshow.queue.length && !slideshowControlHasFocus() && !pointers.size && !revealPointers.size;
  }
  function hideSlideshowControls() {
    slideshowUiTimer = null;
    if (canHideSlideshowControls()) dialog.classList.add('slideshow-ui-hidden');
  }
  function scheduleSlideshowUiHide() {
    clearSlideshowUiTimer();
    if (!dialog.classList.contains('slideshow-ui-hidden') && canHideSlideshowControls()) slideshowUiTimer = window.setTimeout(hideSlideshowControls,SLIDESHOW_UI_IDLE_MS);
  }
  function revealSlideshowControls() {
    if (!slideshow.active) return;
    dialog.classList.remove('slideshow-ui-hidden');
    scheduleSlideshowUiHide();
  }
  function resetSlideshowUi() {
    clearSlideshowUiTimer();
    dialog.classList.remove('slideshow-ui-hidden');
    revealPointers.clear(); revealClickUntil = 0; slideshowPointerInput = false; slideshowPointerControl = null;
  }
  function consumeRevealEvent(event) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
  dialog.addEventListener('pointerdown', event => {
    if (!slideshow.active || (event.pointerType === 'mouse' && event.button !== 0)) return;
    slideshowPointerInput = true;
    slideshowPointerControl = event.target.closest('button,select');
    const revealing = dialog.classList.contains('slideshow-ui-hidden') || revealPointers.size > 0;
    if (revealing) {
      revealPointers.add(event.pointerId);
      revealClickUntil = performance.now() + 500;
      lastTap.time = 0;
      // A first tap only reveals chrome, even above a newly revealed button.
      try { dialog.setPointerCapture(event.pointerId); } catch {} // Window cleanup also covers unsupported capture.
      consumeRevealEvent(event);
    } else revealClickUntil = 0;
    revealSlideshowControls();
  },true);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) window.addEventListener(type,event => {
    if (!revealPointers.has(event.pointerId)) return;
    revealPointers.delete(event.pointerId);
    revealClickUntil = performance.now() + 500;
    consumeRevealEvent(event);
    scheduleSlideshowUiHide();
  },true);
  for (const type of ['click','dblclick']) dialog.addEventListener(type,event => {
    if (slideshow.active && revealClickUntil > performance.now()) consumeRevealEvent(event);
  },true);
  dialog.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') revealSlideshowControls();
  });
  dialog.addEventListener('pointerup', scheduleSlideshowUiHide);
  dialog.addEventListener('pointercancel', scheduleSlideshowUiHide);
  dialog.addEventListener('lostpointercapture', scheduleSlideshowUiHide);
  dialog.addEventListener('keydown', () => { slideshowPointerInput = false; slideshowPointerControl = null; revealClickUntil = 0; revealSlideshowControls(); },true);
  dialog.addEventListener('focusin', event => {
    if (event.target !== slideshowPointerControl) slideshowPointerControl = null;
    revealSlideshowControls();
  });
  dialog.addEventListener('focusout', () => { Promise.resolve().then(scheduleSlideshowUiHide); });
  for (const type of ['click','change']) dialog.addEventListener(type,event => {
    if (!slideshow.active) return;
    // After a pointer selection is committed, return to the photo. Keyboard or
    // assistive-technology focus stays on its control and keeps chrome visible.
    const control = event.target.closest(type === 'change' ? 'select' : 'button');
    if (slideshowPointerInput && control && slideshowPointerControl === control && (type === 'change' || event.detail > 0) && document.activeElement === control) {
      slideshowPointerControl = null;
      stage.focus({preventScroll:true});
    }
    revealSlideshowControls();
  });
  function slideshowPhotos(scope) {
    return catalog.filter(item => scope !== 'filtered' || matches(item)).slice().sort((a,b) => a.school.localeCompare(b.school)).flatMap(item => item.views.map((image,index) => ({item,index})));
  }
  function clearSlideshowTimer() {
    if (slideshowTimer !== null) { window.clearTimeout(slideshowTimer); slideshowTimer = null; }
  }
  function scheduleSlideshow() {
    clearSlideshowTimer();
    if (!slideshow.active || !slideshow.playing || !dialog.open || document.hidden || slideshowPhotos(slideshow.scope).length < 2 || viewerFailed || !viewerReady) return;
    slideshowTimer = window.setTimeout(() => {
      slideshowTimer = null;
      if (slideshow.active && slideshow.playing && dialog.open && !document.hidden) switchViewer(1);
    }, slideshow.delay);
  }
  function updateSlideshowControls(message = '') {
    const entry = viewerDisplayedEntry, total = slideshow.queue.length, photoTotal = slideshowPhotos(slideshow.scope).length;
    slideshowControls.hidden = !slideshow.active;
    dialog.classList.toggle('is-slideshow',slideshow.active);
    quietCaption.hidden = !slideshow.active || !entry || !total;
    $('#slideshow-quiet-school').textContent = entry?.item.fullSchool || '';
    $('#slideshow-quiet-team').textContent = entry ? (entry.item.teamName || `${entry.item.school} ${entry.item.team}`) : '';
    $('#slideshow-quiet-stadium').textContent = entry?.item.stadium || '';
    $('#slideshow-quiet-location').textContent = entry ? `${entry.item.city}, ${entry.item.state}` : '';
    // Keep the recorded capacity's year and approximation rather than imply a
    // newer or more precise count in the compact caption.
    const capacityLabel = entry?.item.capacityLabel || '';
    const capacityYear = capacityLabel.match(/\b20\d{2}\b/);
    const capacityQualifier = /\bnearly\b/i.test(capacityLabel) ? 'Nearly ' : /approx/i.test(capacityLabel) ? 'Approx. ' : '';
    $('#slideshow-quiet-capacity').textContent = entry ? `Seating capacity${capacityYear ? ` (${capacityYear[0]})` : ''}: ${capacityQualifier}${Number(entry.item.seatingCapacity).toLocaleString('en-US')}` : '';
    if (!slideshow.active) resetSlideshowUi();
    else if (!entry || !total || viewerFailed) revealSlideshowControls();
    else if (slideshowUiTimer === null && !dialog.classList.contains('slideshow-ui-hidden')) scheduleSlideshowUiHide();
    slideshowPlay.textContent = slideshow.playing ? 'Pause' : 'Play';
    slideshowPlay.setAttribute('aria-label',slideshow.playing ? 'Pause slideshow' : 'Play slideshow');
    slideshowPlay.disabled = !total || viewerFailed;
    $('#slideshow-shuffle').setAttribute('aria-pressed',String(slideshow.shuffle));
    $('#slideshow-shuffle').disabled = photoTotal < 2;
    slideshowScope.value = slideshow.scope;
    slideshowScope.querySelector('[value="all"]').textContent = `All photos (${slideshowPhotos('all').length})`;
    slideshowScope.querySelector('[value="filtered"]').textContent = `Current filtered results (${slideshowPhotos('filtered').length})`;
    $('#slideshow-speed').value = String(slideshow.delay);
    const displayedPosition = entry ? (slideshow.shuffle && entry.schoolPosition ? entry.schoolPosition : slideshow.queue.findIndex(photo => photoKey(photo) === photoKey(entry)) + 1) : 0;
    const displayedRound = slideshow.shuffle && entry?.schoolRound || slideshow.roundOffset + slideshow.roundIndex + 1;
    const displayedTotal = slideshow.shuffle && entry?.schoolTotal || total;
    $('#slideshow-position').textContent = `${total ? (displayedPosition || '–') : 0} / ${displayedTotal}${slideshow.shuffle ? ` schools · Round ${displayedRound}` : ''}`;
    $('#slideshow-school').textContent = total ? (entry?.item.school || 'Loading photo') : 'No matching photos';
    $('#slideshow-stadium').textContent = total ? (entry?.item.stadium || 'Preparing the first view…') : 'Choose All photos, or close to change your filters.';
    $('#slideshow-view').textContent = total && entry ? entry.item.views[entry.index].title : '';
    const status = message || (total ? `${slideshow.playing ? (viewerReady ? 'Playing' : viewerTransition ? 'Changing photo' : 'Loading photo') : 'Paused'} · ${slideshow.scope === 'all' ? 'All photos' : 'Filtered results'}${slideshow.shuffle ? ` · School shuffle · Round ${displayedRound}` : ''}` : 'Paused · No photos match your filters');
    $('#slideshow-status').setAttribute('aria-live',slideshow.active && slideshow.playing ? 'off' : 'polite');
    if ($('#slideshow-status').textContent !== status) $('#slideshow-status').textContent = status;
    $('#viewer-announcement').setAttribute('aria-live',slideshow.active && slideshow.playing ? 'off' : 'polite');
    window.STADIUM_ATLAS_RUNTIME.slideshow = {active:slideshow.active,playing:slideshow.playing,scope:slideshow.scope,photos:photoTotal,schools:slideshowSchools().length,position:total ? slideshow.position + 1 : 0,shuffle:slideshow.shuffle,round:slideshow.shuffle ? slideshow.roundOffset + slideshow.roundIndex + 1 : null,delay:slideshow.delay};
  }
  function setSlideshowPlaying(playing, message = '') {
    slideshow.playing = Boolean(playing && slideshow.active && slideshow.queue.length && !document.hidden && !viewerFailed);
    updateSlideshowControls(message);
    scheduleSlideshow();
  }
  function saveSlideshowHistory() {
    if (!slideshow.active || location.hash !== '#slideshow') return;
    const state = {from:slideshow.from,owned:slideshow.owned,scope:slideshow.scope,order:slideshow.queue.map(photoKey),position:slideshow.position,shuffle:slideshow.shuffle,delay:slideshow.delay};
    if (slideshow.shuffle) Object.assign(state,{schoolShuffleVersion:2,rounds:slideshow.rounds.map(round => round.map(photoKey)),roundIndex:slideshow.roundIndex,roundOffset:slideshow.roundOffset});
    history.replaceState({stadiumAtlasSlideshow:state},'', '#slideshow');
  }
  function shuffledCopy(values) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i],result[j]] = [result[j],result[i]];
    }
    return result;
  }
  function slideshowSchools() {
    return [...new Map(slideshowPhotos(slideshow.scope).map(entry => [entry.item.id,entry.item])).values()];
  }
  function makeSchoolRound(number, previousSchool = null, preferred = null) {
    const schools = shuffledCopy(slideshowSchools());
    if (preferred) {
      const found = schools.findIndex(item => item.id === preferred.item.id);
      if (found >= 0) schools.unshift(...schools.splice(found,1));
    } else if (schools.length > 1 && schools[0].id === previousSchool) {
      const swap = 1 + Math.floor(Math.random() * (schools.length - 1));
      [schools[0],schools[swap]] = [schools[swap],schools[0]];
    }
    // Shuffle school blocks only; every image stays in its catalog sequence.
    return schools.flatMap((item,position) => item.views.map((_,index) => ({item,index,schoolRound:number + 1,schoolPosition:position + 1,schoolTotal:schools.length})));
  }
  function ensureNextSchoolRound() {
    if (!slideshow.shuffle || !slideshow.queue.length || slideshow.roundIndex + 1 < slideshow.rounds.length) return;
    const last = slideshow.queue[slideshow.queue.length - 1];
    slideshow.rounds.push(makeSchoolRound(slideshow.roundOffset + slideshow.rounds.length,last.item.id));
    // Keep navigation/history bounded for an unattended, multi-day slideshow.
    if (slideshow.rounds.length > 32) {
      slideshow.rounds.shift(); slideshow.roundOffset++; slideshow.roundIndex--;
    }
  }
  function adjacentSlideshowEntry(direction) {
    if (!slideshow.shuffle) return slideshow.queue[(slideshow.position + direction + slideshow.queue.length) % slideshow.queue.length];
    const position = slideshow.position + direction;
    if (position >= 0 && position < slideshow.queue.length) return slideshow.queue[position];
    if (direction > 0) {
      ensureNextSchoolRound();
      return slideshow.rounds[slideshow.roundIndex + 1]?.[0];
    }
    const previous = slideshow.rounds[slideshow.roundIndex - 1];
    return previous?.[previous.length - 1] || slideshow.queue[0];
  }
  function advanceSlideshow(direction) {
    if (!slideshow.shuffle) {
      slideshow.position = (slideshow.position + direction + slideshow.queue.length) % slideshow.queue.length;
      return;
    }
    const position = slideshow.position + direction;
    if (position >= 0 && position < slideshow.queue.length) slideshow.position = position;
    else if (direction > 0) {
      ensureNextSchoolRound(); slideshow.roundIndex++;
      slideshow.queue = slideshow.rounds[slideshow.roundIndex]; slideshow.position = 0;
      ensureNextSchoolRound();
    } else if (slideshow.roundIndex > 0) {
      slideshow.roundIndex--; slideshow.queue = slideshow.rounds[slideshow.roundIndex];
      slideshow.position = slideshow.queue.length - 1;
    }
  }
  function orderSlideshow(keepCurrent = true) {
    const current = keepCurrent && (viewerDisplayedEntry || viewerEntry());
    slideshow.rounds = []; slideshow.roundIndex = 0; slideshow.roundOffset = 0;
    if (slideshow.shuffle) {
      // Keep the current school when enabling shuffle, but restart its complete
      // ordered block at view one. Disabling shuffle retains the current photo.
      slideshow.queue = makeSchoolRound(0,null,current);
      slideshow.rounds = [slideshow.queue]; slideshow.position = 0;
      ensureNextSchoolRound();
    } else {
      slideshow.queue = slideshowPhotos(slideshow.scope);
      slideshow.position = current ? Math.max(0,slideshow.queue.findIndex(entry => photoKey(entry) === photoKey(current))) : 0;
    }
  }
  function restoreSchoolRounds(saved) {
    if (saved?.schoolShuffleVersion !== 2 || !Array.isArray(saved.rounds) || !saved.rounds.length || saved.rounds.length > 32 || !Number.isSafeInteger(saved.roundOffset) || saved.roundOffset < 0 || saved.roundOffset > 1e9 || !Number.isInteger(saved.roundIndex) || saved.roundIndex < 0 || saved.roundIndex >= saved.rounds.length) return false;
    const schools = slideshowSchools(), photos = slideshowPhotos(slideshow.scope);
    const entries = new Map(photos.map(entry => [photoKey(entry),entry]));
    const rounds = [];
    for (let number = 0; number < saved.rounds.length; number++) {
      const keys = saved.rounds[number];
      if (!Array.isArray(keys) || keys.length !== photos.length || !Array.from(keys).every(key => entries.has(key)) || new Set(keys).size !== keys.length) return false;
      const round = [], seenSchools = new Set();
      for (let position = 0; position < keys.length;) {
        const first = entries.get(keys[position]), item = first.item;
        if (first.index !== 0 || seenSchools.has(item.id)) return false;
        seenSchools.add(item.id);
        for (let index = 0; index < item.views.length; index++) {
          const entry = entries.get(keys[position++]);
          if (!entry || entry.item.id !== item.id || entry.index !== index) return false;
          round.push({...entry,schoolRound:saved.roundOffset + number + 1,schoolPosition:seenSchools.size,schoolTotal:schools.length});
        }
      }
      if (seenSchools.size !== schools.length) return false;
      if (number && schools.length > 1 && rounds[number - 1].at(-1).item.id === round[0].item.id) return false;
      rounds.push(round);
    }
    slideshow.rounds = rounds; slideshow.roundIndex = saved.roundIndex; slideshow.roundOffset = saved.roundOffset;
    slideshow.queue = rounds[slideshow.roundIndex];
    ensureNextSchoolRound();
    return true;
  }
  function preloadNextSlideshowPhoto() {
    if (!slideshow.active || slideshowPhotos(slideshow.scope).length < 2) return;
    const next = adjacentSlideshowEntry(1);
    if (!next) return;
    if (!slideshowPreload) { slideshowPreload = new Image(); slideshowPreload.decoding = 'async'; }
    // Exactly one speculative image; changing src cancels any earlier preload.
    const src = next.item.views[next.index].src;
    if (slideshowPreload.getAttribute('src') !== src) slideshowPreload.src = src;
  }
  function leaveSlideshow() {
    clearSlideshowTimer();
    resetSlideshowUi();
    slideshow.active = false; slideshow.playing = false;
    if (slideshowPreload) { slideshowPreload.removeAttribute('src'); slideshowPreload = null; }
    stage.setAttribute('aria-label',stageLabel);
    updateSlideshowControls();
  }
  function routeSlideshow() {
    if (!slideshow.active) {
      const saved = history.state?.stadiumAtlasSlideshow;
      resetSlideshowUi();
      slideshow.active = true; slideshow.playing = false;
      slideshow.scope = saved?.scope === 'filtered' ? 'filtered' : 'all';
      slideshow.shuffle = saved?.shuffle === true;
      slideshow.delay = [3000,5000,8000,12000].includes(saved?.delay) ? saved.delay : 5000;
      slideshow.from = typeof saved?.from === 'string' && /^#(?:collection|stadium\/[a-z0-9-]+)?$/.test(saved.from) ? saved.from : '#collection';
      slideshow.owned = saved?.owned === true;
      orderSlideshow(false);
      const restoredRound = slideshow.shuffle && restoreSchoolRounds(saved);
      if (!slideshow.shuffle && Array.isArray(saved?.order) && saved.order.length === slideshow.queue.length && new Set(saved.order).size === saved.order.length) {
        const entries = new Map(slideshow.queue.map(entry => [photoKey(entry),entry]));
        if (Array.from(saved.order).every(key => entries.has(key))) slideshow.queue = saved.order.map(key => entries.get(key));
      }
      slideshow.position = (!slideshow.shuffle || restoredRound) && Number.isInteger(saved?.position) ? Math.max(0,Math.min(slideshow.queue.length - 1,saved.position)) : 0;
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('viewer-open');
      stage.setAttribute('aria-label',`${stageLabel} Space or P pauses and plays the slideshow. Zooming and dragging pauses playback. Move the pointer, tap once, or press Tab to reveal slideshow controls.`);
      updateViewerImage();
      stage.focus({preventScroll:true});
    }
    document.title = 'Slideshow · Stadium Atlas';
    viewerHistoryEntry = false;
    saveSlideshowHistory();
  }
  function requestViewerFullscreen() {
    // The dialog is already viewport-sized when native fullscreen is unavailable.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { document.documentElement.requestFullscreen().then(() => { if (!dialog.open && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }).catch(() => {}); } catch {}
    }
  }
  $('#start-slideshow').addEventListener('click', () => {
    if (dialog.open || closingViewer || dialog.hidden || !$('#release-warning').hidden) return;
    const from = location.hash || '#collection';
    history.pushState({stadiumAtlasSlideshow:{from,owned:true,scope:'all'}},'', '#slideshow');
    route();
    setSlideshowPlaying(true);
    requestViewerFullscreen();
  });
  slideshowPlay.addEventListener('click', () => setSlideshowPlaying(!slideshow.playing));
  slideshowScope.addEventListener('change', () => {
    slideshow.scope = slideshowScope.value === 'filtered' ? 'filtered' : 'all';
    orderSlideshow(false);
    if (!slideshow.queue.length) slideshow.playing = false;
    saveSlideshowHistory(); updateViewerImage();
  });
  $('#slideshow-speed').addEventListener('change', event => {
    const value = Number(event.target.value);
    slideshow.delay = [3000,5000,8000,12000].includes(value) ? value : 5000;
    saveSlideshowHistory(); updateSlideshowControls(); scheduleSlideshow();
  });
  $('#slideshow-shuffle').addEventListener('click', () => {
    slideshow.shuffle = !slideshow.shuffle;
    orderSlideshow(); saveSlideshowHistory(); updateViewerImage();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { revealSlideshowControls(); return; }
    clearSlideshowUiTimer();
    revealPointers.clear();
    if (slideshow.active) setSlideshowPlaying(false,'Paused while this tab is hidden');
    finishViewerTransition(false);
  });
  window.addEventListener('pagehide', () => {
    if (slideshow.active) setSlideshowPlaying(false);
    finishViewerTransition(false);
    resetSlideshowUi();
  });
  window.addEventListener('pageshow', revealSlideshowControls);
  const onReducedMotion = () => { if (reducedMotion.matches) finishViewerTransition(); };
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change',onReducedMotion);
  else reducedMotion.addListener(onReducedMotion);
  // A visible slideshow may keep playing on another monitor while this window is unfocused.
  // Only actual page hiding, explicit controls, or image exploration pause playback.

  // Published daily snapshots only. No provider credentials or API calls in the browser.
  const recordsSeason = window.STADIUM_ATLAS_RECORDS_SEASON;
  const RECORD_TTL = 24 * 60 * 60 * 1000;
  const recordsCacheKey = `stadium-atlas-records-${recordsSeason}-v1`;
  function recordParts(label) {
    if (typeof label !== 'string' || !/^\d{1,2}-\d{1,2}(?:-\d{1,2})?$/.test(label)) return null;
    const parts = label.split('-').map(Number);
    if (parts.some(n => n > 30) || parts.reduce((a,b) => a+b,0) > 30) return null;
    return [parts[0],parts[1],parts[2] || 0];
  }
  function validRecordSnapshot(value) {
    if (!Number.isInteger(recordsSeason) || !value || value.schemaVersion !== 1 || value.season !== recordsSeason || value.source !== 'CollegeFootballData' || !Array.isArray(value.rows) || value.rows.length !== catalog.length) return null;
    if (typeof value.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.checkedAt)) return null;
    const time = Date.parse(value.checkedAt);
    if (!Number.isFinite(time) || time > Date.now() + 5 * 60 * 1000 || time < Date.UTC(recordsSeason,0,1)) return null;
    if (new Date(time).toISOString().replace('.000Z','Z') !== value.checkedAt.replace('.000Z','Z')) return null;
    const seen = new Set(), rows = [];
    for (const row of value.rows) {
      const item = row && catalog.find(item => item.id === row.stadiumId);
      if (!item || seen.has(item.id)) return null;
      const overall = recordParts(row.overall);
      const independent = item.conference === 'Independent (football)';
      const conference = independent ? null : recordParts(row.conference);
      if (!overall || (independent ? row.conference !== null : !conference || conference.some((n,i) => n > overall[i]))) return null;
      seen.add(item.id);
      rows.push({stadiumId:item.id,overall:row.overall,conference:independent ? null : row.conference});
    }
    return {schemaVersion:1,season:recordsSeason,checkedAt:value.checkedAt,source:'CollegeFootballData',rows};
  }
  let embeddedRecords = validRecordSnapshot(window.STADIUM_ATLAS_RECORDS), savedRecords = null;
  try { savedRecords = validRecordSnapshot(JSON.parse(window.localStorage.getItem(recordsCacheKey))); } catch {}
  let recordSnapshot = embeddedRecords;
  let recordOrigin = embeddedRecords ? 'published' : 'unavailable';
  if (savedRecords && (!embeddedRecords || Date.parse(savedRecords.checkedAt) > Date.parse(embeddedRecords.checkedAt))) {
    recordSnapshot = savedRecords;
    recordOrigin = 'device';
  }
  if (recordSnapshot) { try { window.localStorage.setItem(recordsCacheKey,JSON.stringify(recordSnapshot)); } catch {} }
  const recordMap = new Map((recordSnapshot?.rows || []).map(row => [row.stadiumId,row]));
  function recordState() {
    if (!recordSnapshot) return 'unavailable';
    return Date.now() - Date.parse(recordSnapshot.checkedAt) > RECORD_TTL ? 'stale' : recordOrigin;
  }
  function checkedDate(short = false) {
    if (!recordSnapshot) return '';
    return new Intl.DateTimeFormat(undefined, short ? {month:'short',day:'numeric'} : {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(recordSnapshot.checkedAt));
  }
  function recordSummary(item) {
    const row = recordMap.get(item.id);
    const conference = item.conference === 'Independent (football)' ? 'not applicable for independent football' : row ? row.conference : 'unavailable';
    return `${recordsSeason} season. Overall record ${row ? row.overall : 'unavailable'}. Conference record ${conference}.${recordSnapshot ? ` Last checked ${checkedDate()}.` : ''}`;
  }
  function recordMarkup(item) {
    const row = recordMap.get(item.id), state = recordState();
    const overall = row ? row.overall : '—';
    const conference = item.conference === 'Independent (football)' ? 'N/A' : row ? row.conference : '—';
    const note = !row ? `${recordsSeason} season · Unavailable` : `${recordsSeason} season · ${state === 'stale' ? 'Stale · ' : ''}${recordOrigin === 'device' ? 'Saved · ' : ''}Checked ${checkedDate(true)}`;
    return `<dl class="record-stats"><div><dt>Overall</dt><dd aria-label="Overall record ${row ? escape(overall) : 'unavailable'}">${escape(overall)}</dd></div><div><dt>Conference</dt><dd aria-label="Conference record ${conference === 'N/A' ? 'not applicable: independent football team' : row ? escape(conference) : 'unavailable'}">${escape(conference)}</dd></div></dl><p class="record-note${state === 'stale' ? ' record-stale' : ''}"${recordSnapshot ? ` title="Last checked ${escape(checkedDate())}"` : ''}>${escape(note)}</p>`;
  }
  function updateRecordLabels() {
    const state = recordState(), status = $('#records-status');
    const now = new Date(), activeSeason = now.getUTCFullYear() - (now.getUTCMonth() < 7 ? 1 : 0);
    let text = recordSnapshot ? `${recordsSeason} records · ${recordsSeason < activeSeason ? 'Previous season · ' : ''}${state === 'stale' ? 'Stale · ' : ''}${recordOrigin === 'device' ? 'Saved on this device · ' : ''}Last checked ${checkedDate()}.` : `${recordsSeason} records unavailable. No verified snapshot is loaded.`;
    if (state === 'stale') text += ' A newer daily snapshot has not loaded.';
    if (status) { status.textContent = text; status.classList.toggle('record-stale',state === 'stale'); }
    $$('[data-records-id]').forEach(element => { const item = catalog.find(item => item.id === element.dataset.recordsId); if (item) element.innerHTML = recordMarkup(item); });
    window.STADIUM_ATLAS_RUNTIME.records = {season:recordsSeason,state,origin:recordOrigin,checkedAt:recordSnapshot?.checkedAt || null,teams:recordMap.size};
  }
  $('#reload-records')?.addEventListener('click', () => window.location.reload());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateRecordLabels(); });
  window.addEventListener('focus',updateRecordLabels);
  if (recordSnapshot) {
    const delay = Date.parse(recordSnapshot.checkedAt) + RECORD_TTL + 1 - Date.now();
    if (delay > 0 && delay <= RECORD_TTL + 5 * 60 * 1000) setTimeout(updateRecordLabels,delay);
  }

  for (const value of ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter' + (value === 'All' ? ' letter-all' : '') + (catalog.some(item => item.school.toUpperCase().startsWith(value)) ? ' available' : '');
    button.textContent = value;
    button.dataset.letter = value;
    button.setAttribute('aria-label', value === 'All' ? 'All schools' : `Schools starting with ${value}`);
    button.addEventListener('click', () => { letter = value; renderResults(); });
    board.append(button);
  }

  // Read affiliations from the same catalog used by cards; no separate team lists.
  for (const [select, field] of [[conferenceFilter, 'conference'], [divisionFilter, 'classification']]) {
    const values = [...new Set(catalog.map(item => item[field]).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
  }
  conferenceFilter.addEventListener('change', () => { conference = conferenceFilter.value; renderResults(); });
  divisionFilter.addEventListener('change', () => { classification = divisionFilter.value; renderResults(); });
  function filterDescription() {
    return [conference, classification, letter !== 'All' ? `Schools starting with ${letter}` : '', query ? `Search: “${query}”` : ''].filter(Boolean).join(' · ');
  }

  function matches(item) {
    const searchable = normalize([item.school, item.fullSchool, item.team, item.teamName, item.mascot, item.stadium, item.city, item.state, ...(item.aliases || [])].join(' '));
    return (!conference || item.conference === conference) && (!classification || item.classification === classification) && (letter === 'All' || item.school.toUpperCase().startsWith(letter)) && normalize(query).split(/\s+/).filter(Boolean).every(word => searchable.includes(word));
  }
  function renderResults() {
    cancelCardGesture();
    const results = catalog.filter(matches).sort((a,b) => a.school.localeCompare(b.school));
    const views = results.reduce((sum,item) => sum + item.views.length, 0);
    $$('.letter').forEach(button => { const selected = button.dataset.letter === letter; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('#clear-search').hidden = !query;
    $('#reset-filters').hidden = !query && letter === 'All' && !conference && !classification;
    $('#filter-summary').textContent = filterDescription();
    $('#filter-summary').hidden = !filterDescription();
    $('#results-title').textContent = query ? 'Search results' : conference || classification ? 'Filtered collection' : letter === 'All' ? 'The collection' : `${letter} · Schools`;
    $('#result-count').textContent = `${results.length} stadium${results.length === 1 ? '' : 's'}${results.length ? ` · ${views} views` : ''}`;
    $('#collection-total').textContent = String(catalog.length).padStart(3,'0');
    $('#collection-note-text').textContent = catalog.length === 1 ? 'Starting in Eugene. More home fields to come.' : `${catalog.length} home fields. ${catalog.reduce((sum,item) => sum + item.views.length,0)} perspectives. More to come.`;
    $('#stadium-list').classList.toggle('multi-stadium', catalog.length > 1);
    cardList.innerHTML = results.map(item => {
      const index = selectedViews.get(item.id) || 0;
      const image = item.views[index];
      const teamName = item.teamName || `${item.school} ${item.team}`;
      const capacityYear = (item.capacityLabel || '').match(/\b20\d{2}\b/);
      const capacityLabel = `${/approx/i.test(item.capacityLabel || '') ? 'Approx. capacity' : 'Capacity'}${capacityYear ? ` (${capacityYear[0]})` : ''}`;
      const capacityValue = `${/\bnearly\b/i.test(item.capacityLabel || '') ? 'Nearly ' : ''}${Number(item.seatingCapacity).toLocaleString('en-US')}`;
      const temporarySeats = /including temporary/i.test(item.capacityNote || '') ? '<small>incl. temporary seats</small>' : '';
      const division = (item.classification || '').replace('NCAA Division I ', 'D-I ');
      return `<article class="stadium-card" data-stadium-id="${escape(item.id)}"><div class="card-image" data-card-gallery="${escape(item.id)}" style="aspect-ratio:${image.width}/${image.height}"><a class="card-image-link" href="#stadium/${escape(item.id)}" aria-label="Open ${escape(item.school)}: ${escape(image.title.toLowerCase())}"><img data-card-source="${escape(image.src)}" src="${escape(image.src)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async" alt="${escape(image.alt)}" draggable="false"></a><div class="card-image-status" hidden><p role="status" aria-live="polite"></p><button type="button" class="card-image-retry" aria-label="Retry ${escape(item.school)} image" hidden>Retry image</button></div><span class="card-viewcount" aria-live="polite" aria-atomic="true">${index + 1} / ${item.views.length} · ${escape(image.title)}</span><button type="button" class="card-preview-arrow card-preview-prev" data-card-step="-1" aria-label="Previous ${escape(item.school)} stadium view" title="Previous view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" class="card-preview-arrow card-preview-next" data-card-step="1" aria-label="Next ${escape(item.school)} stadium view" title="Next view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></div><a class="card-body card-detail-link" href="#stadium/${escape(item.id)}" aria-label="Explore ${escape(teamName)}: ${escape(item.stadium)}. ${escape(item.conference)}, ${escape(item.classification)}. ${escape(capacityLabel)}: ${escape(capacityValue)}. ${item.views.length} stadium views. ${escape(recordSummary(item))}"><div class="card-topline"><span>${escape(item.fullSchool)}</span><span class="card-no">${String(indexOf(item)).padStart(2,'0')}</span></div><h3 class="school-name">${escape(teamName)}</h3><p class="card-stadium">${escape(item.stadium)}</p><p class="card-place">${escape(item.city)}, ${escape(item.state)}</p><dl class="card-facts"><div><dt>League / division · 2026</dt><dd>${escape(item.conference)}<span class="card-division" aria-label="${escape(item.classification)}">${escape(division)}</span></dd></div><div><dt>${escape(capacityLabel)}</dt><dd><span class="card-capacity-value">${escape(capacityValue)}</span>${temporarySeats}</dd></div></dl><div class="team-records" data-records-id="${escape(item.id)}">${recordMarkup(item)}</div><div class="card-bottom"><span>Explore stadium</span><span class="card-arrow" aria-hidden="true">↗︎</span></div></a></article>`;
    }).join('');
    updateRecordLabels();
    $('#empty-state').hidden = results.length > 0;
    $('#empty-copy').textContent = `No stadiums match ${filterDescription() || 'these filters'}. Try another conference, division, letter, or search, or show all ${catalog.length} stadiums.`;
  }
  function syncCardView(item) {
    const card = $(`.stadium-card[data-stadium-id="${item.id}"]`);
    if (!card) return;
    const index = selectedViews.get(item.id) || 0;
    const image = item.views[index];
    const gallery = $('.card-image', card);
    gallery.style.aspectRatio = `${image.width} / ${image.height}`;
    const preview = $('.card-image img', card);
    if (preview.dataset.cardSource !== image.src) replaceCardImage(gallery, image, false);
    $('.card-image-link', card).setAttribute('aria-label', `Open ${item.school}: ${image.title.toLowerCase()}`);
    $('.card-viewcount', card).textContent = `${index + 1} / ${item.views.length} · ${image.title}`;
  }
  // A new element per request makes late events from older views harmless.
  // Each original request gets one automatic retry; further retries are user-driven.
  const cardRetryStates = new WeakMap();
  let retryRequest = 0;
  function currentCardImage(image) {
    const gallery = image?.closest?.('[data-card-gallery]');
    return gallery && cardList.contains(gallery) && $('.card-image-link img', gallery) === image ? gallery : null;
  }
  function cardImageStatus(gallery, message = '', failed = false) {
    const status = $('.card-image-status', gallery);
    status.hidden = !message;
    $('p', status).textContent = message;
    $('.card-image-retry', status).hidden = !failed;
    gallery.classList.toggle('card-image-failed', failed);
  }
  function replaceCardImage(gallery, image, retry) {
    const old = $('.card-image-link img', gallery);
    const preview = document.createElement('img');
    preview.dataset.cardSource = image.src;
    preview.alt = image.alt;
    preview.width = image.width;
    preview.height = image.height;
    preview.loading = retry ? 'eager' : 'lazy';
    preview.decoding = 'async';
    preview.draggable = false;
    cardRetryStates.set(preview, {retried:retry});
    cardImageStatus(gallery, retry ? 'Retrying image…' : '');
    old.replaceWith(preview);
    // Retry only this public asset; never modify the catalog or reload all images.
    preview.src = image.src + (retry ? `${image.src.includes('?') ? '&' : '?'}sa_retry=${Date.now()}-${++retryRequest}` : '');
  }
  cardList.addEventListener('error', event => {
    const preview = event.target, gallery = currentCardImage(preview);
    if (!gallery) return;
    const state = cardRetryStates.get(preview) || {retried:false};
    cardRetryStates.set(preview,state);
    if (!state.retried) {
      state.retried = true;
      const item = catalog.find(item => item.id === gallery.dataset.cardGallery);
      const image = item?.views.find(image => image.src === preview.dataset.cardSource);
      if (image) { replaceCardImage(gallery,image,true); return; }
    }
    cardImageStatus(gallery, 'Image couldn’t load. Try again.', true);
  }, true);
  cardList.addEventListener('load', event => {
    const gallery = currentCardImage(event.target);
    if (gallery) cardImageStatus(gallery);
  }, true);

  function stepCardView(gallery, direction) {
    const item = catalog.find(item => item.id === gallery.dataset.cardGallery);
    if (!item) return;
    selectedViews.set(item.id, ((selectedViews.get(item.id) || 0) + direction + item.views.length) % item.views.length);
    syncCardView(item);
  }
  function cancelCardGesture() {
    const old = cardGesture;
    cardGesture = null;
    cardPointers.clear();
    if (old?.gallery.hasPointerCapture?.(old.pointerId)) old.gallery.releasePointerCapture(old.pointerId);
  }
  cardList.addEventListener('click', event => {
    const gallery = event.target.closest('[data-card-gallery]');
    const retry = event.target.closest('.card-image-retry');
    if (retry && gallery) {
      event.preventDefault(); event.stopPropagation();
      const item = catalog.find(item => item.id === gallery.dataset.cardGallery);
      if (item) {
        replaceCardImage(gallery,item.views[selectedViews.get(item.id) || 0],true);
        $('.card-image-link',gallery).focus({preventScroll:true});
      }
      return;
    }
    const control = event.target.closest('[data-card-step]');
    if (control && gallery) { event.preventDefault(); stepCardView(gallery, Number(control.dataset.cardStep)); return; }
    if (gallery && event.detail !== 0 && blockedCardClicks.has(gallery)) {
      const recent = performance.now() - blockedCardClicks.get(gallery) < 800;
      blockedCardClicks.delete(gallery);
      if (recent) { event.preventDefault(); event.stopPropagation(); return; }
    }
    const link = event.target.closest('.card-image-link, .card-detail-link');
    if (link) lastCardFocus = link;
  }, true);
  cardList.addEventListener('keydown', event => {
    const link = event.target.closest('.card-image-link');
    if (link && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      stepCardView(link.closest('[data-card-gallery]'), event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  cardList.addEventListener('dragstart', event => {
    if (event.target.closest('[data-card-gallery]')) event.preventDefault();
  });
  cardList.addEventListener('pointerdown', event => {
    const gallery = event.target.closest('[data-card-gallery]');
    if (!gallery || event.target.closest('button') || event.button !== 0) return;
    cardPointers.add(event.pointerId);
    if (cardPointers.size > 1) {
      if (cardGesture) blockedCardClicks.set(cardGesture.gallery, performance.now());
      blockedCardClicks.set(gallery, performance.now());
      const old = cardGesture;
      cardGesture = null;
      if (old?.gallery.hasPointerCapture?.(old.pointerId)) old.gallery.releasePointerCapture(old.pointerId);
      return;
    }
    blockedCardClicks.delete(gallery);
    cardGesture = {gallery, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, axis:null};
  });
  cardList.addEventListener('pointermove', event => {
    const g = cardGesture;
    if (!g || event.pointerId !== g.pointerId) return;
    const dx = event.clientX - g.startX, dy = event.clientY - g.startY;
    if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
      if (g.axis === 'horizontal') {
        try { g.gallery.setPointerCapture(event.pointerId); } catch {}
      }
    }
    if (g.axis === 'horizontal' && event.cancelable) event.preventDefault();
  });
  function endCardPointer(event) {
    cardPointers.delete(event.pointerId);
    const g = cardGesture;
    if (!g || event.pointerId !== g.pointerId) return;
    cardGesture = null;
    const dx = event.clientX - g.startX, dy = event.clientY - g.startY;
    const moved = Math.max(Math.abs(dx), Math.abs(dy)) >= 10;
    const cancelled = event.type !== 'pointerup';
    if (moved || cancelled) blockedCardClicks.set(g.gallery, performance.now());
    if (!cancelled && g.axis === 'horizontal' && Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.3) stepCardView(g.gallery, dx < 0 ? 1 : -1);
    if (g.gallery.hasPointerCapture?.(event.pointerId)) g.gallery.releasePointerCapture(event.pointerId);
  }
  window.addEventListener('pointerup', endCardPointer);
  window.addEventListener('pointercancel', endCardPointer);
  cardList.addEventListener('lostpointercapture', endCardPointer);
  window.addEventListener('blur', cancelCardGesture);
  function resetFilters() { letter = 'All'; query = ''; conference = ''; classification = ''; input.value = ''; conferenceFilter.value = ''; divisionFilter.value = ''; renderResults(); }
  input.addEventListener('input', () => { query = input.value; renderResults(); });
  $('.search-form').addEventListener('submit', event => { event.preventDefault(); input.blur(); });
  $('#clear-search').addEventListener('click', () => { query = ''; input.value = ''; renderResults(); input.focus(); });
  $('#reset-filters').addEventListener('click', () => { resetFilters(); input.focus(); });
  $('#show-all').addEventListener('click', () => { resetFilters(); input.focus(); });

  function renderDetail() {
    const item = activeStadium;
    $('#detail-eyebrow').innerHTML = `${escape(item.teamName || `${item.school} ${item.team}`)} <span class="muted">/ ${escape(item.city)}, ${escape(item.state)}</span>`;
    $('#detail-title').innerHTML = `${escape(item.stadium)}<span class="title-dot">.</span>`;
    $('#detail-number').textContent = String(indexOf(item)).padStart(3,'0');
    $('#gallery-hint').textContent = `${item.views.length === 2 ? 'Two' : 'Three'} ways to see the home of the ${item.team}.`;
    $('#stadium-description').textContent = item.description || `${item.school}’s home in ${item.city} since ${item.opened}.`;
    $('#fact-sources').innerHTML = (item.sources || [
      {title:'Stadium facts',url:item.factsSources.stadium},
      {title:`Meet ${item.mascot}`,url:item.factsSources.mascot}
    ]).filter(source => source.url).map(source => `<a class="source-link" href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} <span aria-hidden="true">↗︎</span></a>`).join('');
    $('#capacity-note').textContent = item.capacityNote || 'Capacity counts seats; standing-room attendance can be higher.';
    const facts = [['School',item.fullSchool],['Team',item.teamName || `${item.school} ${item.team}`],[item.mascotLabel || 'Mascot',item.mascot],['Division',item.classification || 'Not listed'],['Conference (2026)',item.conference || 'Not listed'],['Location',`${item.city}, ${item.state}`],[item.capacityLabel || 'Seating capacity',Number(item.seatingCapacity).toLocaleString('en-US')],['Opened',item.opened]];
    $('#stadium-facts').innerHTML = facts.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
    $('#stadium-facts').setAttribute('aria-label',`${item.stadium} facts`);
    const imageSizes = [...new Set(item.views.map(image => `${image.width} × ${image.height}`))].join(' and ');
    $('#image-note').textContent = item.imageNote || `About these views: AI-generated, reference-based reconstructions of the stadium’s ${item.artEra || '2024-era'} appearance. Architecture and landscape are interpretive, not current photographs or survey-accurate images. Original image resolution: ${imageSizes} pixels.`;
    $('#detail-records').innerHTML = `<div class="team-records" data-records-id="${escape(item.id)}">${recordMarkup(item)}</div>`;
    updateRecordLabels();
    $('.view-tabs').innerHTML = item.views.map((image,index) => `<button type="button" class="view-tab" data-view="${index}" aria-pressed="false"><img src="${escape(image.src)}" width="${image.width}" height="${image.height}" alt=""><span><small>${String(index + 1).padStart(2,'0')}</small>${escape(image.title)}</span></button>`).join('');
  }
  function changeView(index) {
    view = Math.max(0,Math.min(activeStadium.views.length-1,index));
    selectedViews.set(activeStadium.id,view);
    const image = imageOf();
    const detailImage = $('#detail-image');
    detailImage.src = image.src;
    detailImage.alt = image.alt;
    detailImage.width = image.width;
    detailImage.height = image.height;
    detailImage.style.aspectRatio = `${image.width} / ${image.height}`;
    $('#open-viewer').setAttribute('aria-label', `Open ${image.title.toLowerCase()} of ${activeStadium.stadium} full screen`);
    $$('.view-tab').forEach(button => { const active = Number(button.dataset.view) === view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    if (dialog.open) updateViewerImage();
  }
  $('.view-tabs').addEventListener('click', event => { const button = event.target.closest('.view-tab'); if (button) changeView(Number(button.dataset.view)); });

  function route() {
    cancelCardGesture();
    if (location.hash === '#slideshow') { routeSlideshow(); closingViewer = false; return; }
    const leavingSlideshow = slideshow.active;
    if (leavingSlideshow) leaveSlideshow();
    const match = location.hash.match(/^#stadium\/([a-z0-9-]+)(?:\/view\/([1-9][0-9]*))?$/);
    const item = match && catalog.find(stadium => stadium.id === match[1]);
    const showDetail = Boolean(item) && (!match[2] || Number(match[2]) <= item.views.length);
    viewerHistoryEntry = Boolean(showDetail && match[2] && history.state?.stadiumAtlasViewer?.from === `#stadium/${item.id}` && history.state?.stadiumAtlasViewer?.viewer === location.hash);
    const changedStadium = showDetail && activeStadium.id !== item.id;
    if (showDetail && !wasDetail) homeScroll = window.scrollY;
    home.hidden = showDetail;
    detail.hidden = !showDetail;
    document.title = showDetail ? `${item.stadium} · Stadium Atlas` : 'Stadium Atlas · College football from above';
    if (showDetail) {
      activeStadium = item;
      if (changedStadium || !wasDetail) renderDetail();
      changeView(match[2] ? Number(match[2])-1 : selectedViews.get(item.id) || 0);
    }
    if (showDetail && (!wasDetail || changedStadium)) { window.scrollTo({top:0,behavior:'instant'}); $('#detail-title').focus({preventScroll:true}); }
    if (showDetail && match[2]) {
      if (!dialog.open) {
        dialog.showModal();
        document.body.classList.add('viewer-open');
        updateViewerImage();
        stage.focus({preventScroll:true});
      }
    } else if (dialog.open) {
      dialog.close();
      document.body.classList.remove('viewer-open');
      pointers.clear();
      stage.classList.remove('is-dragging');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (showDetail) $('#open-viewer').focus({preventScroll:true});
      viewerHistoryEntry = false;
    }
    if (!showDetail && wasDetail) {
      syncCardView(activeStadium);
      window.scrollTo({top:homeScroll,behavior:'instant'});
      const link = lastCardFocus?.isConnected && lastCardFocus.getAttribute('href') === `#stadium/${activeStadium.id}` ? lastCardFocus : $(`.card-detail-link[href="#stadium/${activeStadium.id}"]`);
      link?.focus({preventScroll:true});
    }
    if (leavingSlideshow && !dialog.open) $('#start-slideshow').focus({preventScroll:true});
    wasDetail = showDetail;
    closingViewer = false;
  }
  function closeViewer() {
    if (!dialog.open || closingViewer) return;
    closingViewer = true;
    resetSlideshowUi();
    cancelViewerRequest();
    finishViewerTransition(false);
    viewerReady = false;
    if (slideshow.active) {
      setSlideshowPlaying(false);
      if (slideshow.owned) history.back();
      else { history.replaceState(null,'',slideshow.from); route(); }
      return;
    }
    if (viewerHistoryEntry) history.back();
    else { history.replaceState(null, '', `#stadium/${activeStadium.id}`); route(); }
  }
  $('#open-viewer').addEventListener('click', () => {
    const from = `#stadium/${activeStadium.id}`;
    const viewer = `${from}/view/${view + 1}`;
    history.pushState({stadiumAtlasViewer:{from,viewer}}, '', viewer);
    route();
    requestViewerFullscreen();
  });
  $('#close-viewer').addEventListener('click', closeViewer);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  window.addEventListener('hashchange', route);
  function switchViewer(direction) {
    if (!dialog.open || closingViewer) return;
    if (slideshow.active) {
      if (!slideshow.queue.length) return;
      advanceSlideshow(direction);
      saveSlideshowHistory(); updateViewerImage();
      return;
    }
    const nextView = (view + direction + activeStadium.views.length) % activeStadium.views.length;
    const viewer = `#stadium/${activeStadium.id}/view/${nextView + 1}`;
    history.replaceState(viewerHistoryEntry ? {stadiumAtlasViewer:{from:`#stadium/${activeStadium.id}`,viewer}} : null, '', viewer);
    changeView(nextView);
  }
  $('#viewer-prev').addEventListener('click', () => switchViewer(-1));
  $('#viewer-next').addEventListener('click', () => switchViewer(1));
  dialog.addEventListener('keydown', event => {
    // Native selects and buttons retain their own keyboard behavior.
    if (event.target.closest('select,input,textarea')) return;
    if (event.target !== stage && (event.key === 'PageUp' || event.key === 'PageDown')) { event.preventDefault(); switchViewer(event.key === 'PageUp' ? -1 : 1); }
    if (slideshow.active && !event.target.closest('button') && (event.key === ' ' || event.key.toLowerCase() === 'p')) {
      event.preventDefault();
      if (!event.repeat) setSlideshowPlaying(!slideshow.playing);
    }
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) {
      clearSlideshowTimer();
      resetSlideshowUi();
      clearViewerPresentation();
      if (slideshow.active) setSlideshowPlaying(false);
      document.body.classList.remove('viewer-open');
    }
  });

  // Start with the whole image; allow deliberate enlargement without claiming added detail.
  let fit = 1, scale = 1, x = 0, y = 0, stageWidth = 1, stageHeight = 1;
  const pointers = new Map();
  let gesture = null;
  let gestureHadMultiple = false;
  let lastTap = {time:0,x:0,y:0};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const minScale = .5;
  const maxScale = () => 8;
  function constrain() {
    const image = displayedPhoto();
    if (!image) return;
    const width = image.width * fit * scale, height = image.height * fit * scale;
    // Generous movement across the viewport, while keeping a small edge within reach.
    const limitX = Math.max(0, (width + stageWidth) / 2 - Math.min(width, stageWidth) * .12);
    const limitY = Math.max(0, (height + stageHeight) / 2 - Math.min(height, stageHeight) * .12);
    x = clamp(x, -limitX, limitX);
    y = clamp(y, -limitY, limitY);
  }
  function paint() {
    constrain();
    viewerImage.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
    stage.classList.add('can-pan');
  }
  function fitImage() {
    const rect = stage.getBoundingClientRect();
    stageWidth = Math.max(1, rect.width);
    stageHeight = Math.max(1, rect.height);
    const image = displayedPhoto();
    if (!image) return;
    fit = Math.min(stageWidth / image.width, stageHeight / image.height);
    viewerImage.style.width = `${image.width * fit}px`;
    viewerImage.style.height = `${image.height * fit}px`;
    scale = 1; x = 0; y = 0;
    pointers.clear(); gesture = null; gestureHadMultiple = false;
    lastTap = {time:0,x:0,y:0};
    stage.classList.remove('is-dragging');
    paint();
  }
  function showViewerStatus(message = '', retry = false) {
    $('#viewer-image-message').textContent = message;
    $('#viewer-image-status').hidden = !message;
    $('#viewer-retry').hidden = !retry;
  }
  function updateViewerCaption() {
    const entry = viewerDisplayedEntry, image = displayedPhoto();
    if (!image) {
      $('#viewer-title').textContent = viewerPhoto() ? 'Loading photo' : 'No matching photos';
      $('#viewer-stadium').textContent = '';
      $('#viewer-era').textContent = '';
      $('#viewer-announcement').textContent = viewerPhoto() ? 'Loading photo.' : 'No photos match these filters. Choose All photos or close to change filters.';
      return;
    }
    $('#viewer-title').textContent = image.title;
    $('#viewer-stadium').textContent = entry.item.stadium;
    $('#viewer-era').textContent = `${entry.item.artEra || '2024-era'} reconstruction`;
    if (slideshow.active) {
      const position = slideshow.queue.findIndex(photo => photoKey(photo) === photoKey(entry)) + 1;
      $('#viewer-announcement').textContent = `${entry.item.school}, ${entry.item.stadium}. ${image.title}${position ? `, ${position} of ${slideshow.queue.length}` : ''}. Page Up and Page Down change photos. Space pauses or plays. Zooming or dragging pauses playback.`;
    } else {
      $('#viewer-announcement').textContent = `${image.title}, ${entry.index + 1} of ${entry.item.views.length}. Full image fitted to screen. Pinch or scroll to zoom, drag to explore. High magnification can look softer.`;
    }
  }
  function cancelViewerRequest() {
    const request = viewerRequest;
    if (!request) return;
    viewerRequest = null;
    request.detach();
    request.node.removeAttribute('src');
    request.node.remove();
    stage.setAttribute('aria-busy','false');
  }
  function finishViewerTransition(reschedule = true) {
    const transition = viewerTransition;
    if (!transition) return;
    viewerTransition = null;
    if (transition.frame !== null) window.cancelAnimationFrame(transition.frame);
    if (transition.timer !== null) window.clearTimeout(transition.timer);
    transition.outgoing.removeEventListener('transitionend',transition.onEnd);
    transition.outgoing.remove();
    stage.classList.remove('is-crossfading');
    viewerReady = Boolean(viewerDisplayedEntry && !viewerRequest && !viewerFailed && dialog.open && !closingViewer);
    if (reschedule && slideshow.active) { updateSlideshowControls(); scheduleSlideshow(); }
  }
  function clearViewerPresentation() {
    cancelViewerRequest();
    finishViewerTransition(false);
    viewerDisplayedEntry = null;
    viewerReady = false; viewerFailed = false;
    viewerImage.style.visibility = 'hidden';
    viewerImage.removeAttribute('src');
    viewerImage.removeAttribute('data-viewer-source');
    stage.setAttribute('aria-busy','false');
    showViewerStatus();
  }
  function replaceViewerImage(entry, retry = false) {
    cancelViewerRequest();
    finishViewerTransition(false);
    const image = entry.item.views[entry.index];
    viewerFailed = false; viewerReady = false;
    showViewerStatus();
    if (!retry && displayedPhoto()?.src === image.src) {
      viewerDisplayedEntry = entry;
      viewerReady = true;
      fitImage(); updateViewerCaption();
      if (slideshow.active) { updateSlideshowControls(); scheduleSlideshow(); }
      return;
    }
    const replacement = document.createElement('img');
    replacement.className = 'viewer-image-pending';
    replacement.alt = ''; replacement.setAttribute('aria-hidden','true');
    replacement.width = image.width; replacement.height = image.height;
    replacement.draggable = false; replacement.decoding = 'async';
    replacement.dataset.viewerSource = image.src;
    const request = {node:replacement,entry,detach:() => {
      replacement.removeEventListener('load',onLoad);
      replacement.removeEventListener('error',onError);
    }};
    const isCurrent = () => viewerRequest === request && dialog.open && !closingViewer && viewerPhoto()?.src === image.src;
    let decoding = false;
    const onError = () => {
      if (!isCurrent()) return;
      cancelViewerRequest();
      viewerFailed = true; viewerReady = false;
      showViewerStatus(`This image could not load. ${viewerDisplayedEntry ? 'The previous photo is still shown. ' : ''}Retry it, or use the arrows to continue.`,true);
      if (slideshow.active) setSlideshowPlaying(false,'Paused · Image could not load');
    };
    const onReady = () => {
      if (!isCurrent()) return;
      request.detach(); viewerRequest = null;
      const previous = viewerImage, outgoing = viewerDisplayedEntry ? previous : null;
      // Keep the decoded incoming image underneath the outgoing image. Fading
      // the opaque outgoing layer avoids a dark midpoint or a blank frame.
      previous.removeAttribute('id');
      if (outgoing) {
        outgoing.className = 'viewer-image-outgoing';
        outgoing.alt = ''; outgoing.setAttribute('aria-hidden','true');
      } else previous.remove();
      replacement.className = ''; replacement.id = 'viewer-image';
      replacement.alt = image.alt; replacement.removeAttribute('aria-hidden');
      viewerImage = replacement; viewerDisplayedEntry = entry;
      viewerFailed = false;
      stage.setAttribute('aria-busy','false');
      fitImage(); updateViewerCaption();
      if (outgoing && !reducedMotion.matches && !document.hidden) {
        const transition = {outgoing,frame:null,timer:null,onEnd:event => {
          if (viewerTransition === transition && event.target === outgoing && event.propertyName === 'opacity') finishViewerTransition();
        }};
        viewerTransition = transition;
        stage.classList.add('is-crossfading');
        outgoing.addEventListener('transitionend',transition.onEnd);
        // Establish the start opacity before the first animation frame.
        outgoing.getBoundingClientRect();
        transition.frame = window.requestAnimationFrame(() => {
          if (viewerTransition !== transition) return;
          transition.frame = null;
          outgoing.style.opacity = '0';
          transition.timer = window.setTimeout(() => {
            if (viewerTransition === transition) finishViewerTransition();
          },CROSSFADE_MS);
        });
      } else {
        outgoing?.remove();
        viewerReady = true;
      }
      if (slideshow.active) { updateSlideshowControls(); scheduleSlideshow(); }
    };
    const onLoad = () => {
      if (decoding || !isCurrent()) return;
      decoding = true;
      // Decode before presenting; stale decode promises cannot commit a photo.
      if (typeof replacement.decode === 'function') {
        try { replacement.decode().then(onReady,onError); } catch { onError(); }
      } else onReady();
    };
    viewerRequest = request;
    replacement.addEventListener('load',onLoad);
    replacement.addEventListener('error',onError);
    if (!viewerDisplayedEntry) viewerImage.style.visibility = 'hidden';
    stage.setAttribute('aria-busy','true');
    stage.appendChild(replacement);
    replacement.src = retry ? `${image.src}${image.src.includes('?') ? '&' : '?'}sa_viewer_retry=${Date.now()}-${++retryRequest}` : image.src;
    if (replacement.complete && replacement.naturalWidth > 0) onLoad();
  }
  function updateViewerImage() {
    if (!dialog.open || closingViewer) return;
    clearSlideshowTimer();
    const entry = viewerEntry(), image = viewerPhoto();
    $('#viewer-prev').disabled = slideshow.active && (slideshowPhotos(slideshow.scope).length < 2 || (slideshow.shuffle && slideshow.roundIndex === 0 && slideshow.position === 0));
    $('#viewer-next').disabled = slideshow.active && slideshowPhotos(slideshow.scope).length < 2;
    if (!image) {
      clearViewerPresentation();
      if (slideshowPreload) { slideshowPreload.removeAttribute('src'); slideshowPreload = null; }
      updateViewerCaption(); updateSlideshowControls();
      return;
    }
    replaceViewerImage(entry);
    if (!viewerDisplayedEntry) updateViewerCaption();
    if (slideshow.active) {
      const total = slideshow.queue.length;
      const next = adjacentSlideshowEntry(1);
      const prev = adjacentSlideshowEntry(-1);
      $('#viewer-prev').setAttribute('aria-label', `Previous photo: ${prev.item.school}, ${prev.item.views[prev.index].title.toLowerCase()}`);
      $('#viewer-next').setAttribute('aria-label', `Next photo: ${next.item.school}, ${next.item.views[next.index].title.toLowerCase()}`);
      updateSlideshowControls();
      preloadNextSlideshowPhoto();
    } else {
      const nextTitle = activeStadium.views[(view + 1) % activeStadium.views.length].title.toLowerCase();
      const previousTitle = activeStadium.views[(view - 1 + activeStadium.views.length) % activeStadium.views.length].title.toLowerCase();
      $('#viewer-prev').setAttribute('aria-label', `Previous view: ${previousTitle}`);
      $('#viewer-next').setAttribute('aria-label', `Next view: ${nextTitle}`);
    }
  }
  $('#viewer-retry').addEventListener('click', () => {
    const entry = viewerEntry();
    if (!entry) return;
    clearSlideshowTimer();
    replaceViewerImage(entry,true);
    if (!viewerDisplayedEntry) updateViewerCaption();
    stage.focus({preventScroll:true});
    if (slideshow.active) updateSlideshowControls('Paused · Retrying image');
  });
  function pauseForImageInteraction() {
    // Image exploration should respond immediately, even midway through a fade.
    finishViewerTransition(false);
    if (slideshow.active && slideshow.playing) setSlideshowPlaying(false,'Paused to explore · Press Play to continue');
  }
  function localPoint(clientX, clientY) { const rect = stage.getBoundingClientRect(); return {x:clientX - rect.left - rect.width / 2,y:clientY - rect.top - rect.height / 2}; }
  function zoomTo(next, anchor = {x:0,y:0}) {
    next = clamp(next, minScale, maxScale());
    const ratio = next / scale;
    x = anchor.x - (anchor.x - x) * ratio;
    y = anchor.y - (anchor.y - y) * ratio;
    scale = next;
    paint();
  }
  function toggleZoom(point) { if (Math.abs(scale - 1) > .01 || Math.abs(x) > 1 || Math.abs(y) > 1) { scale = 1; x = y = 0; paint(); } else zoomTo(Math.min(maxScale(), 2.5), point); }
  new ResizeObserver(() => { if (dialog.open) fitImage(); }).observe(stage);
  stage.addEventListener('wheel', event => { event.preventDefault(); pauseForImageInteraction(); const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stageHeight : 1); zoomTo(scale * Math.exp(-delta * .002), localPoint(event.clientX,event.clientY)); }, {passive:false});
  stage.addEventListener('dblclick', event => { event.preventDefault(); pauseForImageInteraction(); toggleZoom(localPoint(event.clientX,event.clientY)); });
  function beginGesture() {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const a = points[0], b = points[1];
      gesture = {kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},scale,x,y};
    } else if (points.length === 1) gesture = {kind:'pan',start:points[0],x,y};
    else gesture = null;
  }
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pauseForImageInteraction();
    stage.focus({preventScroll:true});
    stage.setPointerCapture(event.pointerId);
    if (!pointers.size) gestureHadMultiple = false;
    pointers.set(event.pointerId, localPoint(event.clientX,event.clientY));
    if (pointers.size > 1) { lastTap.time = 0; gestureHadMultiple = true; }
    beginGesture();
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, localPoint(event.clientX,event.clientY));
    const points = [...pointers.values()];
    if (gesture?.kind === 'pinch' && points.length >= 2) {
      const a=points[0], b=points[1];
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      scale=clamp(gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance,minScale,maxScale());
      const ratio=scale/gesture.scale;
      x=center.x-(gesture.center.x-gesture.x)*ratio;
      y=center.y-(gesture.center.y-gesture.y)*ratio;
      paint();
    } else if (gesture?.kind === 'pan') {
      x=gesture.x+points[0].x-gesture.start.x;
      y=gesture.y+points[0].y-gesture.start.y;
      paint();
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    if (event.type !== 'pointerup') lastTap.time = 0;
    if (event.type === 'pointerup' && event.pointerType === 'touch' && !gestureHadMultiple && pointers.size === 1 && gesture?.kind === 'pan') {
      const point=localPoint(event.clientX,event.clientY);
      if (Math.hypot(point.x-gesture.start.x,point.y-gesture.start.y)<8) {
        const now=performance.now();
        if (lastTap.time > 0 && now-lastTap.time<300 && Math.hypot(point.x-lastTap.x,point.y-lastTap.y)<24) { toggleZoom(point); lastTap.time=0; }
        else lastTap={time:now,...point};
      }
    }
    pointers.delete(event.pointerId);
    beginGesture();
    if (!pointers.size) stage.classList.remove('is-dragging');
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('lostpointercapture', endPointer);
  stage.addEventListener('keydown', event => {
    const actions = {'+':()=>zoomTo(scale*1.25),'=':()=>zoomTo(scale*1.25),'-':()=>zoomTo(scale/1.25),'0':fitImage,PageUp:()=>switchViewer(-1),PageDown:()=>switchViewer(1),ArrowLeft:()=>{x+=65;paint();},ArrowRight:()=>{x-=65;paint();},ArrowUp:()=>{y+=65;paint();},ArrowDown:()=>{y-=65;paint();}};
    if (actions[event.key]) { event.preventDefault(); if (!['PageUp','PageDown'].includes(event.key)) pauseForImageInteraction(); actions[event.key](); }
  });
  document.addEventListener('fullscreenchange', () => { if(dialog.open) fitImage(); });
  renderResults(); route();
  window.STADIUM_ATLAS_RUNTIME = {...window.STADIUM_ATLAS_RUNTIME,build:BUILD,ready:true,schools:catalog.length,views:catalog.reduce((n,item)=>n+item.views.length,0)};
})();
