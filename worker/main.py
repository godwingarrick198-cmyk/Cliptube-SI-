import os
import re
import time
import tempfile
import subprocess
import base64
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from faster_whisper import WhisperModel
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POLL_SECONDS = int(os.getenv("WORKER_POLL_SECONDS", "12"))
MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
MAX_CLIPS = int(os.getenv("MAX_CLIPS_PER_VIDEO", "3"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
TOKEN_KEY = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")

HOOK_WORDS = {
    "unbelievable", "insane", "secret", "mistake", "never", "always",
    "shocking", "important", "amazing", "crazy", "truth", "why", "how",
    "revealed", "finally", "incredible", "worst", "best", "dangerous",
}


def update_job(job_id: str, **fields: Any) -> None:
    fields["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    supabase.table("processing_jobs").update(fields).eq("id", job_id).execute()


def srt_time(seconds: float) -> str:
    ms = max(0, int(seconds * 1000))
    hours, ms = divmod(ms, 3_600_000)
    minutes, ms = divmod(ms, 60_000)
    secs, ms = divmod(ms, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def detect_moments(segments: list[Any]) -> list[tuple[float, float, str]]:
    usable = [{"start": float(s.start), "end": float(s.end), "text": s.text.strip()} for s in segments if s.text.strip()]
    if not usable:
        return []
    candidates = []
    for start_index, first in enumerate(usable):
        start = first["start"]
        window = []
        for seg in usable[start_index:]:
            if seg["end"] - start > 58:
                break
            window.append(seg)
            duration = seg["end"] - start
            if duration < 22:
                continue
            text = " ".join(x["text"] for x in window)
            words = re.findall(r"[a-z']+", text.lower())
            if len(words) < 35:
                continue
            score = sum(2.5 for word in words if word in HOOK_WORDS)
            score += min(len(words) / max(duration, 1), 3) * 2
            score += min(text.count("?") + text.count("!"), 4) * 1.5
            if re.search(r"\b(but|however|because|the reason|here is why)\b", text.lower()):
                score += 2
            candidates.append((score, start, seg["end"], text))
    candidates.sort(reverse=True, key=lambda item: item[0])
    chosen = []
    for _, start, end, text in candidates:
        if all(end <= old_start or start >= old_end for old_start, old_end, _ in chosen):
            chosen.append((start, end, text))
        if len(chosen) >= MAX_CLIPS:
            break
    return sorted(chosen, key=lambda item: item[0])


def render_clip(source: Path, start: float, end: float, segments: list[Any], output: Path, subtitle: Path) -> str:
    lines = []
    index = 1
    for seg in segments:
        seg_start, seg_end = float(seg.start), float(seg.end)
        left, right = max(start, seg_start), min(end, seg_end)
        if right <= left:
            continue
        lines.extend([str(index), f"{srt_time(left-start)} --> {srt_time(right-start)}", seg.text.strip(), ""])
        index += 1
    subtitle.write_text("\n".join(lines), encoding="utf-8")
    subtitle_filter = "subtitles=" + str(subtitle).replace("\\", "/").replace(":", "\\:")
    subtitle_filter += ":force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=110'"
    vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,{subtitle_filter}"
    command = [
        "ffmpeg", "-y", "-ss", str(start), "-i", str(source), "-t", str(end-start),
        "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output),
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return " ".join(seg.text.strip() for seg in segments if float(seg.end) > start and float(seg.start) < end)


def process(job: dict[str, Any]) -> None:
    job_id = job["id"]
    claim = supabase.table("processing_jobs").update({
        "status": "processing", "stage": "transcribing", "progress": 5,
    }).eq("id", job_id).eq("status", "queued").select("id").execute()
    if not claim.data:
        return

    try:
        path = job.get("source_storage_path")
        if not path or not job.get("permission_confirmed"):
            raise RuntimeError("A private source upload and permission confirmation are required.")
        with tempfile.TemporaryDirectory(prefix="cliptube-") as temp:
            root = Path(temp)
            source = root / "source-video"
            payload = supabase.storage.from_("source-videos").download(path)
            source.write_bytes(payload)

            update_job(job_id, stage="transcribing", progress=12)
            segments_iter, info = model.transcribe(str(source), vad_filter=True, word_timestamps=False)
            segments = list(segments_iter)
            if not segments:
                raise RuntimeError("No speech was detected. This first worker version requires spoken audio.")
            update_job(job_id, stage="detecting_moments", progress=38)
            moments = detect_moments(segments)
            if not moments:
                raise RuntimeError("No suitable 22–58 second highlight windows were found.")

            config = job.get("config") or {}
            niche = str(config.get("niche") or "Video highlight")
            for index, (start, end, transcript) in enumerate(moments, start=1):
                update_job(job_id, stage=f"rendering_clip_{index}", progress=40 + int(index / len(moments) * 45))
                output = root / f"clip-{index}.mp4"
                subtitle = root / f"clip-{index}.srt"
                transcript_text = render_clip(source, start, end, segments, output, subtitle)
                storage_path = f"{job['user_id']}/{job_id}/clip-{index}.mp4"
                supabase.storage.from_("rendered-clips").upload(
                    storage_path, output.read_bytes(),
                    file_options={"content-type": "video/mp4", "upsert": "true"},
                )
                supabase.table("clips").insert({
                    "user_id": job["user_id"], "job_id": job_id,
                    "title": f"{niche} — highlight {index}",
                    "start_seconds": start, "end_seconds": end,
                    "transcript": transcript_text[:20000], "status": "awaiting_review",
                    "storage_path": storage_path,
                }).execute()

            update_job(job_id, status="awaiting_approval", stage="clips_ready_for_review", progress=100)
    except Exception as exc:
        update_job(job_id, status="failed", stage="failed", error_message=str(exc)[:1000])



def decrypt_refresh_token(value: str) -> str:
    if not TOKEN_KEY:
        raise RuntimeError("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured on the worker.")
    iv_part, encrypted_part = value.split(".", 1)
    key = base64.b64decode(TOKEN_KEY)
    nonce = base64.urlsafe_b64decode(iv_part + "=" * (-len(iv_part) % 4))
    ciphertext = base64.urlsafe_b64decode(encrypted_part + "=" * (-len(encrypted_part) % 4))
    return AESGCM(key).decrypt(nonce, ciphertext, None).decode("utf-8")


def refresh_google_access_token(refresh_token: str) -> str:
    payload = urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    with urllib.request.urlopen(request, timeout=45) as response:
        data = json.loads(response.read().decode())
    if not data.get("access_token"):
        raise RuntimeError("Google did not return an access token.")
    return data["access_token"]


def upload_to_youtube(access_token: str, clip_path: Path, title: str, description: str) -> str:
    video_bytes = clip_path.read_bytes()
    metadata = {
        "snippet": {"title": title[:95], "description": description[:4500], "categoryId": "22"},
        "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False},
    }
    init_url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
    init_request = urllib.request.Request(
        init_url, data=json.dumps(metadata).encode(),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(len(video_bytes)),
        }, method="POST",
    )
    with urllib.request.urlopen(init_request, timeout=60) as response:
        upload_url = response.headers.get("Location")
    if not upload_url:
        raise RuntimeError("Google did not return a resumable upload URL.")
    upload_request = urllib.request.Request(
        upload_url, data=video_bytes,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "video/mp4", "Content-Length": str(len(video_bytes))},
        method="PUT",
    )
    with urllib.request.urlopen(upload_request, timeout=600) as response:
        uploaded = json.loads(response.read().decode())
    if not uploaded.get("id"):
        raise RuntimeError("YouTube upload completed without returning a video ID.")
    return uploaded["id"]


def publish_approved_clip() -> bool:
    response = supabase.table("clips").select(
        "id,user_id,job_id,title,transcript,storage_path,status"
    ).eq("status", "approved").order("created_at").limit(1).execute()
    if not response.data:
        return False
    clip = response.data[0]
    claim = supabase.table("clips").update({"status": "publishing"}).eq("id", clip["id"]).eq("status", "approved").select("id").execute()
    if not claim.data:
        return True
    try:
        connection = supabase.table("youtube_connections").select(
            "refresh_token_encrypted"
        ).eq("user_id", clip["user_id"]).single().execute()
        encrypted = connection.data["refresh_token_encrypted"]
        refresh_token = decrypt_refresh_token(encrypted)
        access_token = refresh_google_access_token(refresh_token)
        with tempfile.TemporaryDirectory(prefix="cliptube-publish-") as temp:
            local_clip = Path(temp) / "approved-clip.mp4"
            local_clip.write_bytes(supabase.storage.from_("rendered-clips").download(clip["storage_path"]))
            youtube_id = upload_to_youtube(
                access_token, local_clip, clip["title"],
                (clip.get("transcript") or "")[:4500] + "\\n\\nCreated with Cliptube SI",
            )
        supabase.table("clips").update({
            "status": "published", "youtube_video_id": youtube_id, "view_count": 0,
        }).eq("id", clip["id"]).execute()
        if clip.get("job_id"):
            remaining = supabase.table("clips").select("id", count="exact").eq("job_id", clip["job_id"]).not_.in_("status", ["published", "rejected"]).execute()
            if (remaining.count or 0) == 0:
                update_job(clip["job_id"], status="completed", stage="published", progress=100)
    except Exception as exc:
        message = str(exc)
        status = "awaiting_youtube_connection" if "refresh_token_encrypted" in message else "failed"
        supabase.table("clips").update({"status": status}).eq("id", clip["id"]).execute()
        print(f"Clip publish error {clip['id']}: {message}", flush=True)
    return True


def main() -> None:
    print(f"Cliptube worker online; Whisper model={MODEL_NAME}")
    while True:
        try:
            response = supabase.table("processing_jobs").select(
                "id,user_id,status,stage,source_storage_path,permission_confirmed,config"
            ).eq("status", "queued").order("created_at").limit(1).execute()
            if response.data:
                process(response.data[0])
                continue
            if publish_approved_clip():
                continue
            time.sleep(POLL_SECONDS)
        except Exception as exc:
            print(f"Worker loop error: {exc}", flush=True)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
