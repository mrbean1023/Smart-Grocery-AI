import {
  BarChart3,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Refrigerator,
  Settings,
  ShoppingBasket,
  Sparkles,
  Tags,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/optimize", label: "Optimize", icon: Sparkles },
  { href: "/baskets", label: "Baskets", icon: ShoppingBasket },
  { href: "/products", label: "Products", icon: Tags },
  { href: "/pantry", label: "Pantry", icon: Refrigerator },
  { href: "/meal-plans", label: "Meal Plans", icon: CalendarDays },
  { href: "/assistant", label: "Assistant", icon: MessageSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Bottom tab bar (mobile) — top 5 destinations. */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 5);

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string): string {
  const match = NAV_ITEMS.find((item) => isActive(pathname, item.href));
  if (!match) return "Smart Grocery AI";
  if (pathname === "/recipes/new") return "Add recipe";
  return match.label;
}
