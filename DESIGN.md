---
name: AGENA
description: Un poste de contrôle calme pour lire des faits et retrouver leurs preuves.
colors:
  paper: "#f6f5f1"
  sidebar: "#efeee8"
  white: "#fffefa"
  ink: "#282e25"
  muted: "#636b59"
  line: "#dedfd5"
  accent: "#b54b24"
  green: "#526e42"
  red: "#a8452a"
  on-accent: "#fff"
  accent-hover: "#a13e19"
  secondary-hover: "#eeeee8"
  nav-hover: "#eae9e3"
  nav-active: "#e6e5dd"
  tag-bg: "#eeeee6"
typography:
  display:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "42px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.4
  meta:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "10px"
    lineHeight: 1.8
rounded:
  "4": "4px"
  "5": "5px"
  "6": "6px"
  "7": "7px"
  "8": "8px"
  "9": "9px"
  "10": "10px"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "25": "25px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.6}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.6}"
    padding: "9px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "5px 0"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.4}"
    width: "28px"
    height: "28px"
  input-number:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.5}"
    padding: "7px 9px"
    width: "70px"
    height: "33px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.7}"
    padding: "10px"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.tag-bg}"
    textColor: "{colors.muted}"
    rounded: "{rounded.4}"
    padding: "4px 7px"
  scenario:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.10}"
  timeline-crash:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.4}"
    width: "22px"
    height: "22px"
  proof-step:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.4}"
    padding: "11px 5px"
---

# Design System: AGENA

## Overview

**Creative North Star: "Poste de contrôle calme"**

L’interface présente les informations sur des surfaces papier, avec une encre olive et des repères terre cuite. Sa densité reste celle d’un outil de lecture : titres courts, données alignées, actions explicites et détails accessibles à la demande. Les effets observables et leurs preuves structurent la lecture.

Ce document décrit le code livré, principalement `src/tokens.css`, `src/style.css`, `src/App.tsx` et `src/components/EvidenceDrawer.tsx`, ainsi que la capture finale. La construction directe en code a été autorisée ; aucun comp visuel ni approbation de marque n’est revendiqué. Le lanceur Impeccable était absent : ses références ont été consultées directement, sans panneau live vérifié. La revue finale a conclu « ship », après résolution des trois points signalés.

**Key Characteristics:**

- Papier chaud, encre olive et terre cuite ponctuelle.
- Surfaces plates, séparateurs fins et angles légèrement arrondis.
- Typographie unique, chiffres tabulaires et états nommés.
- Preuves détaillées dans un volet modal distinct.

Le frontmatter fixe les valeurs extraites. Les neuf premières couleurs correspondent aux variables CSS ; les autres décrivent des valeurs de composants existants. Les échelles de rayons et d’espacement recensent des valeurs réutilisées, sans prétendre qu’elles existent déjà comme variables CSS.

## Colors

La palette associe des neutres chauds à un olive discret et une terre cuite plus visible.

### Primary

`accent` sert au lancement, au crash, au temps simulé et aux indices de sélection ou de focus. `accent-hover` accentue le survol du bouton principal ; `on-accent` porte son texte.

### Secondary

`green` signale la réussite et la réconciliation. `red` marque les échecs ; l’icône et le libellé restent présents pour rendre l’état compréhensible sans la couleur seule.

### Neutral

`paper` porte la page, `sidebar` la navigation et `white` les panneaux. `ink` sert au texte principal, `muted` aux indications secondaires, `line` aux bordures. Les fonds `nav-hover`, `nav-active`, `secondary-hover` et `tag-bg` renforcent les états sans ombre.

## Typography

DM Sans Variable est chargée localement via Fontsource et utilisée dans toute l’interface. Le monospace système est réservé aux données techniques. Les chiffres des horloges, horaires, graines et compteurs sont tabulaires.

Les rôles du frontmatter décrivent les tailles de bureau : `display` pour le titre de la méthode, `headline` pour les titres de page, `title` pour les sections, `body` pour le texte courant, `label` pour les boutons et `meta` pour les informations secondaires. Le journal et les critères utilisent des titres de (12px), avec du détail de (11px) sur ordinateur. Il n’existe pas de ratio typographique unique.

À (1200px) et moins, le titre de page passe à (27px). À (760px) et moins, celui de la méthode passe à (34px). Certaines légendes compactes restent à (8–10px) : cet inventaire ne transforme pas ces exceptions en taille recommandée pour un nouveau texte explicatif. Les textes longs de la méthode et des messages sont limités à (70–75ch).

