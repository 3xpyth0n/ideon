"use client";

import { useCallback, useRef } from "react";
import { RippleHandle } from "@components/ui/TouchRipple";

interface UseTouchGesturesProps {
  rippleRef?: React.RefObject<RippleHandle | null>;
  onLongPress: (e: React.TouchEvent | TouchEvent, x: number, y: number) => void;
  onDoubleTap?: (
    e: React.TouchEvent | TouchEvent,
    x: number,
    y: number,
  ) => void;
  onPinch?: (delta: number, centerX: number, centerY: number) => void;
  longPressDelay?: number;
  doubleTapDelay?: number;
  moveThreshold?: number;
  stopPropagation?: boolean;
  allowLongPress?: boolean;
}

export const useTouchGestures = ({
  rippleRef,
  onLongPress,
  onDoubleTap,
  onPinch,
  longPressDelay = 500,
  doubleTapDelay = 400,
  moveThreshold = 25,
  stopPropagation = false,
  allowLongPress = true,
}: UseTouchGesturesProps) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rippleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const activeRippleIdRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const pinchStartDistRef = useRef<number | null>(null);
  const touchesRef = useRef<number>(0);
  const isClickRef = useRef<boolean>(true);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (stopPropagation) {
        e.stopPropagation();
      }

      touchesRef.current = e.touches.length;

      if (e.touches.length === 2 && onPinch) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        pinchStartDistRef.current = Math.sqrt(
          Math.pow(t2.clientX - t1.clientX, 2) +
            Math.pow(t2.clientY - t1.clientY, 2),
        );

        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (rippleTimerRef.current) {
          clearTimeout(rippleTimerRef.current);
          rippleTimerRef.current = null;
        }
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const { clientX, clientY } = touch;
      const now = Date.now();

      // Double tap detection
      if (onDoubleTap && lastTapRef.current) {
        const timeDiff = now - lastTapRef.current.time;
        const dist = Math.sqrt(
          Math.pow(clientX - lastTapRef.current.x, 2) +
            Math.pow(clientY - lastTapRef.current.y, 2),
        );

        if (timeDiff < doubleTapDelay && dist < moveThreshold * 2) {
          // It's a double tap
          onDoubleTap(e, clientX, clientY);

          // Cancel long press and ripple
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          if (rippleTimerRef.current) {
            clearTimeout(rippleTimerRef.current);
            rippleTimerRef.current = null;
          }
          lastTapRef.current = null;
          return;
        }
      }

      lastTapRef.current = { time: now, x: clientX, y: clientY };
      startPosRef.current = { x: clientX, y: clientY };
      isClickRef.current = true;

      if (!allowLongPress) return;

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
        // Clear selection to prevent text highlighting on long press
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
      rippleRef,
      stopPropagation,
      allowLongPress,
      onDoubleTap,
      doubleTapDelay,
      moveThreshold,
      onPinch,
    ],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (e.touches.length === 2 && onPinch && pinchStartDistRef.current) {
        if (e.cancelable) e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.sqrt(
          Math.pow(t2.clientX - t1.clientX, 2) +
            Math.pow(t2.clientY - t1.clientY, 2),
        );

        const delta = dist - pinchStartDistRef.current;
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;

        onPinch(delta, centerX, centerY);
        pinchStartDistRef.current = dist;
        return;
      }

      if (!timerRef.current && !activeRippleIdRef.current) return;

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
    [moveThreshold, rippleRef, onPinch],
  );

  const handleTouchEnd = useCallback(() => {
    touchesRef.current = 0;
    pinchStartDistRef.current = null;
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
    if (!isClickRef.current) {
      lastTapRef.current = null;
    }
    startPosRef.current = null;
    isClickRef.current = true;
  }, [rippleRef]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };
};
