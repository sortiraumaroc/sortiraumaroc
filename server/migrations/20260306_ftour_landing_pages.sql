-- ============================================================================
-- MIGRATION: Ftour Ramadan Landing Pages
-- Date: 2026-03-06
-- Description:
--   Creates landing pages for Ftour Ramadan in 10 major Moroccan cities + national page.
--   Uses category='ftour-ramadan' which triggers special pro_slots-based query
--   in the landing page handler (instead of full-text search).
-- ============================================================================

BEGIN;

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

-- -------------------------------------------------------
-- Ftour Ramadan × City pages
-- -------------------------------------------------------

-- Casablanca
('ftour-casablanca', 'restaurant', 'Casablanca', 'ftour-ramadan', NULL,
 'Ftour Ramadan Casablanca — Les meilleures adresses | SAM',
 'Découvrez les meilleurs ftours de Ramadan à Casablanca. Buffets, menus et formules ftour dans les restaurants casablancais. Réservez sur Sortir Au Maroc.',
 'Les meilleurs ftours de Ramadan à Casablanca',
 'Casablanca, capitale économique du Maroc, offre une multitude d''adresses pour rompre le jeûne pendant le Ramadan. Des grands hôtels du boulevard d''Anfa aux restaurants traditionnels de la médina, en passant par les concepts modernes de Maarif et Gauthier, la ville blanche propose des ftours pour tous les goûts et tous les budgets. Buffets généreux, menus à la carte, formules familiales : les restaurants casablancais rivalisent de créativité pour offrir des tables du ftour mémorables. Harira, briouates, chebbakia, dattes et lait… les classiques sont au rendez-vous, accompagnés de plats revisités et de touches contemporaines. Réservez votre ftour à Casablanca sur Sortir Au Maroc et profitez de ce mois sacré dans les meilleures adresses de la ville.',
 'ftour casablanca, ramadan casablanca, iftar casablanca, meilleur ftour casablanca, restaurant ftour casablanca',
 0.9),

-- Marrakech
('ftour-marrakech', 'restaurant', 'Marrakech', 'ftour-ramadan', NULL,
 'Ftour Ramadan Marrakech — Les meilleures tables | SAM',
 'Les meilleurs ftours de Ramadan à Marrakech. Riads, restaurants et hôtels pour un iftar d''exception. Réservez sur Sortir Au Maroc.',
 'Les meilleurs ftours de Ramadan à Marrakech',
 'Marrakech se transforme pendant le Ramadan pour offrir des ftours d''exception. Les riads de la médina, les palaces de la Palmeraie et les restaurants de Guéliz proposent des tables du ftour somptueuses dans des cadres enchanteurs. La ville ocre est réputée pour ses ftours traditionnels généreux : harira parfumée, briouates croustillantes, chebbakia dorée, tajines fondants et pâtisseries aux amandes. Les hôtels 5 étoiles rivalisent de créativité avec des buffets thématiques mêlant cuisine marocaine traditionnelle et touches gastronomiques contemporaines. Réservez votre ftour à Marrakech sur Sortir Au Maroc et vivez une expérience Ramadan inoubliable dans la ville rouge.',
 'ftour marrakech, ramadan marrakech, iftar marrakech, meilleur ftour marrakech, restaurant ftour marrakech',
 0.9),

-- Rabat
('ftour-rabat', 'restaurant', 'Rabat', 'ftour-ramadan', NULL,
 'Ftour Ramadan Rabat — Les meilleures adresses | SAM',
 'Les meilleurs ftours de Ramadan à Rabat. Restaurants et hôtels de la capitale pour un iftar raffiné. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Rabat',
 'Rabat, capitale du Royaume, célèbre le Ramadan avec élégance. Les restaurants de l''Agdal, les tables de Hassan et les adresses du Bouregreg proposent des ftours raffinés dans des cadres soignés. La cuisine rbatie, réputée pour sa finesse, se décline en formules ftour qui allient tradition et modernité. Des hôtels de standing aux restaurants familiaux, en passant par les traiteurs spécialisés, Rabat offre un éventail d''options pour rompre le jeûne. Les ftours de la capitale se distinguent par leur sophistication et la qualité de leurs produits. Réservez votre table ftour à Rabat sur Sortir Au Maroc.',
 'ftour rabat, ramadan rabat, iftar rabat, meilleur ftour rabat, restaurant ftour rabat',
 0.8),

