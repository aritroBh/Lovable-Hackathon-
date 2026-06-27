import ReactDOM from "react-dom/client";
import OverlayApp from "./OverlayApp";
import { SkillRecordingHud } from "../overlay/SkillRecordingHud";
import "./assets/overlay.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <>
    <OverlayApp />
    <SkillRecordingHud />
  </>,
);
