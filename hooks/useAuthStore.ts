import { create } from "zustand";
import { Role } from "@/lib/auth";

interface AuthState {
  role: Role | null;
  username: string | null;
  setAuth: (role: Role, username: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  role: null,
  username: null,
  setAuth: (role, username) => set({ role, username }),
  clearAuth: () => set({ role: null, username: null }),
}));
