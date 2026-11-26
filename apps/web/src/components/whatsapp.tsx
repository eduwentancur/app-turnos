import type React from "react";
import type { ReactNode } from "react";

export function Phone({
  title,
  children,
  footer,
  scrollRef,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="mx-auto flex h-[680px] w-full max-w-[380px] flex-col overflow-hidden rounded-[2rem] border-8 border-stone-900 bg-[#efeae2] shadow-xl">
      <div className="flex items-center gap-3 bg-[#008069] px-4 py-3 text-white">
        <span className="flex size-9 items-center justify-center rounded-full bg-white/20">✂</span>
        <div>
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="text-xs text-white/80">cuenta de empresa</p>
        </div>
      </div>
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-3">
        {children}
      </div>
      {footer}
    </div>
  );
}

export function BotBubble({
  children,
  button,
  onButton,
  footer,
}: {
  children: ReactNode;
  button?: string;
  onButton?: () => void;
  footer?: string;
}) {
  return (
    <div className="mb-2 max-w-[85%]">
      <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 text-[14px] leading-snug text-stone-900 shadow-sm">
        <div className="whitespace-pre-line break-words">{children}</div>
        {footer && <p className="mt-1 text-[12px] text-stone-400">{footer}</p>}
      </div>
      {button && (
        <button
          type="button"
          onClick={onButton}
          className="mt-0.5 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-[14px] font-medium text-[#008069] shadow-sm hover:bg-stone-50"
        >
          ☰ {button}
        </button>
      )}
    </div>
  );
}

export function ReplyButtons({ items, onSelect }: { items: { id: string; title: string }[]; onSelect: (item: { id: string; title: string }) => void }) {
  return (
    <div className="-mt-1 mb-2 flex max-w-[85%] flex-col gap-0.5">
      {items.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onSelect(b)}
          className="rounded-lg bg-white py-2 text-[14px] font-medium text-[#008069] shadow-sm hover:bg-stone-50"
        >
          {b.title}
        </button>
      ))}
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[14px] text-stone-900 shadow-sm">
      {children}
    </div>
  );
}

export interface SheetRow {
  id: string;
  title: string;
  description?: string;
}

export function ListSheet({
  title,
  sections,
  onSelect,
  onClose,
}: {
  title: string;
  sections: { title?: string; rows: SheetRow[] }[];
  onSelect: (row: SheetRow) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/30">
      <div className="max-h-[85%] overflow-y-auto rounded-t-2xl bg-white pb-3">
        <div className="sticky top-0 flex items-center gap-3 border-b border-stone-100 bg-white px-4 py-3">
          <button type="button" aria-label="Cerrar lista" onClick={onClose} className="text-stone-500">
            ✕
          </button>
          <p className="text-[15px] font-medium">{title}</p>
        </div>
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && <p className="px-4 pb-1 pt-3 text-[13px] font-medium text-[#008069]">{s.title}</p>}
            {s.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-stone-900">{row.title}</span>
                  {row.description && (
                    <span className="block truncate text-[13px] text-stone-500">{row.description}</span>
                  )}
                </span>
                <span className="ml-3 size-5 shrink-0 rounded-full border-2 border-stone-300" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
