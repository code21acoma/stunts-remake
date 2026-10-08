# Stunts Remake

Webový remake klasické hry **Stunts** (1990): závody na tratích s loopingy, skoky, mosty a tunely –
a hlavně editor, ve kterém si trať postavíte sami.

## Spuštění

Hra používá ES moduly, takže potřebuje jednoduchý HTTP server (otevření `index.html` přes `file://` nefunguje):

```
start.bat
```

nebo ručně `python tools/server.py 8123` a otevřít <http://localhost:8123> (obyčejný `python -m http.server` hru spustí také, ale vlastní tratě pak neukládá do složky `myTracks/`). Three.js se načítá z CDN (jsDelivr), je tedy potřeba internet.

## Zveřejnění na webu

Hra je statická stránka – stačí nahrát `index.html`, `js/`, `css/` a `myTracks/` na libovolný hosting s HTTPS (GitHub Pages, Netlify, vlastní FTP). Složka `tools/` na web nepatří.

- Tratě ze složky `myTracks/` se na webu načtou **jen pro čtení** podle seznamu `myTracks/index.json` (ten zapisuje `tools/server.py` při startu a po každém uložení či smazání trati – před nahráním tedy stačí jednou spustit `start.bat`).
- Tratě, které si postaví návštěvník, se ukládají do jeho prohlížeče; může si otevřít i kopii trati ze složky.
- Rekordy a nastavení má každý návštěvník ve svém prohlížeči.
## Co hra umí

- **3D grafika** (Three.js): fyzikální materiály, stíny, obloha se sluncem a odrazy, hory, les, kouř z pneumatik, stopy smyku, ACES tone mapping.
- **Fyzika jízdy** (vlastní, 240 Hz): tuhé těleso se setrvačností, 4 paprskové nápravy (pružina, tlumič, doraz, stabilizátor),
  pneumatiky se skluzovým úhlem a kruhem tření, přenos zatížení, motor s momentovou křivkou a automatem, zpátečka,
  ruční brzda (smyky), aerodynamický odpor a přítlak, kolize karoserie impulsy, jemná kontrola trakce a stability.
