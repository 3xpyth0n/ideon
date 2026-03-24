"use client";

import { useCallback, useRef } from "react";

/**
 * Touch and pointer gesture handler using the Pointer Events API.
 *
 * Why Pointer Events?
 * - Unified API for touch, pen, and mouse input (one handler for all).
 * - ReactFlow v12 calls preventDefault() on its pointerdown handler, which
 *   per the Pointer Events spec suppresses the corresponding legacy
 *   touchstart event. Using Pointer Events ourselves means our handlers
 *   fire on the same event channel that ReactFlow uses, so they are never
 *   suppressed.
 *
 * Fallback: if the browser does not support PointerEvent, we fall back to
 * legacy Touch Events so the hook still works.
 */

export interface UseTouchGesturesProps {
  onLongPress: (
    e: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent,
    clientX: number,
    clientY: number,
  ) => void;
  onDoubleTap?: (
    e: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent,
    x: number,
    y: number,
  ) => void;
  /** @deprecated Pinch-to-zoom is now handled natively by ReactFlow. */
  onPinch?: (delta: number, centerX: number, centerY: number) => void;
  longPressDelay?: number;
  doubleTapDelay?: number;
  moveThreshold?: number;
  stopPropagation?: boolean;
  allowLongPress?: boolean;
}

const HAS_POINTER_EVENTS =
  typeof window !== "undefined" && "PointerEvent" in window;

export const useTouchGestures = ({
  onLongPress,
  onDoubleTap,
  longPressDelay = 500,
  doubleTapDelay = 400,
  moveThreshold = 25,
  stopPropagation = false,
  allowLongPress = true,
}: UseTouchGesturesProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const isClickRef = useRef(true);
  const activePointerIdRef = useRef<number | null>(null);

  // ── Pointer Events path (modern browsers) ──────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (stopPropagation) {
        e.stopPropagation();
      }

      // Only track the primary pointer for single-finger gestures.
      if (
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      activePointerIdRef.current = e.pointerId;
      const { clientX, clientY } = e;
      const now = Date.now();

      if (onDoubleTap && lastTapRef.current) {
        const timeDiff = now - lastTapRef.current.time;
        const dist = Math.sqrt(
          Math.pow(clientX - lastTapRef.current.x, 2) +
            Math.pow(clientY - lastTapRef.current.y, 2),
        );

        if (timeDiff < doubleTapDelay && dist < moveThreshold * 2) {
          onDoubleTap(e, clientX, clientY);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          lastTapRef.current = null;
          return;
        }
      }

      lastTapRef.current = { time: now, x: clientX, y: clientY };
      startPosRef.current = { x: clientX, y: clientY };
      isClickRef.current = true;

      if (!allowLongPress) return;

      timerRef.current = setTimeout(() => {
        if (window.getSelection) {
          window.getSelection()?.removeAllRanges();
        }
        onLongPress(e, clientX, clientY);
        timerRef.current = null;
      }, longPressDelay);
    },
    [
      onLongPress,
      longPressDelay,
      stopPropagation,
      allowLongPress,
      onDoubleTap,
      doubleTapDelay,
      moveThreshold,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      if (!timerRef.current) return;

      const startPos = startPosRef.current;
      if (!startPos) return;

      const dist = Math.sqrt(
        Math.pow(e.clientX - startPos.x, 2) +
          Math.pow(e.clientY - startPos.y, 2),
      );

      if (dist > moveThreshold) {
        isClickRef.current = false;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    [moveThreshold],
  );

  const resetState = useCallback(() => {
    activePointerIdRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isClickRef.current) {
      lastTapRef.current = null;
    }
    startPosRef.current = null;
    isClickRef.current = true;
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      resetState();
    },
    [resetState],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      resetState();
    },
    [resetState],
  );

  // ── Legacy Touch Events fallback ───────────────────────────────────

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (stopPropagation) {
        e.stopPropagation();
      }

      if (e.touches.length === 2) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const { clientX, clientY } = touch;
      const now = Date.now();

      if (onDoubleTap && lastTapRef.current) {
        const timeDiff = now - lastTapRef.current.time;
        const dist = Math.sqrt(
          Math.pow(clientX - lastTapRef.current.x, 2) +
            Math.pow(clientY - lastTapRef.current.y, 2),
        );

        if (timeDiff < doubleTapDelay && dist < moveThreshold * 2) {
          onDoubleTap(e, clientX, clientY);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          lastTapRef.current = null;
          return;
        }
      }

      lastTapRef.current = { time: now, x: clientX, y: clientY };
      startPosRef.current = { x: clientX, y: clientY };
      isClickRef.current = true;

      if (!allowLongPress) return;

      timerRef.current = setTimeout(() => {
        if (window.getSelection) {
          window.getSelection()?.removeAllRanges();
        }
        onLongPress(e, clientX, clientY);
        timerRef.current = null;
      }, longPressDelay);
    },
    [
      onLongPress,
      longPressDelay,
      stopPropagation,
      allowLongPress,
      onDoubleTap,
      doubleTapDelay,
      moveThreshold,
    ],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (!timerRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const startPos = startPosRef.current;
      if (!startPos) return;

      const dist = Math.sqrt(
        Math.pow(touch.clientX - startPos.x, 2) +
          Math.pow(touch.clientY - startPos.y, 2),
      );

      if (dist > moveThreshold) {
        isClickRef.current = false;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    [moveThreshold],
  );

  const handleTouchEnd = useCallback(() => {
    activePointerIdRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isClickRef.current) {
      lastTapRef.current = null;
    }
    startPosRef.current = null;
    isClickRef.current = true;
  }, []);

  // ── Return the appropriate handlers ────────────────────────────────

  if (HAS_POINTER_EVENTS) {
    return {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    };
  }

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };
};
