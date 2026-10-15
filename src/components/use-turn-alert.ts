"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Draft "your pick" alerts shared by the season draft and 10-man boards:
 * - the tab title flashes while it's your turn and the tab is in the
 *   background, so a captain in another tab notices;
 * - an optional chime plays when the turn passes to you (opt-in, remembered
 *   per browser — browsers only allow audio after a click, which the toggle
 *   itself provides).
 */

const SOUND_KEY = "sl.turnSound";
const SOUND_EVENT = "sl:turn-sound";

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeSound(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SOUND_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SOUND_EVENT, onChange);
  };
}

export function useTurnSoundPref(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSound, readSound, () => false);
  const set = (next: boolean) => {
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {
      // storage blocked — the toggle just won't persist
    }
    window.dispatchEvent(new Event(SOUND_EVENT));
    if (next) chime(); // confirms it works and unlocks audio with this click
  };
  return [on, set];
}

function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.3);
    }
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // audio unavailable
  }
}

export function useTurnAlert(isMyTurn: boolean, soundOn: boolean) {
  const wasMyTurn = useRef(isMyTurn);

  // Chime on the transition into your turn (not on page load mid-turn).
  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current && soundOn) chime();
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn, soundOn]);

  // Flash the tab title while it's your turn and the tab isn't visible.
  useEffect(() => {
    if (!isMyTurn) return;
    const original = document.title;
    const alertTitle = `● Your pick — ${original}`;
    let flip = false;
    const tick = () => {
      if (document.visibilityState === "visible") {
        document.title = alertTitle;
        return;
      }
      flip = !flip;
      document.title = flip ? alertTitle : original;
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      document.title = original;
    };
  }, [isMyTurn]);
}

export type LiveStatus = "connecting" | "live" | "reconnecting";

/**
 * Subscribe to an SSE snapshot stream. Returns the connection status so
 * boards can show "Live" vs "Reconnecting…" instead of silently going stale.
 */
export function useSnapshotStream<T>(url: string, onSnapshot: (data: T) => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  });

  useEffect(() => {
    const es = new EventSource(url);
    es.onopen = () => setStatus("live");
    es.addEventListener("update", (e) => {
      setStatus("live");
      try {
        const data = JSON.parse((e as MessageEvent).data) as T;
        if (data) onSnapshotRef.current(data);
      } catch {
        // ignore malformed frame
      }
    });
    // The browser reconnects on its own; just reflect it.
    es.onerror = () => setStatus("reconnecting");
    return () => es.close();
  }, [url]);

  return status;
}