-- Tanger
('ftour-tanger', 'restaurant', 'Tanger', 'ftour-ramadan', NULL,
 'Ftour Ramadan Tanger — Les meilleures tables | SAM',
 'Les meilleurs ftours de Ramadan à Tanger. Restaurants et hôtels pour un iftar face à la Méditerranée. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Tanger',
 'Tanger offre une expérience Ramadan unique entre Méditerranée et Atlantique. Les restaurants de la Kasbah, les terrasses du port et les hôtels du centre-ville proposent des ftours qui mêlent traditions marocaines du nord et influences méditerranéennes. La cuisine tangéroise, riche en saveurs de la mer et en épices, se sublime pendant le Ramadan avec des ftours généreux et colorés. Des formules buffet aux menus à la carte, Tanger a l''adresse ftour qu''il vous faut. Réservez sur Sortir Au Maroc.',
 'ftour tanger, ramadan tanger, iftar tanger, meilleur ftour tanger, restaurant ftour tanger',
 0.8),

-- Agadir
('ftour-agadir', 'restaurant', 'Agadir', 'ftour-ramadan', NULL,
 'Ftour Ramadan Agadir — Les meilleures adresses | SAM',
 'Les meilleurs ftours de Ramadan à Agadir. Restaurants balnéaires et hôtels pour un iftar face à l''océan. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Agadir',
 'Agadir célèbre le Ramadan avec la générosité du sud marocain. Les restaurants de la corniche, les hôtels face à l''océan et les adresses du centre-ville proposent des ftours copieux mettant en valeur les produits de la mer et les spécialités soussies. Les ftours agadirois se distinguent par leur fraîcheur et leur abondance : poissons grillés du jour, tajines de fruits de mer, harira aux herbes et pâtisseries traditionnelles. Réservez votre ftour à Agadir sur Sortir Au Maroc.',
 'ftour agadir, ramadan agadir, iftar agadir, meilleur ftour agadir, restaurant ftour agadir',
 0.8),

-- Fès
('ftour-fes', 'restaurant', 'Fès', 'ftour-ramadan', NULL,
 'Ftour Ramadan Fès — Les meilleures tables | SAM',
 'Les meilleurs ftours de Ramadan à Fès. Riads et restaurants traditionnels pour un iftar fassi authentique. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Fès',
 'Fès, berceau de la gastronomie marocaine, offre les ftours les plus authentiques du royaume. Les riads de la médina et les restaurants gastronomiques de la ville proposent des tables du ftour héritières de siècles de tradition culinaire fassia. La harira de Fès, réputée dans tout le Maroc, s''accompagne de chebbakia finement tressée, de briouates aux amandes et de rfissa parfumée. Les ftours fassis sont une véritable célébration de l''art culinaire marocain. Réservez votre expérience ftour à Fès sur Sortir Au Maroc.',
 'ftour fes, ramadan fes, iftar fes, meilleur ftour fes, restaurant ftour fes, ftour fassi',
 0.8),

-- Meknès
('ftour-meknes', 'restaurant', 'Meknès', 'ftour-ramadan', NULL,
 'Ftour Ramadan Meknès — Les meilleures adresses | SAM',
 'Les meilleurs ftours de Ramadan à Meknès. Restaurants et adresses traditionnelles pour un iftar authentique. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Meknès',
 'Meknès célèbre le Ramadan dans la tradition avec des ftours généreux et authentiques. Les restaurants de la médina et les adresses de la ville nouvelle proposent des tables du ftour mettant en valeur les produits du terroir meknassi. Harira onctueuse, briouates croquantes, msemen doré et pâtisseries au miel composent des ftours mémorables dans la cité ismaélienne. Réservez votre ftour à Meknès sur Sortir Au Maroc.',
 'ftour meknes, ramadan meknes, iftar meknes, meilleur ftour meknes',
 0.7),

