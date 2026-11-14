import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/supabase-request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to view clips." }, { status: 401 });
  const { data, error } = await auth.supabase.from("clips")
    .select("id,job_id,title,start_seconds,end_seconds,transcript,status,storage_path,youtube_video_id,view_count,created_at")
    .order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: "Could not load clips." }, { status: 500 });
  const clips = await Promise.all((data || []).map(async (clip: any) => {
    let previewUrl: string | null = null;
    if (clip.storage_path) {
      const { data: signed } = await auth.supabase.storage.from("rendered-clips").createSignedUrl(clip.storage_path, 3600);
      previewUrl = signed?.signedUrl || null;
    }
    return { ...clip, previewUrl };
  }));
  return NextResponse.json({ clips }, { headers: { "Cache-Control": "no-store" } });
}
