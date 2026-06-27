import { Route, Routes } from "react-router-dom";
import { JourneyProvider } from "./JourneyContext";
import GameHub from "./game/GameHub";

export default function App() {
  return (
    <JourneyProvider>
      <Routes>
        <Route path="/" element={<GameHub />} />
        <Route path="/skill/:id" element={<GameHub />} />
      </Routes>
    </JourneyProvider>
  );
}
