/** Notes that get live editing. Everything else stays on whole-file sync. */
export const LIVE_MAX_BYTES = 1_000_000;
const LIVE_EXTENSIONS = new Set(["md", "txt"]);

export function liveEligible(path: string, size: number, configDir: string): boolean {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
  return LIVE_EXTENSIONS.has(ext) && size <= LIVE_MAX_BYTES && !path.startsWith(`${configDir}/`);
}