-- Oujda
('ftour-oujda', 'restaurant', 'Oujda', 'ftour-ramadan', NULL,
 'Ftour Ramadan Oujda — Les meilleures adresses | SAM',
 'Les meilleurs ftours de Ramadan à Oujda. Spécialités orientales pour un iftar aux saveurs de l''est. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Oujda',
 'Oujda propose des ftours riches en saveurs orientales pendant le Ramadan. La cuisine oujdie, influencée par sa position géographique, offre des ftours uniques mêlant traditions marocaines et influences de l''est. Les restaurants de la ville proposent des berkoukes, des rfissas épicées et des pâtisseries aux amandes qui font la renommée de l''Oriental. Réservez votre ftour à Oujda sur Sortir Au Maroc.',
 'ftour oujda, ramadan oujda, iftar oujda, meilleur ftour oujda',
 0.7),

-- Kénitra
('ftour-kenitra', 'restaurant', 'Kénitra', 'ftour-ramadan', NULL,
 'Ftour Ramadan Kénitra — Les meilleures adresses | SAM',
 'Les meilleurs ftours de Ramadan à Kénitra. Restaurants et traiteurs pour un iftar généreux. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Kénitra',
 'Kénitra offre des ftours généreux pendant le Ramadan, bénéficiant de la fraîcheur des produits agricoles du Gharb. Les restaurants de la ville et les traiteurs spécialisés proposent des tables du ftour copieuses et savoureuses. Des formules familiales aux menus individuels, Kénitra a de quoi satisfaire tous les appétits pour la rupture du jeûne. Réservez votre ftour à Kénitra sur Sortir Au Maroc.',
 'ftour kenitra, ramadan kenitra, iftar kenitra, meilleur ftour kenitra',
 0.7),

-- Tétouan
('ftour-tetouan', 'restaurant', 'Tétouan', 'ftour-ramadan', NULL,
 'Ftour Ramadan Tétouan — Les meilleures tables | SAM',
 'Les meilleurs ftours de Ramadan à Tétouan. Cuisine andalouse et traditions du nord pour un iftar raffiné. Réservez sur SAM.',
 'Les meilleurs ftours de Ramadan à Tétouan',
 'Tétouan propose des ftours imprégnés de traditions andalouses pendant le Ramadan. La cuisine tétouanaise, héritière d''un savoir-faire séculaire, se sublime à l''heure du ftour avec des pastillas délicates, des briouates parfumées et des pâtisseries aux amandes réputées dans tout le royaume. Les restaurants de la médina et les adresses de la ville nouvelle offrent des cadres enchanteurs pour la rupture du jeûne. Réservez votre ftour à Tétouan sur Sortir Au Maroc.',
 'ftour tetouan, ramadan tetouan, iftar tetouan, meilleur ftour tetouan, ftour tetouanais',
 0.7),

-- -------------------------------------------------------
-- Page nationale Ftour (sans ville)
-- -------------------------------------------------------

('ftour-maroc', 'restaurant', NULL, 'ftour-ramadan', NULL,
 'Ftour Ramadan au Maroc — Les meilleures adresses 2026 | SAM',
 'Les meilleurs ftours de Ramadan au Maroc. De Casablanca à Marrakech, trouvez le ftour parfait et réservez sur Sortir Au Maroc.',
 'Les meilleurs ftours de Ramadan au Maroc',
 'Le Ramadan est un moment privilégié de partage et de convivialité au Maroc. Partout dans le royaume, les restaurants, hôtels et traiteurs proposent des ftours d''exception pour célébrer ce mois sacré. De la harira traditionnelle aux buffets gastronomiques, en passant par les formules familiales et les concepts modernes, le ftour au Maroc est une véritable célébration culinaire. Casablanca, Marrakech, Rabat, Fès, Tanger et toutes les villes du royaume rivalisent de créativité pour offrir des tables du ftour mémorables. Que vous cherchiez un ftour traditionnel en famille, un iftar entre amis ou une expérience gastronomique, Sortir Au Maroc vous aide à trouver et réserver l''adresse parfaite. Découvrez notre sélection des meilleurs ftours du Maroc et réservez en quelques clics.',
 'ftour maroc, ramadan maroc, iftar maroc, meilleur ftour maroc, restaurant ramadan maroc',
 0.9);

COMMIT;
