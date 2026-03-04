-- ============================================
-- MISE A JOUR DES ETABLISSEMENTS - LOT 1
-- Sortir Au Maroc - Données trouvées via Google
-- ============================================

-- 1. TITO (Restaurant Grec - Casablanca)
UPDATE establishments SET
  address = '30 Rue Sebou, Casablanca',
  city = 'Casablanca',
  phone = '+212520800280',
  lat = 33.5897,
  lng = -7.6261,
  social_links = '{"instagram": "https://www.instagram.com/tito_casablanca/"}',
  description_short = 'Restaurant grec au cœur de Casablanca. Cuisine méditerranéenne authentique avec poulpe grillé, salades et moussaka.'
WHERE name = 'Tito';

-- 2. AZOUR CASABLANCA (Restaurant & Lounge - ONOMO Hotel)
UPDATE establishments SET
  address = 'Angle Boulevard Massira & Rue Normandie, ONOMO Hotel',
  city = 'Casablanca',
  phone = '+212520070707',
  website = 'https://www.onomohotels.com',
  lat = 33.5881,
  lng = -7.6327,
  description_short = 'Restaurant & Lounge afro-fusion au sein du ONOMO Hotel. Terrasse de 600m², tapas africains, cocktails signature et musique live.'
WHERE name = 'Azour Casablanca';

-- 3. F.KABBAJ (Gastronomie française - Casablanca)
UPDATE establishments SET
  address = '30 Rue des Arènes, Quartier Racine, Casablanca',
  city = 'Casablanca',
  phone = '+212522985078',
  website = 'https://fkabbaj.ma',
  lat = 33.5849,
  lng = -7.6371,
  description_short = 'Restaurant gastronomique familial par la chef Farida Kabbaj. Spécialités françaises, foie gras et produits 100% halal depuis 2010.'
WHERE name = 'F.kabbaj';

-- 4. DAI SUSHI (Japonais - Casablanca)
UPDATE establishments SET
  address = 'Angle Boulevard Abdelmoumen & Rue Soumaya, Casablanca',
  city = 'Casablanca',
  phone = '+212522256626',
  lat = 33.5832,
  lng = -7.6325,
  description_short = 'Restaurant japonais réputé à Casablanca. Sushis frais, cuisine japonaise authentique. Service impeccable et cadre raffiné.'
WHERE name = 'Dai Sushi';

-- 5. SKYBAR (Rooftop Bar - Casablanca)
UPDATE establishments SET
  address = 'Boulevard de la Corniche, Ain Diab, Villa Blanca Hotel',
  city = 'Casablanca',
  phone = '+212663475247',
  website = 'https://villablanca.ma/restaurant/casablanca/sky-bar',
  lat = 33.5935,
  lng = -7.6691,
  social_links = '{"instagram": "https://www.instagram.com/skybarcasablanca/"}',
  description_short = 'Rooftop bar perché au sommet du Villa Blanca Hotel. Vue imprenable sur l''océan, cocktails raffinés et ambiance tropézienne.'
WHERE name = 'Skybar';

-- 6. WEST 91 (Restaurant - Casablanca)
UPDATE establishments SET
  address = '91 Boulevard Driss Slaoui, Ain Diab, Casablanca',
  city = 'Casablanca',
  phone = '+212660492949',
  website = 'https://www.west91.com',
  lat = 33.6009,
  lng = -7.6551,
  social_links = '{"instagram": "https://www.instagram.com/west91.casablanca/"}',
  description_short = 'Restaurant face à l''océan. Cuisine américaine, italienne et méditerranéenne. Capacité 280 places, ouvert de 8h à 1h. Vue mer spectaculaire.'
WHERE name = 'West 91';

-- 7. LA TERASSE BLEUE (Restaurant - Casablanca)
UPDATE establishments SET
  address = 'AnfaPlace Mall, Casablanca',
  city = 'Casablanca',
  phone = '+212767573062',
  lat = 33.5960,
  lng = -7.6650,
  social_links = '{"instagram": "https://www.instagram.com/laterrassebleue/"}',
  description_short = 'Cuisine du monde au cœur d''AnfaPlace Mall. Ambiance conviviale et livraison disponible.'
WHERE name = 'La Terasse Bleue';

