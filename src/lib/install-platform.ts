export type InstallPlatform = "ios" | "android" | "mac-safari" | "firefox-desktop" | "desktop";

/**
 * Which install steps fit this browser. iPadOS reports itself as a Mac, so `touchPoints`
 * (navigator.maxTouchPoints) tells an iPad from a real Mac.
 */
export function installPlatform(ua: string, touchPoints = 0): InstallPlatform {
  const mac = /Macintosh/.test(ua);
  if (/iPhone|iPad|iPod/.test(ua) || (mac && touchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox\//.test(ua)) return "firefox-desktop";
  if (mac && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return "mac-safari";
  return "desktop";
}
