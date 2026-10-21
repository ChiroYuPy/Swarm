# NÉON STOP

**Survis à la marée géométrique.** Un survivor-like en vue du dessus : tu incarnes **Octo**, un octogone néon, dans un monde sans fin peuplé de formes géométriques hostiles.

Les armes tirent toutes seules, tu esquives, ramasses l'XP, montes de niveau, fais évoluer et **fusionnes** tes armes, et tu gères des **bonus temporaires** et un **objet activable** (Espace). La partie dure jusqu'à la mort. Chaque partie est aléatoire ; en interne tout reste piloté par une seed, jamais affichée (relecture, tests, validation future des scores).

## Lancer

```bash
npm install && npm run dev      # jeu sur http://localhost:5173
npm run build                   # typecheck + build de production dans dist/
npm run preview                 # sert le build de production
npm test                        # tests automatisés (Vitest)
npm run balance                 # équilibrage headless : le bot joue 6 seeds en Normal
npm run balance -- 10 20 2      # 10 seeds, 20 min max, difficulté 2 (0 facile, 1 normal, 2 difficile)
```

Paramètres d'URL utiles au développement : `?seed=TOFU-ZEN-12&difficulty=1&autostart=1`, `?bot=1` (pilote automatique), `?stress=1` (horde + build fusionné, partie non classée), `?fps=1`, `?nopause=1` (pas de pause auto sur perte de focus).

**Contrôles** : ZQSD / WASD / flèches (position physique des touches, donc AZERTY et QWERTY marchent), stick ou croix de manette · `Espace` (ou bouton X de la manette) : utiliser l'objet activable · `1` `2` `3` ou flèches + Entrée pour choisir au level-up · `Échap`/`P` pause · `M` muet · `F3` FPS. En relecture : `1` `2` `4` pour la vitesse.

## Publier sur GitHub Pages

Le workflow `.github/workflows/deploy.yml` teste, construit et publie le jeu à chaque push sur `main`.

1. Pousse le dépôt sur GitHub (branche `main`).
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le premier déploiement part au push suivant (ou via **Actions → Déploiement GitHub Pages → Run workflow**).
4. Le jeu est servi sur `https://<utilisateur>.github.io/<dépôt>/`.

Le build utilise des chemins relatifs (`base: './'` dans `vite.config.ts`) : aucun réglage à changer selon le nom du dépôt.

## Contenu

| | |
|---|---|
| **Héros** | Octo : 100 PV, vitesse 150, collecte 72, régén 0,2 PV/s, 0,2 s d'invulnérabilité après un coup |
| **8 armes** (5 niveaux) | **Un niveau = une instance de plus** : Blaster (1 à 5 projectiles), Orbes (1 à 5 orbes), Mines (1 à 5 par pose), Boomerang (1 à 5), Arc électrique (1 à 5 éclairs), Onde de choc (1 à 5 ondes successives). Le Champ de force grandit à chaque niveau ; le Laser passe de 1 à 4 rayons |
| **8 passifs** (5 niveaux) | Puissance (dégâts), Surcadence (recharge), Amplificateur (zone), Propulseurs (vitesse), Aimant (collecte), Vitalité (PV + régén), Blindage (dégâts subis), Chance (objets) |
| **6 fusions** | Spirale, Trous noirs, Champ vampire, Tempête électrique, Boomerang miné, Séisme : arme niveau 5 + partenaire niveau 5 |
| **Bonus temporaires** | Rage (dégâts ×2, 8 s), Frénésie (recharge ×2, 8 s), Turbo (vitesse +50 %, 8 s), Bouclier (invulnérable, 5 s). Ramasser un bonus déjà actif le prolonge |
| **Activables** (1 emplacement, Espace) | Aspirateur (toute l'XP et les objets au sol), Gel (ennemis figés 6 s), Bombe (300 dégâts autour de toi), Éradication (tous les ennemis présents, −20 % PV au boss). Un nouveau remplace l'ancien |
| **Autres objets** | Soin (+30 % PV), Coffre du boss (fusion si possible, sinon 3 améliorations + soin), Caisses bonus « ? » à casser (apparaissent régulièrement près du joueur) |
| **Ennemis** | Chasseur, Fonceur, Tireur, Bloc, Bombe, Essaim : ils **arrivent un type après l'autre** (annoncés à l'écran), plus vite selon la difficulté |
| **Boss** | Trapèze toutes les 3 min (Mk II, Mk III…) : poursuite → spirale de balles → charges annoncées → renforts. Lâche un coffre et un activable |
| **Monde** | Ouvert et infini : obstacles géométriques (cercles, hexagones, rectangles orientés) générés morceau par morceau. Ils bloquent les déplacements et les tirs ; les ennemis les contournent |
| **Difficultés** | Facile (PV ×0,7, dégâts ×0,6, débit ×0,75, nouveaux types 1,5× plus tard), Normal, Difficile (×1,3, ×1,3, ×1,3, nouveaux types 30 % plus tôt) |

