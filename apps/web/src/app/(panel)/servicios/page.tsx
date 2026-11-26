"use client";

import { useState } from "react";
import { Alert, Button, FullScreenLoader, Modal, Toggle } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/api-client";
import { formatDuration, formatPrice } from "@/lib/format";
import { useServices } from "@/lib/services/use-services";
import type { Service } from "@/lib/services/types";
import { ServiceForm } from "./service-form";

type Editing = { mode: "create" } | { mode: "edit"; service: Service } | null;

export default function ServicesPage() {
  const { user } = useAuth();
  const { services, loading, error, create, update, remove } = useServices();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canEdit = user?.role === "OWNER";

  async function toggleActive(service: Service) {
    setActionError(null);
    setBusyId(service.id);
    try {
      await update(service.id, { isActive: !service.isActive });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setActionError(null);
    setBusyId(deleting.id);
    try {
      await remove(deleting.id);
      setDeleting(null);
    } catch (err) {
      setDeleting(null);
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <FullScreenLoader />;

  const activeCount = services.filter((s) => s.isActive).length;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
          <p className="mt-1 text-sm text-stone-500">
            {services.length === 0
              ? "Cargá los servicios que ofrecés con su duración y precio."
              : `${activeCount} disponible${activeCount === 1 ? "" : "s"} para reservar · ${services.length} en total`}
          </p>
        </div>
        {canEdit && <Button onClick={() => setEditing({ mode: "create" })}>+ Nuevo servicio</Button>}
      </div>

      <div className="mt-6 space-y-3">
        {error && <Alert>{error}</Alert>}
        {actionError && <Alert>{actionError}</Alert>}
      </div>

      {services.length === 0 && !error ? (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="text-3xl">💈</p>
          <p className="mt-3 font-medium">Todavía no hay servicios</p>
          <p className="mt-1 text-sm text-stone-500">
            Ej: Corte (30 min), Barba (20 min), Corte + Barba (45 min).
          </p>
          {canEdit && (
            <Button className="mt-5" onClick={() => setEditing({ mode: "create" })}>
              Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {services.map((service) => (
            <li
              key={service.id}
              className={`flex flex-wrap items-center gap-4 px-5 py-4 ${service.isActive ? "" : "bg-stone-50"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`font-medium ${service.isActive ? "" : "text-stone-400"}`}>{service.name}</p>
                  {!service.isActive && (
                    <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                      Inactivo
                    </span>
                  )}
                </div>
                {service.description && (
                  <p className="mt-0.5 truncate text-sm text-stone-500">{service.description}</p>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tabular-nums">{formatPrice(service.price)}</p>
                <p className="text-stone-500">{formatDuration(service.durationMinutes)}</p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Toggle
                    checked={service.isActive}
                    onChange={() => void toggleActive(service)}
                    disabled={busyId === service.id}
                    label={`${service.isActive ? "Desactivar" : "Activar"} ${service.name}`}
                  />
                  <Button
                    variant="ghost"
                    className="px-3"
                    onClick={() => setEditing({ mode: "edit", service })}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="dangerGhost"
                    className="px-3"
                    onClick={() => setDeleting(service)}
                  >
                    Eliminar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        title={editing?.mode === "edit" ? "Editar servicio" : "Nuevo servicio"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ServiceForm
            key={editing.mode === "edit" ? editing.service.id : "new"}
            initial={editing.mode === "edit" ? editing.service : undefined}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              if (editing.mode === "edit") await update(editing.service.id, input);
              else await create(input);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} title="Eliminar servicio" onClose={() => setDeleting(null)}>
        <p className="text-sm text-stone-600">
          ¿Eliminar <strong>{deleting?.name}</strong>? Si ya tiene turnos registrados no se puede
          eliminar: en ese caso desactivalo.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busyId === deleting?.id} onClick={() => void confirmDelete()}>
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
