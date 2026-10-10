import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { radius, space, type, usePalette } from '@/lib/theme';

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = usePalette();
  const inner = <View style={{ padding: padded ? space.lg : 0, gap: space.lg, flex: scroll ? undefined : 1 }}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[type.display, { color: c.ink }]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[type.label, { color: c.muted }]}>{children}</Text>;
}

export function Body({ children, muted, small, bold, style }: {
  children: ReactNode; muted?: boolean; small?: boolean; bold?: boolean; style?: object;
}) {
  const c = usePalette();
  return (
    <Text style={[small ? type.small : bold ? type.bodyBold : type.body, { color: muted ? c.muted : c.ink }, style]}>
      {children}
    </Text>
  );
}

export function Button({ title, onPress, kind = 'primary', loading, disabled, small, icon }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'line' | 'danger' | 'dark';
  loading?: boolean; disabled?: boolean; small?: boolean; icon?: string;
}) {
  const c = usePalette();
  const bg = { primary: c.accent, ghost: c.surface, line: 'transparent', danger: c.critSoft, dark: c.ink }[kind];
  const fg = { primary: c.onAccent, ghost: c.ink, line: c.ink, danger: c.crit, dark: c.bg }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: radius.md, borderWidth: kind === 'line' ? 1 : 0, borderColor: c.line,
        paddingVertical: small ? 9 : 14, paddingHorizontal: small ? 14 : 18, alignItems: 'center',
        justifyContent: 'center', flexDirection: 'row', gap: 6,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1, alignSelf: small ? 'flex-start' : 'stretch',
      }]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <SymbolView name={icon as never} tintColor={fg} size={16} /> : null}
          <Text style={[small ? type.small : type.bodyBold, { color: fg, fontWeight: '700' }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, tone }: {
  label: string; on?: boolean; onPress?: () => void; tone?: 'good' | 'warn' | 'crit' | 'soon';
}) {
  const c = usePalette();
  const toneBg = tone === 'good' ? c.goodSoft : tone === 'warn' ? c.warnSoft : tone === 'crit' ? c.critSoft : c.surface;
  const toneFg = tone === 'good' ? c.good : tone === 'warn' ? c.warn : tone === 'crit' ? c.crit : tone === 'soon' ? c.muted : c.ink;
  const style: ViewStyle = {
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11,
    backgroundColor: on ? c.accentSoft : tone === 'soon' ? 'transparent' : toneBg,
    borderWidth: 1, borderColor: on ? c.accent : tone === 'soon' ? c.line : 'transparent',
    borderStyle: tone === 'soon' ? 'dashed' : 'solid',
  };
  const text = <Text style={[type.small, { color: on ? c.accent : toneFg, fontWeight: '600' }]}>{label}</Text>;
  if (!onPress) return <View style={style}>{text}</View>;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={style}>{text}</Pressable>;
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[{
          backgroundColor: c.surface, borderRadius: radius.md, padding: 12, fontSize: 16, color: c.ink,
          borderWidth: 1, borderColor: c.line, minHeight: props.multiline ? 90 : undefined,
          textAlignVertical: props.multiline ? 'top' : 'auto',
        }, props.style]}
      />
    </View>
  );
}

export function ToggleRow({ title, detail, value, onChange }: {
  title: string; detail?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line }}>
      <View style={{ flex: 1 }}>
        <Body bold>{title}</Body>
        {detail ? <Body small muted>{detail}</Body> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accent }} accessibilityLabel={title} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = usePalette();
  return (
    <View style={[{ borderWidth: 1, borderColor: c.line, borderRadius: radius.lg, padding: space.lg, gap: space.md, backgroundColor: c.bg }, style]}>
      {children}
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'good' | 'warn' | 'crit'; children: ReactNode }) {
  const c = usePalette();
  const bg = { info: c.accentSoft, good: c.goodSoft, warn: c.warnSoft, crit: c.critSoft }[tone];
  const fg = { info: c.accent, good: c.good, warn: c.warn, crit: c.crit }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 12 }}>
      <Text style={[type.small, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 12, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: on ? c.bg : 'transparent' }}>
            <Text style={[type.small, { fontWeight: '700', color: on ? c.ink : c.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Body small bold style={{ flex: 1 }}>{label}</Body>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={4} accessibilityLabel={`${label}, ${n} stars`}>
            <SymbolView name="star.fill" tintColor={n <= value ? c.accent : c.line} size={26} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10 }}>
      <Text style={[type.stat, { color: c.ink }]} numberOfLines={1}>{value}</Text>
      <Text style={[type.small, { color: c.muted, fontSize: 11 }]}>{label}</Text>
    </View>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.line, borderRadius: radius.md }}>
      {children}
    </View>
  );
}

export function Row({ children, between, style }: { children: ReactNode; between?: boolean; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: between ? 'space-between' : 'flex-start' }, style]}>{children}</View>;
}

export function Receipt({ lines, total, footnote }: {
  lines: [string, string][]; total: [string, string]; footnote?: [string, string];
}) {
  const c = usePalette();
  return (
    <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 14, gap: 6 }}>
      {lines.map(([a, b]) => <Row key={a} between><Body small>{a}</Body><Body small>{b}</Body></Row>)}
      <View style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}>
        <Row between><Body bold>{total[0]}</Body><Body bold>{total[1]}</Body></Row>
      </View>
      {footnote ? <Row between><Body small muted>{footnote[0]}</Body><Body small muted>{footnote[1]}</Body></Row> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
});
