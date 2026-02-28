import {
  LayoutDashboard,
  PiggyBank,
  ClipboardList,
  Home,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Tracker", href: "/tracker", icon: PiggyBank },
      { name: "Planner", href: "/planner", icon: ClipboardList },
    ],
  },
];

export const bottomNavItems: NavItem[] = [
  { name: "Household", href: "/household", icon: Home },
  { name: "Settings", href: "/settings", icon: Settings },
];
