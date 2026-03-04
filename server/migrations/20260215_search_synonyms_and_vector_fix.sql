-- ============================================================================
-- SEARCH ENGINE FIX: Synonyms + Vector Enhancement
-- Fixes: "Asiatique", "cuisine marocaine", and ALL taxonomy terms
-- 1. Creates search_synonyms table with comprehensive mappings
-- 2. Updates search vector to include ambiance_tags + specialties
-- 3. Updates search function to expand queries via synonyms
-- 4. Re-populates all search vectors
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE SEARCH SYNONYMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,           -- What the user types (e.g. "asiatique", "cuisine marocaine")
  expanded_terms text NOT NULL, -- What we actually search for (e.g. "asiatique japonais chinois thaïlandais coréen vietnamien wok sushi")
  universe text,                -- NULL = all universes
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_synonyms_term_universe
  ON public.search_synonyms (lower(term), COALESCE(universe, '__all__'));

CREATE INDEX IF NOT EXISTS idx_search_synonyms_term_trgm
  ON public.search_synonyms USING GIN (term gin_trgm_ops);

-- ============================================================================
-- 2. SEED SYNONYMS — RESTAURANTS / CUISINE TYPES
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  -- Generic "cuisine X" phrases → expand to the cuisine adjective + related terms
  ('cuisine marocaine', 'marocain cuisine marocaine tajine couscous pastilla harira tanjia rfissa traditionnel', 'restaurant'),
  ('cuisine française', 'français cuisine française bistrot brasserie gastronomique terroir', 'restaurant'),
  ('cuisine italienne', 'italien cuisine italienne pizza pasta pâtes risotto antipasti trattoria', 'restaurant'),
  ('cuisine japonaise', 'japonais cuisine japonaise sushi sashimi ramen tempura izakaya yakitori maki', 'restaurant'),
  ('cuisine chinoise', 'chinois cuisine chinoise dim sum cantonais szechuan wok nouilles', 'restaurant'),
  ('cuisine libanaise', 'libanais cuisine libanaise mezze falafel houmous taboulé shawarma', 'restaurant'),
  ('cuisine indienne', 'indien cuisine indienne curry tandoori naan biryani tikka masala', 'restaurant'),
  ('cuisine mexicaine', 'mexicain cuisine mexicaine tacos burrito enchilada guacamole quesadilla', 'restaurant'),
  ('cuisine thaïlandaise', 'thaïlandais cuisine thaïlandaise thai pad thai tom yam curry vert', 'restaurant'),
  ('cuisine thaï', 'thaïlandais cuisine thaïlandaise thai pad thai tom yam curry vert', 'restaurant'),
  ('cuisine méditerranéenne', 'méditerranéen cuisine méditerranéenne grec turc libanais espagnol mezze', 'restaurant'),
  ('cuisine orientale', 'oriental cuisine orientale libanais syrien turc mezze kebab shawarma', 'restaurant'),
  ('cuisine espagnole', 'espagnol cuisine espagnole tapas paella sangria pintxos', 'restaurant'),
  ('cuisine turque', 'turc cuisine turque kebab döner pide lahmacun baklava', 'restaurant'),
  ('cuisine coréenne', 'coréen cuisine coréenne bibimbap kimchi barbecue coréen bulgogi', 'restaurant'),
  ('cuisine vietnamienne', 'vietnamien cuisine vietnamienne pho bo bun nem banh mi', 'restaurant'),
  ('cuisine brésilienne', 'brésilien cuisine brésilienne churrasco picanha feijoada', 'restaurant'),
  ('cuisine péruvienne', 'péruvien cuisine péruvienne ceviche lomo saltado', 'restaurant'),
  ('cuisine africaine', 'africain cuisine africaine sénégalais éthiopien camerounais', 'restaurant'),
  ('cuisine algérienne', 'algérien cuisine algérienne couscous chorba bourek', 'restaurant'),
  ('cuisine tunisienne', 'tunisien cuisine tunisienne brik ojja lablabi couscous', 'restaurant'),
  ('cuisine grecque', 'grec cuisine grecque gyros souvlaki moussaka tzatziki salade grecque', 'restaurant'),
  ('cuisine américaine', 'américain cuisine américaine burger hamburger hot dog bbq barbecue ribs', 'restaurant'),
  ('cuisine portugaise', 'portugais cuisine portugaise bacalhau pasteis de nata grillades', 'restaurant'),

  -- Adjective/noun variants → umbrella terms that encompass sub-cuisines
  ('asiatique', 'asiatique japonais chinois thaïlandais coréen vietnamien cambodgien indien wok sushi ramen pho noodles nouilles', 'restaurant'),
  ('oriental', 'oriental libanais syrien turc marocain tunisien algérien iranien mezze kebab shawarma falafel', 'restaurant'),
  ('africain', 'africain sénégalais éthiopien camerounais nigérian ivoirien', 'restaurant'),
  ('latino', 'latino mexicain brésilien péruvien colombien cubain vénézuélien argentin', 'restaurant'),
  ('européen', 'français italien espagnol portugais grec allemand anglais', 'restaurant'),
  ('fusion', 'fusion monde créatif asiatique méditerranéen moderne', 'restaurant'),

  -- Dish-based searches
  ('sushi', 'sushi japonais maki sashimi california roll nigiri', 'restaurant'),
  ('pizza', 'pizza italien pizzeria napolitaine margherita', 'restaurant'),
  ('burger', 'burger hamburger smash burger américain fast food gourmet', 'restaurant'),
  ('tacos', 'tacos mexicain taqueria burrito', 'restaurant'),
  ('couscous', 'couscous marocain algérien tunisien traditionnel', 'restaurant'),
  ('tajine', 'tajine marocain traditionnel tagine', 'restaurant'),
  ('pastilla', 'pastilla marocain traditionnel bastilla', 'restaurant'),
  ('brunch', 'brunch petit déjeuner breakfast eggs benedict pancakes', 'restaurant'),
  ('grillades', 'grillades grill barbecue bbq steakhouse viande braise', 'restaurant'),
  ('fruits de mer', 'fruits de mer poisson seafood crevettes huîtres moules crustacés', 'restaurant'),
  ('pâtes', 'pâtes pasta italien spaghetti tagliatelle penne carbonara bolognaise', 'restaurant'),
  ('ramen', 'ramen japonais nouilles soupe', 'restaurant'),
  ('mezze', 'mezze libanais oriental houmous taboulé falafel', 'restaurant'),
  ('kebab', 'kebab turc döner shawarma grillade', 'restaurant'),
  ('tapas', 'tapas espagnol pintxos apéritif petits plats', 'restaurant'),
  ('crêpes', 'crêpes crêperie galette bretonne', 'restaurant'),
  ('poke', 'poke bowl hawaïen poisson cru healthy', 'restaurant'),
  ('dim sum', 'dim sum chinois cantonais raviolis vapeur', 'restaurant'),

  -- Concept searches
  ('steakhouse', 'steakhouse grill grillades viande bœuf steak côte', 'restaurant'),
  ('café', 'café coffee shop salon de thé latte cappuccino espresso', 'restaurant'),
  ('bar', 'bar lounge cocktail apéritif mixologie', 'restaurant'),
  ('brasserie', 'brasserie français bistrot terrasse plat du jour', 'restaurant'),
  ('fast food', 'fast food burger pizza tacos rapide à emporter', 'restaurant'),
  ('gastronomique', 'gastronomique étoilé fine dining chef table gastro', 'restaurant'),
  ('street food', 'street food food truck ambulant snack rapide', 'restaurant'),
  ('buffet', 'buffet à volonté all you can eat brunch self service', 'restaurant'),
  ('traiteur', 'traiteur événement mariage réception catering', 'restaurant'),
  ('pâtisserie', 'pâtisserie dessert gâteau cake viennoiserie', 'restaurant'),
  ('boulangerie', 'boulangerie pain viennoiserie croissant artisan', 'restaurant'),
  ('glacier', 'glacier glace ice cream sorbet frozen', 'restaurant'),
  ('salon de thé', 'salon de thé thé pâtisserie café goûter', 'restaurant'),

  -- Diet searches
  ('vegan', 'vegan végétalien plant based sans viande sans lait', 'restaurant'),
  ('végétarien', 'végétarien vegan légumes sans viande veggie', 'restaurant'),
  ('halal', 'halal certifié halal viande halal', 'restaurant'),
  ('sans gluten', 'sans gluten gluten free intolérance cœliaque', 'restaurant'),
  ('healthy', 'healthy sain salade bowl poke bio détox', 'restaurant'),
  ('bio', 'bio biologique organique naturel produits locaux', 'restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. SEED SYNONYMS — AMBIANCES (all universes)
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('romantique', 'romantique couple amoureux tête à tête intimiste dîner aux chandelles saint valentin', NULL),
  ('familial', 'familial famille enfants kids club aire de jeux menu enfant', NULL),
  ('branché', 'branché tendance trendy hype insta instagrammable design', NULL),
  ('cosy', 'cosy chaleureux intime confortable douillet', NULL),
  ('terrasse', 'terrasse extérieur en plein air outdoor vue', NULL),
  ('rooftop', 'rooftop toit terrasse vue panoramique skybar', NULL),
  ('festif', 'festif fête soirée ambiance DJ musique danse', NULL),
  ('lounge', 'lounge bar chillout détente cocktail musique', NULL),
  ('live music', 'live music musique live concert groupe chanteur DJ', NULL),
  ('vue mer', 'vue mer bord de mer océan plage front de mer', NULL),
  ('bord de mer', 'bord de mer vue mer océan plage littoral côte', NULL),
  ('jardin', 'jardin verdure nature extérieur plein air calme', NULL),
  ('piscine', 'piscine pool baignade aqua', NULL),
  ('business', 'business professionnel séminaire réunion corporate conférence team building', NULL),
  ('anniversaire', 'anniversaire fête birthday célébration', NULL),
  ('evjf', 'evjf evg enterrement vie de jeune fille garçon bachelorette bachelor fête', NULL),
  ('team building', 'team building entreprise corporate séminaire groupe équipe cohésion', NULL),
  ('décontracté', 'décontracté casual relax informel chill', NULL),
  ('gastronomique', 'gastronomique étoilé fine dining chef table haut de gamme', NULL),
  ('traditionnel', 'traditionnel authentique typique artisanal local terroir', NULL),
  ('design', 'design moderne contemporain minimaliste architectural', NULL),
  ('intimiste', 'intimiste intime petit cosy calme tête à tête', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. SEED SYNONYMS — SPORT & BIEN-ÊTRE
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('hammam', 'hammam bain vapeur gommage savon noir spa traditionnel', 'sport'),
  ('spa', 'spa bien-être wellness détente relaxation massage jacuzzi sauna hammam', 'sport'),
  ('massage', 'massage relaxant sportif thaïlandais shiatsu pierres chaudes réflexologie', 'sport'),
  ('yoga', 'yoga hatha vinyasa kundalini méditation stretching souplesse', 'sport'),
  ('pilates', 'pilates renforcement gainage core souplesse', 'sport'),
  ('fitness', 'fitness gym musculation salle de sport entraînement cardio', 'sport'),
  ('crossfit', 'crossfit hiit fonctionnel circuit training', 'sport'),
  ('musculation', 'musculation bodybuilding fitness poids haltères gym', 'sport'),
  ('piscine', 'piscine natation aquagym aqua nage bassin', 'sport'),
  ('padel', 'padel raquette terrain padel court', 'sport'),
  ('tennis', 'tennis raquette court terre battue', 'sport'),
  ('foot', 'foot football foot5 foot 5 terrain synthétique', 'sport'),
  ('boxe', 'boxe boxing mma arts martiaux kick boxing muay thai', 'sport'),
  ('arts martiaux', 'arts martiaux karate judo taekwondo jiu jitsu kung fu self défense', 'sport'),
  ('coiffeur', 'coiffeur coiffure salon cheveux brushing coloration mèches', 'sport'),
  ('barbier', 'barbier barber coiffeur homme barbe rasage', 'sport'),
  ('institut beauté', 'institut beauté esthétique soins visage corps manucure pédicure épilation', 'sport'),
  ('salle de sport', 'salle de sport gym fitness musculation cardio entraînement', 'sport'),
  ('coach', 'coach personnel coaching entraîneur trainer personal training', 'sport'),
  ('bien-être', 'bien-être wellness spa hammam massage détente relaxation', 'sport'),
  ('détente', 'détente relaxation bien-être spa zen calme repos', 'sport'),
  ('escalade', 'escalade bloc varappe grimpe climbing mur', 'sport'),
  ('squash', 'squash raquette court indoor', 'sport'),
  ('sauna', 'sauna vapeur chaleur détente finlandais', 'sport'),
  ('jacuzzi', 'jacuzzi bain à remous spa balnéothérapie whirlpool', 'sport')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. SEED SYNONYMS — LOISIRS
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('escape game', 'escape game escape room énigme puzzle aventure enquête immersif', 'loisir'),
  ('karting', 'karting kart course circuit vitesse', 'loisir'),
  ('quad', 'quad buggy randonnée tout terrain aventure', 'loisir'),
  ('jet ski', 'jet ski jetski nautique mer eau sport scooter des mers', 'loisir'),
  ('paddle', 'paddle stand up paddle SUP mer eau planche', 'loisir'),
  ('kayak', 'kayak canoë pirogue eau rivière mer pagaie', 'loisir'),
  ('surf', 'surf kitesurf bodyboard vague planche glisse', 'loisir'),
  ('kitesurf', 'kitesurf kite surf vent planche voile', 'loisir'),
  ('parachute', 'parachute parapente saut chute libre vol aérien ciel', 'loisir'),
  ('parapente', 'parapente vol libre aérien ciel panorama', 'loisir'),
  ('golf', 'golf parcours green trou putting driving range practice', 'loisir'),
  ('bowling', 'bowling quilles piste boule', 'loisir'),
  ('laser game', 'laser game laser tag combat jeu équipe', 'loisir'),
  ('paintball', 'paintball airsoft tir combat équipe', 'loisir'),
  ('aquapark', 'aquapark parc aquatique toboggan piscine glissade eau', 'loisir'),
  ('parc attractions', 'parc attractions manèges sensations fortes fête foraine luna park', 'loisir'),
  ('zoo', 'zoo parc animalier animaux safari faune', 'loisir'),
  ('balade cheval', 'balade cheval équitation randonnée cavalière haras', 'loisir'),
  ('balade chameau', 'balade chameau dromadaire désert méharée', 'loisir'),
  ('randonnée', 'randonnée trekking marche trail montagne nature', 'loisir'),
  ('VTT', 'VTT vélo mountain bike cyclisme randonnée', 'loisir'),
  ('accrobranche', 'accrobranche parcours aventure tyrolienne arbre forêt', 'loisir'),
  ('plongée', 'plongée diving sous marine snorkeling masque tuba', 'loisir'),
  ('réalité virtuelle', 'réalité virtuelle VR jeu vidéo simulation immersif casque', 'loisir'),
  ('karaoké', 'karaoké chant micro soirée musique', 'loisir'),
  ('billard', 'billard pool snooker queue bille', 'loisir'),
  ('wakeboard', 'wakeboard ski nautique câble glisse eau', 'loisir'),
  ('saut élastique', 'saut élastique bungee jumping adrénaline sensations fortes', 'loisir'),
  ('simulateur', 'simulateur simulation vol course conduite expérience', 'loisir'),
  ('trottinette', 'trottinette électrique mobilité balade visite', 'loisir'),
  ('activité nautique', 'activité nautique mer eau jet ski paddle kayak surf voile bateau', 'loisir'),
  ('activité aérienne', 'activité aérienne parachute parapente ULM montgolfière vol', 'loisir'),
  ('sensations fortes', 'sensations fortes adrénaline extrême parachute saut élastique karting quad', 'loisir'),
  ('enfants', 'enfants kids famille parc jeux aire de jeux anniversaire', 'loisir')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. SEED SYNONYMS — HÉBERGEMENT
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('hôtel', 'hôtel hotel hébergement nuit chambre séjour', 'hebergement'),
  ('hotel', 'hôtel hotel hébergement nuit chambre séjour', 'hebergement'),
  ('riad', 'riad maison traditionnelle médina patio fontaine maroc', 'hebergement'),
  ('maison hôtes', 'maison hôtes guesthouse chambre hôtes accueil familial', 'hebergement'),
  ('villa', 'villa maison privée piscine jardin luxe vacances', 'hebergement'),
  ('appartement', 'appartement appart location meublé studio loft', 'hebergement'),
  ('resort', 'resort complexe all inclusive club vacances', 'hebergement'),
  ('auberge', 'auberge hostel backpacker dortoir budget économique', 'hebergement'),
  ('glamping', 'glamping camping luxe nature tente lodge insolite', 'hebergement'),
  ('camping', 'camping tente caravane nature plein air bivouac', 'hebergement'),
  ('palace', 'palace palace luxe 5 étoiles prestige grand hôtel', 'hebergement'),
  ('chalet', 'chalet montagne neige ski bois cosy', 'hebergement'),
  ('bungalow', 'bungalow cottage petite maison vacances plage', 'hebergement'),
  ('chambre hôtes', 'chambre hôtes bed and breakfast B&B petit déjeuner accueil', 'hebergement'),
  ('luxe', 'luxe palace 5 étoiles premium prestige suite', 'hebergement'),
  ('pas cher', 'pas cher budget économique bon marché low cost auberge hostel', 'hebergement'),
  ('piscine', 'piscine pool baignade hébergement piscine', 'hebergement'),
  ('vue mer', 'vue mer bord de mer plage océan front de mer littoral', 'hebergement'),
  ('all inclusive', 'all inclusive tout compris pension complète resort club', 'hebergement'),
  ('boutique hotel', 'boutique hotel petit hôtel design charme unique', 'hebergement')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. SEED SYNONYMS — CULTURE
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('musée', 'musée museum exposition collection art histoire sciences', 'culture'),
  ('visite', 'visite guidée visite touristique découverte excursion tour', 'culture'),
  ('visite guidée', 'visite guidée tour guide accompagné découverte patrimoine', 'culture'),
  ('théâtre', 'théâtre pièce spectacle comédie drame scène représentation', 'culture'),
  ('concert', 'concert musique live spectacle scène artiste groupe festival', 'culture'),
  ('exposition', 'exposition expo galerie art peinture sculpture photo', 'culture'),
  ('galerie', 'galerie galerie art exposition peinture sculpture artiste contemporain', 'culture'),
  ('festival', 'festival événement musique spectacle culturel annuel', 'culture'),
  ('monument', 'monument historique patrimoine architecture ancien palais château', 'culture'),
  ('médina', 'médina vieille ville souk artisanat patrimoine historique traditionnel', 'culture'),
  ('atelier', 'atelier workshop créatif art poterie calligraphie cuisine', 'culture'),
  ('cours cuisine', 'cours cuisine atelier culinaire gastronomie apprendre recette chef', 'culture'),
  ('poterie', 'poterie céramique atelier argile artisanat terre', 'culture'),
  ('calligraphie', 'calligraphie écriture arabe atelier art', 'culture'),
  ('dégustation', 'dégustation vin thé olive huile saveur terroir', 'culture'),
  ('spectacle', 'spectacle représentation show soirée performance artiste', 'culture'),
  ('opéra', 'opéra lyrique chant classique orchestré', 'culture'),
  ('danse', 'danse ballet contemporain traditionnelle folklore spectacle', 'culture'),
  ('archéologie', 'archéologie site archéologique ruines fouilles histoire antique', 'culture'),
  ('patrimoine', 'patrimoine historique monument culture héritage ancien', 'culture')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. SEED SYNONYMS — SHOPPING
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('mode', 'mode vêtements prêt-à-porter fashion style tendance', 'shopping'),
  ('chaussures', 'chaussures shoes sneakers baskets talons bottes sandales', 'shopping'),
  ('bijoux', 'bijoux joaillerie fantaisie bague collier bracelet montre', 'shopping'),
  ('beauté', 'beauté cosmétiques maquillage parfumerie soins crème', 'shopping'),
  ('parfumerie', 'parfumerie parfum fragrance eau de toilette beauté', 'shopping'),
  ('décoration', 'décoration déco maison intérieur design mobilier luminaire', 'shopping'),
  ('artisanat', 'artisanat marocain poterie céramique cuir tapis traditionnel souk', 'shopping'),
  ('épicerie fine', 'épicerie fine gourmet produits terroir bio délicatesse', 'shopping'),
  ('maroquinerie', 'maroquinerie cuir sac portefeuille ceinture', 'shopping'),
  ('optique', 'optique lunettes soleil vue monture', 'shopping'),
  ('concept store', 'concept store boutique design sélection multimarque tendance', 'shopping'),
  ('centre commercial', 'centre commercial mall shopping galerie marchande magasin', 'shopping'),
  ('souk', 'souk marché traditionnel artisanat médina bazar', 'shopping'),
  ('vintage', 'vintage rétro seconde main fripe occasion', 'shopping'),
  ('luxe', 'luxe premium haut de gamme marque designer', 'shopping'),
  ('pâtisserie', 'pâtisserie gâteaux desserts sucreries confiseries', 'shopping'),
  ('chocolaterie', 'chocolaterie chocolat praline confiserie douceurs', 'shopping'),
  ('cave vin', 'cave vin œnologie bouteille sommelier cru', 'shopping'),
  ('thé café', 'thé café salon torréfacteur infusion', 'shopping'),
  ('mobilier', 'mobilier meuble canapé table chaise décoration intérieur', 'shopping'),
  ('tapis', 'tapis berbère kilim artisanat décoration marocain', 'shopping'),
  ('textile', 'textile tissu broderie couture caftans djellaba', 'shopping')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. SEED SYNONYMS — RENTACAR / SE DÉPLACER
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('location voiture', 'location voiture véhicule automobile louer', 'rentacar'),
  ('voiture luxe', 'voiture luxe premium prestige sport berline coupé cabriolet', 'rentacar'),
  ('SUV', 'SUV 4x4 crossover tout terrain spacieux', 'rentacar'),
  ('moto', 'moto scooter deux roues motocyclette', 'rentacar'),
  ('vélo', 'vélo bicyclette VTT électrique balade', 'rentacar'),
  ('van', 'van camping-car minibus fourgon aménagé road trip', 'rentacar'),
  ('avec chauffeur', 'avec chauffeur privé transfert navette VTC', 'rentacar'),
  ('pas cher', 'pas cher économique budget bon marché low cost citadine', 'rentacar'),
  ('automatique', 'automatique boîte auto transmission automatique', 'rentacar'),
  ('électrique', 'électrique eco hybride vert écologique zéro émission', 'rentacar')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. SEED SYNONYMS — GENERIC / CROSS-UNIVERSE
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('pas cher', 'pas cher budget économique bon marché low cost promo promotion', NULL),
  ('luxe', 'luxe premium prestige haut de gamme VIP exclusif', NULL),
  ('enfants', 'enfants kids famille bébé junior aire de jeux activité enfant', NULL),
  ('groupe', 'groupe groupes équipe corporate team building séminaire', NULL),
  ('couple', 'couple romantique amoureux tête à tête saint valentin', NULL),
  ('handicapé', 'handicapé accessible PMR mobilité réduite fauteuil roulant', NULL),
  ('parking', 'parking stationnement voiture garer', NULL),
  ('wifi', 'wifi internet connexion gratuit', NULL),
  ('animaux', 'animaux chien chat pet friendly accepté', NULL),
  ('ouvert maintenant', 'ouvert maintenant disponible', NULL),
  ('nouveauté', 'nouveauté nouveau récent ouverture', NULL),
  ('populaire', 'populaire tendance recommandé meilleur top avis', NULL),
  ('promo', 'promo promotion offre réduction deal bon plan', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. UPDATE generate_establishment_search_vector TO INCLUDE ambiance_tags + specialties
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_establishment_search_vector(
  p_name text,
  p_city text,
  p_neighborhood text,
  p_subcategory text,
  p_tags text[],
  p_amenities text[],
  p_cuisine_types text[],
  p_description_short text
) RETURNS tsvector AS $$
DECLARE
  v_tags_text text;
  v_amenities_text text;
  v_cuisine_text text;
  v_ambiance_text text;
  v_specialties_text text;
BEGIN
  -- Convert arrays to space-separated text
  v_tags_text := COALESCE(array_to_string(p_tags, ' '), '');
  v_amenities_text := COALESCE(array_to_string(p_amenities, ' '), '');
  v_cuisine_text := COALESCE(array_to_string(p_cuisine_types, ' '), '');

  RETURN (
    -- Weight A (highest): name
    setweight(to_tsvector('french', COALESCE(p_name, '')), 'A') ||
    -- Weight B: subcategory, cuisine types, tags
    setweight(to_tsvector('french', COALESCE(p_subcategory, '')), 'B') ||
    setweight(to_tsvector('french', v_cuisine_text), 'B') ||
    setweight(to_tsvector('french', v_tags_text), 'B') ||
    -- Weight C: amenities, city, neighborhood
    setweight(to_tsvector('french', v_amenities_text), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_city, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_neighborhood, '')), 'C') ||
    -- Weight D (lowest): description
    setweight(to_tsvector('french', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- NEW: Extended version that includes ambiance_tags and specialties
CREATE OR REPLACE FUNCTION generate_establishment_search_vector_v2(
  p_name text,
  p_city text,
  p_neighborhood text,
  p_subcategory text,
  p_tags text[],
  p_amenities text[],
  p_cuisine_types text[],
  p_description_short text,
  p_ambiance_tags text[],
  p_specialties text[]
) RETURNS tsvector AS $$
DECLARE
  v_tags_text text;
  v_amenities_text text;
  v_cuisine_text text;
  v_ambiance_text text;
  v_specialties_text text;
BEGIN
  -- Convert arrays to space-separated text
  v_tags_text := COALESCE(array_to_string(p_tags, ' '), '');
  v_amenities_text := COALESCE(array_to_string(p_amenities, ' '), '');
  v_cuisine_text := COALESCE(array_to_string(p_cuisine_types, ' '), '');
  v_ambiance_text := COALESCE(array_to_string(p_ambiance_tags, ' '), '');
  v_specialties_text := COALESCE(array_to_string(p_specialties, ' '), '');

  RETURN (
    -- Weight A (highest): name
    setweight(to_tsvector('french', COALESCE(p_name, '')), 'A') ||
    -- Weight B: subcategory, cuisine types, tags, specialties
    setweight(to_tsvector('french', COALESCE(p_subcategory, '')), 'B') ||
    setweight(to_tsvector('french', v_cuisine_text), 'B') ||
    setweight(to_tsvector('french', v_tags_text), 'B') ||
    setweight(to_tsvector('french', v_specialties_text), 'B') ||
    -- Weight C: amenities, city, neighborhood, ambiance
    setweight(to_tsvector('french', v_amenities_text), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_city, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_neighborhood, '')), 'C') ||
    setweight(to_tsvector('french', v_ambiance_text), 'C') ||
    -- Weight D (lowest): description
    setweight(to_tsvector('french', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 12. UPDATE TRIGGER TO USE V2 FUNCTION WITH ambiance_tags + specialties
-- ============================================================================

CREATE OR REPLACE FUNCTION update_establishment_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := generate_establishment_search_vector_v2(
    NEW.name,
    NEW.city,
    NEW.neighborhood,
    NEW.subcategory,
    NEW.tags,
    NEW.amenities,
    NEW.cuisine_types,
    NEW.description_short,
    NEW.ambiance_tags,
    NEW.specialties
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to include ambiance_tags and specialties in the monitored columns
DROP TRIGGER IF EXISTS trg_establishments_search_vector ON public.establishments;

CREATE TRIGGER trg_establishments_search_vector
  BEFORE INSERT OR UPDATE OF name, city, neighborhood, subcategory, tags, amenities, cuisine_types, description_short, ambiance_tags, specialties
  ON public.establishments
  FOR EACH ROW
  EXECUTE FUNCTION update_establishment_search_vector();

-- ============================================================================
-- 13. CREATE SYNONYM EXPANSION HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION expand_search_query(
  search_text text,
  search_universe text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  expanded text;
  synonym_row RECORD;
  normalized_input text;
BEGIN
  normalized_input := lower(trim(search_text));

  -- Look for an exact synonym match (case-insensitive)
  SELECT s.expanded_terms INTO expanded
  FROM public.search_synonyms s
  WHERE lower(s.term) = normalized_input
    AND (s.universe IS NULL OR s.universe = search_universe)
  ORDER BY
    -- Prefer universe-specific match over global
    CASE WHEN s.universe IS NOT NULL THEN 0 ELSE 1 END
  LIMIT 1;

  IF expanded IS NOT NULL THEN
    RETURN expanded;
  END IF;

  -- No exact match: try partial match (the user's query contains a synonym term)
  -- e.g. "restaurant asiatique casablanca" contains "asiatique"
  FOR synonym_row IN
    SELECT s.term, s.expanded_terms
    FROM public.search_synonyms s
    WHERE normalized_input LIKE '%' || lower(s.term) || '%'
      AND length(s.term) >= 4  -- Avoid very short false matches
      AND (s.universe IS NULL OR s.universe = search_universe)
    ORDER BY length(s.term) DESC  -- Prefer longer (more specific) matches
    LIMIT 1
  LOOP
    -- Replace the matched synonym term with expanded terms in the original query
    RETURN replace(normalized_input, lower(synonym_row.term), synonym_row.expanded_terms);
  END LOOP;

  -- No synonym found, return original
  RETURN search_text;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expand_search_query(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text) TO anon;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text) TO authenticated;

-- ============================================================================
-- 14. REPLACE search_establishments_scored WITH SYNONYM-AWARE VERSION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL,
  result_limit int DEFAULT 24,
  result_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  cover_url text,
  universe text,
  subcategory text,
  city text,
  tags text[],
  verified boolean,
  premium boolean,
  curated boolean,
  rating_avg numeric,
  google_rating numeric,
  google_review_count integer,
  relevance_score real,
  total_score real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
  ts_query_original tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
BEGIN
  -- Normalize the search text
  search_text := trim(search_query);

  -- Expand via synonyms
  expanded_text := expand_search_query(search_text, filter_universe);

  -- Detect multi-word queries (on EXPANDED text)
  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- Build tsquery from EXPANDED text
  -- For expanded text with many words, use plainto_tsquery with OR logic
  -- so that matching ANY expanded term counts
  BEGIN
    IF expanded_text <> search_text THEN
      -- Synonym was expanded: use OR logic (any expanded term should match)
      ts_query := to_tsquery('french',
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(
              tsvector_to_array(to_tsvector('french', expanded_text))
            ) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    ELSE
      -- No synonym expansion: use original AND logic
      ts_query := websearch_to_tsquery('french', search_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('french', search_text);
  END;

  -- Also build a tsquery from the ORIGINAL text for scoring boost
  BEGIN
    ts_query_original := websearch_to_tsquery('french', search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query_original := plainto_tsquery('french', search_text);
  END;

  -- If tsquery is empty, use plainto_tsquery fallback
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', expanded_text);
  END IF;
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', search_text);
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      e.id,
      e.name,
      e.slug,
      e.cover_url,
      e.universe::text,
      e.subcategory,
      e.city,
      e.tags,
      COALESCE(e.verified, false) AS verified,
      COALESCE(e.premium, false) AS premium,
      COALESCE(e.curated, false) AS curated,
      e.avg_rating AS rating_avg,
      e.google_rating,
      e.google_review_count,
      -- Relevance score: full-text rank + trigram similarity + direct field matches
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        +
        -- Bonus if original query matches directly
        CASE
          WHEN ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector IS NOT NULL
               AND e.search_vector @@ ts_query_original
            THEN 0.3
          ELSE 0
        END
        +
        COALESCE(similarity(e.name, search_text), 0) * 0.3
        +
        -- Direct array membership checks (very relevant for taxonomy terms)
        CASE WHEN e.cuisine_types IS NOT NULL AND search_text ILIKE ANY(
          ARRAY(SELECT '%' || unnest(e.cuisine_types) || '%')
        ) THEN 0.4 ELSE 0 END
        +
        CASE WHEN e.ambiance_tags IS NOT NULL AND search_text ILIKE ANY(
          ARRAY(SELECT '%' || unnest(e.ambiance_tags) || '%')
        ) THEN 0.2 ELSE 0 END
        +
        CASE WHEN e.specialties IS NOT NULL AND search_text ILIKE ANY(
          ARRAY(SELECT '%' || unnest(e.specialties) || '%')
        ) THEN 0.3 ELSE 0 END
      )::real AS relevance_score,
      -- Total score: relevance + activity/quality bonuses
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        + CASE
            WHEN ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector IS NOT NULL
                 AND e.search_vector @@ ts_query_original
              THEN 0.3
            ELSE 0
          END
        + COALESCE(similarity(e.name, search_text), 0) * 0.3
        + CASE WHEN e.cuisine_types IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.cuisine_types) || '%')
          ) THEN 0.4 ELSE 0 END
        + CASE WHEN e.ambiance_tags IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.ambiance_tags) || '%')
          ) THEN 0.2 ELSE 0 END
        + CASE WHEN e.specialties IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.specialties) || '%')
          ) THEN 0.3 ELSE 0 END
        + COALESCE(e.activity_score, 0) * 0.003
        + CASE WHEN COALESCE(e.is_online, false) THEN 0.15 ELSE 0 END
        + CASE WHEN COALESCE(e.verified, false) THEN 0.05 ELSE 0 END
        + CASE WHEN COALESCE(e.premium, false) THEN 0.10 ELSE 0 END
        + CASE WHEN COALESCE(e.curated, false) THEN 0.05 ELSE 0 END
        + COALESCE(e.avg_rating, 0) / 50.0
      )::real AS total_score
    FROM public.establishments e
    WHERE e.status = 'active'::establishment_status
      -- Universe filter
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      -- City filter (case-insensitive)
      AND (filter_city IS NULL OR e.city ILIKE filter_city)
      -- Match condition: full-text OR trigram OR ILIKE OR direct array match
      AND (
        -- Full-text search on expanded query
        (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        -- Full-text search on original query
        OR (e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        -- Trigram similarity on name (single word only for performance)
        OR (NOT is_multiword AND similarity(e.name, search_text) > 0.15)
        -- ILIKE on name/subcategory
        OR e.name ILIKE '%' || search_text || '%'
        OR e.subcategory ILIKE '%' || search_text || '%'
        -- Direct array membership: cuisine_types
        OR (e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct WHERE ct ILIKE '%' || search_text || '%'
        ))
        -- Direct array membership: tags
        OR (e.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.tags) t WHERE t ILIKE '%' || search_text || '%'
        ))
        -- Direct array membership: ambiance_tags
        OR (e.ambiance_tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.ambiance_tags) at WHERE at ILIKE '%' || search_text || '%'
        ))
        -- Direct array membership: specialties
        OR (e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp WHERE sp ILIKE '%' || search_text || '%'
        ))
      )
  )
  SELECT s.*
  FROM scored s
  ORDER BY s.total_score DESC, s.relevance_score DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- Grant execute permissions to Supabase roles
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.search_establishments_scored IS
  'Full-text search for establishments with French stemming, synonym expansion, trigram fuzzy matching, direct array matching, and activity-based scoring';

