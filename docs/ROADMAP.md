# Vers une arène complète

La tranche livrée est une référence fonctionnelle du simulateur, pas un benchmark général de modèles.

## 1. Durcir le banc d’essai

- Passer de la persistance JSON par exécution à des événements et effets indexés lorsque le volume le justifie.
- Scénarios supplémentaires : conflit de budget, révocation de permission, préférence contradictoire, action à résultat incertain, tâche abandonnée et échéance manquée.
- Imprévus conditionnels générés avec graines et distributions documentées ; jeux de tests cachés distincts des démonstrations.
- Mesures à plusieurs graines, distributions et intervalles d’incertitude. Publier les dénominateurs des opportunités, pas seulement leurs comptes.

## 2. Connecter un vrai agent

- Worker LLM isolé, protocole d’outils public, limite de coût et transport fournisseur instrumenté.
- Capsules de mémoire par agent ; outils externes remplacés par les façades du monde fictif.
- Adaptateurs spécifiques pour les produits accessibles, testés séparément. Leurs noms dans le brief ne constituent pas une intégration.

## 3. Élargir le temps et la récupération

- Mode déterministe actuel et mode à latence virtuelle explicitement facturée.
- Pannes à chaque frontière : avant effet, après effet, avant réponse, après réponse et avant checkpoint.
- Reprise de toute la machine, transaction concurrente et résultats réseau ambigus.

## 4. Publier une arène interactive

- Hôte Node avec disque persistant et processus enfants, isolation par exécution, authentification, quotas et rétention.
- Import de traces avec validation de schéma et version, comparaisons équitables, preuves téléchargeables.
- Juge subjectif optionnel avec grille explicite, séparé des oracles déterministes.

Critère de progression : chaque étape apporte une nouvelle expérience reproductible, jamais seulement une nouvelle animation.
