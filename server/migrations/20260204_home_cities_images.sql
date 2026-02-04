-- ============================================================================
-- Migration: Home Cities Images
-- Date: 2026-02-04
-- Description: Add high-quality representative images for Moroccan cities
-- Source: Unsplash (free for commercial use)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Update city images with high-quality Unsplash photos
-- All images are free to use under Unsplash license
-- Format: https://images.unsplash.com/photo-{ID}?w=800&q=80&fit=crop
-- ---------------------------------------------------------------------------

-- Casablanca - Hassan II Mosque at sunset (iconic landmark)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1569383746724-6f1b882b8f46?w=800&q=80&fit=crop'
where lower(slug) = 'casablanca' or lower(name) = 'casablanca';

-- Marrakech - Jemaa el-Fnaa / Koutoubia Mosque (red city atmosphere)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800&q=80&fit=crop'
where lower(slug) = 'marrakech' or lower(name) = 'marrakech';

-- Rabat - Kasbah des Oudaias (blue and white architecture)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&q=80&fit=crop'
where lower(slug) = 'rabat' or lower(name) = 'rabat';

-- Salé - Neighboring city to Rabat (coastal view)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80&fit=crop'
where lower(slug) = 'sale' or lower(name) = 'salé';

-- Tanger - Famous medina view (gateway to Africa)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800&q=80&fit=crop'
where lower(slug) = 'tanger' or lower(slug) = 'tangier' or lower(name) = 'tanger';

-- Agadir - Beach sunset (modern resort city)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&fit=crop'
where lower(slug) = 'agadir' or lower(name) = 'agadir';

-- Essaouira - Blue fishing boats in harbor (coastal charm)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&q=80&fit=crop'
where lower(slug) = 'essaouira' or lower(name) = 'essaouira';

-- Fès - Chouara Tannery (ancient medina)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800&q=80&fit=crop'
where lower(slug) = 'fes' or lower(slug) = 'fez' or lower(name) = 'fès' or lower(name) = 'fes';

-- Chefchaouen - Blue streets (the blue pearl)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1553899017-fd2a9ca2fdb6?w=800&q=80&fit=crop'
where lower(slug) = 'chefchaouen' or lower(name) = 'chefchaouen';

-- Meknès - Bab Mansour gate (imperial city)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=800&q=80&fit=crop'
where lower(slug) = 'meknes' or lower(name) = 'meknès' or lower(name) = 'meknes';

-- Ouarzazate - Ait Ben Haddou kasbah (Hollywood of Morocco)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1489493585363-d69421e0edd3?w=800&q=80&fit=crop'
where lower(slug) = 'ouarzazate' or lower(name) = 'ouarzazate';

-- El Jadida - Portuguese cistern (coastal heritage)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80&fit=crop'
where lower(slug) = 'el-jadida' or lower(slug) = 'eljadida' or lower(name) = 'el jadida';

-- Ifrane - Cedar forest / Swiss architecture (little Switzerland)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1610641818989-c2051b5e2cfd?w=800&q=80&fit=crop'
where lower(slug) = 'ifrane' or lower(name) = 'ifrane';

-- Tétouan - White medina (Andalusian influence)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1585129777188-94600bc7b4b3?w=800&q=80&fit=crop'
where lower(slug) = 'tetouan' or lower(name) = 'tétouan' or lower(name) = 'tetouan';

-- Oujda - Eastern Morocco (oriental gateway)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?w=800&q=80&fit=crop'
where lower(slug) = 'oujda' or lower(name) = 'oujda';

-- Nador - Mediterranean coast (Rif coastline)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&fit=crop'
where lower(slug) = 'nador' or lower(name) = 'nador';

-- Al Hoceima - Mediterranean bay (pristine beaches)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80&fit=crop'
where lower(slug) = 'al-hoceima' or lower(slug) = 'alhoceima' or lower(name) = 'al hoceima';

-- Kénitra - Atlantic coast (industrial port)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80&fit=crop'
where lower(slug) = 'kenitra' or lower(name) = 'kénitra' or lower(name) = 'kenitra';

-- Béni Mellal - Atlas foothills (agricultural region)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80&fit=crop'
where lower(slug) = 'beni-mellal' or lower(slug) = 'benimellal' or lower(name) = 'béni mellal';

-- Safi - Pottery tradition (ceramic capital)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&q=80&fit=crop'
where lower(slug) = 'safi' or lower(name) = 'safi';

-- Mohammedia - Beach resort (Casablanca suburb)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?w=800&q=80&fit=crop'
where lower(slug) = 'mohammedia' or lower(name) = 'mohammedia';

-- Errachidia - Ziz Valley oasis (desert gateway)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80&fit=crop'
where lower(slug) = 'errachidia' or lower(name) = 'errachidia';

-- Dakhla - Lagoon and kitesurfing (Saharan paradise)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1504681869696-d977211a5f4c?w=800&q=80&fit=crop'
where lower(slug) = 'dakhla' or lower(name) = 'dakhla';

-- Laâyoune - Saharan capital (southern provinces)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=800&q=80&fit=crop'
where lower(slug) = 'laayoune' or lower(name) = 'laâyoune' or lower(name) = 'laayoune';

-- Guelmim - Camel market (gateway to Sahara)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1542401886-65d6c61db217?w=800&q=80&fit=crop'
where lower(slug) = 'guelmim' or lower(name) = 'guelmim';

-- Taroudant - Mini Marrakech (rampart city)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&fit=crop'
where lower(slug) = 'taroudant' or lower(name) = 'taroudant';

-- Tiznit - Silver jewelry (artisan town)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=800&q=80&fit=crop'
where lower(slug) = 'tiznit' or lower(name) = 'tiznit';

-- Settat - Chaouia plains (agricultural heartland)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80&fit=crop'
where lower(slug) = 'settat' or lower(name) = 'settat';

-- Khouribga - Phosphate region (mining town)
update public.home_cities
set image_url = 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800&q=80&fit=crop'
where lower(slug) = 'khouribga' or lower(name) = 'khouribga';

commit;

