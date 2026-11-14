import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase-request";
import { encryptSecret } from "../../../../lib/oauth-crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in before connecting YouTube." }, { status: 401 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ error: "YouTube OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and GOOGLE_TOKEN_ENCRYPTION_KEY in Vercel." }, { status: 503 });
  }
  const state = crypto.randomUUID();
  const statePayload = await encryptSecret(JSON.stringify({
    state, accessToken: auth.user.id ? request.headers.get("authorization")?.slice(7) : "",
    userId: auth.user.id, expiresAt: Date.now() + 10 * 60 * 1000,
  }));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  const response = NextResponse.json({ url: url.toString() });
  response.cookies.set("cliptube_oauth_state", statePayload, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/api/youtube/callback", maxAge: 600,
  });
  return response;
}
