"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { AuthSession } from "@/lib/auth/types";
import { Alert, Button, Field } from "@/components/ui";

export default function AccountPage() {
  const { user, apiFetch, setSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirm) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) throw await parseApiError(res);
      setSession((await res.json()) as AuthSession);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
      <p className="mt-1 text-sm text-stone-500">
        {user?.name} · {user?.email}
      </p>

      <form
        onSubmit={onSubmit}
        noValidate
        className="mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h2 className="font-medium">Cambiar contraseña</h2>
        {error && <Alert>{error}</Alert>}
        {success && (
          <Alert tone="success">Contraseña actualizada. Se cerraron las demás sesiones.</Alert>
        )}
        <Field
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Field
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Field
          label="Repetir nueva contraseña"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" loading={submitting}>
          Guardar
        </Button>
      </form>
    </div>
  );
}
