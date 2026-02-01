begin;

-- Update Menu Digital deliverables to match the sales deck / comparative table.
-- Applies to both monthly and annual offers.

update public.visibility_offers
set deliverables = array[
  'Menu digital consultatif (sans commande)',
  'QR Code par table',
  'Bouton « Appel serveur »',
  'Bouton « Demande d’addition »',
  'Avis express clients',
  'Gestion des avis depuis l’Espace PRO',
  'Accès à l’Espace PRO',
  'Mise en place rapide',
  'Codes promo & remises',
  'Support standard'
]::text[]
where deleted_at is null
  and type = 'menu_digital'
  and title in (
    'MENU DIGITAL — SILVER (Mensuel)',
    'MENU DIGITAL — SILVER (Annuel -17%)'
  );

update public.visibility_offers
set deliverables = array[
  'Tout ce qui est inclus dans l’offre SILVER',
  'Menu digital interactif',
  'Commande à table',
  'Suivi des commandes en temps réel',
  'Gestion avancée des tables et QR codes',
  'Paiements & suivi des encaissements',
  'Reporting et statistiques (ventes, périodes, performances)',
  'Historique des commandes',
  'Paramétrage avancé de l’établissement',
  'Accès prioritaire aux nouvelles fonctionnalités',
  'Chat avec SAM (assistant intelligent côté client)',
  'Support prioritaire'
]::text[]
where deleted_at is null
  and type = 'menu_digital'
  and title in (
    'MENU DIGITAL — PREMIUM (Mensuel)',
    'MENU DIGITAL — PREMIUM (Annuel -17%)'
  );

commit;
