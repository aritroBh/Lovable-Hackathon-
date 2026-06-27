import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../src/api";

const STORAGE_KEY = "specter-tavus-replica";

type PanelPhase = "idle" | "uploading" | "training" | "ready" | "live";

interface StoredReplica {
  replica_id: string | null;
  status: string;
  ready: boolean;
  uploadUrl?: string;
  previewDataUrl?: string;
}

interface TavusPalPanelProps {
  visible: boolean;
  onLiveChange?: (live: boolean) => void;
}

function loadStored(): StoredReplica | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredReplica) : null;
  } catch {
    return null;
  }
}

function saveStored(data: StoredReplica) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function phaseFromStored(stored: StoredReplica | null): PanelPhase {
  if (!stored?.replica_id) return "idle";
  if (stored.ready) return "ready";
  return "training";
}

export const TavusPalPanel: React.FC<TavusPalPanelProps> = ({
  visible,
  onLiveChange,
}) => {
  const [phase, setPhase] = useState<PanelPhase>(() => phaseFromStored(loadStored()));
  const [stored, setStored] = useState<StoredReplica | null>(() => loadStored());
  const [conversationUrl, setConversationUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingStock, setUsingStock] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncStored = useCallback((next: StoredReplica) => {
    setStored(next);
    saveStored(next);
    setPhase(next.ready ? "ready" : next.replica_id ? "training" : "idle");
  }, []);

  const pollStatus = useCallback(async () => {
    const result = await api.tavusGetReplicaStatus();
    if (!result.ok) return;
    const next: StoredReplica = {
      replica_id: result.replica_id ?? stored?.replica_id ?? null,
      status: result.status || "training",
      ready: result.ready === true,
      uploadUrl: result.uploadUrl || stored?.uploadUrl,
      previewDataUrl: stored?.previewDataUrl,
    };
    syncStored(next);
  }, [stored?.previewDataUrl, stored?.replica_id, stored?.uploadUrl, syncStored]);

  useEffect(() => {
    if (phase !== "training") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    void pollStatus();
    pollRef.current = setInterval(() => void pollStatus(), 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, pollStatus]);

  useEffect(() => {
    onLiveChange?.(phase === "live");
  }, [phase, onLiveChange]);

  const handleUpload = async (file: File) => {
    setError(null);
    setPhase("uploading");
    const previewDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

    const base64 = previewDataUrl.split(",")[1] || "";
    const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";

    const upload = await api.tavusUploadPhoto(base64, mimeType);
    if (!upload.ok || !upload.uploadUrl) {
      setError(upload.error || "Upload failed");
      setPhase(phaseFromStored(stored));
      return;
    }

    const replica = await api.tavusCreateReplica(upload.uploadUrl);
    if (!replica.ok || !replica.replica_id) {
      setError(replica.error || "Replica training failed to start");
      setPhase(phaseFromStored(stored));
      return;
    }

    syncStored({
      replica_id: replica.replica_id,
      status: replica.status || "training",
      ready: replica.ready === true,
      uploadUrl: upload.uploadUrl,
      previewDataUrl,
    });
  };

  const startTalk = async () => {
    setError(null);
    setPhase("uploading");
    let memoryContext = "";
    try {
      const mem = await api.ghostwikiQuery("summarize current session skills", undefined);
      if (typeof mem?.answer === "string") memoryContext = mem.answer;
      else if (typeof mem?.context === "string") memoryContext = mem.context;
    } catch {
      /* ponytail: PAL works without memory */
    }

    const result = await api.tavusStartConversation({
      memoryContext,
      replicaId: stored?.replica_id,
      replicaReady: stored?.ready === true,
    });

    if (!result.ok || !result.conversation_url) {
      setError(result.error || "Could not start Tavus conversation");
      setPhase(stored?.ready ? "ready" : stored?.replica_id ? "training" : "idle");
      return;
    }

    setUsingStock(!result.using_custom_replica);
    setConversationUrl(result.conversation_url);
    setPhase("live");
  };

  const endTalk = () => {
    setConversationUrl(null);
    setPhase(stored?.ready ? "ready" : stored?.replica_id ? "training" : "idle");
  };

  if (!visible) return null;

  return (
    <div className="tavus-pal-panel" data-phase={phase}>
      <div className="tavus-pal-panel__header">
        <span className="tavus-pal-panel__title">Specter Face</span>
        {phase === "live" && (
          <button type="button" className="tavus-pal-panel__end" onClick={endTalk}>
            End
          </button>
        )}
      </div>

      {phase === "live" && conversationUrl ? (
        <div className="tavus-pal-panel__video">
          <iframe
            src={conversationUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            title="Specter PAL"
          />
        </div>
      ) : (
        <div className="tavus-pal-panel__body">
          {stored?.previewDataUrl && (
            <img
              className="tavus-pal-panel__preview"
              src={stored.previewDataUrl}
              alt="Your uploaded face"
            />
          )}

          {phase === "training" && (
            <p className="tavus-pal-panel__badge">
              Your face is training (~3h). Using Specter PAL meanwhile.
            </p>
          )}
          {phase === "ready" && (
            <p className="tavus-pal-panel__badge tavus-pal-panel__badge--ready">
              Your replica is ready.
            </p>
          )}
          {usingStock && phase !== "live" && stored?.replica_id && !stored.ready && (
            <p className="tavus-pal-panel__hint">Stock PAL face until training completes.</p>
          )}

          {error && <p className="tavus-pal-panel__error">{error}</p>}

          <div className="tavus-pal-panel__actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="tavus-pal-panel__btn"
              disabled={phase === "uploading"}
              onClick={() => fileRef.current?.click()}
            >
              {stored?.replica_id ? "Replace photo" : "Upload photo"}
            </button>
            <button
              type="button"
              className="tavus-pal-panel__btn tavus-pal-panel__btn--primary"
              disabled={phase === "uploading"}
              onClick={() => void startTalk()}
            >
              {phase === "uploading" ? "Starting…" : "Talk"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
