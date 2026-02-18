/**
 * Configuration côté client de Sam — adapté par univers
 */

import type { ActivityCategory } from "@/lib/taxonomy";

export type SamUniverse = ActivityCategory | "default";

interface UniverseConfig {
  welcomeMessage: { fr: string; en: string; ar: string };
  suggestions: { fr: string[]; en: string[]; ar: string[] };
  subtitle: { fr: string; en: string; ar: string };
}

const UNIVERSE_CONFIGS: Record<SamUniverse, UniverseConfig> = {
  default: {
    welcomeMessage: {
      fr: "Salut ! Je suis Sam, ton concierge intelligent. Dis-moi ce que tu cherches !",
      en: "Hi! I'm Sam, your smart concierge. Tell me what you're looking for!",
      ar: "سلام! أنا سام، المساعد الذكي ديالك. قولّي شنو كتقلّب عليه!",
    },
    suggestions: {
      fr: [
        "Un restaurant marocain à Marrakech",
        "Les tendances du moment",
        "Un spa à Casablanca",
        "Un hôtel à Agadir",
      ],
      en: [
        "A Moroccan restaurant in Marrakech",
        "What's trending now",
        "A spa in Casablanca",
        "A hotel in Agadir",
      ],
      ar: [
        "شي ريسطو مغربي ف مراكش",
        "شنو كاين جديد",
        "شي سبا ف كازا",
        "شي أوطيل ف أكادير",
      ],
    },
    subtitle: {
      fr: "Ton concierge intelligent",
      en: "Your smart concierge",
      ar: "المساعد الذكي ديالك",
    },
  },
  restaurants: {
    welcomeMessage: {
      fr: "Salut ! Envie de bien manger ? Dis-moi ce qui te fait envie 🍽️",
      en: "Hi! Craving something? Tell me what you're in the mood for 🍽️",
      ar: "سلام! بغيتي تاكل شي حاجة بنينة؟ قولّي شنو كتشهّي 🍽️",
    },
    suggestions: {
      fr: [
        "Un restaurant marocain à Marrakech",
        "Un brunch à Casablanca",
        "Les mieux notés près de moi",
        "Un dîner romantique à Rabat",
      ],
      en: [
        "A Moroccan restaurant in Marrakech",
        "Brunch in Casablanca",
        "Best rated near me",
        "A romantic dinner in Rabat",
      ],
      ar: [
        "شي ريسطو مغربي ف مراكش",
        "برانش ف كازا",
        "أحسن واحد قريب ليا",
        "عشاء رومانسي ف الرباط",
      ],
    },
    subtitle: {
      fr: "Ton guide gourmand",
      en: "Your foodie guide",
      ar: "الدليل ديالك للماكلة",
    },
  },
  sport: {
    welcomeMessage: {
      fr: "Salut ! Prêt à te faire du bien ? Spa, hammam, salle de sport… je te trouve ça 💆",
      en: "Hi! Ready to treat yourself? Spa, hammam, gym… I'll find it for you 💆",
      ar: "سلام! بغيتي ترتاح شوية؟ سبا، حمّام، سال دو سبور… أنا هنا 💆",
    },
    suggestions: {
      fr: [
        "Un spa à Casablanca",
        "Un hammam traditionnel à Marrakech",
        "Une salle de sport près de moi",
        "Un cours de yoga à Rabat",
      ],
      en: [
        "A spa in Casablanca",
        "A traditional hammam in Marrakech",
        "A gym near me",
        "A yoga class in Rabat",
      ],
      ar: [
        "شي سبا ف كازا",
        "حمّام تقليدي ف مراكش",
        "سال دو سبور قريب ليا",
        "كور ديال يوغا ف الرباط",
      ],
    },
    subtitle: {
      fr: "Ton coach bien-être",
      en: "Your wellness coach",
      ar: "مساعدك للرياضة و الراحة",
    },
  },
  loisirs: {
    welcomeMessage: {
      fr: "Salut ! Envie de fun ? Escape game, karting, jet ski… dis-moi ! 🎉",
      en: "Hi! Looking for fun? Escape room, karting, jet ski… tell me! 🎉",
      ar: "سلام! بغيتي تسلّي راسك؟ إسكاب غيم، كارتينغ، جيت سكي… قولّي! 🎉",
    },
    suggestions: {
      fr: [
        "Un escape game à Casablanca",
        "Du karting à Marrakech",
        "Des activités en plein air à Agadir",
        "Quoi faire ce weekend ?",
      ],
      en: [
        "An escape room in Casablanca",
        "Karting in Marrakech",
        "Outdoor activities in Agadir",
        "What to do this weekend?",
      ],
      ar: [
        "إسكاب غيم ف كازا",
        "كارتينغ ف مراكش",
        "نشاط ف الهوا الطلق ف أكادير",
        "شنو ندير هاد الويكاند؟",
      ],
    },
    subtitle: {
      fr: "Ton guide loisirs",
      en: "Your leisure guide",
      ar: "دليلك ديال التسلية",
    },
  },
  hebergement: {
    welcomeMessage: {
      fr: "Salut ! Tu cherches où dormir ? Hôtel, riad, villa… je te trouve le spot parfait 🏨",
      en: "Hi! Looking for a place to stay? Hotel, riad, villa… I'll find the perfect spot 🏨",
      ar: "سلام! كتقلّب فين تنعس؟ أوطيل، رياض، فيلا… أنا هنا 🏨",
    },
    suggestions: {
      fr: [
        "Un riad à Marrakech",
        "Un hôtel bord de mer à Agadir",
        "Un hébergement pas cher à Casablanca",
        "Une villa avec piscine à Tanger",
      ],
      en: [
        "A riad in Marrakech",
        "A beachfront hotel in Agadir",
        "Affordable accommodation in Casablanca",
        "A villa with pool in Tangier",
      ],
      ar: [
        "رياض ف مراكش",
        "أوطيل على البحر ف أكادير",
        "إقامة رخيصة ف كازا",
        "فيلا بالمسبح ف طنجة",
      ],
    },
    subtitle: {
      fr: "Ton guide hébergement",
      en: "Your accommodation guide",
      ar: "دليلك ديال الإقامة",
    },
  },
  culture: {
    welcomeMessage: {
      fr: "Salut ! Envie de culture ? Musées, expos, spectacles… je te guide ! 🎭",
      en: "Hi! Looking for culture? Museums, exhibitions, shows… I'll guide you! 🎭",
      ar: "سلام! بغيتي تكتاشف الثقافة؟ متاحف، معارض، عروض… أنا هنا! 🎭",
    },
    suggestions: {
      fr: [
        "Un musée à Marrakech",
        "Une visite guidée à Fès",
        "Des spectacles à Casablanca",
        "Quoi faire de culturel ce weekend ?",
      ],
      en: [
        "A museum in Marrakech",
        "A guided tour in Fez",
        "Shows in Casablanca",
        "Cultural activities this weekend?",
      ],
      ar: [
        "متحف ف مراكش",
        "زيارة بالدليل ف فاس",
        "عروض ف كازا",
        "شنو ندير ثقافي هاد الويكاند؟",
      ],
    },
    subtitle: {
      fr: "Ton guide culturel",
      en: "Your cultural guide",
      ar: "دليلك الثقافي",
    },
  },
  shopping: {
    welcomeMessage: {
      fr: "Salut ! Envie de shopping ? Mode, artisanat, concept stores… je connais les bonnes adresses 🛍️",
      en: "Hi! In the mood for shopping? Fashion, crafts, concept stores… I know the best spots 🛍️",
      ar: "سلام! بغيتي تسوّق؟ موضة، صناعة تقليدية، كونسيبت ستور… عندي عناوين مزيانين 🛍️",
    },
    suggestions: {
      fr: [
        "Des boutiques à Marrakech",
        "Un concept store à Casablanca",
        "De l'artisanat marocain à Fès",
        "Du shopping de luxe à Rabat",
      ],
      en: [
        "Boutiques in Marrakech",
        "A concept store in Casablanca",
        "Moroccan crafts in Fez",
        "Luxury shopping in Rabat",
      ],
      ar: [
        "حوانت ف مراكش",
        "كونسيبت ستور ف كازا",
        "صناعة تقليدية ف فاس",
        "شوبينغ ديال اللوكس ف الرباط",
      ],
    },
    subtitle: {
      fr: "Ton personal shopper",
      en: "Your personal shopper",
      ar: "المساعد ديالك للشوبينغ",
    },
  },
  rentacar: {
    welcomeMessage: {
      fr: "Salut ! Tu cherches un véhicule ? Voiture, scooter, avec chauffeur… je te trouve ça 🚗",
      en: "Hi! Looking for a ride? Car, scooter, chauffeur… I'll find it for you 🚗",
      ar: "سلام! كتقلّب على طوموبيل؟ كار، سكوتر، مع شوفور… أنا هنا 🚗",
    },
    suggestions: {
      fr: [
        "Louer une voiture à Marrakech",
        "Un SUV à Casablanca",
        "Une voiture avec chauffeur à Rabat",
        "Location pas chère à Agadir",
      ],
      en: [
        "Rent a car in Marrakech",
        "An SUV in Casablanca",
        "A car with driver in Rabat",
        "Cheap rental in Agadir",
      ],
      ar: [
        "كراء طوموبيل ف مراكش",
        "SUV ف كازا",
        "طوموبيل مع شوفور ف الرباط",
        "كراء رخيص ف أكادير",
      ],
    },
    subtitle: {
      fr: "Ton guide mobilité",
      en: "Your mobility guide",
      ar: "دليلك ديال التنقل",
    },
  },
};

/**
 * Get Sam config for a specific universe
 */
export function getSamUniverseConfig(universe?: string | null): UniverseConfig {
  if (universe && universe in UNIVERSE_CONFIGS) {
    return UNIVERSE_CONFIGS[universe as SamUniverse];
  }
  return UNIVERSE_CONFIGS.default;
}

export const SAM_CONFIG = {
  displayName: "Sam",
  // Keep backward-compat defaults
  ...UNIVERSE_CONFIGS.default,
} as const;
