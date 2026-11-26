"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/api-client";
import { Alert, Button, Field, FullScreenLoader } from "@/components/ui";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (status !== "unauthenticated") return <FullScreenLoader />;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-stone-900 text-xl text-white">
            ✂
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel de turnos</h1>
          <p className="mt-1 text-sm text-stone-500">Ingresá con tu cuenta de administrador</p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          {error && <Alert>{error}</Alert>}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" loading={submitting} className="w-full">
            Ingresar
          </Button>
        </form>
      </div>
    </main>
  );
}
