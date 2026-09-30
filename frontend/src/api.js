const API = "http://localhost:8000";

/** fetch() only rejects when the server can't be reached at all — say so plainly. */
async function apiFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(`Can't reach the soundbytez server at ${API} — is the backend running?`);
  }
}

/**
 * Start a job. With an accessToken (signed-in user) the backend also saves the
 * result to their Supabase library and returns its track_id; otherwise track_id is null.
 */
export async function createJob(jobType, file, extraFields = {}, accessToken = null) {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  const res = await apiFetch(`${API}/api/jobs/${jobType}`, { method: "POST", body: form, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed (${res.status})`);
  }
  const { job_id, track_id = null } = await res.json();
  return { jobId: job_id, trackId: track_id };
}

/** Server-side limits, e.g. { user_quota_bytes }. */
export async function getLimits() {
  const res = await apiFetch(`${API}/api/limits`);
  if (!res.ok) throw new Error(`Limits lookup failed (${res.status})`);
  return res.json();
}

export async function getJob(jobId) {
  const res = await apiFetch(`${API}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Job lookup failed (${res.status})`);
  return res.json();
}

/** Poll until done/error. onUpdate fires on every tick. Returns the final job. */
export function pollJob(jobId, onUpdate, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId);
        onUpdate?.(job);
        if (job.status === "done") return resolve(job);
        if (job.status === "error") return reject(new Error(job.error || "Job failed"));
        setTimeout(tick, intervalMs);
      } catch (e) {
        reject(e);
      }
    };
    tick();
  });
}

export const fileUrl = (jobId, filename) => `${API}/api/jobs/${jobId}/files/${filename}`;
export const inputUrl = (jobId) => `${API}/api/jobs/${jobId}/input`;
