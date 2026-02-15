"use client";
import { createContext, useContext, ReactNode, useMemo } from "react";
import { UserPresence } from "./hooks/useProjectCanvasState";

interface UserMapContextType {
  resolveUser: (userId: string) => UserPresence | undefined;
}

const UserMapContext = createContext<UserMapContextType>({
  resolveUser: () => undefined,
});

export const useUserMap = () => useContext(UserMapContext);

export const UserMapProvider = ({
  children,
  activeUsers,
}: {
  children: ReactNode;
  activeUsers: UserPresence[];
}) => {
  const userMap = useMemo(() => {
    const map = new Map<string, UserPresence>();
    activeUsers.forEach((u) => map.set(u.id, u));
    return map;
  }, [activeUsers]);

  const resolveUser = (userId: string) => {
    return userMap.get(userId);
  };

  return (
    <UserMapContext.Provider value={{ resolveUser }}>
      {children}
    </UserMapContext.Provider>
  );
};
