import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase-request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await auth.supabase.from("youtube_connections")
    .select("channel_id,channel_title,connected_at").eq("user_id", auth.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check YouTube connection." }, { status: 500 });
  return NextResponse.json({ connected: Boolean(data), channel: data || null });
}