Emplacements : 5 armes, 4 passifs, 1 objet activable.

**Interface** : une seule police (Chakra Petch, embarquée via `@fontsource`), une échelle de tailles commune (12 / 14 / 16 / 20 / 28 px) et un seul style de bouton, onglet, carte et panneau, partagé par le HUD canvas et les écrans DOM.

- **Menu** : Jouer → choix de la difficulté (record affiché sur chaque carte), Bestiaire, Records, Options. Navigation clavier/manette.
- **Bestiaire** : règles, armes (détail des 5 niveaux), passifs (effet par niveau et au niveau 5), objets, ennemis, fusions.
- **HUD** : PV, XP, niveau, chrono, compte à rebours du boss, score, record à battre, éliminés, difficulté, armes et passifs avec leurs niveaux, objet activable, bonus actifs avec leur compte à rebours, stats effectives.
- **Records** : top 10 local par difficulté.
- **Fin de partie** : GAME OVER animé, puis récapitulatif (score qui défile, rang, temps, éliminés, niveau, boss, équipement) avec Rejouer, Revoir la partie et Menu.

## Choix de stack

TypeScript + Vite, **Canvas 2D sans dépendance runtime** (hors police embarquée). Le rendu néon est fait de traits simples et de lueurs : Canvas 2D y suffit, sans le poids d'un moteur comme PixiJS. La charge (500+ entités) est absorbée par des sprites pré-rendus (ImageBitmap) dessinés par lots.

## Architecture

```
src/
  sim/        logique pure et déterministe : aucun DOM, aucune horloge, aucun Math.random
    game.ts         API : createGame({ seed, difficulty }), step, isAwaitingChoice, computeScore, makeScoreRecord
    state.ts        structures (pools préalloués) et événements émis vers le rendu
    rng.ts, dmath.ts  PRNG mulberry32 + flux dérivés, sin/cos/atan2 déterministes
    map.ts          monde infini : obstacles générés par morceau, collisions exactes, ligne de vue
    navfield.ts     champ de navigation (Dijkstra local autour du joueur) : les ennemis contournent les obstacles
    grid.ts         grille spatiale recentrée sur le joueur
    spawner.ts, enemies.ts, weapons.ts, projectiles.ts, pickups.ts, levelup.ts, combat.ts, player.ts
    serialize.ts    hashState, serializeState / deserializeState
    inputcodec.ts, replay.ts   journal d'entrées compact, relecture
  data/       équilibrage, modifiable sans toucher au code : hero, weapons, passives, fusions, enemies, waves, loot, map, difficulty
  ai/bot.ts   pilote automatique (tests, équilibrage, démo du menu) : une source d'entrées comme le clavier
  render/     Canvas 2D : renderer, sprites, effets (particules, nombres, éclairs), HUD, icônes
  input/      clavier + manette -> code d'entrée
  audio/      WebAudio 100 % synthétisé : effets + boucle synthwave séquencée (plus intense pendant les boss)
  ui/         écrans DOM : menu, difficulté, bestiaire, records, options, level-up, pause, fin
  storage/    localStorage versionné avec migration
  main.ts     boucle à pas fixe 60 Hz (accumulateur + interpolation), machine à états de l'app
tests/        déterminisme, monde, level-up, fusions, contenu (instances, arrivées, bonus, activables), relecture, pureté
scripts/balance.ts   équilibrage headless
```

