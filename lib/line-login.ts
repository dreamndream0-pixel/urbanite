import crypto from 'crypto';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

export function getLineLoginConfig() {
  return {
    channelId: process.env.LINE_LOGIN_CHANNEL_ID?.trim() ?? '',
    channelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET?.trim() ?? '',
  };
}

export function getLineRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, '')}/auth/line/callback`;
}

export function getLineSyntheticEmail(lineUserId: string) {
  const hash = crypto.createHash('sha256').update(lineUserId).digest('hex').slice(0, 32);
  return `line-${hash}@line.urbanite.com.tw`;
}

export function getLineSyntheticPassword(lineUserId: string, channelSecret: string) {
  const digest = crypto
    .createHash('sha256')
    .update(`urbanite-line-login:${channelSecret}:${lineUserId}`)
    .digest('hex');
  return `${digest}Aa1!`;
}

export async function exchangeLineCode({
  code,
  redirectUri,
  channelId,
  channelSecret,
}: {
  code: string;
  redirectUri: string;
  channelId: string;
  channelSecret: string;
}) {
  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new Error(typeof data.error_description === 'string' ? data.error_description : 'LINE token exchange failed');
  }
  return data.access_token as string;
}

export async function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.userId !== 'string') {
    throw new Error(typeof data.message === 'string' ? data.message : 'LINE profile request failed');
  }
  return data as LineProfile;
}

export async function upsertLineAuthUser(profile: LineProfile, channelSecret: string): Promise<{ user: User; password: string; email: string }> {
  const admin = createAdminClient();
  const email = getLineSyntheticEmail(profile.userId);
  const password = getLineSyntheticPassword(profile.userId, channelSecret);
  const metadata = {
    provider: 'line',
    line_user_id: profile.userId,
    name: profile.displayName,
    full_name: profile.displayName,
    avatar_url: profile.pictureUrl ?? '',
  };

  const { data: customer } = await admin
    .from('customers')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();

  if (customer?.user_id) {
    const { data, error } = await admin.auth.admin.updateUserById(customer.user_id as string, {
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { provider: 'line', providers: ['line'] },
    });
    if (error || !data.user) throw new Error(error?.message || 'LINE user update failed');
    return { user: data.user, password, email };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: { provider: 'line', providers: ['line'] },
  });
  if (error || !data.user) throw new Error(error?.message || 'LINE user create failed');
  return { user: data.user, password, email };
}

export async function upsertLineCustomer(userId: string, email: string, profile: LineProfile) {
  const admin = createAdminClient();
  const { error } = await admin.from('customers').upsert(
    {
      user_id: userId,
      email,
      name: profile.displayName,
      phone: '',
      address: '',
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
}