-- ============================================================================
-- 15. RE-POPULATE SEARCH VECTORS FOR ALL EXISTING ESTABLISHMENTS
-- Uses the v2 function that includes ambiance_tags + specialties
-- ============================================================================

UPDATE public.establishments
SET search_vector = generate_establishment_search_vector_v2(
  name,
  city,
  neighborhood,
  subcategory,
  tags,
  amenities,
  cuisine_types,
  description_short,
  ambiance_tags,
  specialties
);

-- ============================================================================
-- 16. ADD GIN INDEXES FOR NEW ARRAY COLUMNS (if not exist)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_establishments_ambiance_tags_gin
  ON public.establishments USING GIN (ambiance_tags)
  WHERE ambiance_tags IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establishments_specialties_gin
  ON public.establishments USING GIN (specialties)
  WHERE specialties IS NOT NULL;

-- ============================================================================
-- 17. RLS FOR SEARCH SYNONYMS (public read, admin write)
-- ============================================================================

ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read search synonyms"
  ON public.search_synonyms FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage search synonyms"
  ON public.search_synonyms FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.search_synonyms TO anon;
GRANT SELECT ON public.search_synonyms TO authenticated;
GRANT ALL ON public.search_synonyms TO service_role;

COMMENT ON TABLE public.search_synonyms IS 'Maps user search terms to expanded search terms for synonym-based matching';
COMMENT ON FUNCTION generate_establishment_search_vector_v2 IS 'V2 search vector generator including ambiance_tags and specialties';
COMMENT ON FUNCTION expand_search_query IS 'Expands search query using synonym table for better matching';

