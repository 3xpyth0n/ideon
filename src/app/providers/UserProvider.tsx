"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { signOut } from "next-auth/react";

export interface UserProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  color: string | null;
  role?: string | null;
  email?: string | null;
  updatedAt?: string | Date | null;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
  error: Error | null;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  error: null,
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/account");

      if (res.status === 401) {
        // Not authenticated or User not found
        setUser(null);

        // Only redirect if we are NOT on a public page
        const publicPaths = [
          "/login",
          "/register",
          "/setup",
          "/reset-password",
        ];
        const isPublic = publicPaths.some((p) =>
          window.location.pathname.startsWith(p),
        );

        if (!isPublic) {
          await signOut({ callbackUrl: "/login" });
        }
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        throw new Error(`Failed to fetch user: ${res.statusText}`);
      }
    } catch (err) {
      console.error("UserProvider: Error fetching user", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();

    // Listen for custom event to trigger refresh from other components (like AccountPage update)
    const handleUpdate = () => fetchUser();
    window.addEventListener("user-data-updated", handleUpdate);

    return () => {
      window.removeEventListener("user-data-updated", handleUpdate);
    };
  }, [fetchUser]);

  return (
    <UserContext.Provider
      value={{ user, loading, error, refreshUser: fetchUser }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
