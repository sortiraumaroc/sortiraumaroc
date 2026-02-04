export type MenuBadge =
  | "specialite"
  | "nouveau"
  | "bestSeller"
  | "coupDeCoeur"
  | "chef"
  | "vegetarien"
  | "epice"
  | "fruitsDeMer"
  | "healthy"
  | "traditionnel"
  | "signature";

export type MenuCategory = {
  id: string;
  label: string;
};

export type MenuProduct = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  priceDh: number;
  imageSrc: string;
  badges?: MenuBadge[];
  likes: number;
};

export type VenueProfile = {
  name: string;
  tagline: string;
  logoImageSrc?: string;
  logoAlt?: string;
  heroImageSrc: string;
  heroAlt: string;
  geoFence: {
    enabled?: boolean;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
};

export const venueProfile: VenueProfile = {
  name: "",
  tagline: "",
  logoImageSrc:
    "/placeholder.svg",
  heroImageSrc:
    "",
  geoFence: {
    // Désactivé temporairement pour avancer sur la mise en place (pas de pop-up GPS)
    enabled: false,

    // Gueliz (Marrakech) — coordonnées conservées pour réactivation plus tard
    latitude: 31.6561,
    longitude: -8.0164,
    radiusMeters: 50,
  },
};

export const menuCategories: MenuCategory[] = [
  { id: "menus", label: "Nos menus" },
  { id: "poulets", label: "Poulets" },
  { id: "escalopes", label: "Escalopes" },
  { id: "plats", label: "Plats" },
  { id: "sandwichs", label: "Sandwichs" },
  { id: "salades", label: "Salades" },
  { id: "accompagnements", label: "Accompagnements" },
  { id: "desserts", label: "Desserts" },
  { id: "boissons", label: "Boissons" },
  { id: "cocktails", label: "Cocktails" },
];

export const menuProducts: MenuProduct[] = [
  {
    id: "menu-enfant",
    categoryId: "menus",
    title: "Menu enfant",
    description: "3 tenders de chicken + frites + Capri-Sun.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    badges: ["nouveau", "coupDeCoeur"],
    likes: 18,
  },
  {
    id: "menu-family",
    categoryId: "menus",
    title: "Menu family",
    description: "1 poulet entier + accompagnements + 2 sauces + boisson 1,5L.",
    priceDh: 170,
    imageSrc: "/placeholder.svg",
    badges: ["specialite", "bestSeller"],
    likes: 41,
  },
  {
    id: "menu-big-family",
    categoryId: "menus",
    title: "Menu big family",
    description: "2 poulets entiers + accompagnements + 4 sauces + 2 boissons 1,5L.",
    priceDh: 325,
    imageSrc: "/placeholder.svg",
    likes: 29,
  },
  {
    id: "menu-etudiant",
    categoryId: "menus",
    title: "Menu étudiant",
    description: "Une pizza ou un sandwich au choix + boisson 33cl.",
    priceDh: 37,
    imageSrc: "/placeholder.svg",
    likes: 23,
  },

  {
    id: "demi-poulet-braise",
    categoryId: "poulets",
    title: "1/2 poulet braisé",
    description: "Servi avec un accompagnement et une sauce verte.",
    priceDh: 85,
    imageSrc: "/placeholder.svg",
    badges: ["signature", "bestSeller"],
    likes: 76,
  },
  {
    id: "cuisse-braisee",
    categoryId: "poulets",
    title: "Cuisse braisée",
    description: "Servie avec un accompagnement et une sauce verte.",
    priceDh: 65,
    imageSrc: "/placeholder.svg",
    likes: 44,
  },
  {
    id: "deux-cuisses-braisees",
    categoryId: "poulets",
    title: "2 x cuisses braisées",
    description: "Pour partager, avec accompagnement et sauce verte.",
    priceDh: 85,
    imageSrc: "/placeholder.svg",
    likes: 52,
  },
  {
    id: "pilons-par-3",
    categoryId: "poulets",
    title: "Pilons de poulet (par 3)",
    description: "Servis avec un accompagnement et une sauce verte.",
    priceDh: 50,
    imageSrc: "/placeholder.svg",
    likes: 38,
  },

  {
    id: "escalope-champignon",
    categoryId: "escalopes",
    title: "Escalope sauce champignon",
    description: "Crème champignon, accompagnement au choix.",
    priceDh: 89,
    imageSrc: "/placeholder.svg",
    likes: 33,
  },
  {
    id: "cordon-bleu-maison",
    categoryId: "escalopes",
    title: "Cordon bleu (maison)",
    description: "Cordon bleu maison, accompagnement au choix.",
    priceDh: 95,
    imageSrc: "/placeholder.svg",
    likes: 28,
  },
  {
    id: "escalope-chevre-miel",
    categoryId: "escalopes",
    title: "Escalope chèvre miel",
    description: "Chèvre, miel, accompagnement au choix.",
    priceDh: 95,
    imageSrc: "/placeholder.svg",
    likes: 25,
  },

  {
    id: "plat-poulet-creme",
    categoryId: "plats",
    title: "Poulet à la crème",
    description: "Émincés de poulet, sauce à la crème maison. Pâtes au choix (penne ou tagliatelle).",
    priceDh: 75,
    imageSrc: "/placeholder.svg",
    likes: 29,
  },
  {
    id: "plat-poulet-sauce-tomate",
    categoryId: "plats",
    title: "Poulet sauce tomate",
    description: "Émincés de poulet, sauce tomate maison. Pâtes au choix (penne ou tagliatelle).",
    priceDh: 75,
    imageSrc: "/placeholder.svg",
    likes: 23,
  },
  {
    id: "plat-poulet-sauce-verte",
    categoryId: "plats",
    title: "Poulet sauce verte",
    description: "Émincés de poulet, la fameuse sauce verte maison. Pâtes au choix (penne ou tagliatelle).",
    priceDh: 75,
    imageSrc: "/placeholder.svg",
    likes: 31,
  },
  {
    id: "plat-poulet-carbonara",
    categoryId: "plats",
    title: "Poulet carbonara",
    description: "Émincés de poulet, lardons, champignons, crème fraîche. Pâtes au choix (penne ou tagliatelle).",
    priceDh: 79,
    imageSrc: "/placeholder.svg",
    likes: 34,
  },
  {
    id: "plat-riz-cremeux",
    categoryId: "plats",
    title: "Riz crémeux",
    description: "Riz parfumé, émincés de poulet, sauce crémeuse aux champignons.",
    priceDh: 75,
    imageSrc: "/placeholder.svg",
    likes: 21,
  },

  {
    id: "sandwich-braise",
    categoryId: "sandwichs",
    title: "Sandwich braisé",
    description: "Poulet braisé, crudités, sauce maison.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    badges: ["specialite", "coupDeCoeur"],
    likes: 64,
  },
  {
    id: "wrap-poulet",
    categoryId: "sandwichs",
    title: "Wrap poulet",
    description: "Poulet, crudités, sauce.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    badges: ["nouveau"],
    likes: 31,
  },
  {
    id: "cheese-burger",
    categoryId: "sandwichs",
    title: "Cheese burger",
    description: "Steak, fromage, salade, tomate, oignon.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    likes: 47,
  },

  {
    id: "salade-petit-braise",
    categoryId: "salades",
    title: "Salade Petit Braisé",
    description: "Salade, poulet, crudités, sauce légère.",
    priceDh: 59,
    imageSrc: "/placeholder.svg",
    badges: ["nouveau", "healthy"],
    likes: 22,
  },
  {
    id: "salade-cesar",
    categoryId: "salades",
    title: "Salade César",
    description: "Poulet, laitue, sauce César, croûtons.",
    priceDh: 59,
    imageSrc: "/placeholder.svg",
    likes: 19,
  },
  {
    id: "tartare-poulet",
    categoryId: "salades",
    title: "Tartare de poulet",
    description: "Poulet, avocat, sauce maison.",
    priceDh: 49,
    imageSrc: "/placeholder.svg",
    likes: 15,
  },
  {
    id: "toast-poulet",
    categoryId: "salades",
    title: "Toast poulet",
    description: "Poulet braisé, sauce maison, toast.",
    priceDh: 45,
    imageSrc: "/placeholder.svg",
    likes: 17,
  },

  {
    id: "accompagnement-riz",
    categoryId: "accompagnements",
    title: "Riz",
    description: "Accompagnement.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 12,
  },
  {
    id: "accompagnement-frites-maison",
    categoryId: "accompagnements",
    title: "Frites maison",
    description: "Accompagnement.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 18,
  },
  {
    id: "accompagnement-aloko",
    categoryId: "accompagnements",
    title: "Aloko",
    description: "Accompagnement.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 14,
  },
  {
    id: "accompagnement-pommes-sautees",
    categoryId: "accompagnements",
    title: "Pommes sautées",
    description: "Accompagnement.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 11,
  },
  {
    id: "accompagnement-haricots-verts",
    categoryId: "accompagnements",
    title: "Haricots verts",
    description: "Accompagnement.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 9,
  },
  {
    id: "accompagnement-patate-douce",
    categoryId: "accompagnements",
    title: "Patate douce",
    description: "Accompagnement.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 10,
  },
  {
    id: "sauce-nature",
    categoryId: "accompagnements",
    title: "Sauce Nature",
    description: "Nappage / sauce.",
    priceDh: 15,
    imageSrc: "/placeholder.svg",
    likes: 8,
  },
  {
    id: "sauce-bbq",
    categoryId: "accompagnements",
    title: "Sauce BBQ",
    description: "Nappage / sauce.",
    priceDh: 15,
    imageSrc: "/placeholder.svg",
    likes: 9,
  },
  {
    id: "sauce-piri-piri",
    categoryId: "accompagnements",
    title: "Sauce Piri Piri",
    description: "Nappage / sauce (pimentée).",
    priceDh: 15,
    imageSrc: "/placeholder.svg",
    likes: 11,
  },

  {
    id: "tiramisu",
    categoryId: "desserts",
    title: "Tiramisu",
    description: "Dessert maison.",
    priceDh: 25,
    imageSrc: "/placeholder.svg",
    badges: ["specialite"],
    likes: 36,
  },
  {
    id: "fondant-chocolat",
    categoryId: "desserts",
    title: "Fondant chocolat",
    description: "Servi avec crème anglaise et chantilly.",
    priceDh: 29,
    imageSrc: "/placeholder.svg",
    likes: 27,
  },
  {
    id: "fondant-caramel",
    categoryId: "desserts",
    title: "Fondant caramel",
    description: "Servi avec crème anglaise.",
    priceDh: 29,
    imageSrc: "/placeholder.svg",
    likes: 24,
  },

  {
    id: "canette-33cl",
    categoryId: "boissons",
    title: "Canette 33cl",
    description: "Boisson fraîche (selon disponibilité).",
    priceDh: 10,
    imageSrc: "/placeholder.svg",
    likes: 10,
  },
  {
    id: "bouteille-verre",
    categoryId: "boissons",
    title: "Bouteille en verre",
    description: "Boisson en bouteille (verre).",
    priceDh: 15,
    imageSrc: "/placeholder.svg",
    likes: 7,
  },
  {
    id: "bouteille-1-5l",
    categoryId: "boissons",
    title: "Bouteille 1,5L",
    description: "Boisson 1,5 litre.",
    priceDh: 16,
    imageSrc: "/placeholder.svg",
    likes: 9,
  },
  {
    id: "cafe-nespresso",
    categoryId: "boissons",
    title: "Café Nespresso",
    description: "Café espresso.",
    priceDh: 18,
    imageSrc: "/placeholder.svg",
    likes: 13,
  },

  {
    id: "cocktail-mojito",
    categoryId: "cocktails",
    title: "Mojito",
    description: "Feuilles de menthe, citron, limonade, sirop de canne.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    likes: 16,
  },
  {
    id: "cocktail-irresistible",
    categoryId: "cocktails",
    title: "L'Irresistible",
    description: "Ananas, banane, noix de coco.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    likes: 14,
  },
  {
    id: "cocktail-marrakech",
    categoryId: "cocktails",
    title: "Le Marrakech",
    description: "Mangue, fruits exotiques, lait de coco.",
    priceDh: 40,
    imageSrc: "/placeholder.svg",
    likes: 15,
  },
];
