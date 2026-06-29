import {
  Banknote,
  Car,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  type LucideIcon,
  PawPrint,
  Plane,
  ShoppingCart,
  Tag,
  Tv,
  UtensilsCrossed,
  Zap,
} from "lucide-react";

interface CategoryIconEntry {
  keywords: string[];
  icon: LucideIcon;
}

const CATEGORY_ICON_MAP: CategoryIconEntry[] = [
  { keywords: ["super", "mercado", "almacén"], icon: ShoppingCart },
  { keywords: ["comida", "restaurant", "café", "cafe", "food"], icon: UtensilsCrossed },
  { keywords: ["transport", "metro", "uber", "taxi", "bencin", "gasolin"], icon: Car },
  { keywords: ["salud", "médico", "medico", "farmacia", "doctor"], icon: HeartPulse },
  { keywords: ["arriendo", "rent", "alquiler"], icon: Home },
  { keywords: ["netflix", "spotify", "suscri", "streaming"], icon: Tv },
  { keywords: ["sueldo", "salario", "ingreso"], icon: Banknote },
  { keywords: ["luz", "agua", "gas", "electrici"], icon: Zap },
  { keywords: ["viaje", "vuelo", "hotel"], icon: Plane },
  { keywords: ["educación", "educacion", "colegio", "universidad"], icon: GraduationCap },
  { keywords: ["gym", "deporte"], icon: Dumbbell },
  { keywords: ["mascota"], icon: PawPrint },
  { keywords: ["regalo", "gift"], icon: Gift },
];

export function categoryIcon(category: string | null): LucideIcon {
  if (!category) return Tag;
  const lower = category.toLowerCase();
  for (const entry of CATEGORY_ICON_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.icon;
    }
  }
  return Tag;
}
