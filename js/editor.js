// Editor tratí: mřížka 40×40, paleta dílků, otáčení, patra, uložení/export.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PIECES, GROUPS, TEXT_PIECES, GRID, T, H, tileCells, key, wallMask } from './defs.js';
import { Track, cellCenter, worldToCell, HALF_MAP } from './track.js';
import { buildPiece, finalizePiece, BILLBOARD_DEFAULT, ROAD_TEXT_DEFAULT } from './pieces.js';
import { BUILTIN } from './tracks.js';
import { Store } from './store.js';

const $ = id => document.getElementById(id);

export class Editor {
  constructor(app) {
    this.app = app;
    this.world = app.world;
    this.tool = 'straight';
    this.rot = 0;
    this.e = 0;
    this.active = false;
    this.undo = [];
    this.redo = [];
    this.hover = null;
    this.data = { id: 'c_' + Date.now(), name: 'Moje trať', tiles: [] };

    const cam = this.world.camera;
    this.controls = new OrbitControls(cam, this.world.renderer.domElement);
    Object.assign(this.controls, { enableDamping: true, maxPolarAngle: 1.5, minDistance: 30, maxDistance: 2600, screenSpacePanning: false, zoomToCursor: true, enabled: false });
    // pravé tlačítko = natáčení všemi směry, stisknuté kolečko = posun, otáčení kolečkem = zoom
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.texts = { billboard: BILLBOARD_DEFAULT, roadText: ROAD_TEXT_DEFAULT };   // poslední text pro dílky s nápisem

    const grid = this.grid = new THREE.GridHelper(GRID * T, GRID, 0xffffff, 0xffffff);
    grid.material.transparent = true; grid.material.opacity = 0.22; grid.position.y = 0.15;
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(GRID * T, 0.01, GRID * T)), new THREE.LineBasicMaterial({ color: 0xffc53d }));
    border.position.y = 0.2; grid.add(border);
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    this.errMark = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.ghostMat = new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x114466, transparent: true, opacity: 0.55, depthWrite: false });
    this.badMat = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0x440000, transparent: true, opacity: 0.5, depthWrite: false });
    this.ghost = null;
    // šipky směru jízdy nad dílkem Start/Cíl (jen v editoru)
    const sh = new THREE.Shape([[-1.6, 9], [1.6, 9], [1.6, -1], [4.8, -1], [0, -9], [-4.8, -1], [-1.6, -1]].map(([x, y]) => new THREE.Vector2(x, y)));
    this.arrowGeo = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);   // hrot míří k +z (směr jízdy dílku se startem)
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
    this.startArrow = new THREE.Group();
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.buildUI();
    this.bind();
  }

  buildUI() {
    const mk = (id, cont) => {
      const d = PIECES[id];
      const b = document.createElement('button');
      b.className = 'pbtn'; b.dataset.tool = id;
      b.innerHTML = `<span>${d.icon}</span>${d.name}`;
      b.onclick = () => this.setTool(id);
      cont.appendChild(b);
    };
    // kategorie (sbalitelné; stav sbalení si pamatuje prohlížeč)
    let folded = {};
    try { folded = JSON.parse(localStorage.getItem('stunts.edFolded') || '{}'); } catch { /* bez úložiště */ }
    const listed = new Set(GROUPS.flatMap(g => g[2]));
    const others = Object.keys(PIECES).filter(id => !PIECES[id].hidden && !listed.has(id));
    const groups = others.length ? [...GROUPS, ['other', 'Ostatní', others]] : GROUPS;
    for (const [gid, title, ids] of groups) {
      const head = document.createElement('button');
      head.className = 'ed-group ed-fold' + (folded[gid] ? ' folded' : '');
      head.innerHTML = `<span class="ed-arrow">▾</span>${title} <small>${ids.length}</small>`;
      const pal = document.createElement('div');
      pal.className = 'palette' + (folded[gid] ? ' hidden' : '');
      head.onclick = () => {
        folded[gid] = !folded[gid];
        head.classList.toggle('folded', !!folded[gid]); pal.classList.toggle('hidden', !!folded[gid]);
        try { localStorage.setItem('stunts.edFolded', JSON.stringify(folded)); } catch { /* bez úložiště */ }
      };
      $('edPalette').append(head, pal);
      for (const id of ids) if (PIECES[id] && !PIECES[id].hidden) mk(id, pal);
    }
    $('edErase').onclick = () => this.setTool('erase');
    $('edRot').onclick = () => this.rotate();
    $('edUp').onclick = () => this.setE(this.e + 1);
    $('edDown').onclick = () => this.setE(this.e - 1);
    $('edNew').onclick = () => this.app.dialog('Nová trať', '<p>Smazat aktuální rozpracovanou trať a začít znovu?</p>', [['Zrušit'], ['Nová trať', () => { this.load({ id: 'c_' + Date.now(), name: 'Moje trať', tiles: [] }); }, true]]);
    $('edSave').onclick = () => this.save();
    $('edUndo').onclick = () => this.doUndo();
    $('edRedo').onclick = () => this.doRedo();
    $('edCenter').onclick = () => this.centerView();
    $('edOpen').onclick = () => this.openDialog();
    $('edExport').onclick = () => this.exportDialog();
    $('edImport').onclick = () => this.importDialog();
    $('edTest').onclick = () => this.test();
    $('edMenu').onclick = () => this.app.showMenu();
    $('edName').oninput = e => { this.data.name = e.target.value; };
    this.setTool('straight');
  }

  bind() {
    const el = this.world.renderer.domElement;
    let painting = false, lastCell = null;
    el.addEventListener('pointermove', e => {
      if (!this.active) return;
      this.updateHover(e);
      if (painting && this.hover && (!lastCell || lastCell !== key(...this.hover))) {
        lastCell = key(...this.hover);
        this.apply(e.shiftKey, false);
      }
    });
    el.addEventListener('pointerdown', e => {
      if (!this.active || e.button !== 0) return;
      this.updateHover(e);
      painting = !TEXT_PIECES[this.tool]; lastCell = this.hover ? key(...this.hover) : null;
      this.apply(e.shiftKey, true);
    });
    window.addEventListener('pointerup', () => { painting = false; });
    el.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (!this.active || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || this.app.dialogOpen) return;
      const k = e.key.toLowerCase();
      if (k === 'r') this.rotate();
      else if (k === 'e' || k === 'pageup') this.setE(this.e + 1);
      else if (k === 'q' || k === 'pagedown') this.setE(this.e - 1);
      else if (k === 'x') this.setTool(this.tool === 'erase' ? this.lastTool || 'straight' : 'erase');
      else if (k === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); this.doRedo(); }
      else if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.doUndo(); }
      else if (k === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.doRedo(); }
      else if (k === 'f') this.pickHovered();
      else if (k === 'delete') this.deleteHovered();
      else if (k === 'home') this.centerView();
      else if (k === 'escape') this.app.showMenu();
    });
  }

  // F: vezme dílek pod kurzorem (typ, otočení, patro, text billboardu) jako aktuální nástroj
  pickHovered() {
    const t = this.hover && this.track.cellMap.get(key(...this.hover));
    if (!t) return;
    this.rot = t.rot || 0; $('edRotV').textContent = this.rot * 90 + '°';
    if (PIECES[t.type].cat !== 'deco') this.setE(t.e || 0);
    if (TEXT_PIECES[t.type] && t.text) this.texts[t.type] = t.text;
    this.setTool(t.type);
    this.app.toast('Vybráno: ' + PIECES[t.type].name);
  }

  // Delete: smaže dílek pod kurzorem
  deleteHovered() {
    const t = this.hover && this.track.cellMap.get(key(...this.hover));
    if (!t) return;
    this.snapshot(); this.track.removeTile(t); this.changed(); this.refreshGhost();
  }

  // pohled na celou herní plochu: plynulý přelet na střed mapy (výchozí nadhled, sever nahoře)
  centerView() {
    const c = this.controls, cam = this.world.camera;
    const fromT = c.target.clone(), fromP = cam.position.clone();
    const toT = new THREE.Vector3(0, 0, 0), toP = new THREE.Vector3(0, 340, 300);
    const t0 = performance.now(), dur = 450;
    cancelAnimationFrame(this._centerRaf);
    const step = now => {
      const u = Math.min(1, (now - t0) / dur), s = u * u * (3 - 2 * u);
      c.target.lerpVectors(fromT, toT, s); cam.position.lerpVectors(fromP, toP, s); c.update();
      if (u < 1) this._centerRaf = requestAnimationFrame(step);
    };
    this._centerRaf = requestAnimationFrame(step);
  }

  keysPan(dt, keys) {
    const c = this.controls, cam = this.world.camera;
    const f = new THREE.Vector3().subVectors(c.target, cam.position); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const sp = cam.position.distanceTo(c.target) * 0.9 * dt;
    const mv = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) mv.add(f);
    if (keys.has('KeyS') || keys.has('ArrowDown')) mv.sub(f);
    if (keys.has('KeyD') || keys.has('ArrowRight')) mv.add(r);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mv.sub(r);
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(sp); c.target.add(mv); cam.position.add(mv); }
  }

  setTool(t) {
    if (t !== 'erase') this.lastTool = t;
    this.tool = t;
    document.querySelectorAll('#editorUI .pbtn').forEach(b => b.classList.toggle('on', (b.dataset.tool || (b.id === 'edErase' ? 'erase' : '')) === t));
    this.refreshGhost();
  }
  rotate() { this.rot = (this.rot + 1) % 4; $('edRotV').textContent = this.rot * 90 + '°'; this.refreshGhost(); }
  setE(e) { this.e = Math.max(0, Math.min(3, e)); $('edEV').textContent = this.e; this.refreshGhost(); }

  open(data) {
    this.active = true;
    $('editorUI').classList.remove('hidden');
    this.world.scene.add(this.grid, this.cursor, this.errMark, this.startArrow);
    this.controls.enabled = true;
    this.world.setShadowSize(420);
    this.world.focusShadow(new THREE.Vector3());
    if (data) this.load(data);
    else if (!this.track) this.load(Store.draft() || this.data);
    else this.world.scene.add(this.track.group);
    const cam = this.world.camera;
    cam.up.set(0, 1, 0);
    if (!this.camSet) { cam.position.set(0, 340, 300); this.controls.target.set(0, 0, 0); this.camSet = true; }
    this.controls.update();
    this.updateStatus();
  }

  close() {
    this.active = false;
    $('editorUI').classList.add('hidden');
    this.world.scene.remove(this.grid, this.cursor, this.errMark, this.startArrow);
    if (this.ghost) { this.world.scene.remove(this.ghost); }
    if (this.track) this.world.scene.remove(this.track.group);
    this.controls.enabled = false;
    Store.saveDraft(this.data);
  }

  load(data, keepUndo = false) {
    if (this.track) { this.world.scene.remove(this.track.group); this.track.dispose(); }
    this.data = { id: data.id || 'c_' + Date.now(), name: data.name || 'Moje trať', tiles: data.tiles.filter(t => PIECES[t.type]).map(t => ({ ...t })) };
    if (!keepUndo) { this.undo = []; this.redo = []; }
    this.track = new Track(this.data, this.world.M);
    if (this.active) this.world.scene.add(this.track.group);
    $('edName').value = this.data.name;
    this.updateStatus();
    this.updateUndoUI();
    Store.saveDraft(this.data);
  }

  // historie změn: snapshot() před každou úpravou; zpět (Ctrl+Z) / vpřed (Ctrl+Y, Ctrl+Shift+Z)
  snapshot() {
    this.undo.push(JSON.stringify(this.data.tiles));
    if (this.undo.length > 100) this.undo.shift();
    this.redo = [];
    this.updateUndoUI();
  }
  doUndo() {
    const s = this.undo.pop();
    if (!s) return;
    this.redo.push(JSON.stringify(this.data.tiles));
    this.load({ ...this.data, tiles: JSON.parse(s) }, true);
  }
  doRedo() {
    const s = this.redo.pop();
    if (!s) return;
    this.undo.push(JSON.stringify(this.data.tiles));
    this.load({ ...this.data, tiles: JSON.parse(s) }, true);
  }
  updateUndoUI() {
    const u = $('edUndo'), r = $('edRedo');
    if (!u) return;
    u.disabled = !this.undo.length; r.disabled = !(this.redo && this.redo.length);
    u.title = `Zpět (Ctrl+Z) – ${this.undo.length} kroků`; r.title = `Vpřed (Ctrl+Y) – ${this.redo ? this.redo.length : 0} kroků`;
  }

  updateHover(e) {
    const r = this.world.renderer.domElement.getBoundingClientRect();
    this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.world.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.e * H);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, p)) { this.hover = null; return; }
    const [x, y] = worldToCell(p.x, p.z);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) { this.hover = null; this.refreshGhost(); return; }
    if (!this.hover || this.hover[0] !== x || this.hover[1] !== y) { this.hover = [x, y]; this.refreshGhost(); }
  }

  candidate() {
    if (!this.hover || this.tool === 'erase') return null;
    const def = PIECES[this.tool];
    let e = def.cat === 'deco' ? 0 : this.e;
    if (def.minE) e = Math.max(e, def.minE);
    if (def.maxE !== undefined) e = Math.min(e, def.maxE);
    const t = { type: this.tool, x: this.hover[0], y: this.hover[1], rot: this.rot, e };
    if (TEXT_PIECES[t.type]) t.text = this.texts[t.type];
    return t;
  }

  inBounds(t) { return tileCells(t).every(([x, y]) => x >= 0 && y >= 0 && x < GRID && y < GRID); }

  refreshGhost() {
    if (this.ghost) { this.world.scene.remove(this.ghost); this.ghost.traverse(o => o.geometry && !o.userData.shared && o.geometry.dispose()); this.ghost = null; }
    this.cursor.visible = !!this.hover;
    if (!this.hover || !this.active) return;
    const c = cellCenter(...this.hover);
    const t = this.candidate();
    const cells = t ? tileCells(t) : [this.hover];
    const xs = cells.map(q => q[0]), ys = cells.map(q => q[1]);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * T, h = (Math.max(...ys) - Math.min(...ys) + 1) * T;
    const cc = cellCenter((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2);
    this.cursor.scale.set(w, 1, h);
    this.cursor.position.set(cc.x, 0.25, cc.z);
    this.cursor.material.color.set(this.tool === 'erase' ? 0xff5050 : 0xffffff);
    if (!t) return;
    const ok = this.inBounds(t);
    const b = buildPiece(t, { wallMask: t.type === 'wall' ? wallMask(this.track.cellMap, t.x, t.y) : 0, withCones: true });
    const { group } = finalizePiece(b, t, this.world.M, c, { ghost: ok ? this.ghostMat : this.badMat });
    group.position.y = 0.05;
    if (t.type === 'start') this.arrowsFor(t, group);
    this.ghost = group;
    this.world.scene.add(group);
  }

  apply(erase, click) {
    if (!this.hover) return;
    if (erase || this.tool === 'erase') {
      const t = this.track.cellMap.get(key(...this.hover));
      if (t) { this.snapshot(); this.track.removeTile(t); this.changed(); }
      return;
    }
    const t = this.candidate();
    if (!t || !this.inBounds(t)) return;
    if (TEXT_PIECES[t.type]) { if (click) this.textDialog(t); return; }
    // stejný dílek už tam je?
    const same = this.track.cellMap.get(key(t.x, t.y));
    if (same && same.type === t.type && same.rot === t.rot && same.e === t.e && same.x === t.x && same.y === t.y) return;
    this.snapshot();
    const over = new Set();
    for (const [x, y] of tileCells(t)) { const o = this.track.cellMap.get(key(x, y)); if (o) over.add(o); }
    for (const o of over) this.track.removeTile(o);
    if (t.type === 'trees' || t.type === 'house') t.seed = Math.floor(Math.random() * 1e6);
    this.track.addTile(t);
    this.changed();
  }

  // dílky s textem (billboard, nápis na silnici): zadání textu při položení, kliknutím na existující dílek se text upraví
  textDialog(t) {
    const def = TEXT_PIECES[t.type];
    const old = this.track.cellMap.get(key(t.x, t.y));
    const edit = old && old.type === t.type ? old : null;
    const cur = edit ? edit.text || def.def : this.texts[t.type];
    const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const ok = () => {
      const text = (document.getElementById('bbText').value || '').trim().slice(0, def.max) || def.def;
      this.texts[t.type] = text;
      this.snapshot();
      if (edit) { this.track.removeTile(edit); this.track.addTile({ ...edit, text }); }
      else {
        const over = new Set();
        for (const [x, y] of tileCells(t)) { const o = this.track.cellMap.get(key(x, y)); if (o) over.add(o); }
        for (const o of over) this.track.removeTile(o);
        this.track.addTile({ ...t, text });
      }
      this.changed(); this.refreshGhost();
    };
    this.app.dialog(edit ? `Upravit ${def.title}` : `Nový ${def.title}`, `<p>${def.label} (max. ${def.max} znaků):</p><input id="bbText" maxlength="${def.max}" value="${esc(cur)}" style="width:100%;font-size:18px;padding:8px;box-sizing:border-box">`,
      [['Zrušit'], [edit ? 'Uložit' : 'Umístit', ok, true]]);
    const inp = document.getElementById('bbText');
    inp.focus(); inp.select();
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); this.app.closeDialog(); ok(); } };
  }

  changed() {
    this.updateStatus();
    Store.saveDraft(this.data);
  }

  // dvě šipky ve směru jízdy na dílku (dílek Start/Cíl se projíždí od severní strany k jižní, tj. k +z)
  arrowsFor(t, group, mat = this.arrowMat) {
    const c = cellCenter(t.x, t.y), a = -(t.rot || 0) * Math.PI / 2;
    for (const z of [-11, 11]) {
      const m = new THREE.Mesh(this.arrowGeo, mat);
      m.position.set(c.x + z * Math.sin(a), (t.e || 0) * H + 0.45, c.z + z * Math.cos(a));
      m.rotation.y = a;
      m.renderOrder = 5; m.userData.shared = true;
      group.add(m);
    }
  }

  updateStartArrow() {
    this.startArrow.clear();
    for (const t of this.data.tiles) if (t.type === 'start') this.arrowsFor(t, this.startArrow);
  }

  updateStatus() {
    if (!this.track) return;
    this.updateStartArrow();
    const a = this.track.analysis;
    const st = $('edStatus');
    this.errMark.visible = false;
    if (a.closed) {
      st.className = 'ed-status ok';
      st.textContent = `✓ Trať je uzavřená – ${a.order.length} dílků, ${(a.order.length * T / 1000).toFixed(1)} km`;
    } else {
      st.className = 'ed-status bad';
      st.textContent = '✗ ' + (a.error || 'Trať není uzavřená') + (a.errCell ? ` (pole ${a.errCell[0] + 1}, ${a.errCell[1] + 1})` : '');
      if (a.errCell) {
        const c = cellCenter(...a.errCell);
        this.errMark.position.set(c.x, 30, c.z);
        this.errMark.visible = true;
      }
    }
  }

  update(dt, keys) {
    if (!this.active) return;
    this.keysPan(dt, keys);
    this.controls.update();
    this.errMark.material.opacity = 0.25 + 0.2 * Math.sin(performance.now() / 200);
    this.world.focusShadow(this.controls.target);
  }

  // uložení do složky myTracks (přes server), jinak záložně do prohlížeče
  async save() {
    this.data.name = $('edName').value.trim() || 'Moje trať';
    if (this.data.id.startsWith('b_') || BUILTIN.some(b => b.id === this.data.id)) this.data.id = 'c_' + Date.now();
    try {
      const file = await Store.saveTrack(this.data);
      this.app.toast(file ? `Uloženo: myTracks/${file}` : 'Uloženo jen v prohlížeči – pro ukládání do myTracks spusť hru přes start.bat');
    } catch (e) {
      this.app.toast('Uložení se nepovedlo: ' + e.message);
    }
  }

  test() {
    this.data.name = $('edName').value.trim() || 'Moje trať';
    const a = this.track.analysis;
    const go = () => this.app.startRace(JSON.parse(JSON.stringify(this.data)), { fromEditor: true });
    if (!a.closed) this.app.dialog('Trať není uzavřená', `<p>${a.error || ''}</p><p>Můžeš ji projet ve volné jízdě bez měření času.</p>`, [['Zpět'], ['Volná jízda', go, true]]);
    else go();
  }

  openDialog() {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const items = [
      ...Store.tracks().map(t => ({ t, label: '📁 ' + esc(t.name) + (t.file ? ` <small class="muted">myTracks/${esc(t.file)}</small>` : ''), del: !t.readonly })),
      ...BUILTIN.map(t => ({ t, label: '⭐ ' + esc(t.name) + ' (předloha)' })),
    ];
    const html = '<div class="list">' + items.map((it, i) => `<div class="row"><button class="btn" style="flex:1" data-i="${i}">${it.label}</button>${it.del ? `<button class="btn sm" data-d="${i}">🗑</button>` : ''}</div>`).join('') + '</div>';
    this.app.dialog('Otevřít trať', html, [['Zavřít']]);
    document.querySelectorAll('#dlgBody [data-i]').forEach(b => b.onclick = () => {
      const it = items[+b.dataset.i];
      const d = JSON.parse(JSON.stringify(it.t));
      if (!it.del) { d.id = 'c_' + Date.now(); d.name = it.t.name + ' (kopie)'; }
      this.load(d); this.app.closeDialog();
    });
    document.querySelectorAll('#dlgBody [data-d]').forEach(b => b.onclick = () => {
      const t = items[+b.dataset.d].t;
      this.app.closeDialog();
      this.app.dialog('Smazat trať', `<p>Opravdu smazat „${esc(t.name)}“${t.file ? ` (soubor myTracks/${esc(t.file)})` : ''}?</p>`, [
        ['Ne', () => this.openDialog()],
        ['Smazat', async () => {
          try { await Store.deleteTrack(t.id); } catch (e) { this.app.toast('Smazání se nepovedlo: ' + e.message); }
          this.openDialog();
        }, true]]);
    });
  }

  exportDialog() {
    const code = Store.encode(this.data);
    this.app.dialog('Export trati', `<p>Zkopíruj kód a pošli ho kamarádům:</p><textarea readonly id="expCode">${code}</textarea>`, [['Zavřít'], ['Kopírovat', () => { navigator.clipboard?.writeText(code); this.app.toast('Zkopírováno'); }, true]]);
  }

  importDialog() {
    this.app.dialog('Import trati', '<p>Vlož kód trati:</p><textarea id="impCode"></textarea>', [['Zrušit'], ['Importovat', () => {
      try {
        const d = Store.decode(document.getElementById('impCode').value.trim());
        this.load(d); this.app.toast('Trať načtena');
      } catch (err) { this.app.toast('Neplatný kód trati'); }
    }, true]]);
  }
}

export { HALF_MAP };
