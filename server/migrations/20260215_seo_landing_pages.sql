-- ============================================================================
-- MIGRATION: SEO Landing Pages for category+city combinations
-- Date: 2026-02-15
-- Description:
--   1. Creates landing_pages table with multilingual SEO fields
--   2. Seeds ~43 landing pages for the restaurant universe
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE landing_pages
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,

  -- Filter mapping
  universe TEXT NOT NULL,             -- DB enum value: restaurant, loisir, hebergement, wellness, culture
  city TEXT,                          -- NULL = national page
  category TEXT,                      -- subcategory filter
  cuisine_type TEXT,                  -- cuisine filter (maps to cuisine_types array)

  -- Multilingual SEO: titles (50-60 chars)
  title_fr TEXT NOT NULL,
  title_en TEXT,
  title_es TEXT,
  title_it TEXT,
  title_ar TEXT,

  -- Multilingual SEO: meta descriptions (150-160 chars)
  description_fr TEXT NOT NULL,
  description_en TEXT,
  description_es TEXT,
  description_it TEXT,
  description_ar TEXT,

  -- Multilingual SEO: H1 headings
  h1_fr TEXT NOT NULL,
  h1_en TEXT,
  h1_es TEXT,
  h1_it TEXT,
  h1_ar TEXT,

  -- Multilingual SEO: intro paragraphs (200-300 words)
  intro_text_fr TEXT,
  intro_text_en TEXT,
  intro_text_es TEXT,
  intro_text_it TEXT,
  intro_text_ar TEXT,

  -- SEO control
  keywords TEXT,
  og_image_url TEXT,
  robots TEXT DEFAULT 'index,follow',
  priority REAL DEFAULT 0.8,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON public.landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_universe_city ON public.landing_pages(universe, city);
