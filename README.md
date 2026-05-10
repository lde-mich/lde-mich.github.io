# Maestro dei Set TCG

Una static app per GitHub Pages: quiz dinamico dove il giocatore deve riconoscere se una carta appartiene a un set TCG oppure trovare l'intrusa.

## Funzioni

- Modalita roulette con set casuale.
- Modalita set specifico.
- Domande "trova la carta del set", "trova l'intrusa" o miste.
- Difficolta normale ed esperto.
- Timer, serie, punteggio e risultati finali.
- Pulsante condivisione con Web Share API o copia negli appunti.
- Caricamento dati statici da `data/tcg-data.json`.

## Deploy su GitHub Pages

Pubblica questi file nella root del repository e abilita GitHub Pages da `Settings > Pages`, scegliendo il branch principale e la cartella root.

## Dati reali TCG

Il gioco non chiama API protette dal browser. I dati vengono scaricati da uno script Node e salvati come JSON statico:

```bash
npm run sync:data
```

Origini configurate:

- Pokemon in italiano da TCGdex.
- One Piece in inglese da API TCG.
- Dragon Ball Fusion in inglese da API TCG.

Per One Piece e Dragon Ball serve una chiave API TCG:

```bash
$env:APITCG_API_KEY="LA_TUA_CHIAVE"
npm run sync:data
```

Su GitHub aggiungi la chiave in `Settings > Secrets and variables > Actions > New repository secret` con nome `APITCG_API_KEY`, poi lancia il workflow `Sync TCG data`.

Se `data/tcg-data.json` non esiste ancora o non e' valido, il gioco mostra una schermata di manutenzione e non avvia partite con dati finti.
