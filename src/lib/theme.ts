import { useColorScheme } from 'react-native';

// Clinical white base, near-black ink, one electric accent for actions and live runs.
const light = {
  bg: '#FFFFFF',
  surface: '#F2F3F7',
  ink: '#0B0D12',
  muted: '#5D6272',
  line: '#E2E4EA',
  accent: '#2B3BFF',
  accentSoft: '#E8EAFF',
  onAccent: '#FFFFFF',
  good: '#0E8A4F',
  goodSoft: '#E3F4EB',
  warn: '#9A5B00',
  warnSoft: '#FFF1DC',
  crit: '#C2332B',
  critSoft: '#FDE8E6',
};

const dark: typeof light = {
  bg: '#0E1016',
  surface: '#171A22',
  ink: '#F1F2F5',
  muted: '#9BA1AF',
  line: '#262A35',
  accent: '#6170FF',
  accentSoft: '#1D2147',
  onAccent: '#FFFFFF',
  good: '#3CC184',
  goodSoft: '#12291F',
  warn: '#F0A646',
  warnSoft: '#2D2210',
  crit: '#FF6B61',
  critSoft: '#331614',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28 } as const;

// Condensed, heavy numerals carry the athletic feel; body text stays the iOS system face.
export const type = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5, textTransform: 'uppercase' as const },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  stat: { fontSize: 22, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '700' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
};