-- 8. BOTCHI COFFEE (Café - Casablanca)
UPDATE establishments SET
  address = 'Boulevard de la Corniche, Casablanca',
  city = 'Casablanca',
  lat = 33.5940,
  lng = -7.6680,
  social_links = '{"instagram": "https://www.instagram.com/botchicoffee/"}',
  description_short = 'Coffee lounge tendance combinant savoir-faire artisanal, pâtisseries fines, glaces gourmandes et cafés du monde entier.'
WHERE name = 'Botchi Coffee';

-- 9. COCO PALM (Café & Restaurant - Casablanca)
UPDATE establishments SET
  address = 'SR 12 Anfa Place, Boulevard de la Corniche, Casablanca',
  city = 'Casablanca',
  phone = '+212522798239',
  lat = 33.5958,
  lng = -7.6652,
  social_links = '{"instagram": "https://www.instagram.com/cocopalmcasablanca/"}',
  description_short = 'Un paradis tropical caché au bord de la mer. Cuisine méditerranéenne, brunch et petit-déjeuner avec vue sur l''océan.'
WHERE name = 'Coco Palm';

-- 10. LA TABLE 3 (Fine Dining - Casablanca)
UPDATE establishments SET
  address = 'Ain Diab, Casablanca',
  city = 'Casablanca',
  phone = '+212668846084',
  website = 'https://table3.ma',
  lat = 33.5943,
  lng = -7.6700,
  description_short = 'Restaurant gastronomique du chef étoilé Fayçal Bettioui. Fine dining, produits locaux cultivés sur place. Prix One To Watch MENA 50 Best 2025.'
WHERE name = 'La Table 3';

-- 11. AFRIK N FUSION (Cuisine africaine - Casablanca)
UPDATE establishments SET
  address = '201 Boulevard Mohamed Zerktouni, Casablanca',
  city = 'Casablanca',
  website = 'https://www.afriknfusion.fr',
  lat = 33.5870,
  lng = -7.6310,
  social_links = '{"instagram": "https://www.instagram.com/afriknfusion.casablanca/"}',
  description_short = 'N°1 de la cuisine africaine. Produits frais cuisinés sur place, fusion modernité et tradition. 100% halal.'
WHERE name = 'Afrik N Fusion';

-- 12. GREEN MAMA (Restaurant espagnol - Bouskoura)
UPDATE establishments SET
  address = 'California Golf Resort, Ville Verte, Bouskoura',
  city = 'Casablanca',
  phone = '+212520800200',
  lat = 33.4867,
  lng = -7.6350,
  description_short = 'Restaurant espagnol au Palmeraie Country Club. Tapas, paellas et ambiance festive avec vue sur le Palm Golf.'
WHERE name = 'Green Mama';

-- 13. OTTO (Pizza Napoletana - Casablanca)
UPDATE establishments SET
  address = 'Rue des Acacias, Quartier Maârif, Casablanca',
  city = 'Casablanca',
  lat = 33.5840,
  lng = -7.6280,
  social_links = '{"instagram": "https://www.instagram.com/otto.pizzanapoletana/"}',
  description_short = 'Pizzeria napolitaine authentique au cœur du Maârif. Pizzas artisanales cuites au feu de bois par le passionné Othmane.'
WHERE name = 'Otto';

-- 14. AKAL RESTAURANT
UPDATE establishments SET
  city = 'Casablanca',
  description_short = 'Restaurant à Casablanca proposant une cuisine locale authentique.'
WHERE name = 'Akal Restaurant';

-- 15. POULCOOK (Poulet braisé - Casablanca)
UPDATE establishments SET
  address = 'Quartier Bourgogne, Casablanca',
  city = 'Casablanca',
  website = 'https://poulcook.dishop.co',
  social_links = '{"instagram": "https://www.instagram.com/poulcook.ma/"}',
  description_short = 'Le poulet braisé le plus chaud ! Chaîne franco-marocaine, 6 adresses en France + 1 au Maroc. Commande en ligne disponible.'
WHERE name = 'Poulcook';