## Layout

La page est plafonnée à (1600px). Sur ordinateur, la navigation fixe en hauteur occupe (222px), avec un contenu muni de marges internes horizontales de (34px). Le journal et les résultats forment deux colonnes de proportions (1.62:1), séparées de (22px). Les panneaux défilants conservent leurs en-têtes et leur contexte visuel.

Les adaptations suivent la cascade réelle : à partir de (1600px), navigation de (240px) et marges de (50px) ; à (1200px) et moins, navigation de (190px) et marges de (24px) ; à (980px) et moins, rail d’icônes de (70px). À (760px) et moins, la navigation devient horizontale, les marges passent à (20px), le journal et les résultats s’empilent, et les horloges forment une grille de deux colonnes. Les paramètres utilisent alors une colonne flexible et une colonne de graine de (80px), puis des lignes entières pour le crash et les actions.

Les tableaux et onglets du monde autorisent le défilement horizontal. Le volet de preuve mesure au plus (490px) sur ordinateur et occupe toute la largeur sur mobile. Les espacements sont contextuels ; le code n’impose pas une grille uniforme de multiples de quatre.

## Elevation & Depth

Les panneaux au repos sont plats : fond clair, bordure et séparation tonale. Seul le volet de preuve utilise une ombre latérale et un voile modal ; leurs valeurs exactes figurent dans le sidecar. L’entrée du volet dure (250ms), le survol des boutons (150ms), et le point d’exécution pulse sur (1.8s). Le mode de réduction des animations supprime transitions et animations.

## Shapes

Les panneaux utilisent des angles de (9–10px), les tableaux (8px), la navigation (7px), les boutons (6px), les champs (5px) et les petites étiquettes (4px). Les marques de résultat sont circulaires. Les bordures sont fines (1px) ; les icônes sont des tracés Lucide simples. Les variations proches de rayons sont observées, sans normalisation supplémentaire.

## Components

- **Buttons.** Bouton principal terre cuite, secondaire clair bordé, lien d’action sans fond et bouton icône compact. Les boutons principaux et secondaires ont une hauteur minimale de (37px). Le focus clavier dessine un contour terre cuite de (2px), décalé de (3px). Un bouton désactivé reste à (0.45) d’opacité. Aucun déplacement décoratif au survol.
- **Inputs / Fields.** Champs clairs bordés, libellés au-dessus, chiffres tabulaires pour la graine. Le champ numérique est haut de (33px) sur ordinateur et de (37px) sur mobile. La case de crash reprend la terre cuite.
- **Navigation.** Fond tonal et graisse renforcée pour la destination courante ; le rail devient compact puis horizontal selon les seuils décrits. Les onglets du journal utilisent un soulignement terre cuite de (2px).
- **Chips.** Étiquettes de contexte discrètes et non interactives. Leur fond tonal ne remplace pas une action ni un indicateur de réussite.
- **Cards / Containers.** Panneaux clairs bordés, sans ombre. Le scénario sépare un résumé avec icône et une bande de faits ; le journal et les résultats utilisent des séparateurs internes.
- **Timeline.** Deux pistes distinguent monde et agent. Les événements du monde sont verts, ceux de l’agent plus pâles ; le crash est un carré terre cuite avec éclair. Chaque événement ouvre sa preuve et possède un nom accessible.
- **Evidence drawer.** Dialogue natif modal, fermeture par Échap ou bouton, restitution du focus à l’ouverture précédente. Une explication lisible précède la chaîne de reprise ; les données JSON restent dans un détail repliable. La ligne courante reçoit un fond olive pâle et le nombre de rendez-vous conserve son libellé explicite.

Les dix exemples autonomes du sidecar reproduisent ces formes ; ils ne remplacent pas les comportements React ou le contrôle modal de l’application.

## Do's and Don'ts

### Do:

- **Do** réutiliser les couleurs du frontmatter et les variables CSS correspondantes.
- **Do** accompagner les états d’un mot ou d’une icône et garder le focus clavier visible.
- **Do** préserver les chiffres tabulaires et les alignements dans les mesures.
- **Do** conserver l’explication de la preuve avant ses données techniques.

### Don't:

- **Don't** ajouter une ombre permanente aux panneaux plats existants.
- **Don't** faire dépendre la distinction réussite/échec de la couleur seule.
- **Don't** généraliser les petites légendes de la frise au texte explicatif.
- **Don't** présenter cette documentation descriptive comme un comp ou une identité de marque approuvée.
