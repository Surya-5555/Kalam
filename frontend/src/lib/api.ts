import { API_BASE_URL } from "./constants";
import { getAccessToken, setAccessToken, clearAccessToken } from "./auth";

let refreshInFlight: Promise<string | null> | null = null;

const broadcastAccessToken = (token: string | null) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("auth:accessToken", { detail: { accessToken: token } }));
};

const refreshAccessToken = async (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!refreshRes.ok) {
        clearAccessToken();
        broadcastAccessToken(null);
        if (typeof window !== "undefined") window.location.href = "/login";
        return null;
      }

      const data = await refreshRes.json();
      const newToken = data?.accessToken as string | undefined;
      if (!newToken) {
        clearAccessToken();
        broadcastAccessToken(null);
        if (typeof window !== "undefined") window.location.href = "/login";
        return null;
      }

      setAccessToken(newToken);
      broadcastAccessToken(newToken);
      return newToken;
    })()
      .catch(() => {
        clearAccessToken();
        broadcastAccessToken(null);
        if (typeof window !== "undefined") window.location.href = "/login";
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
};

export const apiFetch = async (
  url: string,
  options: RequestInit = {},
  retry = true
): Promise<Response | undefined> => {
  const token = getAccessToken();

  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
    credentials: "include", // IMPORTANT for refresh cookie
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return;
    return apiFetch(url, options, false);
  }

  return res;
};
