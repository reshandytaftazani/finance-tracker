import React, { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuthMe, login as apiLogin, logout as apiLogout } from "../api/auth.ts";
import { AuthContext } from "./authContext.ts";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data: auth, isLoading, isError } = useQuery({
    queryKey: ["authMe"],
    queryFn: fetchAuthMe,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const login = useCallback(
    async (password: string) => {
      await apiLogin(password);
      await queryClient.invalidateQueries({ queryKey: ["authMe"] });
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    await apiLogout();
    queryClient.setQueryData(["authMe"], {
      authenticated: false,
      auth_enabled: true,
      owner_id: 0,
      display_name: "",
    });
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ auth, isLoading, isError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
