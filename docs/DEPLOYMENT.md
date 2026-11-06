# Publication du lecteur

URL publique : https://agena-arena.mateo-zagar02.chatgpt.site

Hébergement Sites, projet `appgprj_6aede7c63bd48191935405725c4f7bf0`. Le lecteur est public, en lecture seule, avec les deux agents explicitement scriptés. Aucun processus Node, compte personnel ou adaptateur LLM ne s’exécute sur cet hébergement statique.

La première version utilise le code GitHub `85bbc0cc78c0886a4c6c86e0a6d700827cd1ad83`, les traces de deux exécutions réelles, et une compilation Vite avec `VITE_DEMO_MODE=true` et `--base=/`. Le dépôt de publication Sites conserve les fichiers statiques et son manifeste `.openai/hosting.json` ; son commit source est `50e1592dc0174bdeeff9ef088b2dca5d8c92a529`.

Pour mettre à jour : régénérer les traces avec `node scripts/build-demo.ts`, compiler le lecteur pour la racine, synchroniser le dépôt source du même projet Sites, puis enregistrer et publier une nouvelle version. Conserver l’identifiant du projet, l’audience publique et les étiquettes de replay. Les identifiants Git temporaires ne doivent jamais être enregistrés dans le code ou les archives.

Le serveur interactif nécessite Node 24, SQLite et les processus enfants. Il reste disponible par les commandes du README. Une future publication interactive doit utiliser un hébergement adapté à ces besoins.

GitHub Pages est une solution de remplacement facultative ; son workflow se lance manuellement après activation de Pages dans les paramètres du dépôt.
