(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const catalog = window.STADIUMS;
  const home = $('#home-view');
  const detail = $('#detail-view');
  const input = $('#stadium-search');
  const board = $('#letter-board');
  const dialog = $('#image-viewer');
  const stage = $('#zoom-stage');
  const viewerImage = $('#viewer-image');
  let letter = 'All';
  let query = '';
  let view = 0;
  let wasDetail = false;
  let homeScroll = 0;
  let viewerHistoryEntry = false;
  let priorFocus = null;
  $('.skip-link').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); $('#main').scrollIntoView({behavior:'instant'}); });
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  for (const value of ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter' + (value === 'All' ? ' letter-all' : '') + (catalog.some(item => item.school.startsWith(value)) ? ' available' : '');
    button.textContent = value;
    button.dataset.letter = value;
    button.setAttribute('aria-label', value === 'All' ? 'All schools' : `Schools starting with ${value}`);
    button.addEventListener('click', () => { letter = value; renderResults(); });
    board.append(button);
  }

  function matches(item) {
    const searchable = normalize([item.school, item.fullSchool, item.team, item.stadium, item.city, item.state].join(' '));
    return (letter === 'All' || item.school.toUpperCase().startsWith(letter)) && normalize(query).split(/\s+/).filter(Boolean).every(word => searchable.includes(word));
  }
  function renderResults() {
    const results = catalog.filter(matches);
    $$('.letter').forEach(button => { const selected = button.dataset.letter === letter; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('#clear-search').hidden = !query;
    $('#reset-filters').hidden = !query && letter === 'All';
    $('#results-title').textContent = query ? 'Search results' : letter === 'All' ? 'The collection' : `${letter} · Schools`;
    $('#result-count').textContent = `${results.length} stadium${results.length === 1 ? '' : 's'}${results.length ? ' · 2 views' : ''}`;
    $('#stadium-list').innerHTML = results.map(item => `<a class="stadium-card" href="#stadium/${escape(item.id)}" aria-label="Explore ${escape(item.school)}: ${escape(item.stadium)}, two aerial views"><div class="card-image"><img src="${escape(item.views[0].src)}" width="1672" height="941" alt="${escape(item.views[0].alt)}"><span class="card-viewcount">2 AERIAL VIEWS</span></div><div class="card-body"><div class="card-topline"><span>UNIVERSITY OF OREGON</span><span class="card-no">01</span></div><h3 class="school-name">${escape(item.school)}</h3><p class="card-stadium">${escape(item.stadium)}</p><p class="card-place">${escape(item.city)}, ${escape(item.state)}</p><div class="card-bottom"><span>Explore stadium</span><span class="card-arrow" aria-hidden="true">↗</span></div></div></a>`).join('');
    $('#empty-state').hidden = results.length > 0;
    $('#empty-copy').textContent = query ? `No match for “${query}”${letter !== 'All' ? ` among schools starting with ${letter}` : ''}. The collection currently includes Oregon’s Autzen Stadium.` : `No schools starting with ${letter} have been added yet. Oregon’s Autzen Stadium is the first in the collection.`;
  }
  function resetFilters() { letter = 'All'; query = ''; input.value = ''; renderResults(); }
  input.addEventListener('input', () => { query = input.value; renderResults(); });
  $('.search-form').addEventListener('submit', event => { event.preventDefault(); input.blur(); });
  $('#clear-search').addEventListener('click', () => { query = ''; input.value = ''; renderResults(); input.focus(); });
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#show-all').addEventListener('click', () => { resetFilters(); input.focus(); });

  function changeView(index) {
    view = index;
    const image = catalog[0].views[view];
    $('#detail-image').src = image.src;
    $('#detail-image').alt = image.alt;
    $('#open-viewer').setAttribute('aria-label', `Open ${image.title.toLowerCase()} full screen`);
    $$('.view-tab').forEach(button => { const active = Number(button.dataset.view) === view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    if (dialog.open) updateViewerImage();
  }
  $$('.view-tab').forEach(button => button.addEventListener('click', () => changeView(Number(button.dataset.view))));

  function route() {
    const match = location.hash.match(/^#stadium\/oregon-autzen(?:\/view\/([12]))?$/);
    const showDetail = Boolean(match);
    if (showDetail && !wasDetail) homeScroll = window.scrollY;
    home.hidden = showDetail;
    detail.hidden = !showDetail;
    document.title = showDetail ? 'Autzen Stadium · Stadium Atlas' : 'Stadium Atlas · College football from above';
    if (showDetail && !wasDetail) { window.scrollTo({top:0,behavior:'instant'}); $('#detail-title').focus({preventScroll:true}); }
    if (match?.[1]) {
      view = Number(match[1]) - 1;
      changeView(view);
      if (!dialog.open) {
        priorFocus = document.activeElement;
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
      window.scrollTo({top:homeScroll,behavior:'instant'});
      $('.stadium-card')?.focus({preventScroll:true});
    }
    wasDetail = showDetail;
  }
  function closeViewer() {
    if (!dialog.open) return;
    if (viewerHistoryEntry) history.back();
    else { history.replaceState(null, '', '#stadium/oregon-autzen'); route(); }
  }
  $('#open-viewer').addEventListener('click', () => { viewerHistoryEntry = true; location.hash = `stadium/oregon-autzen/view/${view + 1}`; });
  $('#close-viewer').addEventListener('click', closeViewer);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  window.addEventListener('hashchange', route);
  $$('.viewer-switch button').forEach(button => button.addEventListener('click', () => {
    history.replaceState(null, '', `#stadium/oregon-autzen/view/${Number(button.dataset.viewerView) + 1}`);
    changeView(Number(button.dataset.viewerView));
  }));

  // Fit preserves the whole image. The upper zoom bound is the source's native dimensions.
  let fit = 1, scale = 1, x = 0, y = 0, stageWidth = 1, stageHeight = 1;
  const pointers = new Map();
  let gesture = null;
  let lastTap = {time:0,x:0,y:0};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const maxScale = () => Math.max(1, 1 / fit);
  function constrain() {
    const image = catalog[0].views[view];
    x = clamp(x, -Math.max(0, (image.width * fit * scale - stageWidth) / 2), Math.max(0, (image.width * fit * scale - stageWidth) / 2));
    y = clamp(y, -Math.max(0, (image.height * fit * scale - stageHeight) / 2), Math.max(0, (image.height * fit * scale - stageHeight) / 2));
  }
  function paint() {
    constrain();
    viewerImage.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
    stage.classList.toggle('can-pan', scale > 1.01);
  }
  function fitImage() {
    const rect = stage.getBoundingClientRect();
    stageWidth = Math.max(1, rect.width);
    stageHeight = Math.max(1, rect.height);
    const image = catalog[0].views[view];
    fit = Math.min(stageWidth / image.width, stageHeight / image.height, 1);
    viewerImage.style.width = `${image.width * fit}px`;
    viewerImage.style.height = `${image.height * fit}px`;
    scale = 1; x = 0; y = 0;
    pointers.clear(); gesture = null;
    stage.classList.remove('is-dragging');
    paint();
  }
  function updateViewerImage() {
    const image = catalog[0].views[view];
    viewerImage.src = image.src; viewerImage.alt = image.alt;
    $('#viewer-title').textContent = image.title;
    $$('.viewer-switch button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.viewerView) === view)));
    $('#viewer-announcement').textContent = `${image.title}. Full image fitted to screen. Zoom stops at the original image size.`;
    fitImage();
  }
  function localPoint(clientX, clientY) { const rect = stage.getBoundingClientRect(); return {x:clientX - rect.left - rect.width / 2,y:clientY - rect.top - rect.height / 2}; }
  function zoomTo(next, anchor = {x:0,y:0}) {
    next = clamp(next, 1, maxScale());
    const ratio = next / scale;
    x = anchor.x - (anchor.x - x) * ratio;
    y = anchor.y - (anchor.y - y) * ratio;
    scale = next;
    paint();
  }
  function toggleZoom(point) { if (scale > 1.01) { scale = 1; x = y = 0; paint(); } else zoomTo(Math.min(maxScale(), 2.5), point); }
  $('#fit-image').addEventListener('click', () => { fitImage(); $('#viewer-announcement').textContent = 'Full image fitted to screen.'; });
  viewerImage.addEventListener('load', () => { if (dialog.open) fitImage(); });
  new ResizeObserver(() => { if (dialog.open) fitImage(); }).observe(stage);
  stage.addEventListener('wheel', event => { event.preventDefault(); const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stageHeight : 1); zoomTo(scale * Math.exp(-delta * .002), localPoint(event.clientX,event.clientY)); }, {passive:false});
  stage.addEventListener('dblclick', event => { event.preventDefault(); toggleZoom(localPoint(event.clientX,event.clientY)); });
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
    stage.focus({preventScroll:true});
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, localPoint(event.clientX,event.clientY));
    if (pointers.size > 1) lastTap.time = 0;
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
      scale=clamp(gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance,1,maxScale());
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
    if (event.type === 'pointerup' && event.pointerType === 'touch' && pointers.size === 1 && gesture?.kind === 'pan') {
      const point=localPoint(event.clientX,event.clientY);
      if (Math.hypot(point.x-gesture.start.x,point.y-gesture.start.y)<8) {
        const now=performance.now();
        if (now-lastTap.time<300 && Math.hypot(point.x-lastTap.x,point.y-lastTap.y)<24) { toggleZoom(point); lastTap.time=0; }
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
    const actions = {'+':()=>zoomTo(scale*1.25),'=':()=>zoomTo(scale*1.25),'-':()=>zoomTo(scale/1.25),'0':fitImage,ArrowLeft:()=>{x+=65;paint();},ArrowRight:()=>{x-=65;paint();},ArrowUp:()=>{y+=65;paint();},ArrowDown:()=>{y-=65;paint();}};
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  const fullscreenButton = $('#fullscreen-toggle');
  fullscreenButton.hidden = !document.documentElement.requestFullscreen;
  fullscreenButton.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { $('#viewer-announcement').textContent = 'Device full screen is unavailable. The image viewer is already using the available screen.'; }
  });
  document.addEventListener('fullscreenchange', () => { fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit device full screen' : 'Enter device full screen'); if(dialog.open) fitImage(); });
  renderResults(); route();
})();
