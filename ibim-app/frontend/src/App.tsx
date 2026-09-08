import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

type Role = "ADMIN" | "STAFF_DETAILER" | "CLIENT" | "ENGINEER_TRAINEE";

type Project = {
  name: string;
  client: string;
  type: string;
  status: "On track" | "At risk" | "Review";
  progress: number;
  due: string;
};

const projects: Project[] = [
  { name: "Avondale Logistics Hub", client: "Northline Structures", type: "Industrial", status: "On track", progress: 78, due: "18 Sep" },
  { name: "Boort Processing Plant", client: "Civic Steel Group", type: "Commercial", status: "Review", progress: 56, due: "22 Sep" },
  { name: "Festival Stand — Stage 02", client: "Mason & Field", type: "Structural steel", status: "At risk", progress: 34, due: "26 Sep" },
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderKanban, count: "08" },
  { label: "Time & delivery", icon: Clock3 },
  { label: "Automation tools", icon: Code2 },
  { label: "Academy", icon: BookOpen },
  { label: "People", icon: Users },
];

function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(sessionStorage.getItem("ibim_token")));
  const [activeNav, setActiveNav] = useState("Overview");
  const [role, setRole] = useState<Role>("ADMIN");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotSubmitted, setCopilotSubmitted] = useState(false);
  const [copilotAnswer, setCopilotAnswer] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState("");

  const roleLabel = role === "ADMIN" ? "Admin workspace" : role.replace(/_/g, " ").toLowerCase();

  async function submitCopilot(event: FormEvent) {
    event.preventDefault();
    const prompt = copilotPrompt.trim();
    if (!prompt || copilotLoading) return;
    setCopilotLoading(true);
    setCopilotSubmitted(false);
    setCopilotAnswer("");
    setCopilotError("");
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4100";
      const response = await fetch(`${apiUrl}/ai/tekla-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("ibim_token") || ""}` },
        body: JSON.stringify({ prompt, teklaVersion: "Tekla 2024" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The engineering assistant is unavailable");
      setCopilotAnswer(payload.answer || "The assistant returned no answer.");
      setCopilotSubmitted(true);
    } catch (error) {
      setCopilotError(error instanceof Error ? error.message : "The engineering assistant is unavailable");
    } finally {
      setCopilotLoading(false);
    }
  }

  if (!authenticated) return <AccessGate onAuthenticated={() => setAuthenticated(true)} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">iB</div>
          <div className="brand-copy">
            <strong>IBim</strong>
            <span>COMMAND CENTRE</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switcher">
          <span className="workspace-avatar">IC</span>
          <span className="workspace-name"><strong>IBim Consulting</strong><small>{roleLabel}</small></span>
          <ChevronDown size={16} />
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map(({ label, icon: Icon, count }) => (
            <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => { setActiveNav(label); setIsSidebarOpen(false); }}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {count && <em>{count}</em>}
            </button>
          ))}
        </nav>

        <div className="nav-section-label">System</div>
        <nav className="primary-nav" aria-label="System navigation">
          <button className="nav-item"><ShieldCheck size={18} strokeWidth={1.8} /><span>Security & roles</span></button>
          <button className="nav-item"><Settings2 size={18} strokeWidth={1.8} /><span>Settings</span></button>
        </nav>

        <div className="sidebar-footer">
          <div className="support-card"><LifeBuoy size={18} /><div><strong>Need a hand?</strong><span>Talk to IBim support</span></div><ArrowUpRight size={15} /></div>
          <div className="user-row"><div className="user-avatar">SS</div><div><strong>Sriram Santhanam</strong><span>Owner account</span></div><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation" />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input placeholder="Search anything" aria-label="Search anything" /><kbd>⌘ K</kbd></label>
            <button className="icon-button help-button" aria-label="Help"><CircleHelp size={19} /></button>
            <div className="top-avatar">SS</div>
          </div>
        </header>

        <div className="page-body">
          <section className="hero-row">
            <div>
              <p className="eyebrow">Monday, 08 September 2026 <span className="eyebrow-dot" /> Melbourne, VIC</p>
              <h1>Good morning, Sriram<span className="accent-dot">.</span></h1>
              <p className="hero-subtitle">Here is the shape of your operation today.</p>
            </div>
            <div className="hero-controls">
              <div className="role-control"><span>Preview as</span><select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Preview role"><option value="ADMIN">Admin</option><option value="STAFF_DETAILER">Staff detailer</option><option value="CLIENT">Client</option><option value="ENGINEER_TRAINEE">Engineer trainee</option></select><ChevronDown size={15} /></div>
              <button className="primary-button"><BriefcaseBusiness size={16} /> New project</button>
            </div>
          </section>

          <section className="metric-grid" aria-label="Business metrics">
            <MetricCard label="Active projects" value="08" detail="2 due this week" trend="+12.5%" icon={<FolderKanban size={19} />} />
            <MetricCard label="Delivery utilisation" value="86.4%" detail="Across 14 detailers" trend="+4.8%" icon={<Clock3 size={19} />} />
            <MetricCard label="Hours recovered" value="214h" detail="Through automation" trend="+18.2%" icon={<Sparkles size={19} />} />
            <MetricCard label="Pipeline value" value="$184k" detail="5 qualified leads" trend="+9.7%" icon={<ArrowUpRight size={19} />} />
          </section>

          <section className="content-grid">
            <div className="panel projects-panel">
              <div className="panel-heading"><div><p className="panel-kicker">Delivery pulse</p><h2>Projects in motion</h2></div><button className="text-button">View all <ArrowUpRight size={15} /></button></div>
              <div className="project-table">
                <div className="table-header"><span>Project</span><span>Status</span><span>Progress</span><span>Due</span><span /></div>
                {projects.map((project) => <ProjectRow key={project.name} project={project} />)}
              </div>
              <div className="table-footer"><span><span className="live-indicator" /> Last synced 4 min ago</span><button className="text-button">Open delivery board <ArrowUpRight size={15} /></button></div>
            </div>

            <div className="panel copilot-panel">
              <div className="copilot-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="copilot-core"><Sparkles size={20} /></div></div>
              <p className="panel-kicker">IBim Copilot</p><h2>Make Tekla work<br /><span>smarter.</span></h2>
              <p className="copilot-copy">Ask for a code pattern, a detailing review, or a faster way through your next model.</p>
              <form className="copilot-form" onSubmit={submitCopilot}>
                <input value={copilotPrompt} onChange={(event) => { setCopilotPrompt(event.target.value); setCopilotSubmitted(false); }} placeholder="What are you working on?" aria-label="Ask IBim Copilot" />
                <button type="submit" aria-label="Send prompt" disabled={copilotLoading}><ArrowUpRight size={17} /></button>
              </form>
              {copilotLoading && <p className="copilot-status">Thinking through your Tekla workflow...</p>}
              {copilotError && <p className="copilot-error">{copilotError}</p>}
              {copilotSubmitted && <div className="copilot-answer"><p className="copilot-success"><Check size={14} /> Vertex AI response</p><p>{copilotAnswer}</p></div>}
              <div className="suggestion-row"><button onClick={() => setCopilotPrompt("Review my GA drawing workflow")}>GA drawing review</button><button onClick={() => setCopilotPrompt("Create a Tekla Open API pattern")}>Open API pattern</button></div>
            </div>
          </section>

          <section className="bottom-grid">
            <div className="panel activity-panel"><div className="panel-heading"><div><p className="panel-kicker">Recent activity</p><h2>Team momentum</h2></div><button className="icon-button" aria-label="More activity options"><MoreHorizontal size={18} /></button></div><Activity icon={<Check size={14} />} title="IFC model approved" detail="Avondale Logistics Hub · 24 min ago" tone="green" /><Activity icon={<Play size={14} />} title="Automation run completed" detail="Panel Tee Bracket · 1h ago" tone="copper" /><Activity icon={<Users size={14} />} title="New trainee enrolled" detail="Tekla Foundations · 3h ago" tone="blue" /></div>
            <div className="panel training-panel"><div className="training-art"><div className="training-grid" /><span className="training-tag">ACADEMY / 04</span><span className="training-title">Tekla<br /><strong>Foundations</strong></span><button className="play-button" aria-label="Open training course"><Play size={17} fill="currentColor" /></button></div><div className="training-meta"><div><p className="panel-kicker">Your learning path</p><h2>Keep building your edge.</h2></div><span className="course-progress">62%</span></div><div className="progress-track"><span style={{ width: "62%" }} /></div></div>
          </section>
        </div>
      </main>
    </div>
  );
}

function AccessGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4100";
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { name, email, password, organizationName };
      const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to authenticate");
      sessionStorage.setItem("ibim_token", payload.token);
      sessionStorage.setItem("ibim_organization", JSON.stringify(payload.organization));
      onAuthenticated();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to authenticate");
    } finally {
      setLoading(false);
    }
  }

  return <div className="access-screen"><div className="access-visual"><div className="access-grid" /><div className="access-visual-copy"><span className="access-kicker">IBIM / COMMAND CENTRE</span><h1>Structure your<br /><em>next move.</em></h1><p>A single operating layer for detailing delivery, Tekla automation, training, and the people who make complex work possible.</p><div className="access-quote"><span className="quote-mark">“</span><span>Make Tekla not just a tool, but a catalyst for efficiency.</span></div></div><div className="access-coordinate">37°48'49.2&quot;S / 144°57'47.1&quot;E</div></div><div className="access-panel"><div className="access-brand"><span className="brand-mark">iB</span><div><strong>IBim</strong><span>COMMAND CENTRE</span></div></div><div className="access-form-wrap"><p className="panel-kicker">Secure workspace access</p><h2>{mode === "login" ? "Welcome back." : "Start your workspace."}</h2><p className="access-lede">{mode === "login" ? "Sign in to continue to your IBim operation." : "Create an organization account for your team."}</p><form onSubmit={submit}>{mode === "register" && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>}{mode === "register" && <label>Organization<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required minLength={2} /></label>}<label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} /><small>{mode === "register" ? "Use at least 12 characters." : "Your session is protected by organization membership."}</small></label>{error && <p className="access-error">{error}</p>}<button className="access-submit" type="submit" disabled={loading}>{loading ? "Checking access..." : mode === "login" ? "Enter command centre" : "Create workspace"}<ArrowUpRight size={17} /></button></form><button className="access-switch" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Need a new workspace? Create one" : "Already have access? Sign in"}</button></div><div className="access-footer"><span><ShieldCheck size={14} /> Role-aware access</span><span><Check size={14} /> Encrypted session</span></div></div></div>;
}

function MetricCard({ label, value, detail, trend, icon }: { label: string; value: string; detail: string; trend: string; icon: ReactNode }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-trend">{trend}</span></div><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}

function ProjectRow({ project }: { project: Project }) {
  return <div className="project-row"><div className="project-name"><span className={`project-mark ${project.status.toLowerCase().replace(" ", "-")}`} /><div><strong>{project.name}</strong><small>{project.client} <span /> {project.type}</small></div></div><span className={`status status-${project.status.toLowerCase().replace(" ", "-")}`}>{project.status}</span><div className="project-progress"><div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div><small>{project.progress}%</small></div><time>{project.due}</time><button className="icon-button row-menu" aria-label={`More options for ${project.name}`}><MoreHorizontal size={17} /></button></div>;
}

function Activity({ icon, title, detail, tone }: { icon: ReactNode; title: string; detail: string; tone: string }) {
  return <div className="activity-row"><span className={`activity-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><ArrowUpRight size={15} /></div>;
}

export default App;