Garde-fous : `tsconfig.sim.json` compile `src/sim` et `src/data` **sans la lib DOM**. `tests/purity.test.ts` interdit en plus `Math.random`, `Date.now`, `performance.now` et les fonctions trigonométriques natives dans la sim.

## Seed et déterminisme

- La seed est un texte interne (`TOFU-FURIEUX-42`...), normalisé puis hashé en entier 32 bits. Elle n'est jamais montrée au joueur.
- **Flux séparés** dérivés de la seed : `MAP` (obstacles, par morceau `(seed, cx, cy)`), `WAVES` (vagues, caisses), `LOOT` (butin, coffres), `LEVELUP` (propositions), `COSMETIC` (rendu uniquement, jamais relu par la sim).
- **Monde infini** : un morceau d'obstacles ne dépend que de `(seed, cx, cy)`. Le cache n'est qu'une optimisation (il peut être vidé sans rien changer, testé).
- **Pas fixe** : la sim avance par ticks de 1/60 s. Le rendu interpole entre l'état précédent et l'état courant.
- **Vagues identiques pour tous** (à difficulté égale) : chaque apparition consomme toujours le même nombre de tirages, même quand elle échoue. La composition des vagues ne dépend que du temps (testé).
- **Propositions de level-up** : pour le niveau L, ordre de l'univers des 16 objets tiré de `(seed, LEVELUP, L)`, puis les 3 premières offres valides pour le build. Une fusion disponible prend toujours la première place.
- **Maths** : la sim n'utilise que `+ - * /`, `Math.sqrt/floor/abs/min/max` (exacts en IEEE 754) et ses propres approximations polynomiales.

## Journal d'entrées et relecture

Une entrée = 1 octet par pas : `0` immobile, `1..64` direction pleine vitesse, `65..128` demi-vitesse (stick peu incliné), `200..202` choix de level-up, `210` utiliser l'objet activable. Les codes ≥ 200 sont des pas « zéro » qui n'avancent pas le temps. Le journal est compressé en RLE + varint + base64. La dernière partie est rejouable depuis l'écran de fin (en mémoire). Vérifié dans le navigateur : une partie en Difficile avec un activable utilisé est rejouée au point près.

Score : `secondes × 10 + kills + 250 par boss`. Enregistrement local :

```ts
{ seed, difficulty, tempsSurvecu, kills, level, score, version, date }
```

## Stockage

Clé `neonawak.save` en localStorage (v2), toujours sous try/catch : réglages, dernière difficulté choisie, top 10 par difficulté. `migrate()` convertit les sauvegardes v0 et v1 (les anciens scores sont rangés en Normal). Une sauvegarde écrite par une version future du jeu est ignorée et jamais écrasée.

## Ajouter du contenu

