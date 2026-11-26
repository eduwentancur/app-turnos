import { Suspense } from 'react';
import { getHealth } from '@/lib/api';

async function ApiStatus() {
  const health = await getHealth();

  if (!health) {
    return <p className="text-red-400">No se pudo conectar con la API</p>;
  }

  return (
    <p className="text-emerald-400">
      API OK · DB {health.database} · {health.latencyMs} ms
    </p>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="rounded-2xl border border-neutral-800 p-8 text-center">
        <h1 className="mb-4 text-2xl font-semibold">App Turnos</h1>
        <Suspense fallback={<p className="text-neutral-400">Verificando API…</p>}>
          <ApiStatus />
        </Suspense>
      </div>
    </main>
  );
}
