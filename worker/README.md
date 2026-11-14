# Cliptube SI video worker

This worker runs separately from Vercel. The repository includes a scheduled GitHub Actions runner (`.github/workflows/cliptube-worker.yml`) that checks for work every five minutes. Because this repository is public, standard GitHub-hosted runner usage is free under GitHub's public-repository policy. The Dockerfile is an alternative for a persistent host.

## What it does

1. Polls Supabase for authorised jobs with status `queued`.
2. Claims a job by changing its status to `processing`.
3. Downloads only the user's private upload from the `source-videos` bucket.
4. Transcribes speech with faster-whisper.
5. Ranks transcript windows for likely highlights.
6. Renders up to three vertical 1080×1920 MP4 clips with burned-in subtitles.
7. Uploads clips to the private `rendered-clips` bucket and creates review records.
8. Marks the job `awaiting_approval` for user review.\n9. Publishes only user-approved clips to YouTube as **Unlisted**.\n10. Refreshes published Short view counts hourly.

Public YouTube search results are metadata only. This worker does not download YouTube URLs.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side secret only; never put this in Vercel's public variables or browser code.\n- `GOOGLE_CLIENT_ID`\n- `GOOGLE_CLIENT_SECRET`\n- `GOOGLE_TOKEN_ENCRYPTION_KEY` — the same base64-encoded 32-byte key used by the web app to encrypt refresh tokens.
- Optional: `WORKER_POLL_SECONDS` (default 12), `WHISPER_MODEL` (default base), `MAX_CLIPS_PER_VIDEO` (default 3).

## Run with GitHub Actions (zero-upfront-cost path)

Add these repository Actions secrets under Settings → Secrets and variables → Actions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`. Then run the workflow once manually or wait for its five-minute schedule. The runner handles one queued clip job or one approved upload per run. The worker needs FFmpeg and CPU/RAM for faster-whisper; it is intentionally not run inside Vercel serverless functions.

## Alternative Docker run

Build the Docker image and run it on a persistent container host with the same environment variables.

## Current limitations

- CPU transcription is slower than GPU.
- Highlight ranking is transcript heuristics, not a trained viral-moment predictor.
- Only speech-containing videos are handled in this initial worker.
- Publishing requires a connected Google OAuth account and the matching OAuth secrets in GitHub Actions.
- Keep the source-video upload under the configured 50 MB bucket limit.
