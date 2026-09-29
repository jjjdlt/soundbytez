/**
 * A signed-in user's saved tracks: rows in `public.tracks`, stem files in the
 * private `stems` bucket. RLS scopes every query here to the current user.
 * The backend writes rows/files; the browser only reads and deletes.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

const BUCKET = "stems";
const URL_TTL_SECONDS = 60 * 60;

/** Live list of the user's tracks. Polls while anything is still processing. */
export function useTracks(userId) {
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
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
