const TOKEN_KEY = 'tradepulse_token';

/**
 * Single-admin session token (JWT from POST /api/auth/login), kept in localStorage so a page
 * refresh doesn't force a re-login. There is no refresh-token flow - when the token expires
 * (JWT_EXPIRES_IN, default 12h) the next API call gets a 401 and api.ts clears it, kicking the
 * user back to the login screen.
 */
export const authStore = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // localStorage unavailable (private mode, etc.) - session just won't survive a refresh
    }
  },
  clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};
