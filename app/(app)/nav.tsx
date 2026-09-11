"use client";

import { Bike, CircleDollarSign, FileText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Os módulos do produto, na ordem em que foram acordados no CONTEXT.md. */
const MODULOS = [
  { href: "/fleet", label: "Frota", icon: Bike },
  { href: "/renters", label: "Locatários", icon: Users },
  { href: "/rentals", label: "Locações", icon: FileText },
  { href: "/finance", label: "Financeiro", icon: CircleDollarSign },
] as const;

/**
 * A navegação entre módulos.
 *
 * Locações e Financeiro ainda não existem como rota. Eles aparecem porque a
 * lista de módulos é o mapa do produto, e esconder o que vem depois faria o
 * gestor descobrir o sistema por partes.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {MODULOS.map(({ href, label, icon: Icon }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
              ativo
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-hover hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-[18px]", ativo && "text-brand-text")}
              strokeWidth={1.5}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
