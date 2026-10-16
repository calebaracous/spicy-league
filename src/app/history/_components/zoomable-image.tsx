"use client";

import { useRef } from "react";

/**
 * History screenshots are dense spreadsheets — unreadable at phone width.
 * Tapping one opens it full-size in a native <dialog> (Escape / backdrop /
 * button close it; focus is handled by the browser), where it can be
 * scrolled and pinch-zoomed.
 */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="block w-full cursor-zoom-in overflow-x-auto rounded-lg border text-left"
        aria-label={`Enlarge: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-auto max-h-[600px] w-auto min-w-full object-contain"
        />
      </button>
      <dialog
        ref={dialogRef}
        aria-label={alt}
        className="m-auto max-h-[92vh] max-w-[96vw] overflow-auto rounded-lg border bg-[color:var(--bg)] p-0 backdrop:bg-black/80"
        onClick={(e) => {
          // Clicking the backdrop (the dialog element itself) closes it.
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b bg-[color:var(--bg)] px-4 py-2">
          <span className="text-muted-foreground text-sm">{alt}</span>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full border px-3 py-1 text-sm"
          >
            Close
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block h-auto max-w-none" />
      </dialog>
    </>
  );
}
