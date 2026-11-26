/** macOS usa ⌘ para los atajos; Windows y Linux, Ctrl. */
export const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

export const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl+";

/** `true` si el evento es ⌘+tecla (macOS) o Ctrl+tecla (resto). */
export function isModShortcut(event: KeyboardEvent, key: string): boolean {
  return (IS_MAC ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === key;
}
