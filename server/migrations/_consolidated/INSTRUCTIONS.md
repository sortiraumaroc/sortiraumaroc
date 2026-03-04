# Migrations SQL - Instructions d'execution

## 48 fichiers de migration (20260208 - 20260219) consolides en 6 batches

Les fichiers ont ete consolides dans l'ordre chronologique de dependance.

## Ordre d'execution (STRICTEMENT dans cet ordre)

| Batch | Fichier | Lignes | Description |
|-------|---------|--------|-------------|
| 1 | `batch_1_20260208.sql` | 993 | Pro inventory, moderation, DM, social, loyalty FK, email QR |
| 2 | `batch_2_20260209_10.sql` | 524 | Bug reports, highlights/Google rating, wizard columns, admin activity, email templates reservation, search scored |
| 3 | `batch_3_20260211.sql` | 2333 | Claim requests, reviews v2, review emails/indexes, reservation v2, security RLS |
| 4 | `batch_4_20260212_14.sql` | 2396 | Footer social, loyalty v2, packs billing, auto-reply, FAQ, notifications/banners/wheel, messaging, roles, SAM AI, support, trusted devices |
| 5 | `batch_5_20260215_17.sql` | 4509 | Cursor pagination, leads admin, landing pages, search improvements, SEO, user preferences, multilingual search, onboarding, multiword fix, search path fix |
| 6 | `batch_6_20260218_19.sql` | 1563 | Admin notifications, CE module, Ramadan settings, rental vehicles, rental demo seed |

## Comment executer

1. Ouvrir **Supabase Dashboard** > **SQL Editor** > **New query**
2. Copier-coller le contenu de `batch_1_20260208.sql`
3. Cliquer **Run** (Ctrl+Enter)
4. Verifier qu'il n'y a pas d'erreurs
5. Repeter pour chaque batch dans l'ordre (batch_2, batch_3, ..., batch_6)

## Notes importantes

- **Batch 3** contient `security_enable_rls.sql` qui supprime des policies permissives creees dans les batches precedents. C'est normal et voulu.
- **Batch 5** contient des fonctions de recherche qui remplacent celles du Batch 2. C'est l'evolution normale (v1 -> multilingual -> multiword fix -> search_path fix).
- Certains fichiers utilisent `BEGIN;/COMMIT;` pour les transactions. Si une erreur survient, seul le bloc en cours est rollback.
- Les fichiers utilisent `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc. Ils sont **idempotents** et peuvent etre rejoues sans danger.
- **Batch 6** contient des donnees de demo pour la location de voitures (`rental_demo_seed.sql`) avec des UUID fixes.

## Total: 12 318 lignes SQL, 48 fichiers de migration
