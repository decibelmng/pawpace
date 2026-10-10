import type { DogSize, Energy, Run, Settings } from './types';

export const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

export const pace = (sec: number | null | undefined) => {
  if (!sec) return '--:--';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
};

export const paceRange = (a: number | null, b: number | null) =>
  a && b ? (a === b ? pace(a) : `${pace(a)}–${pace(b)}`) : pace(a ?? b);

export const ENERGY_LABEL: Record<Energy, string> = {
  low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very high',
};

export const SIZE_LABEL: Record<DogSize, string> = {
  XS: 'XS · under 10 lb', S: 'S · 10–25 lb', M: 'M · 25–50 lb', L: 'L · 50–90 lb', XL: 'XL · 90+ lb',
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const runDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

export const age = (birthdate: string) => {
  const b = new Date(birthdate);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  return years;
};

/** Client-side preview of the cancellation policy. The database function is the source of truth. */
export function cancellationPreview(run: Run, actor: 'owner' | 'runner', weather: boolean, s: Settings) {
  const hours = (new Date(run.scheduled_at).getTime() - Date.now()) / 3_600_000;
  const base = run.price_cents + run.extra_dog_cents;
  if (run.status === 'proposed') return { tone: 'good' as const, text: 'Nothing has been charged yet.' };
  if (weather) return { tone: 'good' as const, text: `Weather cancellation: full refund of ${money(run.owner_total_cents)}, no strike.` };
  if (actor === 'owner') {
    if (hours >= 12) return { tone: 'good' as const, text: `More than 12 hours out: full refund of ${money(run.owner_total_cents)}.` };
    if (hours >= 2) {
      const half = Math.round(base * 0.5);
      return { tone: 'warn' as const, text: `Under 12 hours: you pay ${money(half + run.booking_fee_cents)}. The runner gets ${money(half - Math.round(half * s.commission_bps / 10000))}.` };
    }
    return { tone: 'crit' as const, text: `Under 2 hours: you pay ${money(base + run.booking_fee_cents)}. The runner is paid in full.` };
  }
  if (hours >= 12) return { tone: 'good' as const, text: 'The owner gets a full refund. No strike.' };
  return { tone: 'crit' as const, text: 'Under 12 hours: the owner gets a full refund and you get a strike. Three strikes in 30 days pauses your account.' };
}
