"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, FullScreenLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import { formatDate, formatPhone, formatPrice, timeAgo } from "@/lib/format";
import type { CustomerPage, CustomerSort } from "@/lib/customers/types";

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: "recent", label: "Visita más reciente" },
  { value: "frequent", label: "Más frecuentes" },
  { value: "inactive", label: "Hace más que no vienen" },
  { value: "name", label: "Nombre (A-Z)" },
];
const PAGE_SIZE = 25;

export default function CustomersPage() {
  const { apiFetch } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Búsqueda con pequeño retardo mientras se escribe
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) params.set("search", query);
    apiFetch(`/api/customers?${params}`)
      .then(async (res) => {
        if (!res.ok) throw await parseApiError(res);
        return (await res.json()) as CustomerPage;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [apiFetch, query, sort, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
      <p className="mt-1 text-sm text-stone-500">
        Se agregan solos con cada turno, desde el panel o desde WhatsApp.
        {data && ` ${data.total} cliente${data.total === 1 ? "" : "s"}.`}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          aria-label="Buscar cliente"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-64 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
        />
        <select
          aria-label="Ordenar"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as CustomerSort);
            setPage(1);
          }}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-600"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!data ? (
        !error && <FullScreenLoader />
      ) : data.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-500">
          {query ? "No hay clientes que coincidan con la búsqueda." : "Todavía no hay clientes. Aparecen al reservar el primer turno."}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 text-right font-medium">Visitas</th>
                <th className="px-3 py-3 font-medium">Última visita</th>
                <th className="px-3 py-3 font-medium">Próximo turno</th>
                <th className="px-5 py-3 text-right font-medium">Gastado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.items.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50">
                  <td className="px-5 py-3">
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="tabular-nums text-stone-500">{formatPhone(c.phone)}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {c.visits}
                    {c.noShows > 0 && (
                      <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700" title="Veces que no vino">
                        {c.noShows} falta{c.noShows === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-stone-600">{c.lastVisit ? timeAgo(c.lastVisit, now) : "—"}</td>
                  <td className="px-3 py-3 text-stone-600 first-letter:uppercase">
                    {c.nextAppointment ? `${formatDate(c.nextAppointment.localDate)} ${c.nextAppointment.localStart}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">{formatPrice(c.totalSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" className="px-3" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ‹ Anterior
          </Button>
          <span className="text-stone-500">
            {page} / {totalPages}
          </span>
          <Button variant="secondary" className="px-3" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Siguiente ›
          </Button>
        </div>
      )}
    </div>
  );
}
