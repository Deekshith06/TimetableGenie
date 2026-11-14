"use client";
import { useState } from "react";
import {
  ExternalLink,
  Search,
  BookOpen,
  ArrowUpRight,
  FileText,
} from "lucide-react";
import registry from "@/docs/research/sources.json";
export default function Research() {
  const [q, setQ] = useState("");
  const papers = registry.papers.filter((p) =>
    (p.title + " " + p.authors.join(" ") + " " + p.claim)
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="section-intro">
        <span className="eyebrow">EVIDENCE, BEFORE CLAIMS</span>
        <h1>Research & evidence</h1>
        <p>
          A source register with explicit access limits. No claim of exhaustive
          coverage or unique capability.
        </p>
      </div>
      <div className="research-summary">
        <div className="panel">
          <BookOpen size={21} />
          <b>{registry.papers.length}</b>
          <span>Scholarly publication records</span>
          <small>
            Across 24 evidence families; includes abstracts, a demo and a talk.
          </small>
        </div>
        <div className="panel">
          <FileText size={21} />
          <b>{registry.official_documents.length}</b>
          <span>Official technical & policy sources</span>
          <small>Sources screened on {registry.review_date}.</small>
        </div>
        <div className="panel">
          <span className="eyebrow">REVIEW WINDOW</span>
          <h3>
            {registry.window_start} — {registry.window_end}
          </h3>
          <p>
            Publication metadata and access depth are recorded individually.
          </p>
        </div>
      </div>
      <div className="evidence-note">
        <b>What the evidence changed</b>
        <p>
          UniTime already handles student sectioning and publishes competition
          data. Timefold supports real-time changes and pinned assignments. FET
          supports rich timetabling constraints. Our contribution is a
          reproducible integrated implementation, not a claim that these systems
          cannot schedule multidisciplinary programs.
        </p>
      </div>
      <div className="section-actions">
        <label className="search-field">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search papers, authors or findings"
          />
        </label>
        <a
          className="button secondary"
          href="/research/pilot-results.md"
          download
        >
          Pilot results <ArrowUpRight size={14} />
        </a>
        <a
          className="button secondary"
          href="/research/implementation-report.md"
          download
        >
          Verification report <ArrowUpRight size={14} />
        </a>
        <a className="button secondary" href="/research/evidence.md" download>
          Review notes <ArrowUpRight size={14} />
        </a>
        <a
          className="button secondary"
          href="/research/design-manuscript.md"
          download
        >
          Methods draft <ArrowUpRight size={14} />
        </a>
        <a
          className="button secondary"
          href="/research/references.bib"
          download
        >
          BibTeX <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="panel research-list">
        {papers.map((p) => (
          <article key={p.id}>
            <div className="paper-year">
              {p.year}
              <span>{p.id}</span>
            </div>
            <div>
              <h3>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.title}
                  <ExternalLink size={13} />
                </a>
              </h3>
              <p>
                {p.authors.join(", ")} · {p.venue}
              </p>
              <p>{p.claim}</p>
              <small className="access-label">
                {p.kind.replace(/_/g, " ")} · {p.access.replace(/_/g, " ")}
              </small>
            </div>
          </article>
        ))}
        {!papers.length && (
          <p className="empty-state">No source records match this search.</p>
        )}
      </div>
      <h2 className="section-title">
        Official sources and implementation boundaries
      </h2>
      <div className="panel research-list">
        {registry.official_documents.map((d) => (
          <article key={d.id}>
            <span className="source-number">{d.id}</span>
            <div>
              <h3>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.title}
                  <ExternalLink size={13} />
                </a>
              </h3>
              <p>{d.claim}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
