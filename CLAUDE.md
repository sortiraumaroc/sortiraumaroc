# SAM.ma — Instructions de travail

## Règles de fonctionnement

### 1. Mode Plan par défaut
- Passe en mode plan pour TOUTE tâche non triviale (3+ étapes ou décisions architecturales)
- Si quelque chose dérape, STOP et replanifie immédiatement — ne continue pas en forçant
- Utilise le mode plan pour les étapes de vérification, pas seulement pour construire
- Rédige des spécifications détaillées dès le départ pour réduire l'ambiguïté

### 2. Stratégie des sous-agents
- Utilise largement les sous-agents pour garder le contexte principal propre
- Délègue la recherche, l'exploration et les analyses parallèles aux sous-agents
- Pour les problèmes complexes, alloue plus de calcul via des sous-agents
- Une tâche par sous-agent pour une exécution focalisée

### 3. Boucle d'auto-amélioration
- Après TOUTE correction de l'utilisateur : mets à jour `tasks/lessons.md` avec le schéma identifié
- Écris des règles pour toi-même afin d'éviter de refaire la même erreur
- Itère sans relâche sur ces leçons jusqu'à réduction du taux d'erreur
- Relis les leçons au début de chaque session pour le projet concerné

### 4. Vérification avant validation
- Ne marque jamais une tâche comme terminée sans prouver qu'elle fonctionne
- Compare le comportement entre la branche principale et tes modifications si pertinent
- Demande-toi : "Un staff engineer approuverait-il ceci ?"
- Lance les tests, vérifie les logs, démontre la conformité

### 5. Exiger l'élégance (équilibré)
- Pour les changements non triviaux : fais une pause et demande "Y a-t-il une manière plus élégante ?"
- Si une solution semble bricolée : "En sachant tout ce que je sais maintenant, implémente la solution élégante"
- Ignore cela pour les corrections simples et évidentes — n'over-engineer pas
- Challenge ton propre travail avant de le présenter

### 6. Correction autonome des bugs
- Lorsqu'un bug est signalé : corrige-le. Ne demande pas qu'on te tienne la main
- Identifie les logs, erreurs, tests en échec — puis résous-les
- Zéro changement de contexte requis de la part de l'utilisateur
- Corrige les tests CI en échec sans qu'on te dise comment

## Gestion des tâches

1. **Planifier d'abord** : Écris le plan dans `tasks/todo.md` avec des éléments vérifiables
2. **Vérifier le plan** : Valide avant de commencer l'implémentation
3. **Suivre l'avancement** : Marque les éléments comme complétés au fur et à mesure
4. **Expliquer les changements** : Résumé de haut niveau à chaque étape
5. **Documenter les résultats** : Ajouter une section de revue dans `tasks/todo.md`
6. **Capturer les leçons** : Mettre à jour `tasks/lessons.md` après corrections

## Principes fondamentaux

- **La simplicité d'abord** : Rends chaque changement aussi simple que possible. Impact minimal sur le code.
- **Zéro paresse** : Trouve la cause racine. Pas de solutions temporaires. Standards développeur senior.
- **Impact minimal** : Les changements ne doivent toucher que le nécessaire. Évite d'introduire des bugs.

## Préférences utilisateur

- Langue de communication : **Français**
- Package manager : **pnpm**
- Dev server : `pnpm run dev` (port 8080)
- Build : `pnpm run build` (client + server)
- Smoke build (rapide) : `pnpm run build:client:smoke`