- **7 vozidel** podle skutečných typů, s 3D náhledy a polepy: Kapka 1.2 (městský hatchback), Buvol 4×4 (hranatý terénní džíp s rezervou a terénními pneumatikami), Horizont R4 (rallye 4×4), Vektor GT3 (závoďák s křídlem a spoilerem), Bizon V8 (muscle car), Blesk X1 (hypersport), Šíp F1 (formule s otevřenými koly, křídly, halo a zavěšením). Osobní auta mají spáry dveří, kliky, poznávací značky a pneumatiky s bočnicemi.
- **Poškození**: nárazy promáčknou karoserii v místě dopadu, rozbijí světla, poškozený motor kouří; s rostoucím poškozením mírně klesá zrychlení (až −30 %) i maximální rychlost (až −20 %). Míra poškození závisí na rychlosti a úhlu (čelně plně, bokem/šikmo asi třetina, dosednutí podvozkem minimálně). HUD ukazuje celkové % a zóny (předek, boky, záď). Při 100 % je auto zničeno a závod končí.
- **Plot kolem mapy**: auto se zastaví a odrazí, jakmile se plotu dotkne kterýkoli roh karoserie (plotem se nedá projet). Fyzika běží po 1/240 s a auta i kamera se kreslí s dopočtem mezi kroky – pohyb je plynulý i při kolísání snímků za sekundu.
- **Čelní náraz ve vysoké rychlosti = okamžitý konec hry** (náraz do zdi/překážky nad ~47 km/h), s ohněm, kouřem a záznamem.
- **30 předpřipravených tratí** v obtížnostech ★ až ★★★★ – 5 klasických ručně stavěných a 25 generovaných nástrojem `tools/trackgen.mjs`. Pět generovaných je jednoduchých (★), zbylých 20 (★★ až ★★★★) jsou dlouhé členité tratě přes velkou část mapy (58–114 dílků, 12–25 zatáček vlevo i vpravo, velké, klopené a tunelové zatáčky) s estakádami (spirály vlevo i vpravo, dlouhá stoupání a klesání, mosty), loopingy, rourou, skoky, esíčky, slalomem mezi kužely, tunely s portály, překážkami a hrboly.
- **Sólo závod**: nejdřív auto (s 3D náhledy a volbou **základní barvy** – 11 barev nebo původní), pak trať (s filtrem obtížnosti, počtem kol a duchem).
- **Soupeři** (volba ve výběru trati: Ne / Lehcí / Střední / Těžcí / Mistři; sólo i pro dva): 7 počítačových jezdců, každý v jiném typu auta a s jinou povahou – Procházka (Šíp F1, odvážný v zatáčkách), Dvořák (Vektor GT3, pozdní brzdění), Novák (Horizont R4, mistr zatáček), Kučerová (Blesk X1, rychlá, ale opatrná), Svoboda (Bizon V8, raketa na rovinkách), Černá (Kapka 1.2, vyrovnaná), Veselý (Buvol 4×4, nováček). Startují v řadách po třech před hráči (rychlejší auta vpředu). Tempo řídí cílový čas kola: ideální čas kola **auta hráče** na dané trati (odhad z tvaru trati, zrychlení a max. rychlosti) + 0–8 % podle povahy + obtížnost; kdo jede před plánem, ubere. Od Střední obtížnosti jezdí soupeři **ideální stopou** (vnější–vnitřní–vnější, výpočet minimální křivosti v šíři silnice; u skoků, loopingu, roury a překážek středem). Těžcí a Mistři jezdí odvážněji (rychlejší zatáčky, pozdější brzdění) a mají lepší pneumatiky (+12 % / +20 % přilnavosti). Soupeři objíždějí pomalejší auta z volnější strany a nenaráží do nich zezadu. Soupeř v rychlejším autě se tak přizpůsobí a dobrý jezdec ho předjede. HUD ukazuje pozici, minimapa soupeře, výsledky celé pořadí; soupeři jsou i v záznamu jízdy.
- **Závod pro dva**: rozdělená obrazovka vedle sebe (vlevo hráč 1 – červené auto, W A S D; vpravo hráč 2 – modré auto, šipky), každý si vybere vlastní auto. Vlastní kamera, HUD (pořadí, kolo, čas, rychlost, poškození) a společná minimapa dole uprostřed; auta se mohou strkat. Vyhrává, kdo dojede první, soupeř má pak 30 s; havárie nebo zničené auto = hráč vypadává.
- **Dílky**: rovinka, zatáčka, velká zatáčka (2×2), krátká rampa (1 pole), dlouhé stoupání z dílků **nájezd s obloukem** (2 pole) + **rovné stoupání** (1 pole, 12,5 %) + **dojezd s obloukem** (2 pole) – každý o patro, sklony plynule navazují (dolů se jede stejnými dílky obráceně), spirála **L i P** (2×2 – jedna otočka se stoupáním o patro, vyjede nad svým začátkem přímo na most), podjezd pod mostem (dvě silnice nad sebou), most přes řeku, tunel v kopci, zatáčka v tunelu – malá i velká 2×2 (plynule navazují na rovný tunel, s chodníky a světly),
  looping (2 pole, tvar kapky – dole větší poloměr, nahoře menší, takže nájezd nerázuje; auto v něm drží rychlost a podvozek o silnici nedrhne), skokánek + dopad (hned za ním, nebo ob jedno pole – volné nebo s kolmou silnicí, přes kterou se skáče), překážka uprostřed, překážky po stranách, hrboly, patra (estakády s pilíři);
  klopení: nájezd a sjezd (L/P), klopená rovinka, klopená zatáčka L/P, **velká klopená zatáčka L/P** (2×2, poloměr 60 m) – porty nesou informaci o klopení, takže úseky musí plynule navazovat;
  dekorace: stromy, domy, jezírko, tribuna, řeka (rovná a zatáčka – navazuje na řeku pod mostem, auto ve vodě zpomalí a vrátí se na trať).
