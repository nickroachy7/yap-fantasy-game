import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

export default function AuthLayout() {
  const { session, initialising } = useAuth();
  if (initialising) return null;
  // Already signed in — never show the login screen.
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
