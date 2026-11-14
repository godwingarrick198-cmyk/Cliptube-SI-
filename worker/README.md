# Cliptube SI video worker

This is a separate Docker worker. Do not run FFmpeg or Whisper inside Vercel serverless functions.

## What it does

1. Polls Supabase for authorised jobs with status `queued`.
2. Claims a job by changing its status to `processing`.
3. Downloads only the user's private upload from the `source-videos` bucket.
4. Transcribes speech with faster-whisper.
5. Ranks transcript windows for likely highlights.
6. Renders up to three vertical 1080×1920 MP4 clips with burned-in subtitles.
7. Uploads clips to the private `rendered-clips` bucket and creates review records.
8. Marks the job `awaiting_approval`; it does not auto-publish.

Public YouTube search results are metadata only. This worker does not download YouTube URLs.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side secret only; never put this in Vercel's public variables or browser code.
- Optional: `WORKER_POLL_SECONDS` (default 12), `WHISPER_MODEL` (default base), `MAX_CLIPS_PER_VIDEO` (default 3).

## Run

Build the Docker image and run it on a persistent container host with the environment variables above. The worker needs FFmpeg and enough RAM/CPU for faster-whisper. The free Vercel serverless runtime is not suitable for this long-running process.

## Current limitations

- CPU transcription is slower than GPU.
- Highlight ranking is transcript heuristics, not a trained viral-moment predictor.
- Only speech-containing videos are handled in this initial worker.
- Clip review and YouTube OAuth publishing are separate steps; this worker deliberately stops at approval.
- Keep the source-video upload under the configured 50 MB bucket limit.