-- ============================================================================
-- 18. UNIQUE INDEX ON SYNONYMS (prevents duplicate entries)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_synonyms_term_universe
ON public.search_synonyms (lower(term), COALESCE(universe, '__null__'));

-- ============================================================================
-- 19. PATCH: Production gap analysis synonyms (37 values from DB not covered)
-- ============================================================================

-- Ambiance tags missing from production data
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('luxueux', 'luxueux luxe palace premium prestige haut de gamme somptueux', 'hebergement'),
('ambiance club', 'ambiance club festif DJ soirée danse night club boîte', 'restaurant'),
('ambiance marocaine', 'ambiance marocaine traditionnel marocain riad médina authentique oriental', 'restaurant'),
('candlelight', 'candlelight bougie romantique intimiste tamisé dîner aux chandelles', 'restaurant'),
('chic', 'chic élégant raffiné haut de gamme stylé classe distingué', 'restaurant'),
('convivial', 'convivial chaleureux accueillant sympathique familial décontracté', 'restaurant'),
('culturel', 'culturel culture art patrimoine historique exposition musée', 'restaurant'),
('dj set', 'dj set DJ musique soirée mix festif ambiance electro', 'restaurant'),
('historique', 'historique ancien patrimoine monument vieux classé héritage', 'restaurant'),
('live band', 'live band musique live concert groupe orchestre jazz', 'restaurant'),
('speakeasy', 'speakeasy bar caché secret cocktail prohibition intimiste clandestin', 'restaurant'),
('vue jardin', 'vue jardin jardin verdure nature extérieur terrasse calme', 'restaurant')
ON CONFLICT DO NOTHING;

