import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRegions = new Set(["US", "GB", "NG", "CA", "IN", "AU", "ZA"]);

export async function GET(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "YouTube discovery is not configured on the server yet." }, { status: 503 });
  }

  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  const maxResultsRaw = Number(request.nextUrl.searchParams.get("maxResults") || 10);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.min(50, Math.max(1, Math.floor(maxResultsRaw))) : 10;
  const requestedRegion = (request.nextUrl.searchParams.get("regionCode") || "").toUpperCase();
  const regionCode = allowedRegions.has(requestedRegion) ? requestedRegion : "";

  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "Search topic must be between 2 and 100 characters." }, { status: 400 });
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(maxResults),
    order: "relevance",
    safeSearch: "moderate",
    key: apiKey,
  });
  if (regionCode) params.set("regionCode", regionCode);

  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (response.status === 403 && reason === "quotaExceeded") {
        return NextResponse.json({ error: "YouTube API daily quota reached. Try again after the quota resets." }, { status: 429 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: "Google rejected the API request. Check that YouTube Data API v3 is enabled and the API key restriction allows it." }, { status: 502 });
      }
      return NextResponse.json({ error: "YouTube could not complete the search. Please try again." }, { status: 502 });
    }

    const videos = (payload.items || [])
      .filter((item: any) => item?.id?.videoId && item?.snippet)
      .map((item: any) => ({
        videoId: item.id.videoId as string,
        title: String(item.snippet.title || ""),
        description: String(item.snippet.description || ""),
        channelTitle: String(item.snippet.channelTitle || ""),
        publishedAt: String(item.snippet.publishedAt || ""),
        thumbnail: String(item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ""),
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id.videoId)}`,
      }));

    return NextResponse.json({ videos, count: videos.length, query, regionCode: regionCode || "WORLDWIDE" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach YouTube. Check your connection and try again." }, { status: 502 });
  }
}
