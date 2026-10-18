import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAuthMe, login, logout } from "../src/api/auth.ts";

test("login sends password with credentials include and returns session info", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/auth/login");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "include");
    assert.deepEqual(JSON.parse(options.body), { password: "secret-password" });
    return Response.json({
      status: "ok",
      owner_id: 1,
      display_name: "Owner Utama",
    });
  });

  const result = await login("secret-password");
  assert.deepEqual(result, {
    status: "ok",
    owner_id: 1,
    display_name: "Owner Utama",
  });
});

test("login with wrong password throws user-friendly Indonesian error message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    return new Response(JSON.stringify({ detail: "Invalid credentials" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  });

  await assert.rejects(
    async () => {
      await login("wrong-password");
    },
    {
      name: "Error",
      message: "Password salah. Silakan coba lagi.",
    }
  );
});

test("logout sends POST to /api/v1/auth/logout with credentials include", async (t) => {
  let called = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/auth/logout");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "include");
    called = true;
    return Response.json({ status: "ok" });
  });

  await logout();
  assert.equal(called, true);
});

test("fetchAuthMe returns authenticated owner details when session is valid", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/auth/me");
    assert.equal(options.credentials, "include");
    return Response.json({
      authenticated: true,
      auth_enabled: true,
      owner_id: 1,
      display_name: "Owner Utama",
    });
  });

  const result = await fetchAuthMe();
  assert.deepEqual(result, {
    authenticated: true,
    auth_enabled: true,
    owner_id: 1,
    display_name: "Owner Utama",
  });
});

test("fetchAuthMe returns authenticated false on 401 without throwing error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    return new Response(JSON.stringify({ detail: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  });

  const result = await fetchAuthMe();
  assert.deepEqual(result, {
    authenticated: false,
    auth_enabled: true,
    owner_id: 0,
    display_name: "",
  });
});
