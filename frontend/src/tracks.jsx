/**
 * A signed-in user's saved tracks: rows in `public.tracks`, stem files in the
 * private `stems` bucket. RLS scopes every query here to the current user.
 * The backend writes rows/files; the browser only reads and deletes.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getLimits } from "./api";
import { useAuth } from "./auth";
import { supabase } from "./supabase";

const BUCKET = "stems";
const URL_TTL_SECONDS = 60 * 60;

const TracksContext = createContext(null);

/**
 * Shares the signed-in user's tracks and storage usage app-wide, so the header's
 * upload button and the dashboard agree on whether the user is out of space.
 */
export function TracksProvider({ children }) {
  const { user } = useAuth();
  const { tracks, error, refresh } = useTrackList(user?.id);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    getLimits()
      .then((l) => setQuota(l.user_quota_bytes))
      .catch(() => setQuota(null)); // backend down: show usage without a limit
  }, []);

  // Processing tracks already hold their estimated size (reserved by the backend).
  const used = tracks.reduce((sum, t) => sum + (t.size_bytes ?? 0), 0);
  const storage = { used, quota, full: quota != null && used >= quota };

  return (
    <TracksContext.Provider value={{ tracks, error, refresh, storage }}>{children}</TracksContext.Provider>
  );
}

export const useTracks = () => useContext(TracksContext);

/** Live list of the user's tracks. Polls while anything is still processing. */
function useTrackList(userId) {
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setTracks([]);
      return;
    }
    const { data, error } = await supabase.from("tracks").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    else {
      setError(null);
      setTracks(data);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const processing = tracks.some((t) => t.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [processing, refresh]);

  return { tracks, error, refresh };
}

export async function getTrack(trackId) {
  const { data, error } = await supabase.from("tracks").select("*").eq("id", trackId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Track not found");
  return data;
}

/** Signed URLs for playback and for "save as" downloads, one pair per stem. */
export async function stemUrls(track) {
  const paths = track.stems.map((s) => s.path);
  const bucket = supabase.storage.from(BUCKET);
  const [play, download] = await Promise.all([
    bucket.createSignedUrls(paths, URL_TTL_SECONDS),
    bucket.createSignedUrls(paths, URL_TTL_SECONDS, { download: true }),
  ]);
  if (play.error) throw play.error;
  if (download.error) throw download.error;
  return track.stems.map((s, i) => ({
    name: s.name,
    url: play.data[i].signedUrl,
    downloadUrl: download.data[i].signedUrl,
  }));
}

export async function deleteTrack(track) {
  const paths = track.stems.map((s) => s.path);
  if (paths.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }
  const { error } = await supabase.from("tracks").delete().eq("id", track.id);
  if (error) throw error;
}
