import type { Period, Slot } from "./types";

/** Límite de WhatsApp: máximo 10 filas por lista, sumando todas las secciones. */
export const WHATSAPP_MAX_ROWS = 10;

export interface ListSection {
  title: string;
  rows: { id: string; title: string; description?: string; slot?: Slot }[];
}

/**
 * Pagina los horarios como lo hará el bot: si entran todos (≤10) se muestran juntos;
 * si no, 9 horarios por página y la fila 10 es "Ver más horarios ›".
 */
export function paginateSlots(periods: Period[], page: number) {
  const flat = periods.flatMap((p) => p.slots.map((slot) => ({ period: p.label, slot })));
  const fitsInOne = flat.length <= WHATSAPP_MAX_ROWS;
  const perPage = fitsInOne ? WHATSAPP_MAX_ROWS : WHATSAPP_MAX_ROWS - 1;
  const totalPages = Math.max(1, Math.ceil(flat.length / perPage));
  const items = flat.slice(page * perPage, page * perPage + perPage);

  const sections: ListSection[] = [];
  for (const item of items) {
    let section = sections.at(-1);
    if (!section || section.title !== item.period) {
      section = { title: item.period, rows: [] };
      sections.push(section);
    }
    section.rows.push({ id: `SLOT:${item.slot.start}`, title: item.slot.localTime, slot: item.slot });
  }

  const hasMore = page < totalPages - 1;
  if (hasMore) {
    sections.at(-1)!.rows.push({ id: `MORE:${page + 1}`, title: "Ver más horarios ›" });
  }
  return { sections, page, totalPages, hasMore };
}
