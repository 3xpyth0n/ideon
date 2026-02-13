"use client";

import { useState, useImperativeHandle, forwardRef, useCallback } from "react";

export interface RippleHandle {
  addRipple: (x: number, y: number) => number;
  removeRipple: (id: number) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  isRemoving: boolean;
}

const TouchRipple = forwardRef<RippleHandle>((_, ref) => {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const addRipple = useCallback((x: number, y: number) => {
    const id = Date.now();
    setRipples((prev) => [...prev, { id, x, y, isRemoving: false }]);
    return id;
  }, []);

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) =>
      prev.map((ripple) =>
        ripple.id === id ? { ...ripple, isRemoving: true } : ripple,
      ),
    );

    setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
    }, 400); // Wait for fade out
  }, []);

  useImperativeHandle(ref, () => ({
    addRipple,
    removeRipple,
  }));

  return (
    <div className="ripple-container">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className={`touch-ripple ${ripple.isRemoving ? "removing" : ""}`}
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 40,
            height: 40,
            marginLeft: -20,
            marginTop: -20,
          }}
        />
      ))}
    </div>
  );
});

TouchRipple.displayName = "TouchRipple";

export default TouchRipple;
