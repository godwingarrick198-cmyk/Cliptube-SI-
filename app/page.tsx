"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Video = { videoId: string; title: string; description: string; channelTitle: string; publishedAt: string; thumbnail: string; url: string };
type Job = { id: string; status: string; stage: string; progress: number; error_message?: string | null; source_video_url?: string | null; config?: { niche?: string } ; created_at: string };
type Clip = { id: string; title: string; status: string; transcript: string | null; start_seconds: number | null; end_seconds: number | null; previewUrl: string | null; youtube_video_id: string | null; created_at: string };
type Metrics = { videosDiscovered: number; clipsCreated: number; shortsPublished: number; viewsTracked: number; jobs: Job[] };

const regions: Record<string,string> = { "United States":"US", "United Kingdom":"GB", Nigeria:"NG", Canada:"CA", India:"IN", Australia:"AU", "South Africa":"ZA" };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [niche, setNiche] = useState("");
  const [country, setCountry] = useState("Worldwide");
  const [limit, setLimit] = useState(10);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceStoragePath, setSourceStoragePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [permission, setPermission] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [youtubeChannel, setYoutubeChannel] = useState<{channel_title:string;channel_id:string}|null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ videosDiscovered: 0, clipsCreated: 0, shortsPublished: 0, viewsTracked: 0, jobs: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState("");

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }, [session]);

  const loadData = useCallback(async () => {
    if (!session) return;
    try {
      const [workflowData, analyticsData] = await Promise.all([api("/api/workflows"), api("/api/analytics")]);
      setJobs(workflowData.workflows || []);
      setMetrics(analyticsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your workspace.");
    }
  }, [api, session]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSession(data.session); setAuthReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (session) loadData(); }, [session, loadData]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true); setAuthMessage("");
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthMessage(signInError ? signInError.message : "Magic link sent. Open the email on this device to sign in.");
    setAuthBusy(false);
  }

  async function discover() {
    if (niche.trim().length < 2) { setError("Enter a topic with at least 2 characters."); return; }
    setBusy(true); setError(""); setMessage(""); setVideos([]); setSearched(niche.trim());
    try {
      const params = new URLSearchParams({ q: niche.trim(), maxResults: String(limit) });
      if (regions[country]) params.set("regionCode", regions[country]);
      const response = await fetch(`/api/youtube/discover?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "YouTube search failed.");
      setVideos(data.videos || []);
      if (data.videos?.length) {
        try { await api("/api/discovered-videos", { method: "POST", body: JSON.stringify({ videos: data.videos }) }); await loadData(); }
        catch (saveError) { setMessage(saveError instanceof Error ? saveError.message : "Results shown but not saved."); }
      } else setMessage("No public videos matched. Try another topic.");
    } catch (e) { setError(e instanceof Error ? e.message : "Discovery failed."); }
    finally { setBusy(false); }
  }

  async function uploadSource(file?: File) {
    if (!file || !session) return;
    if (!["video/mp4","video/quicktime","video/webm"].includes(file.type)) { setError("Upload an MP4, MOV or WebM video."); return; }
    if (file.size > 50 * 1024 * 1024) { setError("The free-tier upload limit is 50 MB per source video."); return; }
    setUploading(true); setError(""); setMessage("");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90);
    const path = `${session.user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("source-videos").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) setError(uploadError.message);
    else { setSourceStoragePath(path); setMessage("Source video uploaded privately. Confirm permission and save the workflow."); }
    setUploading(false);
  }

  async function saveWorkflow() {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api("/api/workflows", { method: "POST", body: JSON.stringify({ niche, country, limit, sourceUrl, sourceStoragePath, permissionConfirmed: permission }) });
      setJobs(current => [data.workflow, ...current]);
      setMessage("Workflow saved to your account. Processing is not started.");
      await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save workflow."); }
    finally { setBusy(false); }
  }

  async function connectYouTube() {
    setError(""); setMessage("");
    try { const data = await api("/api/youtube/connect", { method: "POST", body: "{}" }); window.location.assign(data.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start YouTube connection."); }
  }

  async function reviewClip(id: string, action: "approve" | "reject") {
    setError(""); setMessage("");
    try { await api(`/api/clips/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); setMessage(action === "approve" ? "Clip approved. The worker will publish it as Unlisted." : "Clip rejected."); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update clip."); }
  }

  async function controlJob(id: string, action: string) {
    setError(""); setMessage("");
    try {
      await api(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      setMessage(action === "stop" ? "Workflow stopped." : "Workflow updated.");
      await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Workflow action failed."); }
  }

  if (!authReady) return <main className="auth-screen"><div className="auth-card"><div className="brand-mark">C</div><h1>Cliptube <b>SI</b></h1><p>Loading your secure workspace…</p></div></main>;

  if (!session) return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={signIn}>
        <div className="brand-mark">C</div><div className="eyebrow">YOUR SHORTS WORKSPACE</div>
        <h1>Cliptube <b>SI</b></h1><p>Sign in with a secure email link to save discoveries and workflows to your account.</p>
        <label className="field-label" htmlFor="email">Email address</label>
        <input id="email" className="field" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
        <button className="primary-button" disabled={authBusy}>{authBusy ? "Sending link…" : "Send sign-in link"} <span>→</span></button>
        {authMessage && <p className="inline-notice" role="status">{authMessage}</p>}
        <small>Cliptube SI uses Supabase email authentication. Check your inbox and spam folder.</small>
      </form>
    </main>
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview"><span className="brand-mark">C</span><span>cliptube <b>SI</b><small>SHORTS WORKSPACE</small></span></a>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav"><a className="nav-item active" href="#overview">⌂ Overview</a><a className="nav-item" href="#workflow">◈ Workflow</a><a className="nav-item" href="#discovery">◎ Discovery</a><a className="nav-item" href="#activity">≡ Activity</a></nav>
        <div className="sidebar-bottom"><div className="plan-card"><span className="plan-dot"/> LIVE WORKSPACE<p>Account connected</p><small>Processing worker is not deployed yet.</small></div><div className="profile"><div className="avatar">{session.user.email?.[0]?.toUpperCase() || "U"}</div><div><strong>{session.user.email}</strong><small>Signed in</small></div></div><button className="signout-button" onClick={()=>supabase.auth.signOut()}>Sign out</button></div>
      </aside>
      <section className="content" id="overview">
        <header className="mobile-header"><a className="brand" href="#overview"><span className="brand-mark">C</span><span>cliptube <b>SI</b></span></a><button className="signout-button" onClick={()=>supabase.auth.signOut()}>Sign out</button></header>
        <header className="page-header"><div><div className="eyebrow">YOUR CONTENT WORKSPACE</div><h1>Overview</h1><p>Discover videos, save authorised sources and manage your workflows.</p></div><div className="header-status"><span className="status-dot"/> ACCOUNT CONNECTED</div></header>
        <section className="notice-banner"><span className="notice-icon">i</span><div><strong>Processing pipeline status</strong><p>Discovery, secure sign-in, private source uploads, workflow storage, clip review and encrypted YouTube OAuth are implemented. The separate Docker worker must be deployed to run transcription, highlight detection, FFmpeg rendering and approved publishing. YouTube uploads are configured as Unlisted by default.</p></div></section>\n        <section className="panel channel-panel"><div><span className="panel-kicker">YOUTUBE CHANNEL</span><h3>{youtubeChannel ? `Connected: ${youtubeChannel.channel_title}` : "Connect your YouTube channel"}</h3><p>{youtubeChannel ? "Approved clips will be uploaded as Unlisted by the background worker." : "Connect with Google OAuth to enable publishing after clip review."}</p></div><button className="secondary-button" onClick={connectYouTube}>{youtubeChannel ? "Reconnect YouTube" : "Connect YouTube"} →</button></section>
        {error && <div className="search-error" role="alert">{error}</div>}
        {message && <div className="inline-notice" role="status">{message}</div>}
        <section className="stats-grid" aria-label="Workspace metrics">
          {[[ "Videos discovered", metrics.videosDiscovered, "Saved to your account" ],[ "Clips created", metrics.clipsCreated, "Completed render jobs" ],[ "Shorts published", metrics.shortsPublished, "Published from connected channel" ],[ "Views tracked", metrics.viewsTracked, "Views recorded for published clips" ]].map(([label,value,caption])=><article className="stat-card" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>)}
        </section>
        <div className="section-heading" id="workflow"><div><div className="eyebrow">STEP 01 / 03</div><h2>Build a workflow</h2><p>Save your niche and an authorised source video.</p></div></div>
        <section className="workspace-grid">
          <article className="panel workflow-panel">
            <div className="panel-heading"><div><span className="panel-kicker">WORKFLOW SETUP</span><h3>Discovery preferences</h3></div><span className="draft-tag">ACCOUNT-SAVED</span></div>
            <label className="field-label" htmlFor="niche">Topic or niche</label><input id="niche" className="field" value={niche} onChange={e=>setNiche(e.target.value)} placeholder="Football, gaming, technology" maxLength={80}/>
            <div className="field-row"><div><label className="field-label" htmlFor="country">Target region</label><select id="country" className="field" value={country} onChange={e=>setCountry(e.target.value)}><option>Worldwide</option><option>United States</option><option>United Kingdom</option><option>Nigeria</option><option>Canada</option><option>India</option><option>Australia</option><option>South Africa</option></select></div><div><label className="field-label" htmlFor="limit">Discovery target</label><select id="limit" className="field" value={limit} onChange={e=>setLimit(Number(e.target.value))}><option value={5}>5 videos</option><option value={10}>10 videos</option><option value={20}>20 videos</option><option value={50}>50 videos</option></select></div></div>
            <div className="divider"/>
            <label className="field-label" htmlFor="source">Source video URL (required before processing)</label><input id="source" className="field" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" inputMode="url"/>
            <div className="field-hint">Only provide content you own, have licensed, or have explicit permission to process.</div>
            <label className="permission-row"><input type="checkbox" checked={permission} onChange={e=>setPermission(e.target.checked)}/><span>I own this video or have permission to process it.</span></label>
            <button className="primary-button" onClick={discover} disabled={busy || niche.trim().length<2}>{busy ? "Working…" : "Discover public videos"} <span>⌕</span></button>
            <p className="button-note">Uses YouTube Data API metadata only.</p>
            <button className="secondary-button" onClick={saveWorkflow} disabled={busy || niche.trim().length<2}>Save workflow to account <span>→</span></button>
            <p className="button-note">Creates a real draft in Supabase. It does not start video processing.</p>
          </article>
          <aside className="panel summary-panel"><div className="panel-heading"><div><span className="panel-kicker">WORKFLOW SUMMARY</span><h3>Current setup</h3></div></div><div className="summary-topic"><span className="summary-label">TOPIC</span><strong>{niche || "Your topic appears here"}</strong></div><div className="summary-line"><span>Region</span><strong>{country}</strong></div><div className="summary-line"><span>Discovery target</span><strong>{limit} videos</strong></div><div className="summary-line"><span>Uploaded source</span><strong className="source-value">{sourceStoragePath ? "Private file ready" : "Not uploaded"}</strong></div><div className="summary-line"><span>Permission</span><strong className={permission?"good-text":"muted-text"}>{permission?"Confirmed":"Not confirmed"}</strong></div></aside>
        </section>
        <section className="panel results-panel" id="discovery">
          <div className="panel-heading"><div><span className="panel-kicker">YOUTUBE DATA API V3</span><h3>Discovery results</h3><p>{searched ? `Public videos matching “${searched}”` : "Search to find public metadata. Choose a result to use as your source URL."}</p></div><span className="empty-count">{videos.length} RESULTS</span></div>
          {!videos.length ? <div className="search-state">No results loaded yet. Search a topic above.</div> : <div className="video-results">{videos.map(video=><article className="video-result" key={video.videoId}><a className="video-thumb" href={video.url} target="_blank" rel="noreferrer"><img src={video.thumbnail} alt="" loading="lazy"/><span>▶</span></a><div className="video-info"><a href={video.url} target="_blank" rel="noreferrer" className="video-title">{video.title}</a><div className="video-channel">{video.channelTitle} · {new Date(video.publishedAt).toLocaleDateString()}</div><p>{video.description || "No description provided."}</p><button className="select-source-button" onClick={()=>{setSourceUrl(video.url);setPermission(false);setMessage("Source selected. Confirm ownership or permission before submitting it for processing.");}}>Use as source URL</button></div></article>)}</div>}
        </section>
        <section className="panel controls-panel"><div className="panel-heading"><div><span className="panel-kicker">WORKFLOW CONTROLS</span><h3>Saved workflows</h3><p>Start remains locked until the video-processing worker is deployed.</p></div><span className="demo-pill">LIVE DATA</span></div>
          {!jobs.length ? <div className="search-state">No workflows saved yet.</div> : <div className="job-list">{jobs.map(job=><article className="job-row" key={job.id}><div><strong>{job.config?.niche || "Workflow"}</strong><p>{job.status} · {job.stage} · {new Date(job.created_at).toLocaleString()}</p>{job.source_video_url && <a href={job.source_video_url} target="_blank" rel="noreferrer">Open source video ↗</a>}</div><div className="job-actions"><button onClick={()=>controlJob(job.id,"start")} disabled={job.status!=="draft"}>Start</button><button onClick={()=>controlJob(job.id,"pause")} disabled={!["queued","processing"].includes(job.status)}>Pause</button><button onClick={()=>controlJob(job.id,"resume")} disabled={job.status!=="paused"}>Resume</button><button onClick={()=>controlJob(job.id,"stop")} disabled={["cancelled","completed","failed"].includes(job.status)}>Stop</button></div></article>)}</div>}
        </section>
        <section className="panel review-panel" id="review"><div className="panel-heading"><div><span className="panel-kicker">HUMAN APPROVAL</span><h3>Clip review & publishing</h3><p>Review each rendered clip before approving an Unlisted YouTube upload.</p></div><span className="empty-count">{clips.length} CLIPS</span></div>{!clips.length ? <div className="search-state">No rendered clips yet. Once the background worker processes a queued upload, clips will appear here.</div> : <div className="clip-review-list">{clips.map(clip=><article className="clip-review-card" key={clip.id}>{clip.previewUrl ? <video controls playsInline preload="metadata" src={clip.previewUrl}/> : <div className="clip-video-placeholder">Preview unavailable</div>}<div className="clip-review-info"><strong>{clip.title}</strong><p>{clip.status} · {clip.start_seconds ?? 0}s–{clip.end_seconds ?? 0}s</p>{clip.transcript && <details><summary>Transcript</summary><p>{clip.transcript}</p></details>}{clip.youtube_video_id && <a href={`https://www.youtube.com/watch?v=${clip.youtube_video_id}`} target="_blank" rel="noreferrer">View published Short ↗</a>}{clip.status === "awaiting_review" && <div className="clip-review-actions"><button onClick={()=>reviewClip(clip.id,"approve")} disabled={!youtubeChannel}>Approve & publish Unlisted</button><button onClick={()=>reviewClip(clip.id,"reject")}>Reject</button></div>}</div></article>)}</div>}</section>\n        <section className="panel activity-panel" id="activity"><div className="panel-heading"><div><span className="panel-kicker">LATEST UPDATES</span><h3>Recent activity</h3></div><span className="empty-count">{jobs.length} WORKFLOWS</span></div>{!jobs.length?<div className="empty-state"><strong>Your activity will show here</strong><p>Saved workflows and future processing events will appear here.</p></div>:<div className="job-list">{jobs.slice(0,8).map(job=><div className="activity-row" key={job.id}><span className="status-dot"/><div><strong>{job.config?.niche || "Workflow"} — {job.status}</strong><p>{job.stage} · {new Date(job.created_at).toLocaleString()}</p></div></div>)}</div>}</section>
        <footer className="footer">CLIPTUBE SI <span>•</span> ACCOUNT CONNECTED <span>•</span> VIDEO WORKER PENDING</footer>
      </section>
      <nav className="mobile-nav"><a className="mobile-nav-item selected" href="#overview"><span>⌂</span>Overview</a><a className="mobile-nav-item" href="#workflow"><span>◈</span>Workflow</a><a className="mobile-nav-item" href="#discovery"><span>◎</span>Discovery</a><a className="mobile-nav-item" href="#activity"><span>≡</span>Activity</a></nav>
    </main>
  );
}
