/**
 * MOCK per-user upload library — localStorage only. Stand-in for a Supabase
 * `uploads` table (user_id, job_id, type, name, size, stems, created_at).
 *
 * Note: the backend keeps jobs in memory, so entries here can outlive their
 * job after a backend restart. Real persistence arrives with Supabase Storage.
 */
import { useCallback, useEffect, useState } from "react";

const key = (userId) => `sbz.mock.library.${userId}`;
const EVENT = "sbz-library-change";

export function getLibrary(userId) {
  try {
    return JSON.parse(localStorage.getItem(key(userId))) ?? [];
  } catch {
    return [];
  }
}

function save(userId, entries) {
  localStorage.setItem(key(userId), JSON.stringify(entries));
  window.dispatchEvent(new Event(EVENT));
}

/** entry: { jobId, type, name, size } */
export function addEntry(userId, entry) {
  save(userId, [{ ...entry, stems: null, createdAt: Date.now() }, ...getLibrary(userId)]);
}

export function updateEntry(userId, jobId, fields) {
  save(userId, getLibrary(userId).map((e) => (e.jobId === jobId ? { ...e, ...fields } : e)));
}

export function removeEntry(userId, jobId) {
  save(userId, getLibrary(userId).filter((e) => e.jobId !== jobId));
}

/** Live view of a user's library; re-reads whenever any helper above writes. */
export function useLibrary(userId) {
  const load = useCallback(() => (userId ? getLibrary(userId) : []), [userId]);
  const [entries, setEntries] = useState(load);

  useEffect(() => {
    setEntries(load());
    const onChange = () => setEntries(load());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [load]);

  return entries;
}
