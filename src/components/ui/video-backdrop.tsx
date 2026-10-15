"use client";

import { useEffect, useRef, useState } from "react";

import type { BackdropClip } from "@/lib/backdrop-clips";
import { cn } from "@/lib/utils";

interface VideoBackdropProps {
  clip: BackdropClip;
  className?: string;
}

/**
 * Muted, looping gameplay clip behind a full-width row at 50% opacity.
 * Parent must be `relative isolate overflow-hidden` (TintedSection does this
 * when given a `backdrop`). The video only loads once the row is near the
 * viewport, pauses off-screen, and is skipped entirely for reduced-motion or
 * Save-Data users, who see the poster.
 */
export function VideoBackdrop({ clip, className }: VideoBackdropProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [allowMotion, setAllowMotion] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
      true;
    const update = () => setAllowMotion(!mq.matches && !saveData);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setOnScreen(entry.isIntersecting);
        if (entry.isIntersecting) setNearViewport(true);
      },
      { rootMargin: "200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const showVideo = allowMotion && nearViewport && clip.sources.length > 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React doesn't reliably reflect `muted` as an attribute; autoplay needs it.
    video.muted = true;
    if (onScreen) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [onScreen, showVideo]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-50"
        style={{ backgroundImage: `url(${clip.poster})` }}
      >
        {showVideo && (
          <video
            ref={videoRef}
            className="h-full w-full object-cover transition-opacity duration-700"
            style={{ opacity: ready ? 1 : 0 }}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            poster={clip.poster}
            onCanPlay={() => setReady(true)}
          >
            {clip.sources.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
          </video>
        )}
      </div>
      {/* Fade into the page at the top and bottom so rows blend into each other. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--bg) 0%, transparent 22%, transparent 78%, var(--bg) 100%)",
        }}
      />
    </div>
  );
}
