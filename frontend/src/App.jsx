import { useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { Home, Login, Track, MidiGrabber, LyricCast } from "./screens";
import { AuthProvider, useAuth } from "./auth";
import { useUpload } from "./upload";
import "./App.css";

function Header() {
  const { user, signOut } = useAuth();
  const { upload, uploading, error, clearError } = useUpload();
  const navigate = useNavigate();
  const inputRef = useRef();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <Link to="/" className="topbar-box brand">soundbytez</Link>

      {user && (
        <>
          <button className="topbar-box upload-btn" disabled={uploading} onClick={() => inputRef.current.click()}>
            {uploading ? "uploading…" : "+ upload"}
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
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/track/:jobId" element={<Track />} />
          <Route path="/midi" element={<MidiGrabber />} />
          <Route path="/lyrics" element={<LyricCast />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
