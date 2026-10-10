import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

async function upload(bucket: 'photos' | 'private', path: string, uri: string, contentType: string) {
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Lets the person pick photos from their library and saves them to a profile or dog.
 * Returns the number of photos added.
 */
export async function addPhotos(subjectType: 'profile' | 'dog', subjectId: string, existing: number) {
  const room = Math.max(0, 6 - existing);
  if (room === 0) throw new Error('You already have 6 photos. Remove one to add another.');
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: room,
    quality: 0.8,
  });
  if (picked.canceled) return 0;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first');

  let added = 0;
  for (const [i, asset] of picked.assets.slice(0, room).entries()) {
    const type = asset.mimeType ?? 'image/jpeg';
    const ext = type.includes('png') ? 'png' : type.includes('heic') ? 'heic' : 'jpg';
    const path = `${user.id}/${subjectType}-${subjectId}/${Crypto.randomUUID()}.${ext}`;
    await upload('photos', path, asset.uri, type);
    const { error } = await supabase.from('photos').insert({
      owner_id: user.id, subject_type: subjectType, subject_id: subjectId, path, sort: existing + i,
    });
    if (error) throw error;
    added++;
  }
  return added;
}

export async function removePhoto(id: string, path: string) {
  await supabase.storage.from('photos').remove([path]);
  const { error } = await supabase.from('photos').delete().eq('id', id);
  if (error) throw error;
}

/** One photo for a run report, kept private to the owner and runner. */
export async function pickReportPhoto(runId: string) {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  const path = `reports/${runId}/${Crypto.randomUUID()}.jpg`;
  return upload('private', path, asset.uri, asset.mimeType ?? 'image/jpeg');
}
