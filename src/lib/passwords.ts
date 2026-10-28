const WEAK = new Set([
  "admin123",
  "manager123",
  "cashier123",
  "password",
  "password123",
  "123456",
  "12345678",
]);

export function isWeakPassword(password: string) {
  return WEAK.has(password.trim().toLowerCase()) || password.trim().length < 8;
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (isWeakPassword(password)) {
    return "Choose a stronger password (not a demo or common password)";
  }
  return null;
}
