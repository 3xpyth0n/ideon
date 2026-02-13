"use client";

import React, { createContext, useContext, useRef } from "react";
import TouchRipple, { RippleHandle } from "../components/ui/TouchRipple";

interface TouchContextType {
  rippleRef: React.RefObject<RippleHandle | null>;
}

const TouchContext = createContext<TouchContextType | null>(null);

export const useTouch = () => {
  const context = useContext(TouchContext);
  if (!context) {
    throw new Error("useTouch must be used within a TouchProvider");
  }
  return context;
};

export const TouchProvider = ({ children }: { children: React.ReactNode }) => {
  const rippleRef = useRef<RippleHandle>(null);

  return (
    <TouchContext.Provider value={{ rippleRef }}>
      {children}
      <TouchRipple ref={rippleRef} />
    </TouchContext.Provider>
  );
};