-- 16. BAWADI KECH (Restaurant - Marrakech)
UPDATE establishments SET
  address = 'Circuit de la Palmeraie, Marrakech',
  city = 'Marrakech',
  phone = '+212661283438',
  lat = 31.6691,
  lng = -7.9811,
  description_short = 'Restaurant familial au cœur de la Palmeraie de Marrakech. Pizzas, grillades et ambiance chaleureuse.'
WHERE name = 'Bawadi Kech';

-- 17. L OLIVO (Méditerranéen - Casablanca)
UPDATE establishments SET
  address = 'Boulevard de la Mecque, Quartier Californie, Casablanca',
  city = 'Casablanca',
  phone = '+212668385745',
  lat = 33.5600,
  lng = -7.6750,
  social_links = '{"instagram": "https://www.instagram.com/lolivocasablanca/"}',
  description_short = 'Expérience culinaire méditerranéenne unique et raffinée. Décor signé Carlos Martinez, ambiance solaire et accueillante.'
WHERE name = 'L''olivo';

-- 18. TROCADERO (Casablanca)
UPDATE establishments SET
  address = 'Angle Rue Rocroix et Avenue Emile Zola, Casablanca',
  city = 'Casablanca',
  phone = '+212522242320',
  lat = 33.5760,
  lng = -7.6180,
  social_links = '{"instagram": "https://www.instagram.com/trocadero_ice/"}',
  description_short = 'Café-restaurant emblématique de Casablanca. Breakfast, brunch, déjeuner. Service voiturier, livraison gratuite.'
WHERE name = 'Trocadéro';

-- 19. ELOOMM (Méditerranéen - Marrakech)
UPDATE establishments SET
  address = 'Centre Commercial Almazar, Marrakech',
  city = 'Marrakech',
  website = 'https://eloomm.ma',
  lat = 31.6340,
  lng = -8.0100,
  description_short = 'Restaurant méditerranéen au cœur d''Almazar. Cuisine fusion mêlant élégance méditerranéenne et authenticité marocaine.'
WHERE name = 'Eloomm';

-- 20. CHICKEN CITY (Fast Food - Casablanca)
UPDATE establishments SET
  address = '325 Boulevard Ziraoui, Casablanca',
  city = 'Casablanca',
  phone = '+212529787874',
  lat = 33.5890,
  lng = -7.6200,
  social_links = '{"instagram": "https://www.instagram.com/chickencity_morocco/"}',
  description_short = 'The best CHICKEN from the best CITIES. Poulet de qualité, livraison via Glovo et Yassir.'
WHERE name = 'Chicken City';

-- 21. MELIPOL (Italien - Marrakech)
UPDATE establishments SET
  city = 'Marrakech',
  phone = '+212525977595',
  social_links = '{"instagram": "https://www.instagram.com/restaurantmelipol/"}',
  description_short = 'Le meilleur de l''Italie au cœur de Marrakech. Recettes familiales transmises de génération en génération.'
WHERE name = 'Melipol';

-- 22. PINCHOS (Grillades - Casablanca/Bouskoura)
UPDATE establishments SET
  address = 'Ville Verte Bouskoura, Casablanca',
  city = 'Casablanca',
  phone = '+212520910501',
  social_links = '{"instagram": "https://www.instagram.com/pinchos_green_town/"}',
  description_short = 'Grillades exquises, sandwichs, burgers, pâtes et pizzas. Une explosion de saveurs à chaque bouchée.'
WHERE name = 'Pinchos';

-- 23. BABALI (Street Food - Casablanca)
UPDATE establishments SET
  address = 'Rue Ibnou Kalakis, Bourgogne, Casablanca',
  city = 'Casablanca',
  phone = '+212660350603',
  social_links = '{"instagram": "https://www.instagram.com/babali.casa/"}',
  description_short = 'Street food casablancais. Sandwichs grillés, tacos et barquettes. Deux adresses : Bourgogne et Darbouazza. Halal.'
WHERE name = 'Babali';

-- 24. LA CANTINETTA
UPDATE establishments SET
  city = 'Casablanca',
  description_short = 'Restaurant italien à Casablanca.'
WHERE name = 'La Cantinetta';

-- 25. BOCA GRANDE
UPDATE establishments SET
  city = 'Casablanca',
  description_short = 'Restaurant à Casablanca.'
WHERE name = 'Boca Grande';
