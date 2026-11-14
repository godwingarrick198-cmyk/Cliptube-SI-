import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase-request";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to review clips." }, { status: 401 });
  const { id } = await context.params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action || "");
  if (!["approve", "reject"].includes(action)) return NextResponse.json({ error: "Unsupported review action." }, { status: 400 });
  const { data: existing, error: readError } = await auth.supabase.from("clips")
    .select("id,status").eq("id", id).single();
  if (readError || !existing) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
  if (existing.status !== "awaiting_review") {
    return NextResponse.json({ error: "Only clips awaiting review can be approved or rejected." }, { status: 409 });
  }
  if (action === "approve") {
    const { data: connection } = await auth.supabase.from("youtube_connections")
      .select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!connection) return NextResponse.json({ error: "Connect your YouTube channel before approving a clip for publishing." }, { status: 409 });
  }
  const status = action === "approve" ? "approved" : "rejected";
  const { data, error } = await auth.supabase.from("clips").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "awaiting_review").select("id,status").single();
  if (error || !data) return NextResponse.json({ error: "Could not update this clip." }, { status: 500 });
  return NextResponse.json({ clip: data });
}
