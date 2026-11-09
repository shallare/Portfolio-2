# Audit du Portfolio UNSEPTZEROTROIS - Phase 1

**Date** : 2026-11-07  
**Auteur** : Assistant IA (Claude Fable 5)  
**Version** : 1.0

---

## 1. Architecture Générale

### 1.1 Type de Projet
- **Framework** : Vanilla JavaScript (ES Modules)
- **Bundler** : Vite 7.3.1
- **Architecture** : Single Page Application (SPA) avec navigation par ancres + page séparée `gallery.html`
- **Langage Principal** : JavaScript (ES2022+), pas de TypeScript
- **Gestionnaire de Paquets** : npm

### 1.2 Dépendances (package.json)

```json
{
  "devDependencies": {
    "@studio-freight/lenis": "^1.0.42",  // Smooth scroll
    "gsap": "^3.14.2",                   // Animations
    "vite": "^7.3.1"                     // Build tool
  }
}
```

**Note** : Aucune dépendance de production - tout est en devDependencies car Vite bundle tout.

### 1.3 Système de Routing
- **Navigation principale** : Ancres HTML (`#about`, `#projects`, `#skills`, `#contact`)
- **Navigation fluide** : Lenis `scrollTo()` avec offset `-80px` et durée `1.5s`
- **Page secondaire** : `gallery.html` (lien direct, pas de SPA routing)
- **Mobile** : Menu hamburger avec overlay plein écran

### 1.4 Composants Principaux

| Composant | Fichier | Description |
|-----------|---------|-------------|
| Custom Cursor | `main.js:46-81` | Dot + outline avec effet hover magnétique |
| Preloader | `main.js:115-139` | Animation GSAP timeline au chargement |
| Hero | `main.js:145-157` | Animations d'entrée séquentielles |
| Navbar | `main.js:164-174` | État scrolled + highlight actif |
| Bento Grid | `index.html:122-214` | CSS Grid responsive (3 colonnes desktop) |
| Projects | `index.html:218-432` | 5 blocs alternés avec parallax |
| Marquee | `index.html:436-501` | Double track infinite scroll CSS |
| Skills | `index.html:504-660` | 3 catégories en grid |
| Contact | `index.html:664-776` | Formulaire + liens sociaux |
| Gallery | `gallery.html` | Masonry grid + lightbox + filtres |
| Lightbox | `main.js:432-633` | Navigation, zoom, réactions |

### 1.5 Système de Styles
- **Méthodologie** : CSS Custom Properties (design system complet)
- **Variables clés** : `--bg`, `--bg-card`, `--border`, `--text`, `--purple`, `--pink`, `--blue`, `--gradient`
- **Polices** : Inter (body), Syne/Space Grotesk (display), Antonio (titre)
- **Responsive** : Breakpoints 1024px, 768px, 480px
- **Animations** : GSAP + CSS keyframes (float, rotate, pulse, marquee)
- **Curseur personnalisé** : Désactivé sur mobile (< 768px)

### 1.6 Système de Défilement (Scroll)
- **Lenis** : Smooth scroll avec `duration: 1.4`, easing personnalisé
- **ScrollTrigger** : GSAP plugin pour animations au scroll
- **Raf loop** : `requestAnimationFrame` synchronisé avec Lenis
- **Gestion visibilité** : `lenis.stop()/start()` sur `visibilitychange`
- **Ancres** : Interception click + `lenis.scrollTo()`

### 1.7 Animations et Interactions Existantes

| Animation | Technologie | Détails |
|-----------|-------------|---------|
| Preloader | GSAP Timeline | Shapes + texte + barre progression |
| Hero Entry | GSAP | Stagger lines, reveal-text (translateY) |
| Section Reveal | ScrollTrigger | `.card-reveal`, `.section-title-large` |
| Project Parallax | ScrollTrigger scrub | `y: -30` sur visual |
| Card Tilt | GSAP (mousemove) | `rotateX/rotateY` ±1.5° + glow follow |
| Magnetic Buttons | GSAP (mousemove) | Translation 15% vers curseur |
| Custom Cursor | requestAnimationFrame | Dot (0.08s) + Outline (lerp 0.1) |
| Marquee | CSS @keyframes | 30s/35s linear infinite |
| 3D Shapes Hero | CSS @keyframes | float, rotateCube, rotateTorus, pulse |
| Lightbox | GSAP + CSS | Zoom toggle, navigation clavier |
| Reactions | GSAP | Pop animation `back.out(2)` |

---

## 2. Analyse de Performance Actuelle