- **Roura** (klasika ze Stunts): dílek *Roura – vjezd/výjezd* postupně stočí silnici do kruhové trubky (průměr 13 m), *Roura* pokračuje rovně; v rouře se dá jezdit i po stěnách (náraz do stěny není havárie). Konce roury navazují jen na rouru, trubku je nutné ukončit vjezdem/výjezdem. **Roura s překážkou**: zátaras přes celé dno roury – projet se dá jen bokem po stěně (čelní náraz do zátarasu je havárie; soupeři ho objíždějí po stěně).
- **Slalom (kužely)**: tři kužely uprostřed silnice, objíždějí se střídavě; poražený kužel odletí (i v záznamu jízdy) a auto jen mírně přibrzdí.
- **Most (bez řeky)**: ocelový obloukový most v patře bez vody pod ním (min. 1. patro).
- **Tunel – portál (vjezd)**: otevřená silnice přejde v tunel – zářez do kopce s opěrnými zdmi a svahy, kamenné čelo s obloukem, cedulí TUNEL a světly; na výjezdu se použije otočený. Mezi navazujícími tunelovými dílky se čela nekreslí (bez pruhů na spojích). Předpřipravené tratě mají portály na vjezdech i výjezdech tunelů automaticky (`addPortals` v `js/tracks.js`).
- **Tunel s mostem nad ním**: tunel v kopci a přes hřeben kopce kolmo most o 2 patra výš (kopec je 10 m vysoký) – dvě nezávislé silnice na jednom poli.
- **Rovinka, zatáčka a velká zatáčka se svodidly**: silnice s ocelovými svodidly (profil se dvěma vlnami, pozinkované sloupky, odrazky) po obou stranách i na zemi – nedá se z ní vyjet ani zkrátit; spodní plech brání podjetí.
- **Nápis na silnici**: rovinka s bílým nápisem na vozovce (max. 24 znaků, až 3 slova pod sebou, písmena protažená jako silniční značení). Text se zadá při položení, kliknutím na položený dílek se upraví; nápis se sám natočí tak, aby se četl ve směru jízdy.
- **Křižovatka**: dvě silnice křížící se v jedné úrovni (šrafovaný střed) – dá se postavit osmička bez mostu; trať projede křižovatkou dvakrát (pozor na soupeře v kolmém směru).
- **Šotolina**: štěrková rovinka – silniční auta na ní kloužou (přilnavost ~74 %), terénní (rally, Buvol) téměř ne; u vjezdů výstražné značky.
- **Šikana (zídky)**: dvě betonové zídky ze střídavých stran – projíždí se esíčkem (čelní náraz = havárie).
- **Urychlovač**: svítící plocha s běžícími šipkami – dokud jsou kola na ní, tlačí auto dopředu (+16 m/s², do ~250 km/h).
- **Vlny**: dva hladké hřbety 1,5 m – v rychlosti auto nadskočí.
- **Bedny (prorazit)**: zeď ze 16 dřevěných beden přes celou silnici – auto jí prorazí, bedny se rozletí (horní spadnou, když pod nimi bedna chybí), auto to trochu přibrzdí; i v záznamu jízdy.
- **Demoliční koule**: červený portál s ocelovou koulí na řetězu, která se houpe napříč silnicí (perioda 3,4 s). Kdo nevychytá správný okamžik, koule ho odhodí stranou a poškodí (není to havárie). Kmitá i v editoru.
- **Svodidla u pastí a překážek**: vlny, trampolína, všechny pohyblivé pasti a všechny překážky (kužely, bedny, šikana, olej, zátarasy, hrboly) mají po stranách ocelová svodidla, takže se nedají lehce objet po trávě; u lisu a železničního přejezdu je ve svodidlech mezera pro bloky a vlak.
- **Pohyblivé pasti** (vlastní kategorie v paletě) – u všech jde o načasování; zásah auto odhodí a poškodí, ale není to havárie. Soupeři pasti časují: předpovídají, zda bude past v okamžiku jejich průjezdu volná (i s vlastním rozjezdem), jinak zpomalí a počkají před ní; těsně před pastí nepředjíždějí a z pastí dostávají poloviční poškození (ve frontě se tlačí). Odraz od pasti má strop (auto nevystřelí) a soupeř odhozený daleko mimo trať se po 3 s vrátí.
  - **Lis (drtič)**: dva ocelové bloky prudce sjedou z krajů a na chvíli uzavřou silnici, pak se pomalu rozevřou (cyklus 4,2 s).
  - **Rotující rameno**: ocelová závora se točí kolem sloupu uprostřed silnice – projet se dá po straně, kde se rameno točí po směru jízdy, ve chvíli, kdy míří podél silnice.
  - **Buchary**: dvě těžké hlavy střídavě dopadají na vozovku; úzkým pruhem uprostřed se dá proklouznout kdykoli (kdo se trefí).
  - **Železniční přejezd**: vlak (lokomotiva + vůz) vyjíždí z kůlny a projíždí napříč silnicí (cyklus 11 s); předem blikají světla a spadnou závory. Srážka s vlakem auto pořádně odhodí.
  - **Zvedací sloupky**: tři řady sloupků vyjíždějí ze silnice postupně jako „zelená vlna“ – kdo jede kolem 50 km/h, projede bez zastavení; kdo jede rychle, narazí.
