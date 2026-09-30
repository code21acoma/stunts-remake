# Jednoduchý vývojový server bez mezipaměti – prohlížeč vždy načte aktuální verzi skriptů.
# Navíc ukládá vlastní tratě do složky myTracks/ (jeden soubor JSON na trať):
#   GET    /api/tracks          → seznam tratí [{file, id, name, tiles, ...}]
#   PUT    /api/tracks          → uložit trať (tělo = JSON trati), vrací {file}
#   DELETE /api/tracks/<id>     → smazat trať podle id
# Zápis a mazání jsou povolené jen z tohoto počítače (localhost).
# Seznam souborů myTracks/index.json se obnovuje při startu i po každé změně – na webovém hostingu (bez
# tohoto serveru) z něj hra načte tratě jen pro čtení.
#   python tools/server.py [port]
import http.server
import json
import os
import re
import sys
import urllib.parse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TRACKS = os.path.join(ROOT, 'myTracks')


def read_tracks():
    out = []
    if not os.path.isdir(TRACKS):
        return out
    for fn in sorted(os.listdir(TRACKS)):
        if not fn.lower().endswith('.json') or fn.lower() == 'index.json':
            continue
        try:
            with open(os.path.join(TRACKS, fn), encoding='utf-8') as f:
                t = json.load(f)
            if isinstance(t, dict) and isinstance(t.get('tiles'), list):
                t['file'] = fn
                t.setdefault('id', 'f_' + os.path.splitext(fn)[0])
                t.setdefault('name', os.path.splitext(fn)[0])
                out.append(t)
        except Exception as e:  # poškozený soubor přeskočit
            print(f'myTracks/{fn}: nelze načíst ({e})')
    return out


def write_index():
    if not os.path.isdir(TRACKS):
        return
    files = [t['file'] for t in read_tracks()]
    with open(os.path.join(TRACKS, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(files, f, ensure_ascii=False, indent=1)


def safe_name(name):
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', str(name)).strip().strip('.')
    return (s or 'Trať')[:60]


def track_json(t):
    # čitelný formát: hlavička a jeden dílek na řádek
    head = {k: v for k, v in t.items() if k not in ('tiles', 'file')}
    tiles = ',\n'.join('    ' + json.dumps(x, ensure_ascii=False) for x in t['tiles'])
    body = json.dumps(head, ensure_ascii=False, indent=2)[:-2] if head else '{'
    return body + (',\n' if head else '\n') + '  "tiles": [\n' + tiles + '\n  ]\n}\n'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def local(self):
        return self.client_address[0] in ('127.0.0.1', '::1', '::ffff:127.0.0.1')

    def do_GET(self):
        if self.path.split('?')[0] == '/api/tracks':
            return self.send_json(200, read_tracks())
        return super().do_GET()

    def do_PUT(self):
        if self.path.split('?')[0] != '/api/tracks':
            return self.send_json(404, {'error': 'neznámá adresa'})
        if not self.local():
            return self.send_json(403, {'error': 'ukládat lze jen z tohoto počítače'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            t = json.loads(self.rfile.read(n).decode('utf-8'))
            if not isinstance(t, dict) or not isinstance(t.get('tiles'), list):
                raise ValueError('chybí dílky trati')
            os.makedirs(TRACKS, exist_ok=True)
            tid = str(t.get('id') or '')
            existing = read_tracks()
            # název souboru podle názvu trati; při shodě s jinou tratí přidat kus id
            base = safe_name(t.get('name'))
            if base.lower() == 'index':
                base = 'index (trať)'
            fn = base + '.json'
            if any(x['file'] == fn and str(x.get('id')) != tid for x in existing):
                fn = f'{base} ({tid[-6:]}).json'
            # přejmenovaná trať: starý soubor se stejným id smazat
            for x in existing:
                if str(x.get('id')) == tid and x['file'] != fn:
                    os.remove(os.path.join(TRACKS, x['file']))
            t.pop('file', None)
            with open(os.path.join(TRACKS, fn), 'w', encoding='utf-8') as f:
                f.write(track_json(t))
            write_index()
            return self.send_json(200, {'file': fn})
        except Exception as e:
            return self.send_json(400, {'error': str(e)})

    def do_DELETE(self):
        p = self.path.split('?')[0]
        if not p.startswith('/api/tracks/'):
            return self.send_json(404, {'error': 'neznámá adresa'})
        if not self.local():
            return self.send_json(403, {'error': 'mazat lze jen z tohoto počítače'})
        tid = urllib.parse.unquote(p[len('/api/tracks/'):])
        gone = 0
        for x in read_tracks():
            if str(x.get('id')) == tid:
                os.remove(os.path.join(TRACKS, x['file']))
                gone += 1
        write_index()
        return self.send_json(200, {'deleted': gone})


if __name__ == '__main__':
    os.chdir(ROOT)
    write_index()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f'Stunts Remake: http://localhost:{port}  (Ctrl+C = konec)  · vlastní tratě: {os.path.abspath(TRACKS)}')
    http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
