import { API_BASE_URL } from "./client.ts";

export interface AuthMeResponse {
  authenticated: boolean;
  auth_enabled: boolean;
  owner_id: number;
  display_name: string;
}

export interface LoginResponse {
  status: string;
  owner_id: number;
  display_name: string;
}

export async function login(password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Password salah. Silakan coba lagi.");
    }
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "Gagal masuk ke aplikasi.");
  }

  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    credentials: "include",
  });
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: {
      Accept: "application/json",
    },
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      return {
        authenticated: false,
        auth_enabled: true,
        owner_id: 0,
        display_name: "",
      };
    }
    throw new Error("Gagal memeriksa sesi pengguna.");
  }

  return response.json();
}
