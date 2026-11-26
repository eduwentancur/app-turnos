"use client";

import { useAuth } from "@/lib/auth/auth-context";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Hola, {user?.name} 👋</h1>
      <p className="mt-1 text-stone-500">Este es el panel de {user?.barbershop.name}.</p>

      <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-6">
        <h2 className="font-medium">Próximos pasos del MVP</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-stone-600">
          <li>• Servicios y precios</li>
          <li>• Horarios de atención y bloqueos</li>
          <li>• Disponibilidad y reserva de turnos</li>
          <li>• Calendario de turnos</li>
        </ul>
      </div>
    </div>
  );
}
