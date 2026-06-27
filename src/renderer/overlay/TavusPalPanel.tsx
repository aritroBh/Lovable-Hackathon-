import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../src/api";
import type { PerimeterRoamResult } from "./usePerimeterRoam";

export const TAVUS_PERSONA_SIZE = 96;
export const TAVUS_PERSONA_LIVE_SIZE = 148;

// #region agent log
const dbg = (location: string, message: string, data: Record<string, unknown>, hypothesisId: string) => {
  const payload = {
    sessionId: "389870",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: "post-fix",
  };
  void api.debugAgentLog?.(payload);
  fetch("http://127.0.0.1:7771/ingest/f986ff11-c671-47ba-bf50-4c5b755ea15c", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "389870" },
    body: JSON.stringify(payload),
  }).catch(() => {});
};
// #endregion

type PanelPhase = "idle" | "starting" | "live";

function conversationIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const id = new URL(url).pathname.replace(/^\//, "");
    return id || null;
  } catch {
    return null;
  }
}

interface TavusPalPanelProps {
  visible: boolean;
  onLiveChange?: (live: boolean) => void;
  roam?: PerimeterRoamResult;
}

export const TavusPalPanel: React.FC<TavusPalPanelProps> = ({
  visible,
  onLiveChange,
  roam,
}) => {
  const [phase, setPhase] = useState<PanelPhase>("idle");
  const [conversationUrl, setConversationUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personaVideoUrl, setPersonaVideoUrl] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    // #region agent log
    const onCsp = (e: SecurityPolicyViolationEvent) => {
      dbg("TavusPalPanel.tsx:csp", "CSP violation", {
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        effectiveDirective: e.effectiveDirective,
      }, "A");
    };
    document.addEventListener("securitypolicyviolation", onCsp);
    dbg("TavusPalPanel.tsx:mount", "persona mounted", { visible }, "E");
    return () => document.removeEventListener("securitypolicyviolation", onCsp);
    // #endregion
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void api.tavusGetPersonaPreview().then((result) => {
      // #region agent log
      dbg("TavusPalPanel.tsx:preview", "persona preview response", {
        ok: result?.ok,
        hasVideo: Boolean(result?.thumbnail_video_url),
        faceName: result?.face_name ?? null,
        error: result?.error ?? null,
      }, "B");
      // #endregion
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
    onLiveChange?.(phase === "live");
    return () => onLiveChange?.(false);
  }, [phase, onLiveChange]);

  const startTalk = async () => {
    if (phase !== "idle") return;
    setError(null);
    setPhase("starting");
    let memoryContext = "";
    try {
      const mem = await api.ghostwikiQuery("summarize current session skills", undefined);
      if (typeof mem?.answer === "string") memoryContext = mem.answer;
      else if (typeof mem?.context === "string") memoryContext = mem.context;
    } catch {
      /* ponytail: PAL works without memory */
    }

    const result = await api.tavusStartConversation({ memoryContext });

    // #region agent log
    dbg("TavusPalPanel.tsx:startTalk", "conversation start result", {
      ok: result?.ok,
      hasUrl: Boolean(result?.conversation_url),
      urlHost: result?.conversation_url ? new URL(result.conversation_url).host : null,
      error: result?.error ?? null,
    }, "D");
    // #endregion

    if (!result.ok || !result.conversation_url) {
      setError(result.error || "Could not start Tavus conversation");
      setPhase("idle");
      return;
    }

    const id =
      typeof result.conversation_id === "string"
        ? result.conversation_id
        : conversationIdFromUrl(result.conversation_url);
    conversationIdRef.current = id;
    setConversationUrl(result.conversation_url);
    setPhase("live");
  };

  const endTalk = useCallback(() => {
    const id =
      conversationIdRef.current ?? conversationIdFromUrl(conversationUrl);
    if (id) {
      void api.tavusEndConversation?.(id).then((result) => {
        // #region agent log
        dbg("TavusPalPanel.tsx:endTalk", "conversation end result", {
          ok: result?.ok,
          conversationId: id,
          error: result?.error ?? null,
        }, "G");
        // #endregion
      });
    }
    conversationIdRef.current = null;
    setConversationUrl(null);
    setPhase("idle");
  }, [conversationUrl]);

  useEffect(() => {
    if (!visible && phase === "live") endTalk();
  }, [visible, phase, endTalk]);

  useEffect(() => {
    return () => {
      const id =
        conversationIdRef.current ?? conversationIdFromUrl(conversationUrl);
      if (phase === "live" && id) void api.tavusEndConversation?.(id);
    };
  }, [phase, conversationUrl]);

  if (!visible) return null;

  const bobbing = roam?.isMoving && phase !== "live";
  const isLive = phase === "live" && Boolean(conversationUrl);
  const label =
    phase === "starting"
      ? "Starting PAL…"
      : isLive
        ? "End conversation"
        : personaName
          ? `Talk to ${personaName}`
          : "Talk to Specter PAL";

  return (
    <div
      className={`tavus-persona ${isLive ? "tavus-persona--live" : ""}`}
      data-phase={phase}
    >
      <button
        type="button"
        className={`tavus-persona__circle ${bobbing ? "is-bobbing" : ""} ${phase === "starting" ? "is-starting" : ""}`}
        onClick={() => {
          if (phase === "idle") void startTalk();
          else if (isLive) endTalk();
        }}
        disabled={phase === "starting"}
        aria-label={label}
        title={label}
      >
        {isLive && conversationUrl ? (
          <iframe
            src={conversationUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            title="Specter PAL"
            className="tavus-persona__iframe"
            onLoad={() => {
              // #region agent log
              dbg("TavusPalPanel.tsx:iframe", "conversation iframe loaded", {
                urlHost: new URL(conversationUrl).host,
              }, "A");
              // #endregion
            }}
          />
        ) : personaVideoUrl ? (
          <video
            ref={videoRef}
            className="tavus-persona__video"
            src={personaVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            onLoadedData={() => {
              // #region agent log
              dbg("TavusPalPanel.tsx:video", "persona video loaded", {
                src: personaVideoUrl.slice(0, 80),
                readyState: videoRef.current?.readyState ?? null,
              }, "C");
              // #endregion
            }}
            onError={() => {
              // #region agent log
              dbg("TavusPalPanel.tsx:video", "persona video error", {
                src: personaVideoUrl.slice(0, 80),
                networkState: videoRef.current?.networkState ?? null,
                errorCode: videoRef.current?.error?.code ?? null,
              }, "A");
              // #endregion
            }}
          />
        ) : (
          <div className="tavus-persona__loading" aria-hidden="true" />
        )}
        {phase === "starting" && (
          <span className="tavus-persona__starting" aria-hidden="true" />
        )}
      </button>
      {error && <p className="tavus-persona__error">{error}</p>}
    </div>
  );
};
