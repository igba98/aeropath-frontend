/**
 * WhatsApp share (spec §9.12). Opens wa.me with a short prefilled message.
 * TODO(backend): include signed PDF links once documents are hosted.
 */
export function waLink(phoneE164: string | undefined, text: string): string {
  const digits = (phoneE164 ?? "").replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(phoneE164: string | undefined, text: string) {
  window.open(waLink(phoneE164, text), "_blank", "noopener,noreferrer");
}

export function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0] ?? name;
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
