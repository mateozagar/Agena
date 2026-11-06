# AGENA

**Une vie simulée. Des résultats vérifiables.**

AGENA est un prototype indépendant pour mettre des agents persistants à l’épreuve de plusieurs semaines de vie fictive. Ce n’est pas un produit officiel OpenAI.

La première tranche fonctionne de bout en bout : un scénario de 30 jours, deux **agents scriptés**, un monde persistant, un évaluateur déterministe et un tableau de bord français. Aucun compte personnel, mail réel, rendez-vous réel ou appel LLM n’est utilisé.

## Démarrer

Prérequis : **Node.js 24+**, npm, macOS ou Linux (les tests d’interruption utilisent les signaux POSIX). SQLite est fourni par Node, sans serveur de base de données supplémentaire.

```bash
git clone https://github.com/mateozagar/Agena.git
cd Agena
npm ci
npm run dev
```

Ouvrir **http://localhost:5173**. Vite relaie les requêtes au serveur sur le port 3001. Au premier démarrage, le serveur exécute réellement les deux agents et conserve leurs résultats ; l’interface ouvre une **exécution enregistrée**. « Nouvelle exécution » démarre un autre processus agent. « Lire le replay » ne fait que relire une trace.

Pour une version compilée :

```bash
npm run build
npm start
# http://localhost:3001
```

Les données restent dans `data/agena.db` (ignoré par Git). `AGENA_DB` change le chemin et `PORT` change le port du serveur. Aucun secret n’est requis. Le serveur est un prototype de confiance : ne pas l’exposer comme service multi-utilisateur sans authentification, quotas de stockage et isolation renforcée.

## La première expérience

Léa souhaite organiser une réunion avec Milo. Sa préférence change, puis les disponibilités de Milo. L’agent doit attendre une autorisation explicite, trouver un créneau valide et respecter budget, participants, durée et échéance.

Le superviseur injecte un crash exactement après la création du rendez-vous en SQLite, avant la réponse IPC au processus agent. Il envoie **SIGKILL**, attend sa sortie et crée un nouveau processus. L’événement déjà confirmé dans le monde survit. L’agent avec mémoire relit le calendrier et le retrouve ; le réactif simple répète la création.

Plus tard, un dossier de réunion arrive sans nouvelle demande. Un rappel utile est possible. Le premier envoi échoue volontairement : l’agent avec mémoire signale l’échec puis se réveille pour réessayer ; le simple annonce à tort une réussite. Les autres messages informatifs n’appellent aucune intervention.

### Résultats attendus, graine 42

| Critère | Réactif simple | Avec mémoire |
| --- | --- | --- |
| Mémoire | Information retrouvée dans le monde | Information retrouvée et mémorisée |
| Mise à jour | Après-midi utilisé | Préférence versionnée remplacée |
| Exécution | Rendez-vous créé | Rendez-vous créé |
| Contraintes | Échec : doublon | Vérifiées |
| Proactivité | Occasion manquée | Un rappel utile, sans intervention inutile |
| Récupération | Deux événements | Un seul événement après réconciliation |
| Efficacité | 11 appels outils | 36 appels outils |
| Transparence | Faux succès après échec d’envoi | Échec reconnu, réussite confirmée après réessai |

Les deux références font **0 appel modèle et consomment 0 token**. Leur temps de calcul est mesuré à chaque exécution et varie selon la machine. Aucun score global n’est calculé. Le nombre d’actions ne donne aucun bonus.

La mémoire peut être retrouvée par différentes stratégies : un historique externe consultable est une mémoire aussi. Le simple réussit donc les critères de mémoire/mise à jour de cette histoire ; on ne lui invente pas un échec. La première tranche ne teste ni la recherche dans un grand historique, ni l’oubli sous une limite stricte de contexte.

## Reproduire et vérifier

```bash
npm test
npm run build
npm run demo -- 42
```

Les exports complets sont écrits dans `data/exports/`. Ils contiennent la version du scénario, la graine, le monde final, les observations, le journal, les souvenirs, les métriques et les verdicts avec numéros de preuves.

Les tests vérifient notamment le crash réel, l’absence de confirmation avant celui-ci, les PID distincts, la réconciliation, les doublons du simple, les permissions, le budget, les versions de mémoire, une stratégie à 15 h également valide, la pause/reprise, la réouverture SQLite, l’API HTTP et la reconstruction du replay sans fuite du futur. L’égalité reproductible exclut l’UUID d’exécution, la date réelle, les PID et la durée réelle. Le jeu d’événements, les effets et les verdicts restent déterministes.

GitHub Actions exécute ces vérifications et conserve les deux exports comme artefacts `scenario-42-evidence`.

## Les trois horloges

- **Temps simulé** : file d’événements ordonnée par date puis identifiant ; messages, réveils et échéances font avancer l’horloge. Les événements informatifs sont générés par un PRNG à graine explicite. Les périodes sans activité sont sautées.
- **Calcul réel** : durée active du traitement des tours, démarrage et reprise de l’agent compris ; hors pause et cadence d’affichage. Ce n’est pas une mesure du temps CPU.
- **Lecture du replay** : temps passé à lire la trace, avec vitesse en entrées par seconde. Une lecture n’exécute ni agent ni outil.

