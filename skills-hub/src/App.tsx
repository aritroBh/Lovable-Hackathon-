import { Link, Route, Routes } from "react-router-dom";
import { JourneyProvider } from "./JourneyContext";
import Browse from "./pages/Browse";
import SkillDetail from "./pages/SkillDetail";

function GhostIcon() {
  return (
    <svg className="ghost-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2C7.6 2 4 5.6 4 10v9.5c0 .5.6.8 1 .5l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.4.3 1 0 1-.5V10c0-4.4-3.6-8-8-8z" />
    </svg>
  );
}

export default function App() {
  return (
    <JourneyProvider>
    <div className="layout">
      <header>
        <GhostIcon />
        <div>
          <h1>
            <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>
              Specter Mon — Skills Hub
            </Link>
          </h1>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Browse />} />
        <Route path="/skill/:id" element={<SkillDetail />} />
      </Routes>
      <footer>
        Battle to learn · Catch to publish · PAL trains your party. Synced via
        /api/journey.
      </footer>
    </div>
    </JourneyProvider>
  );
}
