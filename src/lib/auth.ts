// Hardcoded credentials as requested by user
const VALID_EMAIL = "picjob@outlook.com.br";
const VALID_PASSWORD = "Nandi789*@";

const SESSION_KEY = "chat-whisperer-auth-session";

export function isAuthenticated(): boolean {
  return localStorage.getItem(SESSION_KEY) === "valid";
}

export function login(email: string, pass: string): boolean {
  if (email.trim().toLowerCase() === VALID_EMAIL && pass === VALID_PASSWORD) {
    localStorage.setItem(SESSION_KEY, "valid");
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
  window.location.reload(); // Force full app reload to clear memory states
}
