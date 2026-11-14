import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/supabase-request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to view your workflows." }, { status: 401 });
  const { data, error } = await auth.supabase.from("processing_jobs")
    .select("id,status,stage,progress,error_message,source_video_url,permission_confirmed,config,created_at,updated_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Could not load workflows." }, { status: 500 });
  return NextResponse.json({ workflows: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in before saving a workflow." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const niche = String(body.niche || "").trim().slice(0, 80);
  const country = String(body.country || "Worldwide").slice(0, 40);
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
  const sourceUrl = String(body.sourceUrl || "").trim();
  const permissionConfirmed = body.permissionConfirmed === true;
  const sourceStoragePath = String(body.sourceStoragePath || "").trim();
  if (niche.length < 2) return NextResponse.json({ error: "Enter a topic of at least 2 characters." }, { status: 400 });
  if (sourceUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(sourceUrl)) {
    return NextResponse.json({ error: "Use a valid YouTube video URL." }, { status: 400 });
  }
  if (sourceStoragePath && !sourceStoragePath.startsWith(auth.user.id + "/")) {
    return NextResponse.json({ error: "Invalid uploaded source file." }, { status: 400 });
  }
  if (sourceStoragePath && !permissionConfirmed) {
    return NextResponse.json({ error: "Confirm that you own or are authorised to process this video." }, { status: 400 });
  }
  const { data: nicheRow, error: nicheError } = await auth.supabase.from("niches")
    .insert({ user_id: auth.user.id, name: niche }).select("id").single();
  if (nicheError || !nicheRow) return NextResponse.json({ error: "Could not save this topic." }, { status: 500 });
  const { data, error } = await auth.supabase.from("processing_jobs").insert({
    user_id: auth.user.id, niche_id: nicheRow.id, status: "draft", stage: "configured",
    progress: 0, source_video_url: sourceUrl || null, source_storage_path: sourceStoragePath || null, permission_confirmed: permissionConfirmed,
    config: { niche, country, limit, pipeline: ["transcription", "moment_detection", "clip_rendering", "subtitles", "review", "publishing"] },
  }).select("id,status,stage,progress,source_video_url,permission_confirmed,config,created_at").single();
  if (error || !data) return NextResponse.json({ error: "Could not save the workflow." }, { status: 500 });
  return NextResponse.json({ workflow: data }, { status: 201 });
}
