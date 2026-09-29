import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createJob } from "./api";
import { useAuth } from "./auth";
import { addEntry } from "./library";

/** Upload a file for stem separation, record it in the user's library, and jump to its track page. */
export function useUpload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    setError(null);
    setUploading(true);
    try {
      const jobId = await createJob("stem_separation", file);
      if (user) addEntry(user.id, { jobId, type: "stem_separation", name: file.name, size: file.size });
      navigate(`/track/${jobId}`, { state: { name: file.name } });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error, clearError: () => setError(null) };
}
