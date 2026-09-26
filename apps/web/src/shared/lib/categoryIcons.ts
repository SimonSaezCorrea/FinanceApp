import {
  Banknote,
  BriefcaseBusiness,
  Car,
  Clapperboard,
  CreditCard,
  Dumbbell,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  PawPrint,
  PiggyBank,
  Plane,
  Percent,
  Receipt,
  RotateCcw,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Tag,
  Tv,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";

/**
 * One icon per code of the global category catalogue (`reference.Category.code`).
 * A code this map doesn't know (a catalogue row added before the web caught up)
 * falls back to the generic tag rather than breaking the row.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  SUPERMARKET: ShoppingCart,
  RESTAURANTS: UtensilsCrossed,
  TRANSPORT: Car,
  HOUSING: Home,
  UTILITIES: Zap,
  HOME: Sofa,
  HEALTH: HeartPulse,
  EDUCATION: GraduationCap,
  SHOPPING: ShoppingBag,
  ENTERTAINMENT: Clapperboard,
  SUBSCRIPTIONS: Tv,
  TECHNOLOGY: Smartphone,
  TRAVEL: Plane,
  SPORTS: Dumbbell,
  PETS: PawPrint,
  INSURANCE: Shield,
  FAMILY: Users,
  FEES: Receipt,
  SALARY: Banknote,
  FREELANCE: BriefcaseBusiness,
  REFUND: RotateCcw,
  GIFTS: Gift,
  OTHER: Tag,
  SAVINGS: PiggyBank,
  DEBTS: HandCoins,
  INTEREST: Percent,
  STATEMENT_PAYMENT: CreditCard,
  CARD_PREPAYMENT: Landmark,
};

export function categoryIcon(code: string | null | undefined): LucideIcon {
  return (code && CATEGORY_ICONS[code]) || Tag;
}
