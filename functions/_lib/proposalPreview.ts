import { eq } from 'drizzle-orm';
import type { AuthEnv } from './auth';
import { getDb } from './db';
import { proposals } from './db/schema';

/**
 * What a link preview (Open Graph tags + card image) may show for a
 * proposal: the café and the time. Deliberately NOT the senders' search
 * addresses stored on the row — previews are fetched by third-party bots
 * and cached by chat apps.
 */
export type PreviewLocale = 'en' | 'ja' | 'zh';

export interface ProposalPreview {
  cafeName: string;
  cafeAddress: string;
  scheduledAt: number;
  utcOffsetMinutes: number | null;
  /** pending / accepted / cancelled / expired */
  status: string;
  cafeIndex: number;
}

export const PROPOSAL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadProposalPreview(env: AuthEnv, id: string): Promise<ProposalPreview | null> {
  if (!PROPOSAL_ID_RE.test(id)) return null;
  const [row] = await getDb(env).select().from(proposals).where(eq(proposals.id, id));
  if (!row) return null;
  // Current café: index 0 is the row's own café, 1..N the alternates.
  let cafe = { name: row.cafeName, address: row.cafeAddress };
  if (row.cafeIndex > 0) {
    try {
      const alts = JSON.parse(row.altCafesJson) as { name?: string; address?: string }[];
      const alt = Array.isArray(alts) ? alts[row.cafeIndex - 1] : undefined;
      if (alt?.name) cafe = { name: alt.name, address: alt.address ?? '' };
    } catch {
      /* fall back to the main café */
    }
  }
  const toMs = (v: Date | number) => (v instanceof Date ? v.getTime() : Number(v));
  return {
    cafeName: cafe.name,
    cafeAddress: cafe.address,
    scheduledAt: toMs(row.scheduledAt),
    utcOffsetMinutes: row.utcOffsetMinutes ?? null,
    status: toMs(row.expiresAt) < Date.now() ? 'expired' : row.status,
    cafeIndex: row.cafeIndex,
  };
}

/** "Sat, Nov 21 · 3:00 PM" at the café's clock, or null without an offset. */
export function formatPreviewTime(p: ProposalPreview, locale: PreviewLocale): string | null {
  if (p.utcOffsetMinutes == null) return null;
  const wall = p.scheduledAt + p.utcOffsetMinutes * 60_000;
  const tag = locale === 'zh' ? 'zh-CN' : locale;
  const date = new Intl.DateTimeFormat(tag, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(wall);
  const time = new Intl.DateTimeFormat(tag, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(wall);
  return `${date} · ${time}`;
}

export const PREVIEW_COPY: Record<
  PreviewLocale,
  {
    eyebrow: string;
    title: (cafe: string) => string;
    cta: string;
    closed: string;
  }
> = {
  en: {
    eyebrow: 'COFFEE HERE?',
    title: (cafe) => `Coffee at ${cafe}?`,
    cta: 'Tap to accept, shift the time or pick another café — no account needed.',
    closed: 'This coffee proposal has ended.',
  },
  ja: {
    eyebrow: 'ここでコーヒー、どう？',
    title: (cafe) => `${cafe}でコーヒー、どう？`,
    cta: 'タップして OK・時間の変更・別のカフェを選べます。アカウント不要。',
    closed: 'このコーヒーの提案は終了しました。',
  },
  zh: {
    eyebrow: '在这里喝杯咖啡？',
    title: (cafe) => `在 ${cafe} 喝杯咖啡？`,
    cta: '点开即可接受、改时间或换一家，无需注册。',
    closed: '这个咖啡邀约已结束。',
  },
};
