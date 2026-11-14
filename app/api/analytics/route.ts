import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/supabase-request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to view analytics." }, { status: 401 });

  const [videos, jobs, clipsTotal, published, publishedRows] = await Promise.all([
    auth.supabase.from("discovered_videos").select("id", { count: "exact", head: true }),
    auth.supabase.from("processing_jobs")
      .select("id,status,stage,progress,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(50),
    auth.supabase.from("clips").select("id", { count: "exact", head: true }),
    auth.supabase.from("clips").select("id", { count: "exact", head: true }).eq("status", "published"),
    auth.supabase.from("clips").select("view_count").eq("status", "published").limit(1000),
  ]);

  if (videos.error || jobs.error || clipsTotal.error || published.error || publishedRows.error) {
    return NextResponse.json({ error: "Analytics could not be loaded." }, { status: 500 });
  }

  const trackedViews = (publishedRows.data || []).reduce(
    (sum: number, clip: { view_count: number | null }) => sum + Number(clip.view_count || 0), 0,
  );

  return NextResponse.json({
    videosDiscovered: videos.count || 0,
    clipsCreated: clipsTotal.count || 0,
    shortsPublished: published.count || 0,
    viewsTracked: trackedViews,
    jobs: jobs.data || [],
  }, { headers: { "Cache-Control": "no-store" } });
}
