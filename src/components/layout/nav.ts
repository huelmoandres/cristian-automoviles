import {
  Car,
  HandCoins,
  LayoutDashboard,
  Percent,
  ReceiptText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { routes } from "@/lib/routes";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
export type NavSection = { title?: string; items: NavItem[] };

/** Menú lateral agrupado por área. Configuración y salir están en el menú de usuario. */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: routes.home(), label: "Inicio", icon: LayoutDashboard, end: true }],
  },
  {
    title: "Operaciones",
    items: [
      { to: routes.sales(), label: "Ventas", icon: ReceiptText },
      { to: routes.collections(), label: "Cobranzas", icon: HandCoins },
    ],
  },
  {
    title: "Gestión",
    items: [
      { to: routes.clients(), label: "Clientes", icon: Users },
      { to: routes.vehicles(), label: "Vehículos", icon: Car },
    ],
  },
  {
    title: "Financiación",
    items: [{ to: routes.financing(), label: "Planes y recargos", icon: Percent }],
  },
];
