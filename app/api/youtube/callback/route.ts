import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "../../../../lib/oauth-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/?youtube_error=${encodeURIComponent(reason)}`, base));
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get("cliptube_oauth_state")?.value;
  if (!code || !state || !cookie) return fail("Google authorisation was incomplete.");
  try {
    const saved = JSON.parse(await decryptSecret(cookie));
    if (saved.state !== state || saved.expiresAt < Date.now()) return fail("The sign-in request expired. Try connecting again.");
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      cache: "no-store",
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.refresh_token || !tokens.access_token) return fail("Google did not return a refresh token. Revoke Cliptube SI access in Google Account permissions and reconnect.");
    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store",
    });
    const channelData = await channelResponse.json();
    const channel = channelData.items?.[0];
    if (!channel?.id) return fail("No YouTube channel was found on this Google account.");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${saved.accessToken}` } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(saved.accessToken);
    if (userError || userData.user?.id !== saved.userId) return fail("Your Cliptube session expired. Sign in again and reconnect YouTube.");
    const encryptedRefreshToken = await encryptSecret(tokens.refresh_token);
    const { error } = await supabase.from("youtube_connections").upsert({
      user_id: saved.userId, channel_id: channel.id,
      channel_title: channel.snippet?.title || "Connected YouTube channel",
      refresh_token_encrypted: encryptedRefreshToken, updated_at: new Date().toISOString(),
    });
    if (error) return fail("Could not save the encrypted YouTube connection.");
    const response = NextResponse.redirect(new URL("/?youtube=connected", base));
    response.cookies.set("cliptube_oauth_state", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/youtube/callback", maxAge: 0 });
    return response;
  } catch {
    return fail("YouTube connection failed. Check the OAuth settings and try again.");
  }
}
