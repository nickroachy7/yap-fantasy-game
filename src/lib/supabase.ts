import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // This fires at build time as well as runtime, because static rendering
  // imports the app. On a hosting provider .env.local does not exist, so name
  // both places the values can come from.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Locally: copy .env.example to .env.local. ' +
      'On a host (Vercel/Cloudflare): set both as project environment variables.',
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    // On web the SDK uses localStorage and handles the magic-link fragment
    // itself; on native we persist to AsyncStorage and parse the deep link.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
