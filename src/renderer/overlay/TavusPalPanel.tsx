import React, { useEffect, useRef, useState } from "react";
import { api } from "../src/api";
import type { PerimeterRoamResult } from "./usePerimeterRoam";

export const TAVUS_PERSONA_SIZE = 96;
export const TAVUS_PERSONA_LIVE_SIZE = 148;

interface TavusPalPanelProps {
  visible: boolean;
  /** True while TTS is playing — lip-sync video loops only then. */
  isSpeaking?: boolean;
  /** True while waiting for Claude — subtle idle pulse, no lip sync. */
  isThinking?: boolean;
  roam?: PerimeterRoamResult;
}

export const TavusPalPanel: React.FC<TavusPalPanelProps> = ({
  visible,
  isSpeaking = false,
  isThinking = false,
  roam,
}) => {
  const [personaVideoUrl, setPersonaVideoUrl] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void api.tavusGetPersonaPreview().then((result) => {
      if (cancelled || !result?.ok) return;
      if (typeof result.thumbnail_video_url === "string") {
        setPersonaVideoUrl(result.thumbnail_video_url);
      }
      if (typeof result.face_name === "string") {
        setPersonaName(result.face_name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !personaVideoUrl) return;
    if (isSpeaking) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
      if (previewReady) video.currentTime = 0;
    }
  }, [isSpeaking, personaVideoUrl, previewReady]);

  if (!visible) return null;

  const bobbing = Boolean(roam?.isMoving) && !isSpeaking && !isThinking;

  return (
    <div className="tavus-persona" data-speaking={isSpeaking ? "true" : "false"}>
      <div
        className={[
          "tavus-persona__circle",
          bobbing ? "is-bobbing" : "",
          isSpeaking ? "is-speaking" : "",
          isThinking ? "is-thinking" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
        title={personaName ? `${personaName} — use the mic to talk` : "Use the mic to talk"}
      >
        {personaVideoUrl ? (
          <video
            ref={videoRef}
            className="tavus-persona__video"
            src={personaVideoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => {
              const video = videoRef.current;
              if (!video) return;
              video.pause();
              video.currentTime = 0;
              setPreviewReady(true);
            }}
          />
        ) : (
          <div className="tavus-persona__loading" aria-hidden="true" />
        )}
      </div>
    </div>
  );
};
