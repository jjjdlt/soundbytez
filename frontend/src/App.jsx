import { useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Login, Track, GuestJob, MidiGrabber, LyricCast } from "./screens";
import { AuthProvider, useAuth } from "./auth";
import { TracksProvider, useTracks } from "./tracks";
import { useUpload } from "./upload";
import "./App.css";

function Header() {
  const { user, signOut } = useAuth();
  const { upload, uploading, error, clearError } = useUpload();
  const { storage } = useTracks();
  const navigate = useNavigate();
  const inputRef = useRef();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const stemPage = pathname.match(/^\/(?:track|job)\/[^/]+/)?.[0];
  const onLyrics = !!stemPage && pathname.endsWith("/lyrics");

  return (
    <header className="topbar">
      <Link to="/" className="topbar-box brand">soundbytez</Link>

      <div className="topbar-center">
        {user && (
          <>
            <button
              className="topbar-box upload-btn"
              disabled={uploading || storage.full}
              title={storage.full ? "Storage full — delete a track to upload more" : undefined}
              onClick={() => inputRef.current.click()}
            >
              {uploading ? "uploading…" : storage.full ? "storage full" : "+ upload"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
          </>
        )}
        {/* On a track: flip between its stems and its lyrics. Elsewhere: the drop-a-song Lyric Cast page. */}
        <Link className="topbar-box" to={stemPage ? (onLyrics ? stemPage : `${stemPage}/lyrics`) : "/lyrics"}>
          {onLyrics ? "stems" : "lyrics"}
        </Link>
      </div>

      <div className="topbar-right">
        {user ? (
          <div className="user-menu">
            <button className="topbar-box" onClick={() => setMenuOpen((o) => !o)}>
              {user.email.split("@")[0]}
            </button>
            {menuOpen && (
              <div className="user-dropdown" onMouseLeave={() => setMenuOpen(false)}>
                <span className="muted">{user.email}</span>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                    navigate("/");
                  }}
                >
                  log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="topbar-box">Login</Link>
        )}
      </div>

      {error && (
        <div className="upload-toast error-box" onClick={clearError} title="dismiss">
          upload failed: {error}
        </div>
      )}
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TracksProvider>
        <BrowserRouter>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            {/* :view is "lyrics" or absent; one route, so the player keeps playing across the switch */}
            <Route path="/track/:trackId/:view?" element={<Track />} />
            <Route path="/job/:jobId/:view?" element={<GuestJob />} />
            <Route path="/midi" element={<MidiGrabber />} />
            <Route path="/lyrics" element={<LyricCast />} />
          </Routes>
        </BrowserRouter>
      </TracksProvider>
    </AuthProvider>
  );
}
