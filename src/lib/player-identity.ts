const PLAYER_ID_KEY = "eit:player-id";
const PLAYER_NAME_KEY = "eit:player-name";

/** A stable anonymous id for this browser, created on first use. */
export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

/** Last name the player entered, used only to prefill the name field. */
export function getSavedPlayerName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PLAYER_NAME_KEY) ?? "";
}

export function savePlayerName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_NAME_KEY, name);
}
