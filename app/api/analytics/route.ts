import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to view analytics." }, { status: 401 });
  const [videos, jobs, clips] = await Promise.all([
    auth.supabase.from("discovered_videos").select("id", { count: "exact", head: true }),
    auth.supabase.from("processing_jobs").select("id,status,stage,progress,created_at,updated_at").order("created_at", { ascending: false }).limit(50),
    auth.supabase.from("clips").select("id,status,view_count", { count: "exact" }),
  ]);
  if (videos.error || jobs.error || clips.error) return NextResponse.json({ error: "Analytics could not be loaded." }, { status: 500 });
  const completedClips = (clips.data || []).filter((clip: any) => clip.status === "completed").length;
  const publishedClips = (clips.data || []).filter((clip: any) => Boolean(clip.youtube_video_id)).length;
  const trackedViews = (clips.data || []).reduce((sum: number, clip: any) => sum + Number(clip.view_count || 0), 0);
  return NextResponse.json({
    videosDiscovered: videos.count || 0, clipsCreated: completedClips,
    shortsPublished: publishedClips, viewsTracked: trackedViews, jobs: jobs.data || [],
  }, { headers: { "Cache-Control": "no-store" } });
}
