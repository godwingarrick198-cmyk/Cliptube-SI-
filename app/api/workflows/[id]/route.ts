import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-request";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to control workflows." }, { status: 401 });
  const { id } = await context.params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action || "");
  const transitions: Record<string, { status: string; stage: string }> = {
    start: { status: "queued", stage: "waiting_for_processing_worker" },
    pause: { status: "paused", stage: "paused_by_user" },
    resume: { status: "queued", stage: "waiting_for_processing_worker" },
    stop: { status: "cancelled", stage: "cancelled_by_user" },
  };
  const next = transitions[action];
  if (!next) return NextResponse.json({ error: "Unsupported workflow action." }, { status: 400 });
  const { data: existing, error: readError } = await auth.supabase.from("processing_jobs")
    .select("id,status,source_video_url,permission_confirmed").eq("id", id).single();
  if (readError || !existing) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  if (action === "start" || action === "resume") {
    if (!existing.source_video_url || existing.permission_confirmed !== true) {
      return NextResponse.json({ error: "Add a source video you own or are authorised to use, then confirm permission." }, { status: 400 });
    }
    return NextResponse.json({ error: "The processing worker is not connected yet. Your workflow is saved, but transcription and rendering cannot start until a worker is deployed." }, { status: 409 });
  }
  const { data, error } = await auth.supabase.from("processing_jobs")
    .update({ status: next.status, stage: next.stage, updated_at: new Date().toISOString() })
    .eq("id", id).select("id,status,stage,progress,updated_at").single();
  if (error || !data) return NextResponse.json({ error: "Could not update this workflow." }, { status: 500 });
  return NextResponse.json({ workflow: data });
}