- **Une arme** : une entrée dans `src/data/weapons.ts` (`BASE_WEAPONS`) avec un `behavior` existant et ses 5 niveaux (`prog(base, delta2, ...)`, cumulatifs ; `count` = nombre d'instances). Pour un comportement inédit : un `case` dans `updateWeapons` (`src/sim/weapons.ts`) et une icône dans `src/render/icons.ts`.
- **Un passif** : une entrée dans `src/data/passives.ts`. Pour une nouvelle stat, l'ajouter à `PlayerStats` (`state.ts`), à `computeStats` / `applyBuffs` (`player.ts`) et à `statRows` (`hud.ts`).
- **Un objet** : une entrée dans `PICKUPS` (`src/data/loot.ts`, famille `instant`, `timed` ou `active`), son code `PK_*` dans `state.ts` (même ordre), son effet dans `pickups.ts` (bonus) ou `useActivable` (`player.ts`), et son pictogramme dans `drawPickupIcon`.
- **Un ennemi** : une entrée dans `src/data/enemies.ts` puis un poids dans une phase de `src/data/waves.ts` (sa première phase = son arrivée, annoncée automatiquement).
- **Une fusion** : l'arme résultante dans `FUSED_WEAPONS` (`fusion: true`) et une ligne dans `src/data/fusions.ts`.
- Après tout changement de gameplay : incrémenter `SIM_VERSION`, puis `npm test` et `npm run balance`.

## Équilibrage

Mesuré avec le bot « joueur moyen » (il esquive, lit les charges du boss, utilise ses activables quand il est encerclé), 6 seeds par difficulté, 15 min max :

- **Facile** : les 6 parties atteignent 15 min.
- **Normal** : mort entre **6:00 et 9:41** pour 5 parties sur 6, une partie tient 15 min.
- **Difficile** : mort entre **2:56 et 6:28**.

Arrivées des ennemis en Normal : Chasseur dès le début, Essaim à 1:00, Fonceur à 1:30, Tireur à 3:30, Bloc à 4:30, Bombe à 6:00. PV ennemis × (1 + 0,3·m + 0,1·m²). Tous ces réglages sont dans `src/data/`.

## Performance

- Sim : ~0,1 à 0,4 ms par tick en headless, jusqu'à 1 000 ennemis. Pools préalloués, compactage par swap, grille spatiale recentrée et reconstruite par tri par comptage, requêtes d'obstacles sans allocation.
- Rendu (`?stress=1`, Chrome) : **~140 i/s** en moyenne, 95e centile à 12 ms, avec ~400 ennemis et ~230 projectiles à l'écran.
- Les entités nombreuses sont des sprites ImageBitmap pré-rendus. Les obstacles, le boss, les ondes et les éclairs restent vectoriels. « Qualité basse » coupe les lueurs et plafonne la résolution.

## Vers le multijoueur

La sim est pensée pour plusieurs joueurs dans une même partie : `createGame({ seed, players: n })`, `step(state, inputs[])` avec un code par joueur, ennemis qui ciblent le joueur le plus proche, immunité par (joueur, arme), kills crédités au propriétaire des dégâts, apparitions réparties.

1. **Classement en ligne** : un serveur reçoit `ScoreRecord` + journal et peut **rejouer le journal en headless** (`replayToEnd({ seed, difficulty }, codes)`) pour valider le score.
2. **Même monde, plusieurs joueurs** : le level-up fige le monde. Il faudra des choix sans pause ou une pause commune, et entrelacer les codes des joueurs dans le journal. La grille spatiale est centrée sur le premier joueur vivant : à élargir (ou une grille par joueur) si les joueurs s'éloignent beaucoup.
3. **Réseau** : sim pure + `hashState` permettent du lockstep déterministe avec détection de désynchronisation ; `serializeState` / `deserializeState` permettent un rattrapage par instantané.

## Décisions prises

- Fusion = deux objets **au niveau maximal** (5/5). Une fusion arme + passif garde le passif ; arme + arme libère un emplacement.
- « Un niveau = une instance » pour Blaster, Orbes, Mines, Boomerang, Arc électrique et Onde de choc ; le Champ de force grandit ; le Laser plafonne à 4 rayons (5 rayons tournants couvriraient tout l'écran).
- Un seul emplacement d'activable : un nouvel objet remplace l'ancien (choix tactique : l'utiliser avant d'en ramasser un autre).
- Les bonus temporaires sont prolongés (pas cumulés) si on en ramasse un identique.
- Les objets au sol disparaissent au bout de 45 s (ils clignotent les 5 dernières) ; le coffre du boss reste.
- Pendant le Gel, les ennemis ne bougent pas, ne tirent pas et ne font pas de dégâts de contact.
- Espace ne valide jamais un choix de level-up (seulement Entrée, 1/2/3 ou clic), pour éviter un choix involontaire quand on spamme l'objet.
- Classement **local** uniquement, sans pseudo, top 10 par difficulté ; seule la dernière partie est rejouable.
- Le boss plane au-dessus des obstacles. « Abandonner » enregistre le score comme une mort.

## Ce qui reste

- Manette : implémentée (stick, croix, A/B/X/Start) mais pas testée sur une vraie manette.
- Audio : vérifié sans erreur, pas écouté ni mixé à l'oreille ; les activables réutilisent des sons existants.
- Pas de rebinding des touches ni de mode daltonien (les formes restent distinctes).
