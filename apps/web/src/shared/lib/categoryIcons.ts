import {
  Banknote,
  Bus,
  Car,
  Clapperboard,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  type LucideIcon,
  PawPrint,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  Tv,
  UtensilsCrossed,
  Wifi,
  Zap,
} from "lucide-react";

interface CategoryIconEntry {
  keywords: string[];
  icon: LucideIcon;
}

const CATEGORY_ICON_MAP: CategoryIconEntry[] = [
  { keywords: ["super", "mercado", "almacén", "almacen", "feria"], icon: ShoppingCart },
  { keywords: ["compra", "shopping", "tienda"], icon: ShoppingBag },
  { keywords: ["ropa", "vestuario", "zapato"], icon: Shirt },
  { keywords: ["comida", "restaurant", "café", "cafe", "food"], icon: UtensilsCrossed },
  {
    keywords: ["transport", "metro", "uber", "taxi", "bencin", "gasolin", "peaje"],
    icon: Car,
  },
  { keywords: ["micro", "bus", "bip", "locomoción", "locomocion"], icon: Bus },
  { keywords: ["salud", "médico", "medico", "farmacia", "doctor"], icon: HeartPulse },
  { keywords: ["arriendo", "rent", "alquiler", "hogar", "casa", "depto"], icon: Home },
  { keywords: ["netflix", "spotify", "suscri", "streaming"], icon: Tv },
  // "Entretención"/"Entretenimiento" both start with this stem.
  { keywords: ["entreten", "cine", "concierto", "juego", "ocio"], icon: Clapperboard },
  { keywords: ["sueldo", "salario", "ingreso"], icon: Banknote },
  { keywords: ["luz", "agua", "gas", "electrici"], icon: Zap },
  { keywords: ["viaje", "vuelo", "hotel"], icon: Plane },
  { keywords: ["educación", "educacion", "colegio", "universidad"], icon: GraduationCap },
  { keywords: ["gym", "deporte"], icon: Dumbbell },
  { keywords: ["mascota"], icon: PawPrint },
  { keywords: ["regalo", "gift"], icon: Gift },
  { keywords: ["internet", "wifi", "fibra"], icon: Wifi },
  { keywords: ["celular", "teléfono", "telefono", "plan móvil", "movil"], icon: Smartphone },
  { keywords: ["factura", "cuenta", "pago", "boleta"], icon: Receipt },
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
