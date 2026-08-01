/** Anonymous leaderboard identity — no accounts, no login. Just a random id
 * plus a chosen display name, both local to this browser/device. */

export interface PlayerIdentity {
  id: string;
  name: string;
}

const STORAGE_KEY = "giveortake:player";

export function loadPlayerIdentity(): PlayerIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
    if (typeof parsed.id === "string" && typeof parsed.name === "string") {
      return { id: parsed.id, name: parsed.name };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePlayerIdentity(identity: PlayerIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage unavailable — identity just won't persist across sessions.
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers without crypto.randomUUID.
  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createPlayerIdentity(name: string): PlayerIdentity {
  const identity = { id: randomId(), name: name.trim().slice(0, 40) };
  savePlayerIdentity(identity);
  return identity;
}