- **Boční vítr**: tři obří ventilátory s točícími se lopatkami foukají přes silnici – poryvy (až 22,5 m/s² – víc, než udrží pneumatiky těžších aut) tlačí auto ke kraji, je potřeba kontrovat a nejet pomalu; proud je plný nad silnicí a za závětrným okrajem rychle slábne, takže odfouknuté auto se může vrátit. Nad vozovkou je vidět proudění vzduchu.
- **Olejové skvrny**: tři lesklé kaluže oleje (s převrženým sudem) – na nich kola skoro nedrží (28 %), je lepší je objet nebo přes ně jet rovně.
- **Boční rampa (na dvě kola)**: klín pod jednou polovinou silnice – auto se nakloní a kus jede po dvou kolech.
- **Trampolína**: modrá pružná plocha – auto vymrští svisle vzhůru (11 m/s), přistane o kus dál; za ní nech aspoň dvě rovinky.
- **Ohnivý kruh**: hořící obruč (dekorace, plameny blikají) – postav ji do volného pole mezi skokánek a dopad a proleť jí.
- **Esíčko L/P** (2×2): dvě protisměrné zatáčky – trať pokračuje stejným směrem o pole vedle.
- **Zeď**: sousední zdi se samy propojí (rovně, roh, T, kříž) – zabrání zkracování trati; náraz do ní je jako do svodidla.
- **Billboard**: při položení se zadá text (max. 60 znaků), kliknutím na existující billboard ho změníš; text je vidět ve hře z obou stran a ukládá se i do exportního kódu.
- **Editor**: paleta dílků je rozdělená do sbalitelných kategorií – Silnice, Stoupání a mosty, Klopení, Tunely, Triky a skoky, Překážky, Dekorace (kliknutím na nadpis se kategorie sbalí, stav si prohlížeč pamatuje; seznam kategorií je `GROUPS` v `js/defs.js`); pravé tlačítko = natáčení pohledu všemi směry, stisknuté kolečko = posun (i W A S D / šipky), kolečko = zoom k místu pod kurzorem; **F** vezme dílek pod kurzorem (typ, otočení, patro), **Delete** ho smaže; tlačítko **⌖** (nebo **Home**) plynule vystředí pohled na střed herní plochy (nadhled na celou mapu);
  mřížka 40×40, otáčení, patra, guma, tlačítka **↶ / ↷** (zpět / vpřed) (Ctrl+Z / Ctrl+Y nebo Ctrl+Shift+Z, historie 100 kroků), kontrola uzavření trati s vyznačením chyby, žluté **šipky na dílku Start/Cíl** ukazují směr jízdy,
  uložení do složky **`myTracks/`** (jeden soubor `Název trati.json` na trať; hra je při spuštění načte k předpřipraveným tratím, soubory lze i ručně kopírovat), export/import kódem, okamžitá testovací jízda. Ukládání do složky zajišťuje server `tools/server.py` (spouští ho `start.bat`); bez něj se tratě ukládají jen do prohlížeče. Tratě uložené dřív v prohlížeči se při prvním spuštění přesunou do `myTracks/`.
