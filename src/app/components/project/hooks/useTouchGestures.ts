"use client";

import { useCallback, useRef } from "react";
import { RippleHandle } from "../../ui/TouchRipple";

interface UseTouchGesturesProps {
  rippleRef?: React.RefObject<RippleHandle | null>;
  onLongPress: (e: React.TouchEvent | TouchEvent, x: number, y: number) => void;
  longPressDelay?: number;
  moveThreshold?: number;
  stopPropagation?: boolean;
}

export const useTouchGestures = ({
  rippleRef,
  onLongPress,
  longPressDelay = 500,
  moveThreshold = 10,
  stopPropagation = false,
}: UseTouchGesturesProps) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rippleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const activeRippleIdRef = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (stopPropagation) {
        e.stopPropagation();
      }
      const touch = "touches" in e ? e.touches[0] : null;
      if (!touch) return;

      const { clientX, clientY } = touch;
      startPosRef.current = { x: clientX, y: clientY };

      // Start ripple timer (appears after a short delay to avoid single click ripples)
      rippleTimerRef.current = setTimeout(() => {
        if (rippleRef?.current) {
          activeRippleIdRef.current = rippleRef.current.addRipple(
            clientX,
            clientY,
          );
        }
      }, 150); // Show ripple after 150ms of holding

      // Start long press timer
      timerRef.current = setTimeout(() => {
        onLongPress(e, clientX, clientY);
        timerRef.current = null;
      }, longPressDelay);
    },
    [onLongPress, longPressDelay, rippleRef, stopPropagation],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (!timerRef.current && !activeRippleIdRef.current) return;

      const touch = "touches" in e ? e.touches[0] : null;
      if (!touch) return;

      const startPos = startPosRef.current;
      if (!startPos) return;

      const dist = Math.sqrt(
        Math.pow(touch.clientX - startPos.x, 2) +
          Math.pow(touch.clientY - startPos.y, 2),
      );

      if (dist > moveThreshold) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (rippleTimerRef.current) {
          clearTimeout(rippleTimerRef.current);
          rippleTimerRef.current = null;
        }
        if (activeRippleIdRef.current !== null && rippleRef?.current) {
          rippleRef.current.removeRipple(activeRippleIdRef.current);
          activeRippleIdRef.current = null;
        }
      }
    },
    [moveThreshold, rippleRef],
  );

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rippleTimerRef.current) {
      clearTimeout(rippleTimerRef.current);
      rippleTimerRef.current = null;
    }
    if (activeRippleIdRef.current !== null && rippleRef?.current) {
      rippleRef.current.removeRipple(activeRippleIdRef.current);
      activeRippleIdRef.current = null;
    }
    startPosRef.current = null;
  }, [rippleRef]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };
};