### 2.1 Points Forts
- ✅ Code modulaire, bien organisé
- ✅ GSAP optimisé (will-change, transform-only)
- ✅ Lenis pour scroll fluide non-bloquant
- ✅ Lazy loading images (`loading="lazy"`)
- ✅ CSS-first animations (marquee, 3D shapes)
- ✅ Pas de framework lourd (React/Vue/Svelte)

### 2.2 Points d'Attention pour Intégration Gestuelle
- ⚠️ **Thread principal chargé** : GSAP tick + Lenis raf + cursor raf + ScrollTrigger
- ⚠️ **Custom cursor** : `mousemove` listener + 2 rAF loops (dot + outline)
- ⚠️ **Card tilt** : `mousemove` sur chaque carte + GSAP.to à 60fps
- ⚠️ **Magnetic buttons** : `mousemove` + GSAP.to
- ⚠️ **ScrollTrigger** : Écoute scroll + refresh sur resize

### 2.3 Budget Performance Disponible
- **Objectif** : 60fps stable (16.67ms/frame)
- **Actuel estimé** : ~8-12ms/frame au scroll, ~4-6ms idle
- **Marge** : ~4-8ms pour traitement gestuel
- **Recommandation** : Web Worker obligatoire pour MediaPipe

---

## 3. Architecture Recommandée pour Contrôle Gestuel

### 3.1 Choix Technologiques

| Besoin | Solution | Justification |
|--------|----------|---------------|
| Hand Tracking | **MediaPipe Tasks Vision (JS)** | WASM, GPU WebGL, 21 landmarks, < 10ms inférence |
| Webcam Access | **WebRTC getUserMedia()** | Standard navigateur, HTTPS/localhost |
| Processing | **Web Worker** | Décharge main thread, transferable objects |
| Rendering Preview | **Canvas 2D** (optionnel) | Overlay landmarks, debug mode uniquement |
| Cursor Smoothing | **One Euro Filter** | Adaptatif, réduit tremblements sans lag |
| Gesture State Machine | **Custom JS** | 5 états, priorités, transitions validées |

### 3.2 Architecture Proposée

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN THREAD (UI)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Gesture UI  │  │ Virtual     │  │ Portfolio           │  │
│  │ Panel       │  │ Cursor      │  │ (existante)         │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                    │
│         └───────┬────────┘                                    │
│                 ▼                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           GestureController (orchestrateur)             │ │
│  │  - State machine (5 gestes + priorités)                 │ │
│  │  - Virtual cursor position → DOM element hit-test       │ │
│  │  - Scroll/Click dispatch via Lenis/GSAP                 │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────┘
                              │ postMessage (landmarks + gestures)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    WEB WORKER                                │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ MediaPipe       │  │ Gesture         │                   │
│  │ HandLandmarker  │  │ Recognition     │                   │
│  │ (WASM + WebGL)  │  │ (5 gestures)    │                   │
│  └─────────────────┘  └─────────────────┘                   │
│         ▲                  │                                  │
│         │                  ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Video Frame Capture (OffscreenCanvas → ImageBitmap)   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Intégration Sans Casser l'Existante

1. **Lazy Load** : Charger MediaPipe UNIQUEMENT quand utilisateur clique "Activer"
2. **Isolation** : Worker séparé, pas d'import dans main.js
3. **Cleanup** : `stop()` complet (tracks, worker, event listeners, canvas)
4. **Fallback** : Si WebGL indisponible → CPU (plus lent mais fonctionnel)
5. **Config** : Paramètres exposés dans panel UI (sensibilité, lissage, seuils)

---

## 4. Fichiers à Créer / Modifier

### 4.1 Nouveaux Fichiers
```
/gesture-control/
├── gesture-controller.js      # Orchestrateur principal (main thread)
├── gesture-worker.js          # Web Worker (MediaPipe + recognition)
├── gesture-ui.js              # Panel UI + prévisualisation
├── one-euro-filter.js         # Lissage curseur
├── gesture-config.js          # Configuration centralisée
└── gesture-styles.css         # Styles du panel UI
```

### 4.2 Fichiers à Modifier
- `index.html` : Ajouter bouton d'accès + container panel + import module
- `gallery.html` : Même chose (cohérence)
- `main.js` : Initialisation optionnelle du système gestuel
- `style.css` : Import des styles gestuels (ou inline dans gesture-styles.css)
- `package.json` : Ajouter `@mediapipe/tasks-vision` en devDependencies

---

## 5. Recherche Projet Python GitHub (Phase 2)

### 5.1 Critères de Sélection
- [ ] Python 3.10+ compatible
- [ ] OpenCV + MediaPipe (Tasks Vision ou Solutions)
- [ ] 21 landmarks main
- [ ] Détection doigts levés + pincement
- [ ] Contrôle curseur système (pyautogui/pynput)
- [ ] Défilement gestuel
- [ ] Licence open source (MIT/Apache 2.0/BSD)
- [ ] Actif (commits < 1 an)
- [ ] Code propre, pas de code suspect

