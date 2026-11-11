"use client";

import { useMemo, useState } from "react";

type WorkflowStatus = "Draft" | "Running (demo)" | "Paused (demo)" | "Stopped";
type Workflow = { niche: string; country: string; limit: number; sourceUrl: string };

export default function Home() {
  const [form, setForm] = useState<Workflow>({ niche: "", country: "Worldwide", limit: 10, sourceUrl: "" });
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [status, setStatus] = useState<WorkflowStatus>("Draft");
  const [saved, setSaved] = useState<Workflow | null>(null);
  const [notice, setNotice] = useState("Create a workflow draft to preview your setup. Nothing is processed or published yet.");
  const [activeTab, setActiveTab] = useState("Overview");

  const canSave = form.niche.trim().length > 1;
  const sourceHost = useMemo(() => {
    if (!form.sourceUrl.trim()) return "No source added";
    try { return new URL(form.sourceUrl).hostname; } catch { return "Enter a valid URL"; }
  }, [form.sourceUrl]);

  function saveDraft() {
    if (!canSave) { setNotice("Add a niche with at least 2 characters."); return; }
    if (form.sourceUrl && sourceHost === "Enter a valid URL") { setNotice("Enter a valid source URL or leave it blank."); return; }
    setSaved({ ...form });
    setStatus("Draft");
    setNotice("Draft saved in this browser session only. It has not been sent to Supabase.");
  }

  function demoStatus(next: WorkflowStatus) {
    if (!saved) { setNotice("Save a workflow draft first."); return; }
    setStatus(next);
    setNotice("Demo control only: no background job has started, paused, or stopped.");
  }

  const nav = ["Overview", "Workflow", "Sources", "Activity"];
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Cliptube SI home"><span className="brand-mark">C</span><span>cliptube <b>SI</b><small>SHORTS WORKSPACE</small></span></a>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map((item, i) => <a key={item} className={activeTab === item ? "nav-item active" : "nav-item"} href={`#${item.toLowerCase()}`} onClick={() => setActiveTab(item)}><span className="nav-icon">{["⌂", "◈", "◎", "≡"][i]}</span>{item}</a>)}
        </nav>
        <div className="sidebar-bottom"><div className="plan-card"><span className="plan-dot" /> BUILD MODE <p>Version 2 interface</p><small>Backend features are not connected yet.</small></div><div className="profile"><div className="avatar">G</div><div><strong>Workspace</strong><small>Local preview</small></div></div></div>
      </aside>

      <section className="content" id="overview">
        <header className="mobile-header"><a className="brand" href="#overview"><span className="brand-mark">C</span><span>cliptube <b>SI</b></span></a><span className="demo-pill">DEMO MODE</span></header>
        <header className="page-header"><div><div className="eyebrow">YOUR CONTENT WORKSPACE</div><h1>Overview</h1><p>Set up a clipping workflow and keep track of its progress.</p></div><div className="header-status"><span className="status-dot" /> {status}</div></header>

        <section className="notice-banner"><span className="notice-icon">i</span><div><strong>Version 2 preview</strong><p>This is the redesigned interface. Workflow actions are local demos until the processing backend is connected.</p></div></section>

        <section className="stats-grid" aria-label="Workspace metrics">
          {[["Videos discovered","—","Metadata discovery not connected"],["Clips created","—","Clip rendering not connected"],["Shorts published","—","Publishing not connected"],["Views tracked","—","Analytics not connected"]].map(([title,value,caption]) => <article className="stat-card" key={title}><span>{title}</span><strong>{value}</strong><small>{caption}</small></article>)}
        </section>

        <div className="section-heading" id="workflow"><div><div className="eyebrow">GET STARTED</div><h2>Build a workflow</h2><p>Choose a topic and set your discovery preferences.</p></div><span className="step-label">STEP 01 / 03</span></div>
        <section className="workspace-grid">
          <article className="panel workflow-panel">
            <div className="panel-heading"><div><span className="panel-kicker">WORKFLOW SETUP</span><h3>Discovery preferences</h3></div><span className="draft-tag">NEW DRAFT</span></div>
            <label className="field-label" htmlFor="niche">What topic should we look for?</label>
            <input id="niche" className="field" value={form.niche} onChange={e => setForm({...form, niche:e.target.value})} placeholder="e.g. Football, gaming, technology" maxLength={80}/>
            <div className="field-row">
              <div><label className="field-label" htmlFor="country">Target region</label><select id="country" className="field" value={form.country} onChange={e => setForm({...form,country:e.target.value})}><option>Worldwide</option><option>United States</option><option>United Kingdom</option><option>Nigeria</option><option>Canada</option><option>India</option></select></div>
              <div><label className="field-label" htmlFor="limit">Discovery target</label><select id="limit" className="field" value={form.limit} onChange={e => setForm({...form,limit:Number(e.target.value)})}><option value={5}>5 videos</option><option value={10}>10 videos</option><option value={20}>20 videos</option><option value={50}>50 videos</option></select></div>
            </div>
            <div className="divider" />
            <div className="field-label">Optional source video URL</div>
            <input className="field" aria-label="Optional source video URL" value={form.sourceUrl} onChange={e => setForm({...form,sourceUrl:e.target.value})} placeholder="https://www.youtube.com/watch?v=..." inputMode="url"/>
            <div className="field-hint">Only submit videos you own, have licensed, or have explicit permission to process. Public discovery is metadata-only.</div>
            <label className="permission-row"><input type="checkbox" checked={permissionConfirmed} onChange={e => setPermissionConfirmed(e.target.checked)}/><span>I will only process content I own or am authorised to use.</span></label>
            <button className="primary-button" onClick={saveDraft} disabled={!canSave || !permissionConfirmed}>Save workflow draft <span>→</span></button>
            <p className="button-note">Saves locally for this preview. No video is downloaded or processed.</p>
          </article>

          <aside className="panel summary-panel">
            <div className="panel-heading"><div><span className="panel-kicker">LIVE PREVIEW</span><h3>Workflow summary</h3></div><span className="preview-icon">◈</span></div>
            <div className="summary-topic"><span className="summary-label">TOPIC</span><strong>{form.niche.trim() || "Your topic will appear here"}</strong></div>
            <div className="summary-line"><span>Target region</span><strong>{form.country}</strong></div>
            <div className="summary-line"><span>Discovery target</span><strong>{form.limit} videos</strong></div>
            <div className="summary-line"><span>Source</span><strong className="source-value">{sourceHost}</strong></div>
            <div className="summary-line"><span>Permission declaration</span><strong className={permissionConfirmed ? "good-text" : "muted-text"}>{permissionConfirmed ? "Confirmed" : "Not confirmed"}</strong></div>
            <div className="summary-footer"><span className="status-dot" /> {saved ? "Draft saved in this session" : "Waiting for setup"}</div>
          </aside>
        </section>

        <section className="panel controls-panel" id="sources">
          <div className="panel-heading"><div><span className="panel-kicker">CONTROL CENTRE</span><h3>Workflow controls</h3><p>These buttons demonstrate the intended control states only.</p></div><span className="demo-pill">DEMO</span></div>
          <div className="control-buttons"><button onClick={() => demoStatus("Running (demo)")}>▶ Start demo</button><button onClick={() => demoStatus("Paused (demo)")}>Ⅱ Pause</button><button onClick={() => demoStatus("Running (demo)")}>↻ Resume</button><button className="stop-button" onClick={() => demoStatus("Stopped")}>■ Stop</button></div>
          <div className="inline-notice" role="status">{notice}</div>
        </section>

        <section className="panel activity-panel" id="activity"><div className="panel-heading"><div><span className="panel-kicker">LATEST UPDATES</span><h3>Recent activity</h3></div><span className="empty-count">0 EVENTS</span></div><div className="empty-state"><div className="empty-symbol">⌁</div><strong>Your activity will show here</strong><p>No real discovery or processing jobs have run yet.</p></div></section>
        <footer className="footer">CLIPTUBE SI <span>•</span> VERSION 2 PREVIEW <span>•</span> BUILT FOR MOBILE</footer>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map((item,i)=><a key={item} href={`#${item.toLowerCase()}`} className={activeTab===item?"mobile-nav-item selected":"mobile-nav-item"} onClick={()=>setActiveTab(item)}><span>{["⌂","◈","◎","≡"][i]}</span>{item}</a>)}</nav>
    </main>
  );
}