-- Specialties missing from production data
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('afro-fusion', 'afro-fusion africain fusion cuisine monde sénégalais éthiopien', 'restaurant'),
('épicerie', 'épicerie épicerie fine traiteur produits alimentaire courses', 'restaurant'),
('foie gras', 'foie gras gastronomique français terroir canard sud-ouest luxe', 'restaurant'),
('international', 'international cuisine du monde fusion varié multi cuisine mondial cosmopolite', 'restaurant'),
('internationale', 'internationale international cuisine du monde fusion varié cosmopolite', 'restaurant'),
('yéménit', 'yéménit yéménite arabe oriental moyen-orient mandi', 'restaurant')
ON CONFLICT DO NOTHING;

-- Subcategories missing from production (dirty data coverage)
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('hôtel / lodge', 'hôtel lodge hébergement safari nature écolodge', 'hebergement'),
('hotel_5_etoiles', 'hôtel 5 étoiles palace luxe premium prestige', 'hebergement'),
('spa / loisirs', 'spa loisirs bien-être détente relaxation hammam massage', 'loisir'),
('international', 'international varié multi mondial cosmopolite', 'loisir'),
('loisir', 'loisir activité jeu divertissement sortie', 'loisir'),
('cafe_classique', 'café classique salon de thé coffee shop expresso cappuccino', 'restaurant'),
('français / français', 'français cuisine française bistrot brasserie gastronomique terroir', 'restaurant'),
('general', 'restaurant général cuisine variée', 'restaurant'),
('general / general', 'restaurant général cuisine variée', 'restaurant'),
('marocain / marocain', 'marocain cuisine marocaine tajine couscous pastilla traditionnel', 'restaurant'),
('patisserie_francaise', 'pâtisserie française gâteau dessert viennoiserie croissant', 'restaurant'),
('restaurant / marocain', 'restaurant marocain cuisine marocaine tajine couscous traditionnel', 'restaurant'),
('rooftop_restaurant', 'rooftop restaurant terrasse toit vue panoramique hauteur', 'restaurant'),
('shisha_lounge', 'chicha shisha narguilé lounge hookah fumoir détente', 'restaurant'),
('route de targa', 'restaurant marrakech', 'restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 20. TAXONOMY COVERAGE: All cuisine types from taxonomy.ts (21 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('cuisine afghane', 'afghan cuisine afghane kaboul kebab mantu bolani', 'restaurant'),
('afghan', 'afghan cuisine afghane kaboul kebab mantu bolani oriental', 'restaurant'),
('afternoon tea', 'afternoon tea thé goûter pâtisserie salon de thé british scones', 'restaurant'),
('cuisine alsacienne', 'alsacien cuisine alsacienne choucroute flammekueche tarte flambée bretzel', 'restaurant'),
('alsacien', 'alsacien cuisine alsacienne choucroute flammekueche tarte flambée bretzel', 'restaurant'),
('cuisine auvergnate', 'auvergnat cuisine auvergnate truffade aligot fromage cantal', 'restaurant'),
('auvergnat', 'auvergnat cuisine auvergnate truffade aligot fromage cantal', 'restaurant'),
('cuisine basque', 'basque cuisine basque pintxos piperade piment espelette axoa pays basque', 'restaurant'),
('basque', 'basque cuisine basque pintxos piperade piment espelette axoa pays basque', 'restaurant'),
('bouchon lyonnais', 'bouchon lyonnais lyon cuisine lyonnaise quenelle andouillette salade lyonnaise', 'restaurant'),
('cuisine canadienne', 'canadien cuisine canadienne poutine québec érable sirop', 'restaurant'),
('canadien', 'canadien cuisine canadienne poutine québec érable sirop', 'restaurant'),
('cuisine corse', 'corse cuisine corse charcuterie figatellu brocciu lonzu coppa île', 'restaurant'),
('corse', 'corse cuisine corse charcuterie figatellu brocciu lonzu coppa île', 'restaurant'),
('cuisine créole', 'créole cuisine créole antillais colombo accras boudin antilles réunion', 'restaurant'),
('créole', 'créole cuisine créole antillais colombo accras boudin antilles réunion', 'restaurant'),
('cuisine des îles', 'cuisine des îles tropical exotique antillais créole réunionnais malgache', 'restaurant'),
('cuisine suisse', 'cuisine suisse fondue raclette rösti suisse chocolat', 'restaurant'),
('cuisine traditionnelle', 'cuisine traditionnelle terroir classique maison fait maison plat du jour', 'restaurant'),
('cuisine égyptienne', 'égyptien cuisine égyptienne koshary foul medames falafel oriental', 'restaurant'),
('égyptien', 'égyptien cuisine égyptienne koshary foul medames falafel oriental', 'restaurant'),
('europe de l''est', 'europe de l''est polonais tchèque hongrois roumain bulgare pierogi goulash bortsch', 'restaurant'),
('cuisine franco-belge', 'franco-belge cuisine franco-belge belge frites moules gaufre carbonnade', 'restaurant'),
('franco-belge', 'franco-belge cuisine franco-belge belge frites moules gaufre carbonnade', 'restaurant'),
('cuisine israélienne', 'israélien cuisine israélienne houmous falafel shakshuka pita', 'restaurant'),
('israélien', 'israélien cuisine israélienne houmous falafel shakshuka pita', 'restaurant'),
('cuisine pakistanaise', 'pakistanais cuisine pakistanaise biryani curry naan tikka chapati', 'restaurant'),
('pakistanais', 'pakistanais cuisine pakistanaise biryani curry naan tikka chapati', 'restaurant'),
('cuisine provençale', 'provençal cuisine provençale ratatouille bouillabaisse tapenade pistou olive', 'restaurant'),
('provençal', 'provençal cuisine provençale ratatouille bouillabaisse tapenade pistou olive', 'restaurant'),
('cuisine russe', 'russe cuisine russe bortsch pelmeni blini caviar vodka', 'restaurant'),
('russe', 'russe cuisine russe bortsch pelmeni blini caviar vodka', 'restaurant'),
('cuisine savoyarde', 'savoyard cuisine savoyarde fondue raclette tartiflette reblochon montagne', 'restaurant'),
('savoyard', 'savoyard cuisine savoyarde fondue raclette tartiflette reblochon montagne', 'restaurant'),
('cuisine scandinave', 'scandinave cuisine scandinave nordique saumon gravlax suédois danois norvégien', 'restaurant'),
('scandinave', 'scandinave cuisine scandinave nordique saumon gravlax suédois danois norvégien', 'restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 21. TAXONOMY COVERAGE: Sport specialties (31 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('badminton', 'badminton raquette volant court indoor sport', 'sport'),
('basketball', 'basketball basket ballon panier terrain sport collectif', 'sport'),
('coiffure femme', 'coiffure femme salon cheveux brushing coloration mèches coupe', 'sport'),
('coiffure homme', 'coiffure homme salon barbier coupe dégradé', 'sport'),
('day spa', 'day spa spa journée soins détente relaxation bien-être', 'sport'),
('enveloppement', 'enveloppement soin corps argile algue boue gommage détox', 'sport'),
('hammam moderne', 'hammam moderne spa vapeur bain bien-être contemporain', 'sport'),
('hammam traditionnel', 'hammam traditionnel bain vapeur gommage savon noir beldi kessa', 'sport'),
('massage aux pierres chaudes', 'massage pierres chaudes hot stones relaxant détente chaleur', 'sport'),
('massage sportif', 'massage sportif récupération muscles sport performance', 'sport'),
('massage thaïlandais', 'massage thaïlandais thai stretching traditionnel asiatique', 'sport'),
('soins du corps', 'soins du corps gommage enveloppement modelage hydratation', 'sport'),
('soins du visage', 'soins du visage facial nettoyage peau hydratation anti-âge', 'sport'),
('spa de luxe', 'spa de luxe spa premium prestige haut de gamme 5 étoiles palace', 'sport'),
('yoga kundalini', 'yoga kundalini méditation spirituel énergie chakra respiration', 'sport'),
('yoga vinyasa', 'yoga vinyasa flow dynamique enchaînement respiration', 'sport'),
('zumba', 'zumba danse fitness cardio latino musique cours', 'sport'),
('méditation', 'méditation zen mindfulness pleine conscience relaxation calme', 'sport'),
('cardio', 'cardio vélo elliptique tapis course endurance', 'sport'),
('hiit', 'hiit high intensity interval training circuit intense', 'sport'),
('coloration', 'coloration couleur cheveux mèches balayage teinture', 'sport'),
('manucure', 'manucure ongles vernis nail art soin mains', 'sport'),
('pédicure', 'pédicure ongles pieds soin podologie', 'sport'),
('épilation', 'épilation cire laser lumière pulsée poils', 'sport'),
('gommage', 'gommage exfoliant peau soin corps visage peeling', 'sport'),
('réflexologie', 'réflexologie pieds mains plantaire massage zone', 'sport'),
('massage relaxant', 'massage relaxant détente zen calme bien-être huiles essentielles', 'sport'),
('natation', 'natation nage piscine bassin crawl brasse', 'sport'),
('aquagym', 'aquagym aqua fitness piscine eau gym gymnastique', 'sport'),
('mma', 'mma mixed martial arts combat libre grappling', 'sport'),
('football', 'football foot soccer ballon terrain sport collectif', 'sport')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 22. TAXONOMY COVERAGE: Loisirs specialties (17 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('escape game horreur', 'escape game horreur peur frisson zombie épouvante', 'loisir'),
('escape game aventure', 'escape game aventure exploration trésor mystère', 'loisir'),
('escape game enquête', 'escape game enquête détective crime indice mystère', 'loisir'),
('escape game famille', 'escape game famille enfants kids fun ludique', 'loisir'),
('karting indoor', 'karting indoor intérieur couvert circuit électrique', 'loisir'),
('karting outdoor', 'karting outdoor extérieur piste circuit vitesse', 'loisir'),
('buggy', 'buggy quad randonnée tout terrain aventure sable désert', 'loisir'),
('canoë', 'canoë kayak pirogue rivière eau pagaie descente', 'loisir'),
('snorkeling', 'snorkeling palmes masque tuba mer poissons coraux', 'loisir'),
('tyrolienne', 'tyrolienne zip line câble hauteur sensation accrobranche', 'loisir'),
('golf 18 trous', 'golf 18 trous parcours complet championnat green', 'loisir'),
('golf 9 trous', 'golf 9 trous parcours court practice putting', 'loisir'),
('mini-golf', 'mini-golf minigolf putt putt famille enfants fun', 'loisir'),
('airsoft', 'airsoft paintball combat tactique réplique équipe', 'loisir'),
('aquarium', 'aquarium poissons mer océan faune marine visite', 'loisir'),
('segway', 'segway gyropode balade visite électrique urbain', 'loisir'),
('saut à l''élastique', 'saut élastique bungee jumping adrénaline sensations fortes pont', 'loisir')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 23. TAXONOMY COVERAGE: Hébergement types (12 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('hôtel 5 étoiles', 'hôtel 5 étoiles palace luxe premium prestige suite', 'hebergement'),
('hôtel 4 étoiles', 'hôtel 4 étoiles confort supérieur standing', 'hebergement'),
('hôtel 3 étoiles', 'hôtel 3 étoiles standard confort milieu gamme', 'hebergement'),
('hôtel 2 étoiles', 'hôtel 2 étoiles économique budget simple', 'hebergement'),
('hôtel boutique', 'hôtel boutique design charme unique petit personnalisé', 'hebergement'),
('riad traditionnel', 'riad traditionnel médina patio fontaine zellige maroc artisanal', 'hebergement'),
('riad de luxe', 'riad de luxe riad premium prestige raffiné haut de gamme', 'hebergement'),
('maison d''hôtes', 'maison hôtes guesthouse chambre accueil familial convivial', 'hebergement'),
('chambre d''hôtes', 'chambre hôtes bed breakfast petit déjeuner accueil', 'hebergement'),
('studio', 'studio appartement petit logement meublé', 'hebergement'),
('loft', 'loft espace ouvert moderne design industriel appartement', 'hebergement'),
('gîte', 'gîte location vacances campagne nature rural maison', 'hebergement')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 24. TAXONOMY COVERAGE: Culture types (25 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('musée d''art', 'musée art peinture sculpture contemporain moderne beaux-arts', 'culture'),
('musée d''histoire', 'musée histoire civilisation patrimoine archéologie antiquité', 'culture'),
('musée des sciences', 'musée sciences technologie innovation découverte interactif', 'culture'),
('musée ethnographique', 'musée ethnographique traditions peuple culture artisanat folklore', 'culture'),
('galerie d''art', 'galerie art exposition peinture sculpture artiste contemporain', 'culture'),
('exposition temporaire', 'exposition temporaire expo art vernissage événement galerie', 'culture'),
('exposition permanente', 'exposition permanente collection musée visite', 'culture'),
('monument historique', 'monument historique patrimoine architecture ancien palais château', 'culture'),
('palais', 'palais royal historique architecture majestueux monument visite', 'culture'),
('château', 'château forteresse rempart médiéval historique visite', 'culture'),
('site archéologique', 'site archéologique ruines fouilles histoire antique romain', 'culture'),
('ruines', 'ruines vestiges antique archéologie site historique', 'culture'),
('mosquée', 'mosquée islam architecture islamique visite prière monument', 'culture'),
('église', 'église cathédrale chapelle chrétien architecture religieux', 'culture'),
('synagogue', 'synagogue judaïque mellah patrimoine religieux visite', 'culture'),
('salle de concert', 'salle concert musique live spectacle scène acoustique', 'culture'),
('ballet', 'ballet danse classique spectacle tutu pointes chorégraphie', 'culture'),
('danse traditionnelle', 'danse traditionnelle folklore ahwash guedra ahouach marocain spectacle', 'culture'),
('visite audioguidée', 'visite audioguidée audio guide casque parcours autonome', 'culture'),
('visite nocturne', 'visite nocturne nuit soirée illumination spectacle lumière', 'culture'),
('atelier créatif', 'atelier créatif art bricolage création DIY loisir créatif', 'culture'),
('atelier artisanat', 'atelier artisanat poterie céramique cuir zellige mosaïque', 'culture'),
('cours de poterie', 'cours poterie céramique argile tour atelier artisanat', 'culture'),
('cours de calligraphie', 'cours calligraphie écriture arabe art atelier', 'culture'),
('œnologie', 'œnologie vin dégustation sommelier cave cépage terroir', 'culture')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 25. TAXONOMY COVERAGE: Shopping types (31 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('mode femme', 'mode femme vêtements prêt-à-porter robe jupe pantalon fashion', 'shopping'),
('mode homme', 'mode homme vêtements costume chemise pantalon fashion', 'shopping'),
('mode enfant', 'mode enfant vêtements bébé junior kids', 'shopping'),
('mode bébé', 'mode bébé vêtements nourrisson layette naissance', 'shopping'),
('prêt-à-porter', 'prêt-à-porter mode vêtements fashion tendance', 'shopping'),
('haute couture', 'haute couture créateur designer luxe fashion mode couture', 'shopping'),
('créateur', 'créateur designer marque indépendant fait main artisan mode', 'shopping'),
('seconde main', 'seconde main occasion fripe vintage recyclé dépôt vente', 'shopping'),
('chaussures femme', 'chaussures femme escarpins sandales bottes talons baskets', 'shopping'),
('chaussures homme', 'chaussures homme mocassins derby baskets sneakers', 'shopping'),
('chaussures enfant', 'chaussures enfant baskets sandales bottes kids', 'shopping'),
('sacs', 'sacs maroquinerie main bandoulière cabas pochette', 'shopping'),
('accessoires', 'accessoires écharpe ceinture chapeau gants lunettes', 'shopping'),
('bijoux fantaisie', 'bijoux fantaisie collier bracelet bague boucles mode', 'shopping'),
('bijoux précieux', 'bijoux précieux or argent diamant joaillerie pierres', 'shopping'),
('montres', 'montres horlogerie bracelet luxe chronographe', 'shopping'),
('lunettes', 'lunettes optique soleil vue monture', 'shopping'),
('cosmétiques', 'cosmétiques maquillage beauté crème soin teint', 'shopping'),
('soins', 'soins beauté crème sérum masque hydratant anti-âge', 'shopping'),
('maquillage', 'maquillage beauté cosmétiques rouge lèvres fond de teint mascara', 'shopping'),
('luminaires', 'luminaires lampe suspension éclairage lustre design', 'shopping'),
('art de la table', 'art de la table vaisselle assiettes verres couverts', 'shopping'),
('linge de maison', 'linge de maison draps serviettes couette coussin textile', 'shopping'),
('artisanat local', 'artisanat local fait main traditionnel produit terroir régional', 'shopping'),
('artisanat marocain', 'artisanat marocain poterie zellige tapis cuir babouche', 'shopping'),
('céramique', 'céramique poterie artisanat vaisselle décoration argile', 'shopping'),
('cuir', 'cuir maroquinerie tannerie babouche sac ceinture', 'shopping'),
('traiteur', 'traiteur événement réception buffet catering cuisine', 'shopping'),
('produits du terroir', 'produits terroir local régional artisan producteur', 'shopping'),
('multimarques', 'multimarques boutique sélection marques mode', 'shopping'),
('marché', 'marché souk marché couvert frais producteur local', 'shopping')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 26. TAXONOMY COVERAGE: Vehicle types (21 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('citadine', 'citadine petite voiture ville compacte économique', 'rentacar'),
('compacte', 'compacte voiture moyenne berline pratique', 'rentacar'),
('berline', 'berline voiture confort familiale spacieuse', 'rentacar'),
('4x4', '4x4 SUV tout terrain offroad montagne piste', 'rentacar'),
('crossover', 'crossover SUV compact urbain polyvalent', 'rentacar'),
('monospace', 'monospace familial 7 places spacieux groupe', 'rentacar'),
('break', 'break voiture familiale coffre spacieux', 'rentacar'),
('coupé', 'coupé sportif deux portes élégant performance', 'rentacar'),
('cabriolet', 'cabriolet décapotable convertible toit ouvrant soleil', 'rentacar'),
('pick-up', 'pick-up utilitaire tout terrain chargement aventure', 'rentacar'),
('utilitaire', 'utilitaire camionnette fourgon déménagement transport', 'rentacar'),
('minibus', 'minibus transport groupe 9 places excursion navette', 'rentacar'),
('camping-car', 'camping-car van aménagé road trip voyage mobile', 'rentacar'),
('scooter', 'scooter deux roues moto urbain pratique', 'rentacar'),
('vélo électrique', 'vélo électrique e-bike VAE assistance pédalage balade', 'rentacar'),
('trottinette électrique', 'trottinette électrique mobilité urbain balade visite', 'rentacar'),
('voiture de luxe', 'voiture luxe premium prestige haut de gamme berline sport', 'rentacar'),
('voiture de sport', 'voiture sport performance rapide coupé cabriolet puissant', 'rentacar'),
('voiture électrique', 'voiture électrique eco zéro émission tesla green', 'rentacar'),
('voiture hybride', 'voiture hybride eco économique essence électrique', 'rentacar'),
('voiture avec chauffeur', 'voiture chauffeur privé VTC transfert navette service', 'rentacar')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 27. TAXONOMY COVERAGE: Ambiance types missing
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('vue panoramique', 'vue panoramique rooftop hauteur panorama 360 terrasse toit', NULL),
('en plein air', 'en plein air extérieur outdoor terrasse jardin nature', NULL)
ON CONFLICT DO NOTHING;

COMMIT;
