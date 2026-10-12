(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const BUILD = '1.4.0';
  window.STADIUM_ATLAS_RUNTIME = {build:BUILD,ready:false,schools:0,views:0};
  const catalog = window.STADIUMS;
  const expectedBuild = document.documentElement.dataset.appBuild;
  const validCatalog = Array.isArray(catalog) && catalog.length === 24 && catalog.every(item => item && Array.isArray(item.views) && item.views.length === 2);
  if (expectedBuild !== BUILD || window.STADIUM_ATLAS_CATALOG_BUILD !== BUILD || !validCatalog) {
    let warning = document.getElementById('release-warning');
    if (!warning) {
      warning = document.createElement('section');
      warning.id = 'release-warning';
      warning.setAttribute('role','alert');
      document.body.prepend(warning);
    }
    warning.hidden = false;
    warning.innerHTML = '<strong>The update files need to match.</strong><p id="release-warning-message">Upload index.html, styles.css, app.js, and catalog.js from the same v1.4.0 code ZIP into the same app folder, replacing the older files, then reload.</p>';
    warning.style.cssText = 'display:block;padding:18px;margin:20px;background:#382f18;border:1px solid #dbc477;border-radius:4px;color:#fff3c8;font:14px/1.6 Arial,sans-serif;';
    if (document.getElementById('main')) document.getElementById('main').hidden = true;
    if (document.getElementById('home-view')) document.getElementById('home-view').hidden = true;
    if (document.getElementById('detail-view')) document.getElementById('detail-view').hidden = true;
    const failedDialog = document.getElementById('image-viewer');
    if (failedDialog) { if (failedDialog.open) failedDialog.close(); failedDialog.hidden = true; failedDialog.style.cssText = 'display:none!important'; }
    document.body.classList.remove('viewer-open');
    return;
  }
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
  let activeStadium = catalog[0];
  let wasDetail = false;
  let homeScroll = 0;
  let viewerHistoryEntry = false;
  let closingViewer = false;
  const selectedViews = new Map();
  $('.skip-link').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); $('#main').scrollIntoView({behavior:'instant'}); });
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const indexOf = item => catalog.indexOf(item) + 1;
  const imageOf = () => activeStadium.views[view];

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

  function matches(item) {
    const searchable = normalize([item.school, item.fullSchool, item.team, item.teamName, item.mascot, item.stadium, item.city, item.state, ...(item.aliases || [])].join(' '));
    return (letter === 'All' || item.school.toUpperCase().startsWith(letter)) && normalize(query).split(/\s+/).filter(Boolean).every(word => searchable.includes(word));
  }
  function renderResults() {
    const results = catalog.filter(matches).sort((a,b) => a.school.localeCompare(b.school));
    const views = results.reduce((sum,item) => sum + item.views.length, 0);
    $$('.letter').forEach(button => { const selected = button.dataset.letter === letter; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('#clear-search').hidden = !query;
    $('#reset-filters').hidden = !query && letter === 'All';
    $('#results-title').textContent = query ? 'Search results' : letter === 'All' ? 'The collection' : `${letter} · Schools`;
    $('#result-count').textContent = `${results.length} stadium${results.length === 1 ? '' : 's'}${results.length ? ` · ${views} views` : ''}`;
    $('#collection-total').textContent = String(catalog.length).padStart(3,'0');
    $('#collection-note-text').textContent = catalog.length === 1 ? 'Starting in Eugene. More home fields to come.' : `${catalog.length} home fields. ${catalog.reduce((sum,item) => sum + item.views.length,0)} perspectives. More to come.`;
    $('#stadium-list').classList.toggle('multi-stadium', catalog.length > 1);
    $('#stadium-list').innerHTML = results.map(item => `<a class="stadium-card" href="#stadium/${escape(item.id)}" aria-label="Explore ${escape(item.school)}: ${escape(item.stadium)}, ${item.views.length} aerial views"><div class="card-image"><img src="${escape(item.views[0].src)}" width="${item.views[0].width}" height="${item.views[0].height}" loading="lazy" decoding="async" alt="${escape(item.views[0].alt)}"><span class="card-viewcount">${item.views.length} AERIAL VIEWS</span></div><div class="card-body"><div class="card-topline"><span>${escape(item.fullSchool)}</span><span class="card-no">${String(indexOf(item)).padStart(2,'0')}</span></div><h3 class="school-name">${escape(item.school)}</h3><p class="card-stadium">${escape(item.stadium)}</p><p class="card-place">${escape(item.city)}, ${escape(item.state)}</p><div class="card-bottom"><span>Explore stadium</span><span class="card-arrow" aria-hidden="true">↗︎</span></div></div></a>`).join('');
    $('#empty-state').hidden = results.length > 0;
    $('#empty-copy').textContent = query ? `No match for “${query}”${letter !== 'All' ? ` among schools starting with ${letter}` : ''}. Try another school, stadium, or city, or show the full collection.` : `No schools starting with ${letter} have been added yet. Show all ${catalog.length} stadium${catalog.length === 1 ? '' : 's'} to keep exploring.`;
  }
  function resetFilters() { letter = 'All'; query = ''; input.value = ''; renderResults(); }
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
    $('#gallery-hint').textContent = `Two ways to see the home of the ${item.team}.`;
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
    $('#viewer-stadium').textContent = item.stadium;
    $('#viewer-era').textContent = `${item.artEra || '2024-era'} reconstruction`;
    $$('.view-tab').forEach((button,index) => {
      const image = item.views[index];
      const thumbnail = $('img',button);
      thumbnail.src = image.src;
      thumbnail.width = image.width;
      thumbnail.height = image.height;
    });
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
  $$('.view-tab').forEach(button => button.addEventListener('click', () => changeView(Number(button.dataset.view))));

  function route() {
    const match = location.hash.match(/^#stadium\/([a-z0-9-]+)(?:\/view\/([12]))?$/);
    const item = match && catalog.find(stadium => stadium.id === match[1]);
    const showDetail = Boolean(item);
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
      window.scrollTo({top:homeScroll,behavior:'instant'});
      $(`.stadium-card[href="#stadium/${activeStadium.id}"]`)?.focus({preventScroll:true});
    }
    wasDetail = showDetail;
    closingViewer = false;
  }
  function closeViewer() {
    if (!dialog.open || closingViewer) return;
    closingViewer = true;
    if (viewerHistoryEntry) history.back();
    else { history.replaceState(null, '', `#stadium/${activeStadium.id}`); route(); }
  }
  $('#open-viewer').addEventListener('click', () => {
    const from = `#stadium/${activeStadium.id}`;
    const viewer = `${from}/view/${view + 1}`;
    history.pushState({stadiumAtlasViewer:{from,viewer}}, '', viewer);
    route();
    // Use native full screen where available; the dialog already fills the viewport elsewhere.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { document.documentElement.requestFullscreen().then(() => { if (!dialog.open && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }).catch(() => {}); } catch {}
    }
  });
  $('#close-viewer').addEventListener('click', closeViewer);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  window.addEventListener('hashchange', route);
  function switchViewer(direction) {
    const nextView = (view + direction + activeStadium.views.length) % activeStadium.views.length;
    const viewer = `#stadium/${activeStadium.id}/view/${nextView + 1}`;
    history.replaceState(viewerHistoryEntry ? {stadiumAtlasViewer:{from:`#stadium/${activeStadium.id}`,viewer}} : null, '', viewer);
    changeView(nextView);
  }
  $('#viewer-prev').addEventListener('click', () => switchViewer(-1));
  $('#viewer-next').addEventListener('click', () => switchViewer(1));
  dialog.addEventListener('keydown', event => {
    if (event.target !== stage && (event.key === 'PageUp' || event.key === 'PageDown')) { event.preventDefault(); switchViewer(event.key === 'PageUp' ? -1 : 1); }
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
    const image = imageOf();
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
    const image = imageOf();
    fit = Math.min(stageWidth / image.width, stageHeight / image.height);
    viewerImage.style.width = `${image.width * fit}px`;
    viewerImage.style.height = `${image.height * fit}px`;
    scale = 1; x = 0; y = 0;
    pointers.clear(); gesture = null; gestureHadMultiple = false;
    lastTap = {time:0,x:0,y:0};
    stage.classList.remove('is-dragging');
    paint();
  }
  function updateViewerImage() {
    const image = imageOf();
    viewerImage.src = image.src; viewerImage.alt = image.alt;
    $('#viewer-title').textContent = image.title;
    const otherTitle = activeStadium.views[(view + 1) % activeStadium.views.length].title.toLowerCase();
    $('#viewer-prev').setAttribute('aria-label', `Previous view: ${otherTitle}`);
    $('#viewer-next').setAttribute('aria-label', `Next view: ${otherTitle}`);
    $('#viewer-announcement').textContent = `${image.title}, ${view + 1} of ${activeStadium.views.length}. Full image fitted to screen. Pinch or scroll to zoom, drag to explore. High magnification can look softer.`;
    fitImage();
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
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  document.addEventListener('fullscreenchange', () => { if(dialog.open) fitImage(); });
  renderResults(); route();
  window.STADIUM_ATLAS_RUNTIME = {build:BUILD,ready:true,schools:catalog.length,views:catalog.reduce((n,item)=>n+item.views.length,0)};
})();
