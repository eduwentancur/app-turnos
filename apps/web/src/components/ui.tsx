import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  loading,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {loading && <Spinner className="size-4 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 aria-invalid:border-red-500"
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
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