- **Závod**: odpočet, kontrolní body (každý dílek – průjezd se uzná, jen když má auto aspoň v některé části dílku kola na obou stranách na vozovce, ne jedním bokem na trávě; v rouře a loopingu stačí jet uvnitř, přeletěný dílek – skok, trampolína – se uzná, když auto letí nad jeho silnicí; vynechat lze nejvýš 1 – při větší zkratce se kolo nezapočítá a objeví se upozornění se šipkou zpět a značkou na minimapě), 1–3 kola, rekordy, **duch** nejlepší jízdy, **záznam jízdy** s TV kamerami.
- Kamery: za autem, vzdálená, z kapoty, **kokpit** – silniční auta (Kapka, Buvol, Bizon) mají ručičkové budíky rychlosti a otáček s ukazatelem stupně (Bizon s chromem a dřevem), závodní (GT3, rally, Blesk) karbonovou desku, digitální displej (stupeň, rychlost, pruh otáček) a LED diody pro řazení (blikají v omezovači), GT3 a rally ochranný rám; formule displej, diody a tlačítka přímo na volantu. Dále rukavice na volantu otáčejícím se podle řízení, zrcátka, čelní sklo s tónovaným pruhem, dveřní panely, středová konzole, kontrolka poškození a hlava řidiče se mírně vychyluje při přetížení (zatáčky, brzdění, hrboly); ve hře pro dva vidí kokpit jen jeho hráč, TV. Minimapa, otáčkoměr. Dotykové ovládání (dole vlevo zatáčení, vpravo v řadě ruční brzda, brzda/zpátečka a plyn; na úzkém telefonu se tlačítka zmenší, aby se nepřekrývala). Na mobilu je HUD kompaktní: poškození jako barevný údaj v horní liště (jako ve hře pro dva), pod časem zmenšený tachometr a vedle něj minimapa, menší ikony kamery, návratu a pauzy, bez poznámky o typu kamery; na počítači beze změny.
- **Zvuk** (syntetizovaný v prohlížeči, bez zvukových souborů): motor jako AudioWorklet – zážehy válců jsou hladké tlakové pulzy (každý válec trvale trochu jinak silný), jdou do výfukového potrubí (vlnovod s odrazy, u motorů do V a plochých dvě větve) a přes tlumič; k tomu dunění, sání a mechanika (diesel klepe), na omezovači motor zakoktá a hlasitost se pomalu vyrovnává; každé auto má vlastní charakter (Kapka čtyřválec, Buvol hrubý šestiválec s turbem, rally čtyřválec s turbem, GT3 šestiválec, Bizon bublající nerovnoměrně zapalující V8, Blesk V8 s turbem, formule ječící V10); pod plynem ostřejší a hlasitější, bez plynu tišší, ale čistě slyšet, při řazení krátké přerušení zapalování, turbo píská a při ubrání ufoukne ventil. Pneumatiky kvílí podle skluzu (výška tónu podle skluzu a rychlosti), na trávě šustí, na šotolině křupou, po asfaltu valivý hukot; vítr sílí s rychlostí; dopad po skoku, nárazy s kovovým zazvoněním. Motory tří nejbližších soupeřů jsou slyšet ze správné strany (stereo) a s Dopplerovým jevem. V kokpitu jsou zvuky utlumené jako uvnitř auta.
- **Hudba**: vlastní retro skladba ve stylu her z 90. let (FM zvuk jako AdLib), generovaná v prohlížeči bez zvukových souborů; hraje jen v menu (v závodě ne), klávesa **N** zap/vyp.
- **Ovladač PlayStation DualSense (CFI-ZCT1W)** a jiné ovladače ve standardním mapování (USB i Bluetooth, doporučen Chrome/Edge): páčka/D-pad řízení, R2 plyn (plynule), L2 brzda, ✕ ruční brzda, △ kamera, ○ návrat na trať, Options pauza, vibrace při nárazech; ovládání menu (D-pad, ✕ potvrdit, ○ zpět) a záznamu; ve hře pro dva má každý hráč svůj ovladač. Po připojení se ukáže hláška.

## Ovládání

| Klávesa | Akce |
|---|---|
| ↑ / W | plyn |
| ↓ / S | brzda, zpátečka |
| ← → / A D | řízení (ve vzduchu náklon) |
| Mezerník | ruční brzda |
| C | kamera |
| R | návrat na trať |
| Esc / P | pauza |
| M | zvuk |
| F8 | autopilot (ladění – jízda se nepočítá do rekordů) |

## Struktura

| Soubor | Obsah |
|---|---|
| `js/defs.js` | data dílků, porty, analýza uzavření trati (bez three.js) |
| `js/tracks.js` | předpřipravené tratě ("želví" příkazy) |
| `js/pieces.js` | geometrie dílků (sweep profilu po křivce) |
| `js/track.js` | trať ve scéně, kolize s BVH, raycasty |
| `js/physics.js` | fyzika vozu |
| `js/car.js` | 3D model auta |
| `js/world.js` | renderer, obloha, terén, kouř, stopy |
| `js/editor.js` | editor tratí |
| `js/ai.js` | autopilot (demo v menu, testy tratí) |
| `js/main.js` | herní smyčka, kamery, HUD, záznam, duch |
| `tools/trackgen.mjs` | `node tools/trackgen.mjs seznam.json` – generátor tratí: náhodný tvar z bloků → trať po jeho obvodu, rozmístění prvků, ověření uzavření; seznam `[[seed, obtížnost, "id", "Název", ["povinné prvky"]], …]` |
| `tools/trackcheck.mjs` | `node tools/trackcheck.mjs` – ověří uzavření vestavěných tratí |
| `tools/rivaltest.js` | v konzoli: `(await import('/tools/rivaltest.js')).lap('zeleny', 'gt', { corner: 0.9 })` – čas kola soupeře s danou povahou |
| `tools/simtest.js` | v konzoli: `(await import('/tools/simtest.js')).run()` – autopilot projede všechny tratě |
| `tools/traptest.js` | v konzoli: `(await import('/tools/traptest.js')).run(['gt', 'kapka'])` – zkušební okruh s pohyblivými pastmi, vypíše zásahy a čekání |
