/* ════════════════════════════════════════════════════════════════════
   boot
   ════════════════════════════════════════════════════════════════════ */
// open the last session; first run on this version moves the old single drawing into Session 1
async function boot() {
  const prefs = isLab ? {} : loadPrefs();          // lab and test runs start from the same demo and settings every time
  if (isLab || !await DB.open()) {
    seedDemo();
    if (!isLab) { prefsReady = !prefs.legacy; setTimeout(() => toast('Sessions need browser storage, which is turned off here'), 400); }
  } else {
    try {
      await listSessions();
      const cur = sessions.find(s => s.id === prefs.cur) || sessions[0];
      if (prefs.legacy) {
        session = newMeta(nextName()); sessions.unshift(session);
        doc = await docFromRecord(prefs.legacy); docDirty = true;
      } else if (cur) {
        session = cur;
        doc = await docFromRecord(await DB.get('docs', cur.id));
      } else {
        seedDemo();
        session = newMeta('Session 1'); sessions.unshift(session); docDirty = true;
      }
      if (docDirty) await saveNow();
      prefsReady = !(prefs.legacy && docDirty);       // a failed migration keeps the old drawing in place
      savePrefs();
      thumbT = setTimeout(saveThumb, 1200);            // refresh in case the app closed before the last one rendered
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { console.error(e); DB.ok = false; seedDemo(); toast("Saved sessions couldn't be read"); }
  }
  for (const L of doc.layers) dirty.add(L.id);
  const L0 = activeLayer();
  if (L0) { ui.brush = L0.brush; if (brushTool()) ui.tool = L0.brush; }
  updUndo();
  fit();
  updateResolution();
  renderPanel();
  afterChange();
  if (document.fonts) document.fonts.ready.then(refreshSegs);
}
boot();
// leaving the app (home button, app switcher): write now rather than after the debounce
addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
addEventListener('pagehide', () => saveNow());
window.__sm = { doc: () => doc, ui, request, setTool, exportPNG, export3DPNG, exportModel, T, view, applyView, zoomToPct, dirty, renderPanel, three, animate3D, heightGrid, render3D,
  closeup, placeCanvas, sel, selectAll, deleteSel, dropSel, screenToDoc, SC, lightOf, renderCanvas, compositeScreen,
  stamps(st, P) { const b = new FBuf(); strokeStamps(st, P, b, doc.w, doc.h, .5); return Array.from(b.a.subarray(0, b.n)); },
  setDoc(d) { doc = withLight(d); gcTargets(); for (const L of doc.layers) dirty.add(L.id); view.z = 1; fit(); updateResolution(); afterChange(); },
  demo() { seedDemo(); this.setDoc(doc); } };
if (/[?&]lab=/.test(location.search)) document.body.append(h('script', { src: 'dev/lab.js' }));   // local A/B against reference images (dev only)
if (/[?&]test\b/.test(location.search)) document.body.append(h('script', { src: 'dev/test.js' }));   // __sm.test checks (dev only)
})();
