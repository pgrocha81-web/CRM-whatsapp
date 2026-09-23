"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/funil", label: "Funil", icon: "▦", key: "funil" },
  { href: "/inbox", label: "Conversas", icon: "💬", key: "inbox" },
  { href: "/clientes", label: "Clientes", icon: "👥", key: "clientes" },
  { href: "/tarefas", label: "Tarefas", icon: "✓", key: "tarefas" },
  { href: "/vencimentos", label: "Vencimentos", icon: "🛂", key: "vencimentos" },
] as const;

export function NavLinks({ badges }: { badges: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white md:static md:flex-col md:gap-1 md:border-0 md:bg-transparent">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const badge = badges[link.key] ?? 0;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] md:flex-none md:flex-row md:gap-3 md:rounded-lg md:px-3 md:py-2 md:text-sm ${
              active ? "font-semibold text-stone-900 md:bg-stone-100" : "text-stone-500 hover:text-stone-900 md:hover:bg-stone-100"
            }`}
          >
            <span className="w-5 text-center text-base leading-none">{link.icon}</span>
            <span>{link.label}</span>
            {badge > 0 && (
              <span className="absolute right-3 top-1 rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold leading-4 text-white md:static md:ml-auto">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
