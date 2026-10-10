// Shapes of the rows the app reads. Regenerate full database types with:
//   npx supabase gen types typescript --project-id taywuqiufuyutttukfyj > src/lib/database.types.ts

export type Role = 'owner' | 'runner';
export type DogSize = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type Energy = 'low' | 'medium' | 'high' | 'very_high';
export type TierCode = 'short' | 'standard' | 'long' | 'endurance';
export type RunStatus =
  | 'proposed' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed' | 'declined';

export interface Profile {
  id: string;
  display_name: string;
  city_id: string | null;
  neighborhood: string | null;
  is_owner: boolean;
  is_runner: boolean;
  bio: string | null;
  onboarded: boolean;
  suspended_until: string | null;
}

export interface RunnerProfile {
  profile_id: string;
  gender: string | null;
  pace_min_sec: number | null;
  pace_max_sec: number | null;
  miles_min: number | null;
  miles_max: number | null;
  styles: string[];
  sizes_accepted: DogSize[];
  max_dogs: number;
  service_radius_mi: number;
  rating_avg: number | null;
  runs_completed: number;
  active: boolean;
}

export interface Dog {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  birth_year: number | null;
  size: DogSize;
  energy: Energy;
  run_minutes_min: number | null;
  run_minutes_max: number | null;
  leash_manners: number | null;
  reactive_dogs: boolean;
  reactive_people: boolean;
  reactive_bikes: boolean;
  heat_sensitive: boolean;
  rating_avg: number | null;
}

export interface Listing {
  id: string;
  owner_id: string;
  title: string;
  preferred_tier: TierCode | null;
  active: boolean;
}

export interface Tier {
  id: string;
  city_id: string;
  code: TierCode;
  label: string;
  minutes: number;
  miles: number;
  price_cents: number;
  sort: number;
}

export interface Settings {
  commission_bps: number;
  booking_fee_cents: number;
  gps_addon_cents: number;
  extra_dog_cents: number;
  min_runner_age: number;
}

export interface RunnerCard {
  profile_id: string;
  display_name: string;
  neighborhood: string | null;
  bio: string | null;
  gender: string | null;
  pace_min_sec: number | null;
  pace_max_sec: number | null;
  miles_min: number | null;
  miles_max: number | null;
  styles: string[];
  sizes_accepted: string[];
  rating_avg: number | null;
  runs_completed: number;
  distance_mi: number;
  photo_path: string | null;
  background_checked: boolean;
  requested_you: boolean;
}

export interface DeckDog {
  id: string;
  name: string;
  breed: string | null;
  size: DogSize;
  energy: Energy;
  birth_year: number | null;
  run_minutes_min: number | null;
  run_minutes_max: number | null;
  leash_manners: number | null;
  reactive_dogs: boolean;
  reactive_people: boolean;
  reactive_bikes: boolean;
  heat_sensitive: boolean;
  rating_avg: number | null;
  photo_path: string | null;
}

export interface ListingCard {
  listing_id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  neighborhood: string | null;
  distance_mi: number;
  from_price_cents: number;
  dogs: DeckDog[];
  requested_you: boolean;
}

export interface Match {
  id: string;
  listing_id: string;
  owner_id: string;
  runner_id: string;
  status: 'requested' | 'matched' | 'declined' | 'blocked';
  requested_by: Role | null;
  matched_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string | null;
  body: string | null;
  photo_path: string | null;
  run_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Run {
  id: string;
  match_id: string;
  owner_id: string;
  runner_id: string;
  listing_id: string;
  proposed_by: string;
  city_id: string;
  scheduled_at: string;
  tier_code: TierCode;
  minutes: number;
  miles: number;
  extra_dogs: number;
  gps_addon: boolean;
  repeat_weekly: boolean;
  price_cents: number;
  extra_dog_cents: number;
  gps_cents: number;
  booking_fee_cents: number;
  commission_cents: number;
  owner_total_cents: number;
  runner_payout_cents: number;
  status: RunStatus;
  started_at: string | null;
  ended_at: string | null;
  distance_mi: number | null;
  cancelled_by: Role | null;
  cancel_reason: string | null;
  refund_cents: number | null;
  runner_comp_cents: number | null;
  dispute_open_until: string | null;
  payout_released_at: string | null;
}

export interface RunReport {
  run_id: string;
  leash_manners: number;
  energy: number;
  behavior: number;
  pace_fit: number;
  overall: number;
  notes: string | null;
  photo_path: string | null;
  ai_tags: string[];
  ai_flagged: boolean;
}
