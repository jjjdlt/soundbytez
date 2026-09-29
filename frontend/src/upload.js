import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createJob } from "./api";
import { useAuth } from "./auth";

/**
 * Upload a file for stem separation and jump to its page: the saved track for
 * signed-in users, or the temporary job page for guests.
 */
export function useUpload() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    setError(null);
    setUploading(true);
    try {
      const { jobId, trackId } = await createJob("stem_separation", file, {}, accessToken);
      navigate(trackId ? `/track/${trackId}` : `/job/${jobId}`, { state: { name: file.name } });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error, clearError: () => setError(null) };
}
