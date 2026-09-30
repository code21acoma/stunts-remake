// Ukládání: vlastní tratě do složky myTracks/ (přes server), rekordy + duchové, nastavení a rozpracovaná
// trať editoru do localStorage prohlížeče. Všechny přístupy jsou chráněné.
const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export function trackHash(tiles) {
  const s = JSON.stringify(tiles.filter(t => t.type !== 'trees' && t.type !== 'house').map(t => [t.type, t.x, t.y, t.rot, t.e]).sort());
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Vlastní tratě: přes náš server (tools/server.py) se ukládají jako soubory do složky myTracks/
// a hra je při spuštění načte. Bez serveru (jiný HTTP server) záložně do localStorage prohlížeče.
let fileTracks = null;          // null = zápis do složky myTracks není dostupný (není náš server)
let siteTracks = [];            // tratě z myTracks/index.json jen pro čtení (web bez našeho serveru)
const api = (method, path = '', body) => fetch('api/tracks' + path, {
  method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
}).then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));

export const Store = {
  // načte tratě ze složky myTracks; stávající tratě z prohlížeče do ní jednou přesune
  async init() {
    try {
      const list = await api('GET');
      if (!Array.isArray(list)) throw new Error('není seznam');
      fileTracks = list;
      const local = get('stunts.tracks', []);
      for (const t of local) if (!fileTracks.some(x => x.id === t.id)) await this.saveTrack(t);
      if (local.length) set('stunts.tracks', []);
      return { files: true, moved: local.length };
    } catch {
      fileTracks = null;
      // web bez našeho serveru: tratě ze složky myTracks podle seznamu index.json (jen pro čtení)
      try {
        const files = await fetch('myTracks/index.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : []));
        const loaded = await Promise.all(files.map(fn => fetch('myTracks/' + encodeURIComponent(fn), { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null)).catch(() => null)));
        siteTracks = loaded.filter(t => t && Array.isArray(t.tiles))
          .map((t, i) => ({ ...t, id: t.id || 'f_' + files[i], name: t.name || files[i].replace(/\.json$/i, ''), file: files[i], readonly: true }));
      } catch { siteTracks = []; }
      return { files: false, site: siteTracks.length };
    }
  },
  get usesFiles() { return fileTracks !== null; },
  // bez serveru: vlastní tratě z prohlížeče + tratě ze složky (stejné id z prohlížeče má přednost)
  tracks: () => {
    if (fileTracks) return fileTracks;
    const local = get('stunts.tracks', []);
    return [...local, ...siteTracks.filter(s => !local.some(l => l.id === s.id))];
  },
  // vrací název souboru (nebo null při uložení jen do prohlížeče)
  async saveTrack(t) {
    const clean = { id: t.id, name: t.name, tiles: t.tiles };
    if (fileTracks !== null) {
      const { file } = await api('PUT', '', clean);
      fileTracks = fileTracks.filter(x => x.id !== t.id);
      fileTracks.unshift({ ...clean, file });
      return file;
    }
    const all = get('stunts.tracks', []).filter(x => x.id !== t.id);
    all.unshift(clean);
    set('stunts.tracks', all);
    return null;
  },
  async deleteTrack(id) {
    if (fileTracks !== null) {
      await api('DELETE', '/' + encodeURIComponent(id));
      fileTracks = fileTracks.filter(x => x.id !== id);
    } else set('stunts.tracks', get('stunts.tracks', []).filter(x => x.id !== id));
  },
  draft: () => get('stunts.draft', null),
  saveDraft: t => set('stunts.draft', t),
  settings: () => ({ car: 'gt', laps: 1, ghost: true, muted: false, ...get('stunts.settings', {}) }),
  saveSettings: s => set('stunts.settings', s),
  bestKey: (tiles, laps) => 'stunts.best.' + trackHash(tiles) + '.' + laps,
  best(tiles, laps) { return get(this.bestKey(tiles, laps), null); },
  saveBest(tiles, laps, rec) {
    if (!set(this.bestKey(tiles, laps), rec)) { rec.ghost = null; set(this.bestKey(tiles, laps), rec); }
  },
  encode(t) {
    const o = { n: t.name, t: t.tiles.map(x => [x.type, x.x, x.y, x.rot, x.e || 0, x.seed || 0, ...(x.text ? [x.text] : [])]) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  },
  decode(code) {
    const o = JSON.parse(decodeURIComponent(escape(atob(code))));
    return { id: 'c_' + Date.now(), name: o.n, tiles: o.t.map(([type, x, y, rot, e, seed, text]) => ({ type, x, y, rot, e, ...(seed ? { seed } : {}), ...(text ? { text } : {}) })) };
  },
};
