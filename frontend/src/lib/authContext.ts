import { createContext, useContext } from "react";
import type { AuthMeResponse } from "../api/auth.ts";

export interface AuthContextType {
  auth: AuthMeResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
