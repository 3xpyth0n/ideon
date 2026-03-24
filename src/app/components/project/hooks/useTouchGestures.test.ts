import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTouchGestures } from "./useTouchGestures";

function createPointerEvent(
  pointerId: number,
  clientX: number,
  clientY: number,
): React.PointerEvent {
  return {
    pointerId,
    clientX,
    clientY,
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent;
}

describe("useTouchGestures", () => {
  it("fires double tap on quick repeated pointer taps", () => {
    const onLongPress = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useTouchGestures({
        onLongPress,
        onDoubleTap,
        allowLongPress: false,
      }),
    );

    const firstTap = createPointerEvent(1, 120, 180);
    const secondTap = createPointerEvent(1, 123, 182);

    act(() => {
      result.current.onPointerDown?.(firstTap);
      result.current.onPointerUp?.(firstTap);
      result.current.onPointerDown?.(secondTap);
    });

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels a pending long press when a second pointer appears", () => {
    vi.useFakeTimers();

    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useTouchGestures({
        onLongPress,
        longPressDelay: 500,
      }),
    );

    const firstTouch = createPointerEvent(1, 40, 40);
    const secondTouch = createPointerEvent(2, 60, 60);

    act(() => {
      result.current.onPointerDown?.(firstTouch);
      vi.advanceTimersByTime(200);
      result.current.onPointerDown?.(secondTouch);
      vi.advanceTimersByTime(400);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
