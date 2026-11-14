# Cliptube SI

Cliptube SI is a mobile-friendly workspace for discovering public YouTube video metadata, processing user-owned or authorised source uploads into vertical clips, reviewing them, and publishing approved clips to a connected YouTube channel.

## Live application

- Production: https://cliptube-si.vercel.app
- Background worker: GitHub Actions, configured in `.github/workflows/cliptube-worker.yml`
- Hourly analytics refresh: `.github/workflows/cliptube-analytics.yml`

## Current workflow

1. Sign in with a Supabase email magic link.
2. Search public YouTube metadata by niche and region.
3. Upload a source video you own or are authorised to process (MP4, MOV, WebM; 50 MB maximum).
4. Confirm your rights and save a workflow.
5. Start the workflow; GitHub Actions picks up queued jobs.
6. The worker transcribes speech with faster-whisper, scores transcript windows, renders 9:16 clips and burns in subtitles.
7. Review each private clip preview in the dashboard.
8. Connect YouTube with Google OAuth and approve individual clips.
9. Approved clips are uploaded as Unlisted. Published view counts refresh hourly.

## Important boundaries

- Public YouTube search is metadata-only. Cliptube does not download videos from YouTube.
- Processing requires a user-uploaded source video and explicit ownership/licence/permission confirmation.
- The first highlight detector uses transcript heuristics; it is not a trained viral-moment model.
- The first worker version requires spoken audio.
- Vercel handles the web app and API routes; FFmpeg and Whisper run in GitHub Actions, not in Vercel serverless functions.

## Setup and operations

See [worker/README.md](worker/README.md) for the background worker, required GitHub Actions secrets, OAuth callback, and operational limits.

The Google API key is configured in Vercel as a server-only environment variable. OAuth client credentials and the token-encryption key are also server-side. Never add secrets to client-side `NEXT_PUBLIC_*` variables.
