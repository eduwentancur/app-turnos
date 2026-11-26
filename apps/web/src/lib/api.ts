/** URL base de la API (solo servidor). */
export const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type HealthStatus = {
  status: string;
  database: string;
  latencyMs: number;
  timestamp: string;
};

export async function getHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as HealthStatus) : null;
  } catch {
    return null;
  }
}
