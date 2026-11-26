"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { FullScreenLoader } from "@/components/ui";

const NAV = [
  { href: "/", label: "Inicio", ready: true },
  { href: "/turnos", label: "Turnos", ready: false },
  { href: "/servicios", label: "Servicios", ready: true },
  { href: "/horarios", label: "Horarios", ready: true },
  { href: "/clientes", label: "Clientes", ready: false },
  { href: "/vista-cliente", label: "Vista del cliente", ready: true },
  { href: "/cuenta", label: "Mi cuenta", ready: true },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated" || !user) return <FullScreenLoader />;

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-stone-200 bg-white md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-stone-900 text-white">✂</span>
          <span className="font-semibold">{user.barbershop.name}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map((item) =>
            item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                  pathname === item.href
                    ? "bg-stone-100 font-medium text-stone-900"
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.href}
                className="flex cursor-not-allowed items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-stone-400"
              >
                {item.label}
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  Pronto
                </span>
              </span>
            ),
          )}
        </nav>
        <div className="mt-auto hidden border-t border-stone-200 p-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-stone-500">{user.email}</p>
          <button
            onClick={() => void logout()}
            className="mt-3 text-sm text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 p-5 md:p-8">{children}</main>
    </div>
  );
}
