import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Home, StemSplitter, MidiGrabber, LyricCast } from "./screens";
import "./App.css";

function Nav() {
  const { pathname } = useLocation();
  if (pathname === "/") return null;
  return (
    <header className="topnav">
      <Link to="/" className="brand">soundbytez</Link>
      <Link to="/stems">stems</Link>
      <Link to="/midi">midi</Link>
      <Link to="/lyrics">lyrics</Link>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stems" element={<StemSplitter />} />
        <Route path="/midi" element={<MidiGrabber />} />
        <Route path="/lyrics" element={<LyricCast />} />
      </Routes>
    </BrowserRouter>
  );
}
