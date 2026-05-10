# Dati TCG

Questa cartella contiene i JSON statici usati dal gioco.

Il file principale viene generato con:

```bash
npm run sync:data
```

Origini configurate:

- Pokemon in italiano da TCGdex.
- One Piece in inglese da API TCG.
- Dragon Ball Fusion in inglese da API TCG.

Per One Piece e Dragon Ball serve la variabile `APITCG_API_KEY`.

Per provare il download senza scrivere file:

```bash
DRY_RUN=1 SYNC_GAMES=pokemon POKEMON_SET_LIMIT=2 npm run sync:data
```
