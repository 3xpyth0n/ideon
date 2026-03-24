"use client";

import { Viewport } from "@xyflow/react";
import { useCallback, useRef } from "react";

const PANE_SELECTOR = ".react-flow__pane";
const CONTENT_TOUCH_SELECTOR = [
  ".nopan",
  ".nowheel",
  "input",
  "textarea",
  "[contenteditable='true']",
  ".ProseMirror",
].join(", ");
const BLOCK_TOUCH_SELECTOR = [
  ".react-flow__resize-control",
  ".react-flow__node",
  ".block-card",
  ".block-header",
  ".shell-block-header",
  ".handle-drag-target",
].join(", ");
const DOUBLE_TAP_DELAY = 400;
const DOUBLE_TAP_DISTANCE = 40;
const TAP_MOVE_THRESHOLD = 12;

export type CanvasTouchIntent = "pane" | "block" | "content" | "ignore";

interface TouchPoint {
  x: number;
  y: number;
}

interface TouchPanState {
  pointerId: number;
  start: TouchPoint;
  viewport: Viewport;
}

interface TouchPinchState {
  pointerIds: [number, number];
  initialMidpoint: TouchPoint;
  initialDistance: number;
  viewport: Viewport;
}

export interface UseCanvasTouchViewportProps {
  disabled?: boolean;
  minZoom: number;
  maxZoom: number;
  getViewport: () => Viewport;
  setViewport: (
    viewport: Viewport,
    options?: { duration?: number },
  ) => Promise<boolean> | void;
  onPaneDoubleTap?: (x: number, y: number) => void;
}

export function classifyCanvasTouchTarget(
  target: EventTarget | null,
): CanvasTouchIntent {
  if (!(target instanceof HTMLElement)) return "ignore";

  const getClosestMatch = (selector: string): HTMLElement | null => {
    const match = target.closest(selector);
    return match instanceof HTMLElement ? match : null;
  };
  const getAncestorDistance = (ancestor: HTMLElement | null) => {
    if (!ancestor) return Number.POSITIVE_INFINITY;

    let distance = 0;
    let current: HTMLElement | null = target;
    while (current && current !== ancestor) {
      current = current.parentElement;
      distance += 1;
    }

    return current === ancestor ? distance : Number.POSITIVE_INFINITY;
  };

  const blockTarget = getClosestMatch(BLOCK_TOUCH_SELECTOR);
  const contentTarget = getClosestMatch(CONTENT_TOUCH_SELECTOR);
  const paneTarget = getClosestMatch(PANE_SELECTOR);

  if (blockTarget || contentTarget) {
    const blockDistance = getAncestorDistance(blockTarget);
    const contentDistance = getAncestorDistance(contentTarget);

    if (blockDistance <= contentDistance) return "block";
    return "content";
  }

  if (paneTarget) return "pane";
  return "ignore";
}

export function computePinchViewport(
  initialViewport: Viewport,
  initialMidpoint: TouchPoint,
  currentMidpoint: TouchPoint,
  initialDistance: number,
  currentDistance: number,
  minZoom: number,
  maxZoom: number,
): Viewport {
  const zoomFactor =
    initialDistance > 0 ? currentDistance / initialDistance : 1;
  const zoom = Math.min(
    Math.max(initialViewport.zoom * zoomFactor, minZoom),
    maxZoom,
  );
  const flowX = (initialMidpoint.x - initialViewport.x) / initialViewport.zoom;
  const flowY = (initialMidpoint.y - initialViewport.y) / initialViewport.zoom;

  return {
    zoom,
    x: currentMidpoint.x - flowX * zoom,
    y: currentMidpoint.y - flowY * zoom,
  };
}