CREATE INDEX IF NOT EXISTS idx_landing_pages_active ON public.landing_pages(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

-- Public read policy
CREATE POLICY "landing_pages_public_read" ON public.landing_pages
  FOR SELECT USING (is_active = true);


-- ============================================================================
-- 2. SEED DATA — Restaurant universe
-- ============================================================================

-- -------------------------------------------------------
-- 2a. City pages (10 main cities)
-- -------------------------------------------------------

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

-- Casablanca
('restaurants-casablanca', 'restaurant', 'Casablanca', NULL, NULL,
 'Restaurants Casablanca — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Casablanca. Comparez les avis, consultez les menus et réservez en ligne sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Casablanca',
 'Casablanca, capitale économique du Maroc, est aussi sa capitale gastronomique. Des tables étoilées du quartier Gauthier aux restaurants traditionnels de l''ancienne médina, la ville offre une diversité culinaire exceptionnelle. Que vous cherchiez un restaurant marocain authentique avec vue sur la mosquée Hassan II, un restaurant de fruits de mer sur la corniche, ou une adresse branchée à Maarif, Casablanca saura satisfaire toutes vos envies. La scène culinaire casablancaise mêle traditions marocaines et influences internationales, avec des chefs qui revisitent les classiques et des concepts innovants qui ouvrent régulièrement. Réservez votre table en quelques clics sur Sortir Au Maroc et découvrez les adresses incontournables de la ville blanche. Des restaurants gastronomiques aux bistrots de quartier, notre sélection couvre tous les budgets et toutes les occasions, que ce soit pour un déjeuner d''affaires, un dîner en amoureux ou un repas en famille.',
 'restaurant casablanca, manger casablanca, où manger casablanca, meilleur restaurant casablanca',
 0.9),

-- Marrakech
('restaurants-marrakech', 'restaurant', 'Marrakech', NULL, NULL,
 'Restaurants Marrakech — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Marrakech. Des riads gastronomiques aux rooftops, réservez votre table sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Marrakech',
 'Marrakech est une destination culinaire de renommée mondiale. La ville ocre offre une expérience gastronomique unique, des souks animés de la Jemaa el-Fna aux restaurants raffinés de la Palmeraie. Les riads-restaurants du quartier de la Kasbah proposent une cuisine marocaine d''exception dans des cadres somptueux, tandis que les rooftops de Guéliz offrent des vues imprenables sur l''Atlas. La nouvelle ville regorge de concepts modernes : bistronomie, cuisine fusion, restaurants healthy et coffee shops tendance. Les chefs marrakchis, qu''ils soient locaux ou internationaux, puisent dans la richesse des épices et des produits du terroir pour créer des plats mémorables. Du tajine traditionnel au menu dégustation contemporain, Marrakech conjugue tradition et modernité avec brio. Réservez dès maintenant sur Sortir Au Maroc et laissez-vous porter par les saveurs de la ville rouge.',
 'restaurant marrakech, manger marrakech, où manger marrakech, meilleur restaurant marrakech',
 0.9),

-- Rabat
('restaurants-rabat', 'restaurant', 'Rabat', NULL, NULL,
 'Restaurants Rabat — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Rabat. Des tables de la capitale aux bistrots du quartier Hassan, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Rabat',
 'Rabat, capitale du Royaume, est une ville où la gastronomie se vit avec élégance et discrétion. Le quartier de l''Agdal regorge de restaurants branchés et de brasseries modernes, tandis que la médina et la Kasbah des Oudaïas abritent des adresses authentiques au charme intemporel. Les restaurants du front de mer à Salé et sur le Bouregreg offrent des panoramas exceptionnels pour accompagner votre repas. La scène culinaire rbatie se distingue par sa sophistication : les chefs de la capitale excellent dans l''art de marier cuisine marocaine traditionnelle et gastronomie internationale. Que vous cherchiez un restaurant pour un déjeuner diplomatique ou une terrasse décontractée pour un brunch dominical, Rabat a l''adresse qu''il vous faut. Explorez notre sélection complète et réservez votre table en quelques clics sur Sortir Au Maroc.',
 'restaurant rabat, manger rabat, où manger rabat, meilleur restaurant rabat',
 0.9),

-- Tanger
('restaurants-tanger', 'restaurant', 'Tanger', NULL, NULL,
 'Restaurants Tanger — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Tanger. Cuisine méditerranéenne, poissons frais et rooftops, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Tanger',
 'Tanger, porte de l''Afrique sur la Méditerranée, est une ville où les saveurs se croisent et s''enrichissent. Sa position géographique unique en fait un carrefour culinaire entre Europe et Afrique, entre Méditerranée et Atlantique. Les restaurants de poissons du port offrent une fraîcheur incomparable, tandis que les adresses du quartier Marshan et de la Kasbah séduisent par leur charme bohème. La ville nouvelle, en pleine effervescence, accueille de nouveaux concepts gastronomiques chaque mois. Des tapas espagnoles aux tajines traditionnels, en passant par la cuisine fusion et les rooftops avec vue sur le détroit de Gibraltar, Tanger est une destination food à part entière. Réservez votre prochaine expérience culinaire tangéroise sur Sortir Au Maroc.',
 'restaurant tanger, manger tanger, où manger tanger, meilleur restaurant tanger',
 0.8),

-- Agadir
('restaurants-agadir', 'restaurant', 'Agadir', NULL, NULL,
 'Restaurants Agadir — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Agadir. Poissons grillés, cuisine balnéaire et tables de plage, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Agadir',
 'Agadir, station balnéaire du sud marocain, est réputée pour sa cuisine de la mer exceptionnelle. Le port de pêche offre les produits les plus frais du pays, que les restaurants de la corniche transforment en véritables festins. Des grillades de sardines aux plateaux de fruits de mer, en passant par le poisson du jour cuisiné à la chermoula, Agadir est le paradis des amateurs de cuisine marine. La ville propose également une belle diversité de restaurants internationaux le long de son front de mer, des pizzerias aux restaurants asiatiques. Le souk El Had et ses environs recèlent des trésors de cuisine marocaine traditionnelle à prix doux. Découvrez toutes les bonnes adresses d''Agadir sur Sortir Au Maroc et réservez votre table face à l''océan.',
 'restaurant agadir, manger agadir, où manger agadir, meilleur restaurant agadir',
 0.8),

-- Fès
('restaurants-fes', 'restaurant', 'Fès', NULL, NULL,
 'Restaurants Fès — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Fès. Cuisine fassia raffinée et riads gastronomiques, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Fès',
 'Fès, berceau de la gastronomie marocaine, est reconnue pour l''excellence de sa cuisine traditionnelle. La cuisine fassia est considérée comme la plus raffinée du pays, héritière de siècles de savoir-faire culinaire. Les riads-restaurants de la médina, classée au patrimoine mondial de l''UNESCO, offrent des expériences gastronomiques inoubliables dans des décors somptueux. La pastilla, le tajine aux pruneaux et amandes, le mechoui et les pâtisseries au miel sont des spécialités incontournables. La ville nouvelle de Fès propose aussi des adresses modernes qui revisitent les classiques avec créativité. Que vous soyez amateur de cuisine traditionnelle ou de concepts contemporains, Fès saura enchanter vos papilles. Réservez votre table sur Sortir Au Maroc.',
 'restaurant fes, manger fes, où manger fes, meilleur restaurant fes, cuisine fassia',
 0.8),

-- Meknès
('restaurants-meknes', 'restaurant', 'Meknès', NULL, NULL,
 'Restaurants Meknès — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Meknès. Cuisine traditionnelle et produits du terroir, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Meknès',
 'Meknès, cité impériale entourée de vignobles et d''oliveraies, est une destination gourmande méconnue qui mérite le détour. La ville est célèbre pour la qualité de ses produits du terroir : huile d''olive, vins des coteaux de l''Atlas et fromages artisanaux. Les restaurants de la médina proposent une cuisine marocaine généreuse et authentique, tandis que les adresses de la ville nouvelle innovent avec des concepts modernes. La place El Hedim et ses environs regorgent de petits restaurants où déguster des plats traditionnels à prix doux. Meknès est aussi la capitale du vin marocain, avec plusieurs domaines viticoles qui proposent des dégustations et des repas gastronomiques. Découvrez les meilleures tables meknassies sur Sortir Au Maroc.',
 'restaurant meknes, manger meknes, où manger meknes, meilleur restaurant meknes',
 0.7),

-- Oujda
('restaurants-oujda', 'restaurant', 'Oujda', NULL, NULL,
 'Restaurants Oujda — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Oujda. Cuisine orientale et spécialités de l''est marocain, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Oujda',
 'Oujda, capitale de l''Oriental marocain, offre une gastronomie unique influencée par sa proximité avec l''Algérie et la Méditerranée. La cuisine oujdie se distingue par ses saveurs intenses et ses plats généreux : la berkoukes, la rfissa, le couscous aux sept légumes et les grillades sont des incontournables. Les restaurants du centre-ville et du quartier Al Massira proposent une cuisine traditionnelle authentique, tandis que les nouvelles adresses de la ville moderne apportent une touche contemporaine. Les pâtisseries et les cafés d''Oujda sont réputés dans tout le royaume pour leur excellence. Explorez la richesse culinaire de l''Oriental sur Sortir Au Maroc.',
 'restaurant oujda, manger oujda, où manger oujda, meilleur restaurant oujda',
 0.7),

-- Kénitra
('restaurants-kenitra', 'restaurant', 'Kénitra', NULL, NULL,
 'Restaurants Kénitra — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Kénitra. Cuisine marocaine et tables de la Mamora, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Kénitra',
 'Kénitra, ville dynamique du Gharb, propose une scène culinaire en plein essor. Située entre Rabat et Meknès, la ville bénéficie d''une position stratégique et d''un accès privilégié aux produits agricoles de la plaine du Gharb, l''un des greniers du Maroc. Les restaurants de Kénitra sont réputés pour la fraîcheur de leurs ingrédients et la générosité de leurs portions. Du poisson frais du port de Mehdia aux spécialités de viande grillée, en passant par les restaurants de la forêt de la Mamora, Kénitra offre des expériences variées pour tous les budgets. Découvrez les bonnes adresses de Kénitra sur Sortir Au Maroc.',
 'restaurant kenitra, manger kenitra, où manger kenitra, meilleur restaurant kenitra',
 0.7),

-- Tétouan
('restaurants-tetouan', 'restaurant', 'Tétouan', NULL, NULL,
 'Restaurants Tétouan — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Tétouan. Cuisine andalouse et méditerranéenne, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Tétouan',
 'Tétouan, la colombe blanche du nord du Maroc, est une ville où la gastronomie porte l''empreinte de l''Andalousie. Sa médina, classée au patrimoine mondial de l''UNESCO, abrite des restaurants et des pâtisseries qui perpétuent des recettes séculaires. La cuisine tétouanaise se distingue par sa finesse et ses influences hispano-mauresques : pastilla au pigeon, tajine de poisson à la charmoula, et les fameuses pâtisseries aux amandes. Les restaurants de la ville nouvelle et du front de mer de Martil complètent l''offre avec des concepts modernes et des terrasses avec vue sur la Méditerranée. Réservez votre table à Tétouan sur Sortir Au Maroc.',
 'restaurant tetouan, manger tetouan, où manger tetouan, meilleur restaurant tetouan',
 0.7);


-- -------------------------------------------------------
-- 2b. Cuisine type × city pages (10 types × 3 cities)
-- -------------------------------------------------------

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

-- === CASABLANCA ===
('restaurant-italien-casablanca', 'restaurant', 'Casablanca', NULL, 'Italien',
 'Restaurants italiens Casablanca | SAM',
 'Les meilleurs restaurants italiens à Casablanca. Pizzas, pastas et cuisine transalpine, réservez votre table sur Sortir Au Maroc.',
 'Restaurants italiens à Casablanca',
 'Casablanca compte parmi les meilleures adresses italiennes du Maroc. Du quartier Gauthier à Maarif en passant par Anfa, les restaurants italiens de la ville blanche proposent des pizzas cuites au feu de bois, des pâtes fraîches maison et des plats de la tradition transalpine. Que vous ayez envie d''une simple margherita ou d''un risotto aux fruits de mer, les chefs italiens et marocains formés en Italie vous garantissent une expérience authentique. Découvrez notre sélection des meilleures tables italiennes à Casablanca et réservez en ligne.',
 'restaurant italien casablanca, pizza casablanca, pâtes casablanca, cuisine italienne casablanca',
 0.7),

('sushi-casablanca', 'restaurant', 'Casablanca', NULL, 'Japonais',
 'Sushi & restaurants japonais Casablanca | SAM',
 'Les meilleurs restaurants de sushi à Casablanca. Sushi, ramen et cuisine japonaise, réservez sur Sortir Au Maroc.',
 'Sushi et restaurants japonais à Casablanca',
 'La scène sushi de Casablanca n''a jamais été aussi dynamique. Des comptoirs à sushi traditionnels aux concepts fusion japonais-marocain, la ville blanche regorge d''adresses pour les amateurs de cuisine nippone. Que vous préfériez les makis classiques, les sashimis ultra-frais ou les rolls créatifs, les restaurants japonais de Casablanca rivalisent de qualité. Le quartier d''Anfa et le boulevard de la Corniche concentrent les meilleures adresses, mais de nouveaux concepts ouvrent régulièrement dans tous les quartiers. Réservez votre table sushi à Casablanca sur Sortir Au Maroc.',
 'sushi casablanca, japonais casablanca, ramen casablanca, maki casablanca',
 0.7),

('restaurant-marocain-casablanca', 'restaurant', 'Casablanca', NULL, 'Marocain',
 'Restaurants marocains Casablanca | SAM',
 'Les meilleurs restaurants marocains à Casablanca. Tajines, couscous et cuisine traditionnelle, réservez sur Sortir Au Maroc.',
 'Restaurants marocains à Casablanca',
 'Casablanca est la ville idéale pour découvrir la richesse de la cuisine marocaine. Des restaurants traditionnels de la médina aux tables gastronomiques qui revisitent les classiques, la ville offre toutes les facettes de la gastronomie du royaume. Tajines parfumés, couscous du vendredi, pastilla croustillante et méchoui fondant sont autant de spécialités à déguster dans des cadres allant du simple et authentique au luxueux et raffiné. Les chefs casablancais excellent dans l''art de sublimer les recettes ancestrales tout en innovant. Trouvez votre restaurant marocain à Casablanca sur Sortir Au Maroc.',
 'restaurant marocain casablanca, tajine casablanca, couscous casablanca, cuisine marocaine casablanca',
 0.7),

('brunch-casablanca', 'restaurant', 'Casablanca', NULL, NULL,
 'Brunch à Casablanca — Les meilleures adresses | SAM',
 'Les meilleurs brunchs à Casablanca. Brunchs gourmands, buffets et formules du weekend, réservez sur Sortir Au Maroc.',
 'Les meilleurs brunchs à Casablanca',
 'Le brunch est devenu un véritable art de vivre à Casablanca. Chaque weekend, les terrasses de Gauthier, les coffee shops de Maarif et les restaurants de la Corniche se remplissent de gourmands en quête du brunch parfait. Des formules buffet all-inclusive aux brunchs à la carte, les options sont nombreuses et variées. Pancakes, eggs benedict, avocado toast, msemen, baghrir et pâtisseries marocaines se côtoient dans des assiettes colorées. Certaines adresses proposent des brunchs thématiques ou des formules avec animation pour les enfants. Découvrez les meilleures adresses brunch de Casablanca et réservez votre dimanche matin sur Sortir Au Maroc.',
 'brunch casablanca, petit dejeuner casablanca, weekend casablanca, meilleur brunch casablanca',
 0.7),

('restaurant-francais-casablanca', 'restaurant', 'Casablanca', NULL, 'Français',
 'Restaurants français Casablanca | SAM',
 'Les meilleurs restaurants français à Casablanca. Bistrots et gastronomie française, réservez sur Sortir Au Maroc.',
 'Restaurants français à Casablanca',
 'L''héritage francophone de Casablanca se retrouve dans sa gastronomie. La ville compte de nombreux restaurants français de qualité, des bistrots traditionnels aux tables gastronomiques. Le quartier Gauthier et le centre-ville abritent des brasseries parisiennes, des restaurants de cuisine bourgeoise et des caves à vins avec menus accords mets-vins. Les chefs français installés à Casablanca apportent leur savoir-faire et leur créativité, souvent en intégrant des produits du terroir marocain à leurs recettes. Découvrez la fine cuisine française à Casablanca sur Sortir Au Maroc.',
 'restaurant francais casablanca, bistrot casablanca, gastronomie française casablanca',
 0.7),

('pizza-casablanca', 'restaurant', 'Casablanca', NULL, 'Italien',
 'Pizzerias Casablanca — Les meilleures pizzas | SAM',
 'Les meilleures pizzerias à Casablanca. Pizzas napolitaines et romaines, four à bois, réservez sur Sortir Au Maroc.',
 'Les meilleures pizzerias à Casablanca',
 'Casablanca est une ville de pizza lovers. Des pizzerias napolitaines authentiques aux concepts de pizza gourmet, la ville blanche offre un tour d''Italie sans quitter le Maroc. Les meilleurs pizzaïolos de la ville utilisent des fours à bois importés de Naples, de la mozzarella di bufala et des farines italiennes pour des pizzas dignes de la botte. Du quartier Gauthier à Ain Diab, en passant par Maarif et le centre-ville, chaque quartier a sa pizzeria préférée. Découvrez les meilleures pizzas de Casablanca et réservez votre soirée pizza sur Sortir Au Maroc.',
 'pizza casablanca, pizzeria casablanca, meilleure pizza casablanca, pizza napolitaine casablanca',
 0.6),

('burger-casablanca', 'restaurant', 'Casablanca', NULL, 'Américain',
 'Burgers Casablanca — Les meilleures adresses | SAM',
 'Les meilleurs burgers à Casablanca. Burgers gourmet, smash burgers et classiques, découvrez les adresses sur SAM.',
 'Les meilleurs burgers à Casablanca',
 'Le burger gourmet a conquis Casablanca. La ville regorge de restaurants et de food trucks spécialisés dans le burger, des classiques américains aux créations originales. Bœuf wagyu, poulet croustillant, options végétariennes : les propositions sont infinies. Les quartiers de Maarif et du Bourgogne concentrent les adresses les plus populaires, mais de nouveaux concepts ouvrent régulièrement aux quatre coins de la ville. Steaks hachés frais, buns briochés, sauces maison et frites croustillantes font le bonheur des burger addicts casablancais. Trouvez le meilleur burger de Casablanca sur Sortir Au Maroc.',
 'burger casablanca, meilleur burger casablanca, smash burger casablanca, burger gourmet casablanca',
 0.6),

('restaurant-asiatique-casablanca', 'restaurant', 'Casablanca', NULL, 'Asiatique',
 'Restaurants asiatiques Casablanca | SAM',
 'Les meilleurs restaurants asiatiques à Casablanca. Thaï, chinois, vietnamien et fusion, réservez sur Sortir Au Maroc.',
 'Restaurants asiatiques à Casablanca',
 'La cuisine asiatique a trouvé un véritable public à Casablanca. Des restaurants chinois historiques aux nouvelles adresses thaïlandaises et vietnamiennes, la ville blanche offre un voyage culinaire à travers l''Asie. Les restaurants de cuisine asiatique de Casablanca proposent des plats authentiques : pad thaï, dim sum, pho, bibimbap et curry sont au rendez-vous. Le quartier du Racine et le boulevard d''Anfa concentrent plusieurs adresses incontournables. Les concepts de street food asiatique et les restaurants fusion complètent une offre de plus en plus riche. Explorez la cuisine asiatique à Casablanca sur Sortir Au Maroc.',
 'restaurant asiatique casablanca, thaï casablanca, chinois casablanca, vietnamien casablanca',
 0.6),

('restaurant-indien-casablanca', 'restaurant', 'Casablanca', NULL, 'Indien',
 'Restaurants indiens Casablanca | SAM',
 'Les meilleurs restaurants indiens à Casablanca. Curry, tandoori et naan, réservez votre table sur Sortir Au Maroc.',
 'Restaurants indiens à Casablanca',
 'La cuisine indienne a ses fidèles adeptes à Casablanca. Les restaurants indiens de la ville proposent un voyage gustatif à travers le sous-continent : currys parfumés, tandoori fumé au charbon, naan fraîchement sorti du four et biryanis épicés. Du butter chicken au masala dosa, en passant par les thalis complets et les samossas croustillants, les saveurs de l''Inde sont bien représentées dans la ville blanche. Les restaurants indiens de Casablanca se distinguent par la qualité de leurs épices et l''authenticité de leurs recettes. Réservez votre table indienne à Casablanca sur Sortir Au Maroc.',
 'restaurant indien casablanca, curry casablanca, tandoori casablanca, cuisine indienne casablanca',
 0.6),

('fruits-de-mer-casablanca', 'restaurant', 'Casablanca', NULL, 'Fruits de mer',
 'Fruits de mer Casablanca — Les meilleures tables | SAM',
 'Les meilleurs restaurants de fruits de mer à Casablanca. Poissons frais et plateaux royaux, réservez sur Sortir Au Maroc.',
 'Restaurants de fruits de mer à Casablanca',
 'Casablanca, avec son port de pêche et sa corniche atlantique, est la ville idéale pour déguster des fruits de mer d''une fraîcheur incomparable. Les restaurants du port de pêche proposent des poissons grillés du jour et des plateaux de fruits de mer à des prix imbattables. Sur la Corniche, les restaurants haut de gamme subliment les produits de la mer avec des préparations raffinées. Huîtres, crevettes royales, homard, sole meunière et loup de mer grillé figurent parmi les incontournables. Découvrez les meilleures tables de fruits de mer à Casablanca sur Sortir Au Maroc.',
 'fruits de mer casablanca, restaurant poisson casablanca, plateau fruits de mer casablanca',
 0.7),

-- === MARRAKECH ===
('restaurant-italien-marrakech', 'restaurant', 'Marrakech', NULL, 'Italien',
 'Restaurants italiens Marrakech | SAM',
 'Les meilleurs restaurants italiens à Marrakech. Pizzas, pastas et dolce vita, réservez sur Sortir Au Maroc.',
 'Restaurants italiens à Marrakech',
 'Marrakech compte de nombreux restaurants italiens de qualité, notamment dans le quartier de Guéliz et à la Palmeraie. Les chefs italiens installés dans la ville ocre proposent des pizzas au feu de bois, des pâtes fraîches maison et des spécialités régionales de toute l''Italie. Les terrasses ombragées des restaurants italiens de Marrakech offrent un cadre idéal pour savourer un aperitivo ou un dîner romantique sous les étoiles. Réservez votre table italienne à Marrakech sur Sortir Au Maroc.',
 'restaurant italien marrakech, pizza marrakech, pâtes marrakech, cuisine italienne marrakech',
 0.7),

('sushi-marrakech', 'restaurant', 'Marrakech', NULL, 'Japonais',
 'Sushi & restaurants japonais Marrakech | SAM',
 'Les meilleurs restaurants de sushi à Marrakech. Sushi frais et cuisine japonaise raffinée, réservez sur Sortir Au Maroc.',
 'Sushi et restaurants japonais à Marrakech',
 'La scène sushi de Marrakech s''est considérablement enrichie ces dernières années. Les restaurants japonais de Guéliz et de l''Hivernage proposent des sushis d''une fraîcheur remarquable, des rolls créatifs et des menus dégustation qui rivalisent avec les grandes capitales. Certains restaurants intègrent des influences marocaines dans leurs créations pour des combinaisons surprenantes. Réservez votre expérience sushi à Marrakech sur Sortir Au Maroc.',
 'sushi marrakech, japonais marrakech, maki marrakech, restaurant japonais marrakech',
 0.7),

('restaurant-marocain-marrakech', 'restaurant', 'Marrakech', NULL, 'Marocain',
 'Restaurants marocains Marrakech | SAM',
 'Les meilleurs restaurants marocains à Marrakech. Tajines, tanjias et palais gastronomiques, réservez sur Sortir Au Maroc.',
 'Restaurants marocains à Marrakech',
 'Marrakech est la ville emblématique de la cuisine marocaine. Des palais gastronomiques de la médina aux restaurants de la Palmeraie, la ville ocre offre une expérience culinaire hors du commun. La tanjia, plat emblématique de Marrakech cuit lentement dans les cendres du hammam, est un incontournable. Les riads-restaurants proposent des menus traditionnels dans des cadres enchanteurs avec fontaines et jardins intérieurs. Les restaurants de la place Jemaa el-Fna offrent quant à eux une expérience street food unique au monde. Découvrez la cuisine marocaine authentique de Marrakech sur Sortir Au Maroc.',
 'restaurant marocain marrakech, tajine marrakech, tanjia marrakech, cuisine marocaine marrakech',
 0.7),

('brunch-marrakech', 'restaurant', 'Marrakech', NULL, NULL,
 'Brunch à Marrakech — Les meilleures adresses | SAM',
 'Les meilleurs brunchs à Marrakech. Terrasses de Guéliz et riads, formules weekend, réservez sur Sortir Au Maroc.',
 'Les meilleurs brunchs à Marrakech',
 'Le brunch à Marrakech est une institution, surtout le weekend. Les terrasses de Guéliz, les jardins de riads et les restaurants de la Palmeraie rivalisent de créativité pour proposer des brunchs mémorables. Mêlant influences marocaines et internationales, les brunchs marrakchis proposent des pancakes, des œufs bénédicte et des avocado toasts côte à côte avec des msemen, du baghrir et des pâtisseries aux amandes. Certains hôtels et riads proposent des brunchs avec piscine pour une expérience complète. Réservez votre brunch à Marrakech sur Sortir Au Maroc.',
 'brunch marrakech, petit dejeuner marrakech, weekend marrakech, meilleur brunch marrakech',
 0.7),

('restaurant-francais-marrakech', 'restaurant', 'Marrakech', NULL, 'Français',
 'Restaurants français Marrakech | SAM',
 'Les meilleurs restaurants français à Marrakech. Gastronomie et bistronomie française, réservez sur Sortir Au Maroc.',
 'Restaurants français à Marrakech',
 'Marrakech attire de nombreux chefs français qui y ouvrent des restaurants d''exception. La bistronomie française se marie parfaitement avec les produits du terroir marocain, donnant naissance à une cuisine fusion élégante. Les restaurants français de Guéliz et de l''Hivernage proposent des menus gastronomiques, des caves à vins bien fournies et un service soigné. Des adresses incontournables pour les amateurs de cuisine française au cœur de la ville ocre. Réservez sur Sortir Au Maroc.',
 'restaurant francais marrakech, bistrot marrakech, gastronomie française marrakech',
 0.6),

('pizza-marrakech', 'restaurant', 'Marrakech', NULL, 'Italien',
 'Pizzerias Marrakech — Les meilleures pizzas | SAM',
 'Les meilleures pizzerias à Marrakech. Pizzas napolitaines, four à bois et livraison, réservez sur Sortir Au Maroc.',
 'Les meilleures pizzerias à Marrakech',
 'Marrakech compte d''excellentes pizzerias, particulièrement dans les quartiers de Guéliz et de l''Hivernage. Les pizzaïolos de la ville ocre maîtrisent l''art de la pizza napolitaine avec des fours à bois, des pâtes longue fermentation et des ingrédients importés d''Italie. Des adresses familiales aux concepts gourmet, il y en a pour tous les goûts et tous les budgets. Trouvez votre pizzeria à Marrakech sur Sortir Au Maroc.',
 'pizza marrakech, pizzeria marrakech, meilleure pizza marrakech',
 0.6),

('burger-marrakech', 'restaurant', 'Marrakech', NULL, 'Américain',
 'Burgers Marrakech — Les meilleures adresses | SAM',
 'Les meilleurs burgers à Marrakech. Burgers gourmet et classiques américains, découvrez les adresses sur SAM.',
 'Les meilleurs burgers à Marrakech',
 'Le burger gourmet s''est imposé à Marrakech avec plusieurs adresses devenues incontournables. Guéliz concentre les meilleurs spots burger de la ville, avec des concepts qui misent sur la qualité des produits : bœuf frais, buns artisanaux et sauces maison. Des food trucks aux restaurants assis, la scène burger marrakchie est variée et créative. Trouvez le meilleur burger de Marrakech sur Sortir Au Maroc.',
 'burger marrakech, meilleur burger marrakech, burger gourmet marrakech',
 0.6),

('restaurant-asiatique-marrakech', 'restaurant', 'Marrakech', NULL, 'Asiatique',
 'Restaurants asiatiques Marrakech | SAM',
 'Les meilleurs restaurants asiatiques à Marrakech. Thaï, japonais, chinois et fusion, réservez sur Sortir Au Maroc.',
 'Restaurants asiatiques à Marrakech',
 'Marrakech propose une offre croissante de restaurants asiatiques de qualité. Des restaurants thaïlandais aux tables japonaises en passant par les restaurants chinois et vietnamiens, la ville ocre permet un véritable tour d''Asie culinaire. Les concepts de fusion asiatique-marocaine ajoutent une touche originale à cette offre. Découvrez les restaurants asiatiques de Marrakech sur Sortir Au Maroc.',
 'restaurant asiatique marrakech, thaï marrakech, chinois marrakech, cuisine asiatique marrakech',
 0.6),

('restaurant-indien-marrakech', 'restaurant', 'Marrakech', NULL, 'Indien',
 'Restaurants indiens Marrakech | SAM',
 'Les meilleurs restaurants indiens à Marrakech. Curry, tandoori et cuisine du sous-continent, réservez sur SAM.',
 'Restaurants indiens à Marrakech',
 'Les restaurants indiens de Marrakech proposent des currys épicés, des tandooris fumés et des naans dorés dans des cadres chaleureux. La communauté indienne de Marrakech a contribué à l''émergence de plusieurs adresses authentiques, notamment dans le quartier de Guéliz. Les biryanis parfumés et les thalis colorés séduisent les amateurs de saveurs intenses. Réservez votre table indienne à Marrakech sur Sortir Au Maroc.',
 'restaurant indien marrakech, curry marrakech, tandoori marrakech, cuisine indienne marrakech',
 0.6),

('fruits-de-mer-marrakech', 'restaurant', 'Marrakech', NULL, 'Fruits de mer',
 'Fruits de mer Marrakech — Les meilleures tables | SAM',
 'Les meilleurs restaurants de fruits de mer à Marrakech. Poissons frais et plateaux, réservez sur Sortir Au Maroc.',
 'Restaurants de fruits de mer à Marrakech',
 'Bien que située à l''intérieur des terres, Marrakech dispose de restaurants de fruits de mer qui se font livrer quotidiennement les produits de la pêche d''Essaouira et d''Agadir. Les restaurants de poisson de la ville ocre proposent des produits d''une remarquable fraîcheur : plateaux de fruits de mer, poissons grillés, tajines de poisson et spécialités de la côte atlantique. Réservez votre table poisson à Marrakech sur Sortir Au Maroc.',
 'fruits de mer marrakech, restaurant poisson marrakech, fruits de mer marrakech',
 0.6),

-- === RABAT ===
('restaurant-italien-rabat', 'restaurant', 'Rabat', NULL, 'Italien',
 'Restaurants italiens Rabat | SAM',
 'Les meilleurs restaurants italiens à Rabat. Pizzas, pastas et cuisine italienne authentique, réservez sur SAM.',
 'Restaurants italiens à Rabat',
 'Rabat accueille plusieurs restaurants italiens de qualité, notamment dans les quartiers de l''Agdal et de Hassan. Les pizzerias napolitaines côtoient les trattorias traditionnelles et les restaurants gastronomiques italiens. Le cadre raffiné de la capitale se prête parfaitement à un dîner italien avec vue sur le Bouregreg ou dans les ruelles de la ville nouvelle. Réservez votre restaurant italien à Rabat sur Sortir Au Maroc.',
 'restaurant italien rabat, pizza rabat, pâtes rabat, cuisine italienne rabat',
 0.6),

('sushi-rabat', 'restaurant', 'Rabat', NULL, 'Japonais',
 'Sushi & restaurants japonais Rabat | SAM',
 'Les meilleurs restaurants de sushi à Rabat. Sushi frais et cuisine japonaise, réservez sur Sortir Au Maroc.',
 'Sushi et restaurants japonais à Rabat',
 'La scène sushi de Rabat s''est considérablement développée avec l''ouverture de restaurants japonais de qualité dans les quartiers de l''Agdal et de Hay Riad. Des comptoirs à sushi intimistes aux restaurants japonais plus élaborés, la capitale offre un éventail d''adresses pour les amateurs de cuisine nippone. Fraîcheur du poisson et créativité des rolls sont au rendez-vous. Réservez votre expérience sushi à Rabat sur Sortir Au Maroc.',
 'sushi rabat, japonais rabat, maki rabat, restaurant japonais rabat',
 0.6),

('restaurant-marocain-rabat', 'restaurant', 'Rabat', NULL, 'Marocain',
 'Restaurants marocains Rabat | SAM',
 'Les meilleurs restaurants marocains à Rabat. Cuisine traditionnelle de la capitale, réservez sur Sortir Au Maroc.',
 'Restaurants marocains à Rabat',
 'Rabat, capitale du Royaume, offre une cuisine marocaine empreinte d''élégance et de raffinement. Les restaurants de la médina et de la Kasbah des Oudaïas proposent des tajines et des couscous dans des cadres historiques enchanteurs. L''Agdal et Hassan abritent des restaurants gastronomiques marocains qui revisitent les classiques avec modernité. La cuisine rbatie est réputée pour sa délicatesse et son équilibre des saveurs. Découvrez les restaurants marocains de la capitale sur Sortir Au Maroc.',
 'restaurant marocain rabat, tajine rabat, couscous rabat, cuisine marocaine rabat',
 0.6),

('brunch-rabat', 'restaurant', 'Rabat', NULL, NULL,
 'Brunch à Rabat — Les meilleures adresses | SAM',
 'Les meilleurs brunchs à Rabat. Brunchs gourmands et formules weekend dans la capitale, réservez sur SAM.',
 'Les meilleurs brunchs à Rabat',
 'Le brunch est devenu incontournable à Rabat, surtout le weekend. Les coffee shops de l''Agdal, les terrasses de Hassan et les restaurants du Bouregreg proposent des formules brunch variées et gourmandes. Influences internationales et touches marocaines se mêlent dans des assiettes créatives et généreuses. Des spots instagrammables aux adresses plus intimistes, Rabat a de quoi satisfaire tous les bruncheurs. Réservez votre brunch à Rabat sur Sortir Au Maroc.',
 'brunch rabat, petit dejeuner rabat, weekend rabat, meilleur brunch rabat',
 0.6),

('restaurant-francais-rabat', 'restaurant', 'Rabat', NULL, 'Français',
 'Restaurants français Rabat | SAM',
 'Les meilleurs restaurants français à Rabat. Gastronomie et bistronomie de la capitale, réservez sur Sortir Au Maroc.',
 'Restaurants français à Rabat',
 'Rabat, avec sa tradition diplomatique et sa communauté francophone importante, compte parmi les meilleures adresses françaises du Maroc. Les restaurants de l''Agdal et du centre-ville proposent une cuisine française raffinée, des brasseries classiques aux tables bistronomiques modernes. Les chefs français installés à Rabat y apportent leur expertise et leur passion, pour le plus grand bonheur des gourmets de la capitale. Réservez votre table française à Rabat sur Sortir Au Maroc.',
 'restaurant francais rabat, bistrot rabat, gastronomie française rabat',
 0.6),

('pizza-rabat', 'restaurant', 'Rabat', NULL, 'Italien',
 'Pizzerias Rabat — Les meilleures pizzas | SAM',
 'Les meilleures pizzerias à Rabat. Pizzas napolitaines et four à bois dans la capitale, réservez sur SAM.',
 'Les meilleures pizzerias à Rabat',
 'Rabat dispose d''excellentes pizzerias dans tous les quartiers de la ville. De l''Agdal à Hassan en passant par Hay Riad, les pizzaïolos de la capitale proposent des pizzas napolitaines au four à bois, des pâtes longue fermentation et des ingrédients de qualité. Des adresses familiales aux concepts gourmet, la pizza rbatie a de quoi surprendre. Découvrez les meilleures pizzerias de Rabat sur Sortir Au Maroc.',
 'pizza rabat, pizzeria rabat, meilleure pizza rabat',
 0.6),

('burger-rabat', 'restaurant', 'Rabat', NULL, 'Américain',
 'Burgers Rabat — Les meilleures adresses | SAM',
 'Les meilleurs burgers à Rabat. Burgers gourmet et smash burgers dans la capitale, découvrez les adresses sur SAM.',
 'Les meilleurs burgers à Rabat',
 'La scène burger de Rabat ne cesse de s''enrichir avec de nouvelles adresses créatives. L''Agdal et l''océan concentrent les spots les plus populaires, avec des concepts qui misent sur des steaks hachés frais, des buns artisanaux et des accompagnements originaux. Du classique cheeseburger au burger gourmet gastronomique, Rabat a le burger qu''il vous faut. Découvrez les meilleures adresses sur Sortir Au Maroc.',
 'burger rabat, meilleur burger rabat, burger gourmet rabat, smash burger rabat',
 0.6),

('restaurant-asiatique-rabat', 'restaurant', 'Rabat', NULL, 'Asiatique',
 'Restaurants asiatiques Rabat | SAM',
 'Les meilleurs restaurants asiatiques à Rabat. Thaï, chinois, japonais et fusion, réservez sur Sortir Au Maroc.',
 'Restaurants asiatiques à Rabat',
 'La cuisine asiatique est de plus en plus présente à Rabat. Des restaurants thaïlandais de l''Agdal aux restaurants chinois historiques, en passant par les nouveaux concepts vietnamiens et coréens, la capitale offre un beau panorama de la gastronomie asiatique. Les restaurants fusion qui marient saveurs asiatiques et produits locaux ajoutent une touche d''originalité. Explorez la cuisine asiatique à Rabat sur Sortir Au Maroc.',
 'restaurant asiatique rabat, thaï rabat, chinois rabat, cuisine asiatique rabat',
 0.6),

('restaurant-indien-rabat', 'restaurant', 'Rabat', NULL, 'Indien',
 'Restaurants indiens Rabat | SAM',
 'Les meilleurs restaurants indiens à Rabat. Curry, tandoori et naan dans la capitale, réservez sur SAM.',
 'Restaurants indiens à Rabat',
 'Les restaurants indiens de Rabat proposent une cuisine authentique aux saveurs intenses. Currys, tandooris, biryanis et naans sont préparés avec des épices importées et un savoir-faire traditionnel. Les quartiers de l''Agdal et de Hassan abritent les principales adresses indiennes de la capitale. Réservez votre table indienne à Rabat sur Sortir Au Maroc.',
 'restaurant indien rabat, curry rabat, tandoori rabat, cuisine indienne rabat',
 0.6),

('fruits-de-mer-rabat', 'restaurant', 'Rabat', NULL, 'Fruits de mer',
 'Fruits de mer Rabat — Les meilleures tables | SAM',
 'Les meilleurs restaurants de fruits de mer à Rabat. Poissons frais de l''Atlantique, réservez sur Sortir Au Maroc.',
 'Restaurants de fruits de mer à Rabat',
 'Rabat, ville côtière de l''Atlantique, offre un accès privilégié aux produits de la mer les plus frais. Les restaurants de fruits de mer du front de mer et du Bouregreg proposent des poissons grillés du jour, des plateaux royaux et des spécialités de la mer. Le port de pêche de Rabat alimente quotidiennement les tables de la ville en produits d''une fraîcheur incomparable. Réservez votre restaurant de fruits de mer à Rabat sur Sortir Au Maroc.',
 'fruits de mer rabat, restaurant poisson rabat, plateau fruits de mer rabat',
 0.6);


-- -------------------------------------------------------
-- 2c. National pages (sans ville)
-- -------------------------------------------------------

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

('restaurants-maroc', 'restaurant', NULL, NULL, NULL,
 'Restaurants au Maroc — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants au Maroc. De Casablanca à Marrakech, réservez dans les meilleures adresses sur Sortir Au Maroc.',
 'Les meilleurs restaurants au Maroc',
 'Le Maroc est une destination gastronomique de premier plan, reconnue mondialement pour la richesse et la diversité de sa cuisine. De Casablanca à Marrakech, de Fès à Tanger, chaque ville a ses spécialités et ses adresses incontournables. La cuisine marocaine, inscrite au patrimoine immatériel de l''UNESCO, se décline en une infinité de tajines, couscous, pastillas et grillades. Mais le Maroc, c''est aussi une scène culinaire internationale en pleine effervescence : restaurants français, italiens, japonais, indiens et fusion se multiplient dans les grandes villes. Que vous cherchiez un restaurant traditionnel dans un riad de Fès, un rooftop branché à Marrakech ou un restaurant de poisson face à l''océan à Agadir, Sortir Au Maroc vous aide à trouver et réserver la table parfaite. Notre plateforme référence des milliers de restaurants dans tout le royaume, avec des avis vérifiés et la réservation en ligne.',
 'restaurant maroc, meilleur restaurant maroc, où manger maroc, gastronomie marocaine',
 0.9),

('meilleurs-restaurants-maroc', 'restaurant', NULL, NULL, NULL,
 'Top restaurants Maroc — Les incontournables 2026 | SAM',
 'Le classement des meilleurs restaurants au Maroc en 2026. Gastronomie marocaine et internationale, réservez sur SAM.',
 'Les meilleurs restaurants du Maroc en 2026',
 'Découvrez notre sélection des meilleurs restaurants du Maroc pour 2026. Ce classement est basé sur les avis vérifiés de nos utilisateurs, les notes Google, et l''expertise de notre équipe éditoriale. Des tables gastronomiques aux adresses de quartier, nous avons sélectionné les établissements qui se distinguent par la qualité de leur cuisine, leur service et leur cadre. Le Maroc culinaire ne cesse de se réinventer, avec de nouveaux chefs talentueux qui ouvrent des restaurants innovants tout en préservant l''authenticité des saveurs marocaines. De Casablanca à Marrakech, de Rabat à Tanger, explorez les meilleures tables du royaume et réservez votre prochaine expérience gastronomique sur Sortir Au Maroc.',
 'meilleur restaurant maroc, top restaurant maroc, classement restaurant maroc 2026',
 0.8),

('brunch-maroc', 'restaurant', NULL, NULL, NULL,
 'Brunch au Maroc — Les meilleures adresses 2026 | SAM',
 'Les meilleurs brunchs au Maroc. De Casablanca à Marrakech, trouvez le brunch parfait et réservez sur Sortir Au Maroc.',
 'Les meilleurs brunchs au Maroc',
 'Le brunch est devenu un véritable phénomène au Maroc. Chaque weekend, les terrasses des grandes villes se remplissent de gourmands en quête de la formule idéale. Casablanca, Marrakech, Rabat et Tanger rivalisent de créativité avec des brunchs qui mêlent influences internationales et touches marocaines. Pancakes et msemen, eggs benedict et baghrir, avocado toast et amlou : les brunchs marocains sont un festival de saveurs. Des hôtels cinq étoiles aux coffee shops de quartier, en passant par les riads et les rooftops, les options sont infinies. Sortir Au Maroc vous aide à trouver le brunch parfait pour votre dimanche matin, où que vous soyez dans le royaume.',
 'brunch maroc, meilleur brunch maroc, brunch weekend maroc, petit dejeuner gourmand maroc',
 0.8);

COMMIT;
