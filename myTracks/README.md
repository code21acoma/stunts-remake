# myTracks – vlastní tratě

Každá trať je jeden soubor `Název trati.json`. Hra je při spuštění načte k předpřipraveným tratím.

- **Uložit** v editoru zapíše (nebo přepíše) soubor sem; přejmenovaná trať se uloží pod novým názvem a starý soubor zmizí.
- Smazání trati v editoru nebo ve výběru trati soubor smaže.
- Tratě od kamarádů stačí zkopírovat do této složky (a obnovit stránku).
- Ukládání funguje při spuštění přes `start.bat` (server `tools/server.py`).
- `index.json` je seznam souborů pro web: server ho zapisuje sám (při startu i po každé změně). Na webovém hostingu bez našeho serveru z něj hra načte tratě jen pro čtení.

Formát: `{ "id": "...", "name": "...", "tiles": [ { "type": "straight", "x": 20, "y": 10, "rot": 0, "e": 0 }, ... ] }`
