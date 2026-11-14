import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/supabase-request";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to save discovery results." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const videos = Array.isArray(body.videos) ? body.videos.slice(0, 50) : [];
  if (!videos.length) return NextResponse.json({ saved: 0 });
  const rows = videos.filter((v: any) => v?.videoId && v?.title).map((v: any) => ({
    user_id: auth.user.id,
    youtube_video_id: String(v.videoId).slice(0, 32),
    title: String(v.title).slice(0, 500),
    description: String(v.description || "").slice(0, 5000),
    channel_title: String(v.channelTitle || "").slice(0, 300),
    thumbnail_url: String(v.thumbnail || "").slice(0, 1000),
    video_url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(v.videoId))}`,
    published_at: v.publishedAt || null,
    authorization_status: "metadata_only",
  }));
  const { error } = await auth.supabase.from("discovered_videos")
    .upsert(rows, { onConflict: "user_id,youtube_video_id" });
  if (error) return NextResponse.json({ error: "Could not save discovery results. Check the discovered_videos unique constraint." }, { status: 500 });
  return NextResponse.json({ saved: rows.length });
}
