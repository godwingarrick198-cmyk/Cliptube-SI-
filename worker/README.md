# Cliptube SI background worker

This worker runs outside Vercel because FFmpeg and Whisper are long-running workloads. The repository includes a scheduled GitHub Actions runner in `.github/workflows/cliptube-worker.yml`. It checks the queue every five minutes. This repository is public, so standard GitHub-hosted Actions runners are free for public-repository usage.

## Pipeline

1. Claims a queued job for the authenticated user.
2. Downloads only that user's private upload from Supabase Storage (`source-videos`).
3. Transcribes speech with faster-whisper.
4. Scores transcript windows and selects up to three 22–58 second highlights.
5. Renders vertical 1080×1920 MP4 clips with burned-in subtitles using FFmpeg.
6. Uploads clips to the private `rendered-clips` bucket.
7. Adds review records and marks the job `awaiting_approval`.
8. Publishes only clips explicitly approved by the user to YouTube as **Unlisted**.
9. Refreshes published Short view counts through YouTube Data API.

Public YouTube discovery is metadata-only. The worker does not download videos from YouTube. Users must upload source media they own or are authorised to process.

## GitHub Actions secrets

Open the repository's **Settings → Secrets and variables → Actions** and add:

- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret; never expose it in browser code.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` — the same base64-encoded 32-byte key configured in Vercel.

Then open **Actions → Cliptube SI background worker → Run workflow** once. After that, the schedule checks for work every five minutes.

## Limits

- Source uploads are limited to 50 MB by the configured Supabase Storage bucket.
- The first version requires speech/audio and uses transcript heuristics, not a trained viral-moment predictor.
- CPU transcription speed depends on the GitHub runner and source duration.
- Approved uploads are Unlisted by default; users can change visibility in YouTube Studio.
- Vercel serverless functions are not used for video rendering.
- The Dockerfile is available for a persistent container host if a different worker host is preferred.
