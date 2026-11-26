// Client HTTP minimal vers l'API backend. Lit le token + l'entreprise active
// dans le localStorage (écrits par AuthContext) pour les en-têtes.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const STORAGE_KEY = 'devis-ai-auth';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { token, activeCompanyId } = JSON.parse(raw);
      if (token) headers.Authorization = `Bearer ${token}`;
      if (activeCompanyId) headers['X-Company-Id'] = String(activeCompanyId);
    }
  } catch {
    /* storage illisible : requête anonyme */
  }
  return headers;
}

// Normalise le champ `detail` d'une erreur FastAPI en message lisible.
// Il peut être une chaîne (HTTPException) ou un tableau d'objets de validation
// (422 pydantic : [{ loc, msg, … }]). Sans ce filtrage, `new Error(detail)`
// afficherait « [object Object] » côté UI.
export function extractDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg: unknown }).msg) : ''))
      .filter(Boolean);
    if (msgs.length) return msgs.join(' ');
  } else if (detail && typeof detail === 'object' && 'msg' in detail) {
    return String((detail as { msg: unknown }).msg);
  }
  return undefined;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = extractDetail((await res.json()).detail);
    } catch {
      /* corps non-JSON */
    }
    throw new Error(detail ?? `Erreur ${res.status}`);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

// Envoi de fichier (multipart) : on laisse le navigateur poser le Content-Type
// avec sa boundary — surtout ne pas le forcer à application/json.
async function upload<T>(path: string, file: File, fieldName = 'file'): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* corps non-JSON */
    }
    throw new Error(detail ?? `Erreur ${res.status}`);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T = null>(path: string) => request<T>('DELETE', path),
  upload,
};
