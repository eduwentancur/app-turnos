/** Error normalizado de la API (mismo formato que AllExceptionsFilter del backend). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messages: string[],
  ) {
    super(messages.join(". "));
    this.name = "ApiError";
  }
}

type ErrorBody = { statusCode?: number; error?: string; message?: string | string[] };

export async function parseApiError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // respuesta sin JSON (ej. API caída detrás del proxy)
  }
  const raw = body.message ?? (res.status >= 500 ? "El servidor no está disponible" : res.statusText);
  const messages = (Array.isArray(raw) ? raw : [raw]).map((m) =>
    // "email: Email inválido" -> "Email inválido"
    m.replace(/^[\w.]+:\s/, ""),
  );
  return new ApiError(res.status, body.error ?? "Error", messages);
}

/** Mensaje amigable para mostrar en la UI ante cualquier error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "No se pudo conectar con el servidor. Revisá tu conexión.";
}