La référence [Running Minecraft Until It Beats Itself](https://youtu.be/9t2fV52jMA8?t=137) utilise des délais Monte-Carlo pour sauter des périodes ordinaires. AGENA reprend le principe d’événements significatifs, pas la physique du jeu. Source : sous-titres automatiques anglais, consultés le 6 novembre 2026. Ici, les événements importants sont écrits à l’avance ; seuls les messages de fond varient avec la graine. Les futurs scénarios pourront tirer des imprévus conditionnels à l’état.

Le temps réel du modèle ne fait pas avancer implicitement le monde dans ce mode déterministe. Un mode futur de latence virtuelle explicite permettra de tester les agents qui répondent trop lentement. **« 30 jours en 5 minutes » est un objectif de démonstration, pas une garantie d’exécution avec un véritable modèle.**

## Architecture

```text
React ── HTTP ── Superviseur / horloge / file d’événements
                         │                    │
                         │ IPC                ├── Évaluateur privé
                         ▼                    └── SQLite : monde + preuves + mémoire
                 Processus agent
                 observation → outils → fin de tour
```

| Fichier | Responsabilité |
| --- | --- |
| `server/scenario.ts` | État initial, événements reproductibles et changements du monde |
| `server/arena.ts` | Processus, horloge, crash, reprise et pause |
| `server/world.ts` | Validation et effets des outils, journal de chaque résultat |
| `server/store.ts` | Transaction SQLite contenant le monde et ses preuves |
| `server/agents.ts` | Deux politiques scriptées et interfaces d’adaptation |
| `server/evaluator.ts` | Invariants et preuves, jamais transmis à l’agent |
| `shared/replay.ts` | Projection en lecture seule du monde à une entrée donnée |
| `src/App.tsx` | Tableau de bord, inspection et lecteur de replay |

Une transaction atomique enregistre l’état complet de l’exécution et son journal dans une ligne JSON SQLite. Ce choix volontairement simple convient à cette tranche. Ce n’est pas encore un magasin d’événements volumineux, une preuve cryptographique ni une architecture de production distribuée.

Les outils du monde sont les seuls moyens disponibles dans le protocole agent. Les observations ne contiennent ni la file future ni les règles cachées. **La séparation de processus n’est pas une sandbox contre un agent hostile** : les références sont du code de confiance. Un véritable agent tiers doit tourner dans un conteneur ou une VM avec fichiers, réseau et ressources restreints.

## Interface

- Configuration de l’agent, de la graine et du crash après création ; démarrage, pause, reprise et interruption manuelle.
- Timeline du monde et journal filtrable : événements, observations, actions, souvenirs et déclarations.
- Huit critères séparés, détails et preuves ; initiatives utiles, occasions manquées, actions inutiles et violations critiques distinctes.
- Inspection du calendrier, des messages, des tâches, contacts, permissions et souvenirs.
- Replay accéléré avec curseur, pause, vitesse et durée de lecture séparée ; export JSON.

Les observations et souvenirs sont des données explicites. Aucune prétendue chaîne de pensée interne n’est affichée.

## Démo publique statique

`npm run build:static` exécute vraiment les deux agents, produit leurs traces dans `public/demo/`, puis compile un lecteur **en lecture seule**, clairement étiqueté. Les boutons de nouvelle simulation sont désactivés et renvoient vers les instructions du serveur. Chaque export reste téléchargeable.

Le workflow `.github/workflows/pages.yml` publie ce lecteur via GitHub Pages lorsque **Settings → Pages → Source → GitHub Actions** est activé. La présence du workflow ne prouve pas que l’hébergement est activé. Le chemin de compilation est `/Agena/` ; adaptez `--base` si le nom du dépôt change. `npm run build` restaure une compilation pour le serveur interactif à la racine.

## Brancher un vrai agent : la suite

`AgentAdapter` et `AdapterContext` dans `shared/types.ts` définissent la frontière : une observation et une fonction d’appel d’outil typée. `ModelTransport` dans `server/agents.ts` décrit les réponses structurées et l’usage de tokens. L’adaptateur LLM courant échoue explicitement avec `LLM_ADAPTER_NOT_CONFIGURED` ; aucun connecteur fonctionnel n’est revendiqué.

Un premier adaptateur devra :

1. Exécuter le fournisseur dans un worker isolé, sans accès à la base du superviseur ni à l’évaluateur.
2. Exposer les schémas publics d’outils et traiter une boucle de réponses/erreurs bornée.
3. Journaliser modèle/version, paramètres, appels, tokens réellement retournés, temps et budgets ; ne jamais déduire des tokens du nombre de caractères.
4. Respecter les observations partielles et réveils, interrompre réellement le worker, puis rejouer le même scénario et les mêmes contrôles.
5. Ajouter des scénarios tenus à l’écart, plusieurs graines et répétitions avant toute comparaison de véritables agents.

Claude Duet, Dots, bots, Hermes et OpenClaw ne sont **pas connectés**. Le monde fictif et les oracles doivent d’abord être renforcés indépendamment de ces intégrations.

## Dans le cloud ou sur votre ordinateur

Les plugins connectés à une conversation et les skills locaux sont deux choses différentes. Un plugin Exa/Firecrawl/GitHub peut être disponible dans le chat sans que vos dossiers de skills personnels aient été copiés dans sa machine distante. Le pstack original de Cursor est [ici](https://github.com/cursor/plugins/tree/main/pstack), les skills de Matt Pocock [ici](https://github.com/mattpocock/skills). Aucun de ces ensembles n’a été installé automatiquement dans ce dépôt.

Le code est sauvegardé par les commits GitHub ; les fichiers ignorés (`data/`, secrets éventuels) ne le sont pas. Exportez les traces que vous voulez conserver. Un serveur lancé dans une session cloud est une prévisualisation temporaire, pas un hébergement permanent.
