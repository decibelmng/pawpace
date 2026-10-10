import * as Calendar from 'expo-calendar';
import { Linking, Platform } from 'react-native';

import type { Run } from './types';

const title = (run: Run, dogName: string) => `PawPace run with ${dogName}`;
const end = (run: Run) => new Date(new Date(run.scheduled_at).getTime() + (run.minutes + 15) * 60_000);

export async function addToAppleCalendar(run: Run, dogName: string) {
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (!perm.granted) throw new Error('Allow calendar access in Settings to add runs.');
  const cal = Platform.OS === 'ios'
    ? await Calendar.getDefaultCalendarAsync()
    : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find((c) => c.allowsModifications);
  if (!cal) throw new Error('No calendar found on this phone.');
  await Calendar.createEventAsync(cal.id, {
    title: title(run, dogName),
    startDate: new Date(run.scheduled_at),
    endDate: end(run),
    notes: `${run.minutes} min run. Handoff in person. Dogs stay leashed for the whole run.`,
    alarms: [{ relativeOffset: -60 }],
  });
}

export function openGoogleCalendar(run: Run, dogName: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(title(run, dogName))}`
    + `&dates=${fmt(new Date(run.scheduled_at))}/${fmt(end(run))}`
    + `&details=${encodeURIComponent('Booked on PawPace. Dogs stay leashed for the whole run.')}`;
  return Linking.openURL(url);
}
