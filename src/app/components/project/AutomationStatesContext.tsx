import { createContext, useContext } from "react";

export type AutomationStateEntry = {
  state: string;
  label: string | null;
  decayAt: number;
};

type AutomationStatesContextValue = {
  states: Record<string, AutomationStateEntry>;
  resetBlockState: (blockId: string) => void;
};

export const AutomationStatesContext =
  createContext<AutomationStatesContextValue>({
    states: {},
    resetBlockState: () => {},
  });

export function useBlockAutomationState(
  blockId: string,
): AutomationStateEntry | null {
  const { states } = useContext(AutomationStatesContext);
  return states[blockId] ?? null;
}

export function useResetBlockAutomationState(): (blockId: string) => void {
  const { resetBlockState } = useContext(AutomationStatesContext);
  return resetBlockState;
}
