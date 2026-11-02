// What a rich text field may contain. Everything is stored as Markdown (the project's rich-text format), so a feature
// switched off here is also something the server or the student site does not render for that field.

export type EditorFeature = 'headings' | 'lists' | 'quote' | 'code' | 'link' | 'divider' | 'image';

/** Long-form content: text lessons and blog posts (images included). */
export const FULL: readonly EditorFeature[] = ['headings', 'lists', 'quote', 'code', 'link', 'divider', 'image'];
/** Formatted copy without images: bios, briefs, descriptions, emails. */
export const STANDARD: readonly EditorFeature[] = ['headings', 'lists', 'quote', 'link'];
/** Short answers and feedback: emphasis, lists and links. */
export const BASIC: readonly EditorFeature[] = ['lists', 'link'];

/** Web, email and same-site links only; bare domains get https://. Null when the address can't be a safe link. */
export function normalizeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return /\s/.test(url) ? null : url;
  if (/^\/(?!\/)/.test(url)) return /\s/.test(url) ? null : url;
  // "example.com/page" → https://example.com/page; anything with a scheme (javascript:, data:…) is refused.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(url)) return `https://${url}`;
  return null;
}

/** Images load from https only (no tracking pixels over http, no data: or javascript: URLs). */
export const normalizeImageSrc = (raw: string): string | null => {
  const url = raw.trim();
  return /^https:\/\/\S+$/i.test(url) ? url : null;
};