function getDistance(first: TouchPoint, second: TouchPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getMidpoint(first: TouchPoint, second: TouchPoint): TouchPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function getFirstTwoPointers(activePointers: Map<number, TouchPoint>) {
  const entries = Array.from(activePointers.entries());
  if (entries.length < 2) return null;

  const [firstId, first] = entries[0];
  const [secondId, second] = entries[1];

  if (!first || !second) return null;

  return {
    pointerIds: [firstId, secondId] as [number, number],
    first,
    second,
  };
}

export const useCanvasTouchViewport = ({
  disabled = false,
  minZoom,
  maxZoom,
  getViewport,
  setViewport,
  onPaneDoubleTap,
}: UseCanvasTouchViewportProps) => {
  const activeTouchIntentsRef = useRef<Map<number, CanvasTouchIntent>>(
    new Map(),
  );
  const activePointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const panStateRef = useRef<TouchPanState | null>(null);
  const pinchStateRef = useRef<TouchPinchState | null>(null);
  const movedRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );

  const clearGestureState = useCallback(() => {
    activePointersRef.current.clear();
    panStateRef.current = null;
    pinchStateRef.current = null;
    movedRef.current = false;
  }, []);

  const releaseTrackedPointers = useCallback(
    (container: HTMLDivElement) => {
      activePointersRef.current.forEach((_, pointerId) => {
        container.releasePointerCapture?.(pointerId);
      });
      clearGestureState();
    },
    [clearGestureState],
  );

  const stopCanvasTouchEvent = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || event.pointerType !== "touch") return;

      const intent = classifyCanvasTouchTarget(event.target);
      if (intent === "ignore") return;

      const container = event.currentTarget as HTMLDivElement;
      activeTouchIntentsRef.current.set(event.pointerId, intent);

      if (intent !== "pane") {
        releaseTrackedPointers(container);
        return;
      }

      const hasActiveNonPaneTouch = Array.from(
        activeTouchIntentsRef.current.values(),
      ).some((activeIntent) => activeIntent !== "pane");
      if (hasActiveNonPaneTouch) {
        releaseTrackedPointers(container);
        return;
      }

      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      container.setPointerCapture?.(event.pointerId);
      stopCanvasTouchEvent(event);

      if (activePointersRef.current.size === 1) {
        panStateRef.current = {
          pointerId: event.pointerId,
          start: { x: event.clientX, y: event.clientY },
          viewport: getViewport(),
        };
        pinchStateRef.current = null;
        movedRef.current = false;
        return;
      }

      const firstTwoPointers = getFirstTwoPointers(activePointersRef.current);
      if (!firstTwoPointers) return;

      const { pointerIds, first, second } = firstTwoPointers;
      pinchStateRef.current = {
        pointerIds,
        initialMidpoint: getMidpoint(first, second),
        initialDistance: getDistance(first, second),
        viewport: getViewport(),
      };
      panStateRef.current = null;
      movedRef.current = false;
    },
    [disabled, getViewport, releaseTrackedPointers, stopCanvasTouchEvent],
  );

  const onPointerMoveCapture = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      if (!activePointersRef.current.has(event.pointerId)) return;

      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const pinchState = pinchStateRef.current;
      if (pinchState) {
        const first = activePointersRef.current.get(pinchState.pointerIds[0]);
        const second = activePointersRef.current.get(pinchState.pointerIds[1]);
        if (!first || !second) {
          clearGestureState();
          return;
        }

        const currentMidpoint = getMidpoint(first, second);
        const currentDistance = getDistance(first, second);
        const nextViewport = computePinchViewport(
          pinchState.viewport,
          pinchState.initialMidpoint,
          currentMidpoint,
          pinchState.initialDistance,
          currentDistance,
          minZoom,
          maxZoom,
        );

        movedRef.current = true;
        stopCanvasTouchEvent(event);
        void setViewport(nextViewport, { duration: 0 });
        return;
      }

      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - panState.start.x;
      const deltaY = event.clientY - panState.start.y;

      if (Math.hypot(deltaX, deltaY) > TAP_MOVE_THRESHOLD) {
        movedRef.current = true;
        lastTapRef.current = null;
      }

      stopCanvasTouchEvent(event);
      void setViewport(
        {
          ...panState.viewport,
          x: panState.viewport.x + deltaX,
          y: panState.viewport.y + deltaY,
        },
        { duration: 0 },
      );
    },
    [clearGestureState, maxZoom, minZoom, setViewport, stopCanvasTouchEvent],
  );

  const finishTap = useCallback(
    (x: number, y: number) => {
      if (movedRef.current) {
        lastTapRef.current = null;
        return;
      }

      const now = Date.now();
      const previousTap = lastTapRef.current;
      if (previousTap) {
        const timeDelta = now - previousTap.time;
        const distance = Math.hypot(x - previousTap.x, y - previousTap.y);
        if (
          timeDelta < DOUBLE_TAP_DELAY &&
          distance < DOUBLE_TAP_DISTANCE &&
          onPaneDoubleTap
        ) {
          onPaneDoubleTap(x, y);
          lastTapRef.current = null;
          return;
        }
      }

      lastTapRef.current = { time: now, x, y };
    },
    [onPaneDoubleTap],
  );

  const endTrackedTouch = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activeTouchIntentsRef.current.delete(event.pointerId);
      if (!activePointersRef.current.has(event.pointerId)) return;

      const container = event.currentTarget as HTMLDivElement;
      container.releasePointerCapture?.(event.pointerId);

      const wasPinching = !!pinchStateRef.current;
      const panState = panStateRef.current;

      if (panState && panState.pointerId === event.pointerId) {
        finishTap(event.clientX, event.clientY);
      } else if (wasPinching) {
        lastTapRef.current = null;
      }

      stopCanvasTouchEvent(event);
      clearGestureState();
    },
    [clearGestureState, finishTap, stopCanvasTouchEvent],
  );

  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture: endTrackedTouch,
    onPointerCancelCapture: endTrackedTouch,
  };
};
