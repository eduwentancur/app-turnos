"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, TextArea, Toggle } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { formatDuration, formatPrice } from "@/lib/format";
import { SERVICE_NAME_MAX, type Service, type ServiceInput } from "@/lib/services/types";

const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120];

interface Props {
  initial?: Service;
  onSubmit: (input: ServiceInput) => Promise<void>;
  onCancel: () => void;
}

export function ServiceForm({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 30));
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const priceNumber = Number(price.replace(",", "."));
  const durationNumber = Number(duration);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const trimmed = name.trim();
    if (trimmed.length < 2) next.name = "Ingresá un nombre";
    else if (trimmed.length > SERVICE_NAME_MAX) next.name = `Máximo ${SERVICE_NAME_MAX} caracteres`;
    if (!Number.isInteger(durationNumber) || durationNumber < 5 || durationNumber % 5 !== 0) {
      next.duration = "Duración en minutos, múltiplo de 5";
    }
    if (price.trim() === "" || Number.isNaN(priceNumber) || priceNumber < 0) {
      next.price = "Ingresá un precio válido";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        durationMinutes: durationNumber,
        price: priceNumber,
        isActive,
      });
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  }

  const previewName = name.trim() || "Nombre del servicio";
  const previewDetail =
    !Number.isNaN(priceNumber) && price.trim() !== ""
      ? `${formatPrice(priceNumber)} · ${formatDuration(durationNumber || 0)}`
      : formatDuration(durationNumber || 0);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {serverError && <Alert>{serverError}</Alert>}

      <Field
        label="Nombre"
        placeholder="Ej: Corte + Barba"
        value={name}
        maxLength={SERVICE_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        hint={`${name.trim().length}/${SERVICE_NAME_MAX}`}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Duración (min)"
          type="number"
          inputMode="numeric"
          min={5}
          step={5}
          list="durations"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          error={errors.duration}
        />
        <datalist id="durations">
          {DURATIONS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <Field
          label="Precio ($)"
          type="text"
          inputMode="decimal"
          placeholder="8000"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
        />
      </div>

      <TextArea
        label="Descripción"
        hint="Opcional"
        rows={2}
        maxLength={200}
        placeholder="Detalle interno o para mostrar al cliente"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Disponible para reservar</p>
          <p className="text-xs text-stone-500">Si lo desactivás, no se ofrece en WhatsApp</p>
        </div>
        <Toggle checked={isActive} onChange={setIsActive} label="Disponible para reservar" />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
          Así se ve en WhatsApp
        </p>
        <div className="rounded-xl bg-[#efeae2] p-3">
          <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-[15px] text-stone-900">{previewName}</p>
              <p className="truncate text-[13px] text-stone-500">{previewDetail}</p>
            </div>
            <span className="ml-3 size-5 shrink-0 rounded-full border-2 border-emerald-600" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {initial ? "Guardar cambios" : "Crear servicio"}
        </Button>
      </div>
    </form>
  );
}