### 5.2 Candidats à Évaluer
1. `google/mediapipe` - Exemples officiels (reference)
2. `cvzone/cvzone` - Wrapper MediaPipe populaire
3. `Kazuhito00/hand-gesture-recognition-using-mediapipe` - Spécifique gestes
4. `omkarpathak/Hand-Gesture-Recognition` - Classique
5. Recherche GitHub "hand gesture control mouse mediapipe" → filtrer

---

## 6. Plan d'Action Détaillé

### Phase 1 ✅ - AUDIT (CETTE PAGE)
- [x] Analyse architecture complète
- [x] Identification technologies
- [x] Évaluation performance
- [x] Architecture recommandée
- [x] Plan fichiers

### Phase 2 - RECHERCHE PYTHON
- [ ] Recherche GitHub ciblée
- [ ] Évaluation 3-5 candidats
- [ ] Sélection + justification
- [ ] Création `gesture-control-python/` structure
- [ ] Adaptation code (main.py, hand_tracking.py, etc.)
- [ ] Test fonctionnement standalone

### Phase 3 - ARCHITECTURE WEB
- [ ] Install `@mediapipe/tasks-vision`
- [ ] Créer Web Worker structure
- [ ] Implémenter HandLandmarker charger modèle
- [ ] Pipeline vidéo : getUserMedia → OffscreenCanvas → Worker
- [ ] Test basique landmarks

### Phase 4 - 5 GESTES
- [ ] GestureRecognition class (worker)
- [ ] Détection 5 doigts (stop)
- [ ] Détection 2 doigts (scroll)
- [ ] Détection 1 doigt (cursor)
- [ ] Détection pincement (click)
- [ ] Machine à états + priorités
- [ ] Transitions avec hysteresis temporelle

### Phase 5 - UI
- [ ] Bouton "Contrôle gestuel" dans navbar
- [ ] Panel latéral/overlay
- [ ] Prévisualisation webcam (canvas)
- [ ] Indicateurs : geste détecté, statut, mode debug
- [ ] Mode compact / diagnostic
- [ ] Messages d'état explicites
- [ ] Responsive

### Phase 6 - SÉCURITÉ
- [ ] Permission explicite (pas d'auto-start)
- [ ] Arrêt complet tracks MediaStream
- [ ] Cleanup worker + event listeners
- [ ] Pas d'envoi réseau
- [ ] Gestion erreurs permission/refus

### Phase 7 - PERFORMANCES
- [ ] Lazy load MediaPipe
- [ ] One Euro Filter curseur
- [ ] Throttling traitement (target 15-30fps)
- [ ] Configurable : sensibilité, vitesse, seuils
- [ ] Fallback CPU

### Phase 8 - TESTS
- [ ] Tests unitaires reconnaissance doigts
- [ ] Tests priorités gestes
- [ ] Tests transitions
- [ ] Tests click simple/double
- [ ] Tests cleanup webcam
- [ ] Lint + build production

### Phase 9 - DOCUMENTATION
- [ ] `docs/GESTURE_CONTROL.md`
- [ ] `gesture-control-python/README.md`
- [ ] Commandes exactes install/lancement

### Phase 10 - VÉRIFICATION FINALE
- [ ] Checklist complète 10 points
- [ ] `docs/GESTURE_CONTROL_FINAL_REPORT.md`

---

## 7. Risques Identifiés et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| MediaPipe trop lourd pour mobile | Moyenne | Élevé | Détecter mobile → désactiver/bannière info |
| WebGL indisponible | Faible | Moyen | Fallback CPU (WASM only) |
| Latence curseur visible | Moyenne | Élevé | One Euro Filter + calibration zone |
| Conflit cursor personnalisé existant | Élevé | Moyen | Désactiver custom cursor quand gestuel actif |
| Permissions refusées | Moyenne | Faible | UI gracieuse, fallback souris |
| Performance scroll + gesture | Moyenne | Élevé | Worker isolé, throttling, profiling |

---

## 8. Métriques de Succès

- [ ] **Latence curseur** < 50ms (main → écran)
- [ ] **FPS portfolio** > 55fps avec gestuel actif
- [ ] **Précision gestes** > 90% (conditions normales)
- [ ] **Temps init** < 3s (chargement modèle)
- [ ] **Mémoire** < 100MB additionnel
- [ ] **Zero régression** fonctionnalités existantes
- [ ] **Build production** OK
- [ ] **Python standalone** fonctionnel

---

*Fin de l'audit - Prêt pour Phase 2*