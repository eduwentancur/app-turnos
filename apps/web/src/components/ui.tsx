import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const BUTTON_VARIANTS = {
  primary: "bg-stone-900 text-white hover:bg-stone-800",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
  dangerGhost: "text-red-600 hover:bg-red-50 hover:text-red-700",
} as const;

export function Button({
  loading,
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: keyof typeof BUTTON_VARIANTS;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner className="size-4 border-current/30 border-t-current" />}
      {children}
    </button>
  );
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 aria-invalid:border-red-500";

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-stone-700">
        {label}
        {hint && <span className="text-xs font-normal text-stone-400">{hint}</span>}
      </span>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={INPUT_CLASS}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-stone-700">
        {label}
        {hint && <span className="text-xs font-normal text-stone-400">{hint}</span>}
      </span>
      <textarea {...props} className={`${INPUT_CLASS} resize-none`} />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-emerald-600" : "bg-stone-300"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-5.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div role="alert" className={`rounded-lg border px-3 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Spinner({ className = "size-6 border-stone-300 border-t-stone-900" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 ${className}`} aria-hidden />;
}

export function FullScreenLoader() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
  );
}
