import { supabase } from './supabase';

type Action = 'setup_card' | 'onboard_runner' | 'authorize_run' | 'capture_run' | 'settle_cancel' | 'tip';

/** Calls the `payments` edge function. Throws with a readable message on failure. */
export async function payments<T = Record<string, unknown>>(action: Action, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('payments', { body: { action, ...params } });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = (await ctx.json()).error ?? message;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return data as T;
}
