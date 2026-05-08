"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Role } from "@/lib/auth";

interface AuthProviderProps {
  role: string | null;
  username: string | null;
  children: React.ReactNode;
}

export default function AuthProvider({ role, username, children }: AuthProviderProps) {
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (role && username) {
      setAuth(role as Role, username);
    }
  }, [role, username, setAuth]);

  return <>{children}</>;
}
