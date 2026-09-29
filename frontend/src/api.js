const API = "http://localhost:8000";

/** fetch() only rejects when the server can't be reached at all — say so plainly. */
async function apiFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(`Can't reach the soundbytez server at ${API} — is the backend running?`);
  }
}

export async function createJob(jobType, file, extraFields = {}) {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const res = await apiFetch(`${API}/api/jobs/${jobType}`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed (${res.status})`);
  }
  return (await res.json()).job_id;
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
