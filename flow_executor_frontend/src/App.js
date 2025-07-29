import React, { useState, useEffect } from 'react';
import './App.css';

// --- CONFIG ---
const API_BASE = "http://localhost:3001"; // Backend URL
const COLORS = {
  primary: "#0057d9",
  secondary: "#f4f4f6",
  accent: "#ffd600"
};

// --- UTILITIES ---
function fetchWithAuth(url, options = {}, token) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : undefined,
      ...options.headers,
    }
  });
}

// --- AUTH CONTEXT ---
const AuthContext = React.createContext();

// --- COMPONENTS ---

// PUBLIC_INTERFACE
function App() {
  // Theme
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auth State
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || "");
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('loading'); // loading | logged_in | none

  // UI Navigation State
  const [screen, setScreen] = useState(token ? "dashboard" : "login"); // login | register | dashboard
  const [flows, setFlows] = useState([]); // Sidebar flow list
  const [selectedFlow, setSelectedFlow] = useState(null); // Loaded flow object
  const [nodes, setNodes] = useState([]); // Flow diagram nodes (for editor)
  const [edges, setEdges] = useState([]); // Flow diagram edges (for editor)
  const [jsCode, setJsCode] = useState(""); // JS code on current flow node

  // Result modal
  const [showResult, setShowResult] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Modal: Save As New Flow
  const [saveAsModal, setSaveAsModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");

  // Modal: View all execution results
  const [resultsModal, setResultsModal] = useState(false);
  const [allResults, setAllResults] = useState([]);

  // Error message for user
  const [errorMsg, setErrorMsg] = useState("");

  // --- Authentication effect (load user info etc) ---
  useEffect(() => {
    if (!token) {
      setAuthStatus("none");
      setUser(null);
      setScreen("login");
      return;
    }
    setAuthStatus("loading");
    // Validate the token by making a quick call (e.g., list flows)
    fetchWithAuth(`${API_BASE}/flows`, {}, token)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Token validation failed");
      })
      .then(() => {
        setAuthStatus("logged_in");
        setScreen("dashboard");
      })
      .catch(() => {
        setAuthStatus("none");
        setToken("");
        setUser(null);
        localStorage.removeItem("authToken");
        setScreen("login");
      });
  }, [token]);

  // --- Load flows on login/dashboard ---
  useEffect(() => {
    if (authStatus !== "logged_in") return;
    fetchWithAuth(`${API_BASE}/flows`, {}, token)
      .then(res => res.ok ? res.json() : [])
      .then(data => { setFlows(data); })
      .catch(() => { setFlows([]); });
  }, [authStatus, token]);

  // --- HANDLERS ---

  // PUBLIC_INTERFACE
  function handleLogin(username, password) {
    setErrorMsg("");
    fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    })
    .then(res => res.ok ? res.json() : res.json().then(e => {throw new Error(e.detail || "Login failed");}))
    .then(data => {
      setToken(data.access_token);
      localStorage.setItem("authToken", data.access_token);
      setAuthStatus("logged_in");
      setScreen("dashboard");
      setErrorMsg("");
    })
    .catch(err => setErrorMsg(err.message));
  }

  // PUBLIC_INTERFACE
  function handleRegister(username, password) {
    setErrorMsg("");
    fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    })
    .then(res => res.ok ? res.json() : res.json().then(e => {throw new Error(e.detail || "Registration failed");}))
    .then(data => {
      setToken(data.access_token);
      localStorage.setItem("authToken", data.access_token);
      setAuthStatus("logged_in");
      setScreen("dashboard");
      setErrorMsg("");
    })
    .catch(err => setErrorMsg(String(err.message || err)));
  }

  // PUBLIC_INTERFACE
  function handleLogout() {
    setToken("");
    setUser(null);
    setAuthStatus("none");
    localStorage.removeItem("authToken");
    setScreen("login");
    setFlows([]);
    setNodes([]);
    setEdges([]);
    setSelectedFlow(null);
    setJsCode("");
  }

  // PUBLIC_INTERFACE
  function handleSelectFlow(flow) {
    setSelectedFlow(flow);
    setNodes(flow.nodes || []);
    setEdges(flow.edges || []);
    setJsCode((extractCodeFromFlow(flow) || ""));
  }

  // PUBLIC_INTERFACE
  function handleNewFlow() {
    setSelectedFlow(null);
    setNodes([]);
    setEdges([]);
    setJsCode("");
  }

  // PUBLIC_INTERFACE
  function handleSaveFlow() {
    if (!selectedFlow) {
      setSaveAsModal(true);
      setSaveTitle("");
      return;
    }
    // Update flow
    fetchWithAuth(`${API_BASE}/flows/${selectedFlow.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: selectedFlow.title,
        nodes,
        edges
      })
    }, token)
      .then(res => res.ok ? res.json() : res.json().then(e => {throw new Error(e.detail || "Save failed");}))
      .then(flow => {
        setSelectedFlow(flow);
        setErrorMsg("Flow saved!");
        // Refresh flows
        fetchWithAuth(`${API_BASE}/flows`, {}, token)
          .then(res => res.ok ? res.json() : [])
          .then(data => setFlows(data));
      })
      .catch(err => setErrorMsg(String(err.message || err)));
  }

  // PUBLIC_INTERFACE
  function handleSaveAsFlow(title) {
    fetchWithAuth(`${API_BASE}/flows`, {
      method: "POST",
      body: JSON.stringify({
        title,
        nodes,
        edges
      })
    }, token)
      .then(res => res.ok ? res.json() : res.json().then(e => {throw new Error(e.detail || "Save failed");}))
      .then(flow => {
        setSelectedFlow(flow);
        setSaveAsModal(false);
        setErrorMsg("Flow created!");
        // Refresh flows
        fetchWithAuth(`${API_BASE}/flows`, {}, token)
          .then(res => res.ok ? res.json() : [])
          .then(data => setFlows(data));
      })
      .catch(err => setErrorMsg(String(err.message || err)));
  }

  // PUBLIC_INTERFACE
  function handleDeleteFlow() {
    if (!selectedFlow) return;
    if (!window.confirm("Delete this flow?")) return;
    fetchWithAuth(`${API_BASE}/flows/${selectedFlow.id}`, {
      method: "DELETE"
    }, token)
    .then(res => res.ok ? null : res.json().then(e => {throw new Error(e.detail || "Delete failed");}))
    .then(() => {
      setSelectedFlow(null);
      setNodes([]);
      setEdges([]);
      setJsCode("");
      setErrorMsg("Flow deleted.");
      // Refresh flows
      fetchWithAuth(`${API_BASE}/flows`, {}, token)
        .then(res => res.ok ? res.json() : [])
        .then(data => setFlows(data));
    })
    .catch(err => setErrorMsg(String(err.message || err)));
  }

  // PUBLIC_INTERFACE
  function handleExecuteFlow() {
    if (!selectedFlow) return;
    fetchWithAuth(`${API_BASE}/execute`, {
      method: "POST",
      body: JSON.stringify({
        flow_id: selectedFlow.id,
        inputs: null // Could prompt for input if desired
      })
    }, token)
    .then(res => res.ok ? res.json() : res.json().then(e => { throw new Error(e.detail || "Execution failed");}))
    .then(result => {
      setExecutionResult(result);
      setShowResult(true);
    })
    .catch(err => setErrorMsg(String(err.message || err)));
  }

  // PUBLIC_INTERFACE
  function handleLoadResults() {
    fetchWithAuth(`${API_BASE}/results`, {}, token)
      .then(res => res.ok ? res.json() : [])
      .then(results => {
        setAllResults(results);
        setResultsModal(true);
      })
      .catch(() => setAllResults([]));
  }

  // Flow node JS code management
  function extractCodeFromFlow(flow) {
    // Assumes user code lives in a node with type === "js" and data.code property
    const jsNode = (flow.nodes || []).find(node => node.type === "js");
    return jsNode?.data?.code || "";
  }

  function handleCodeChange(newCode) {
    setJsCode(newCode);
    // If a JS node exists, update its code; otherwise, add one (for MVP simplicity)
    setNodes(prevNodes => {
      const idx = prevNodes.findIndex(n => n.type === "js");
      if (idx !== -1) {
        const updated = [...prevNodes];
        updated[idx] = { ...updated[idx], data: { ...updated[idx].data, code: newCode }};
        return updated;
      }
      // Add a new JS node in center
      return [...prevNodes, { id: `node-js-${Date.now()}`, type: "js", data: { code: newCode }, position: { x: 200, y: 200 } }];
    });
  }

  // --- RENDERING ---

  return (
    <AuthContext.Provider value={{ token, user, authStatus, setToken, setUser }}>
      {/* Top navigation bar */}
      <div style={{
        width: "100vw",
        height: "100vh",
        background: COLORS.secondary,
        color: COLORS.primary,
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
      }}>
        <Navbar
          theme={theme}
          setTheme={setTheme}
          onLogout={authStatus === "logged_in" ? handleLogout : undefined}
          onResults={authStatus === "logged_in" ? handleLoadResults : undefined}
          screen={screen}
          setScreen={setScreen}
        />
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {authStatus === "loading" ? (
            <LoadingScreen />
          ) : screen === "login" ? (
            <LoginForm
              onLogin={handleLogin}
              onSwitchToRegister={() => { setScreen("register"); setErrorMsg(""); }}
              errorMsg={errorMsg}
            />
          ) : screen === "register" ? (
            <RegisterForm
              onRegister={handleRegister}
              onSwitchToLogin={() => { setScreen("login"); setErrorMsg(""); }}
              errorMsg={errorMsg}
            />
          ) : (
            <DashboardLayout
              flows={flows}
              onSelectFlow={handleSelectFlow}
              onNewFlow={handleNewFlow}
              selectedFlow={selectedFlow}
              nodes={nodes}
              setNodes={setNodes}
              edges={edges}
              setEdges={setEdges}
              jsCode={jsCode}
              setJsCode={handleCodeChange}
              onSaveFlow={handleSaveFlow}
              onDeleteFlow={handleDeleteFlow}
              onExecuteFlow={handleExecuteFlow}
              errorMsg={errorMsg}
              setErrorMsg={setErrorMsg}
            />
          )}
        </div>
        {/* Modals */}
        {showResult && (
          <ResultModal result={executionResult} onClose={() => setShowResult(false)} />
        )}
        {saveAsModal && (
          <SaveAsModal
            onCancel={() => setSaveAsModal(false)}
            onSave={handleSaveAsFlow}
            saveTitle={saveTitle}
            setSaveTitle={setSaveTitle}
          />
        )}
        {resultsModal && (
          <ResultsHistoryModal
            results={allResults}
            onClose={() => setResultsModal(false)}
          />
        )}
      </div>
    </AuthContext.Provider>
  );
}

// --- NAVBAR ---
function Navbar({ theme, setTheme, onLogout, onResults, screen, setScreen }) {
  return (
    <nav style={{
      background: COLORS.primary,
      color: "#fff",
      padding: "0 2rem",
      height: 56,
      minHeight: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `2.5px solid ${COLORS.accent}`,
      letterSpacing: 1
    }}>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>FlowCode&nbsp;
        <span style={{ background: COLORS.accent, color: COLORS.primary, borderRadius: 4, fontSize: 14, padding: "2px 5px", fontWeight: 700, marginLeft: 4 }}>EXEC</span>
      </span>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {(onResults && screen === "dashboard") && (
          <button style={navBtnStyle} onClick={onResults}>Execution Results</button>
        )}
        <ThemeToggle theme={theme} setTheme={setTheme} />
        {onLogout
          ? <button style={logoutBtnStyle} onClick={onLogout}>Logout</button>
          : screen === "login"
            ? <button style={navBtnStyle} onClick={() => setScreen("register")}>Register</button>
            : screen === "register"
              ? <button style={navBtnStyle} onClick={() => setScreen("login")}>Login</button>
              : null
        }
      </div>
    </nav>
  );
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      style={{ ...navBtnStyle, fontSize: 18 }}
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

const navBtnStyle = {
  border: 0,
  background: COLORS.secondary,
  color: COLORS.primary,
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 4,
  padding: "8px 16px",
  cursor: "pointer",
  transition: "background 0.2s"
};
const logoutBtnStyle = { ...navBtnStyle, background: COLORS.accent, color: COLORS.primary };

// --- AUTH FORMS ---
function LoginForm({ onLogin, onSwitchToRegister, errorMsg }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div style={{ margin: "auto", width: "100%", maxWidth: 360, background: "#fff", borderRadius: 8, padding: 32, boxShadow: "0 2px 8px #d3dbee22", minHeight: 350, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h2 style={{ color: COLORS.primary, marginBottom: 24 }}>Sign in</h2>
      <input type="text" autoFocus placeholder="Username"
        value={username} onChange={e => setUsername(e.target.value)}
        style={authInputStyle} />
      <input type="password" placeholder="Password"
        value={password} onChange={e => setPassword(e.target.value)}
        style={authInputStyle} />
      <button onClick={() => onLogin(username, password)} style={{ ...navBtnStyle, width: "100%", marginTop: 12 }}>Login</button>
      <span style={{ fontSize: 13, marginTop: 22 }}>
        No account? <button onClick={onSwitchToRegister} style={{ color: COLORS.primary, background: "none", border: 0, padding: 0, cursor: "pointer" }}>Register</button>
      </span>
      {errorMsg && <p style={{ color: "crimson", marginTop: 14 }}>{errorMsg}</p>}
    </div>
  );
}

function RegisterForm({ onRegister, onSwitchToLogin, errorMsg }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div style={{ margin: "auto", width: "100%", maxWidth: 360, background: "#fff", borderRadius: 8, padding: 32, boxShadow: "0 2px 8px #d3dbee22", minHeight: 350, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h2 style={{ color: COLORS.primary, marginBottom: 24 }}>Register</h2>
      <input type="text" autoFocus placeholder="Username"
        value={username} onChange={e => setUsername(e.target.value)}
        style={authInputStyle} />
      <input type="password" placeholder="Password"
        value={password} onChange={e => setPassword(e.target.value)}
        style={authInputStyle} />
      <button onClick={() => onRegister(username, password)} style={{ ...navBtnStyle, width: "100%", marginTop: 12 }}>Create Account</button>
      <span style={{ fontSize: 13, marginTop: 22 }}>
        Already have an account? <button onClick={onSwitchToLogin} style={{ color: COLORS.primary, background: "none", border: 0, padding: 0, cursor: "pointer" }}>Login</button>
      </span>
      {errorMsg && <p style={{ color: "crimson", marginTop: 14 }}>{errorMsg}</p>}
    </div>
  );
}

const authInputStyle = {
  width: "100%",
  marginTop: 8,
  marginBottom: 8,
  padding: 10,
  fontSize: 15,
  border: `1.5px solid ${COLORS.primary}33`,
  borderRadius: 5,
  outline: "none",
  background: "#fafbfc"
};

// --- DASHBOARD LAYOUT ---
function DashboardLayout({
  flows, onSelectFlow, onNewFlow, selectedFlow, nodes, setNodes, edges, setEdges, jsCode, setJsCode,
  onSaveFlow, onDeleteFlow, onExecuteFlow, errorMsg, setErrorMsg
}) {
  // Sidebar width for responsiveness
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 220 : 48,
        background: "#fff",
        borderRight: `2.5px solid ${COLORS.secondary}`,
        transition: "width 0.22s",
        minHeight: 0,
        minWidth: 48
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 8px 2px 16px" }}>
          <span style={{ fontWeight: 600, fontSize: 17, opacity: sidebarOpen ? 1 : 0, transition: "opacity 0.2s" }}>Your Flows</span>
          <button style={{
            border: 0, background: "none", fontSize: 18, cursor: "pointer", color: COLORS.primary
          }} onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar">{sidebarOpen ? "◀" : "▶"}</button>
        </div>
        <div style={{ padding: "6px 0" }}>
          <button style={{
            width: "88%", margin: "8px 6%",
            padding: "9px 0", borderRadius: 6, fontWeight: 600, fontSize: 14, border: 0,
            background: COLORS.primary, color: "#fff", cursor: "pointer"
          }} onClick={onNewFlow}>+ New Flow</button>
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.secondary}`, padding: "5px 0 0 0", minHeight: 0 }}>
          <div style={{ maxHeight: "calc(100vh - 150px)", overflowY: "auto", paddingRight: 6 }}>
            {flows.length === 0 && <p style={{ color: "#888", marginLeft: 14, fontSize: 13 }}>No saved flows</p>}
            {flows.map(flow => (
              <SidebarFlowItem
                key={flow.id} flow={flow}
                selected={selectedFlow?.id === flow.id}
                onClick={() => onSelectFlow(flow)}
              />
            ))}
          </div>
        </div>
      </div>
      {/* Main content: flow editor and code editor */}
      <div style={{
        flex: 1,
        background: COLORS.secondary,
        minHeight: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px 10px 18px",
          borderBottom: `2px solid ${COLORS.secondary}`,
          background: "#fff",
        }}>
          <span style={{ fontWeight: 600, fontSize: 19 }}>
            {selectedFlow ? (
              <span>
                Editing: <span style={{ color: COLORS.primary, fontWeight: 700 }}>{selectedFlow.title}</span>
              </span>
            ) : (
              <span>
                <span style={{ color: COLORS.primary, fontWeight: 700 }}>New Flow</span>
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={onSaveFlow} style={navBtnStyle}>💾 Save</button>
            <button onClick={onExecuteFlow} style={{ ...navBtnStyle, background: COLORS.accent }}>▶ Run</button>
            {selectedFlow &&
              <button onClick={onDeleteFlow} style={{ ...navBtnStyle, background: "#eee", color: "crimson" }}>🗑 Delete</button>}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "auto", background: COLORS.secondary, minHeight: 0 }}>
          {/* Flow diagram editor */}
          <FlowDiagramEditor
            nodes={nodes}
            setNodes={setNodes}
            edges={edges}
            setEdges={setEdges}
          />
          {/* JS code editor */}
          <div style={{
            flex: 0.8,
            margin: "16px",
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 2px 10px #0040aa06",
            minHeight: 340,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            <div style={{
              background: COLORS.primary,
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              padding: "7px 20px"
            }}>JavaScript Code</div>
            <CodeEditor
              code={jsCode}
              onChange={setJsCode}
            />
          </div>
        </div>
        {errorMsg && (
          <div style={{ background: "#fff8dd", color: COLORS.primary, fontWeight: 500, fontSize: 15, borderTop: `2px solid ${COLORS.accent}`, padding: "10px 40px 10px 20px", minHeight: 28 }}>
            {errorMsg}
            <button onClick={() => setErrorMsg("")} style={{ float: "right", border: 0, background: "none", fontSize: 18, color: "#888" }} aria-label="Dismiss">✖</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarFlowItem({ flow, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 12px",
        fontWeight: selected ? 700 : 500,
        background: selected ? COLORS.primary + "10" : "none",
        color: selected ? COLORS.primary : "#1a1a1a",
        cursor: "pointer",
        borderLeft: selected ? `3px solid ${COLORS.primary}` : "3px solid transparent",
        borderRadius: 6,
        margin: "4px 6px"
      }}>
      {flow.title}
    </div>
  );
}

// --- FlowDiagramEditor MOCKUP (MVP: no real drag-drop yet) ---

function FlowDiagramEditor({ nodes, setNodes, edges, setEdges }) {
  // This MVP just renders static "nodes" on a grid. Real flow editing would use a library like reactflow.
  return (
    <div style={{
      flex: 1.3,
      margin: "16px 0 16px 16px",
      minWidth: 320,
      minHeight: 350,
      background: "#fcfdff",
      border: `1.5px solid ${COLORS.secondary}`,
      borderRadius: 8,
      position: "relative",
      boxShadow: "0 2px 10px #0040aa09"
    }}>
      <div style={{ position: "absolute", top: 12, left: 18, color: "#888", fontSize: 14 }}>
        <span>Flow Diagram Editor <span style={{ fontSize: 16 }}>🟦🟧</span> (MVP preview)</span>
      </div>
      <div style={{
        width: "100%",
        height: "100%",
        position: "relative"
      }}>
        {/* Render nodes */}
        {nodes.map((node, idx) => (
          <NodeWidget key={node.id || idx} node={node} index={idx} />
        ))}
        {/* Render edges as SVG? MVP: skip... */}
        {nodes.length === 0 && (
          <span style={{
            position: "absolute", top: "45%", left: "12%",
            color: "#bbb", fontSize: 15
          }}>
            No nodes. Add your JS code to create a node!
          </span>
        )}
      </div>
    </div>
  );
}

function NodeWidget({ node, index }) {
  return (
    <div style={{
      position: "absolute",
      top: node.position?.y || 80 + 38 * index,
      left: node.position?.x || 50 + 32 * index,
      padding: "10px 16px",
      background: node.type === "js" ? COLORS.accent : "#f3f3ff",
      color: node.type === "js" ? "#000" : COLORS.primary,
      borderRadius: 8,
      boxShadow: "0 2px 7px #bbc7e425",
      fontWeight: 500,
      fontSize: 15,
      minWidth: 52
    }}>
      {node.type === "js" ? "JS Node" : node.type}
    </div>
  );
}

// --- SIMPLE CODE EDITOR (textarea styled to look minimal/modern) ---

function CodeEditor({ code, onChange }) {
  return (
    <textarea
      value={code}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1,
        fontFamily: "'Fira Mono', 'Consolas', 'Menlo', 'monospace'",
        fontSize: 15,
        border: "none",
        outline: "none",
        padding: 16,
        background: "#f4f4f7",
        resize: "vertical",
        minHeight: 160,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        color: "#2f2f30"
      }}
      autoCorrect="off"
      spellCheck={false}
      rows={12}
    />
  );
}

// --- RESULT MODAL ---
function ResultModal({ result, onClose }) {
  if (!result) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0004", zIndex: 1001,
      display: "flex", justifyContent: "center", alignItems: "center"
    }}>
      <div style={{
        minWidth: 340, background: "#fff", borderRadius: 8, padding: "26px 30px 20px 30px",
        boxShadow: "0 8px 32px #0001", display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        <h2 style={{ color: COLORS.primary, marginBottom: 12 }}>Execution Result</h2>
        {result.success
          ? <pre style={{ color: "#218c00", background: "#e8ffe9", borderRadius: 6, padding: "13px 15px", fontWeight: 600, maxWidth: 500, fontSize: 15, overflow: "auto" }}>{result.output || "No output"}</pre>
          : <pre style={{ color: "#c90e1c", background: "#fff2f2", borderRadius: 6, padding: "13px 15px", fontWeight: 600, maxWidth: 500, fontSize: 15, overflow: "auto" }}>{result.error || "Error"}</pre>
        }
        <button style={{ ...navBtnStyle, marginTop: 18, background: COLORS.primary, color: "#fff", minWidth: 96 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// --- SAVE AS NEW FLOW MODAL ---
function SaveAsModal({ onCancel, onSave, saveTitle, setSaveTitle }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0004", zIndex: 999,
      display: "flex", justifyContent: "center", alignItems: "center"
    }}>
      <div style={{
        minWidth: 300, background: "#fff", borderRadius: 8, padding: 26,
        boxShadow: "0 8px 32px #0001", display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        <h3 style={{ color: COLORS.primary, marginBottom: 20 }}>Save As New Flow</h3>
        <input
          type="text"
          placeholder="Flow Title"
          value={saveTitle}
          onChange={e => setSaveTitle(e.target.value)}
          style={{ ...authInputStyle, width: "88%", marginBottom: 16 }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 30 }}>
          <button
            onClick={onCancel}
            style={{ ...navBtnStyle, background: "#eee", color: COLORS.primary }}>Cancel</button>
          <button
            onClick={() => { if (saveTitle) onSave(saveTitle); }}
            style={{ ...navBtnStyle, background: COLORS.primary, color: "#fff" }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}

// --- HISTORY OF EXECUTION RESULTS MODAL ---
function ResultsHistoryModal({ results, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0004", zIndex: 900,
      display: "flex", justifyContent: "center", alignItems: "center"
    }}>
      <div style={{
        width: 530, maxHeight: 480, overflowY: "auto", background: "#fff", borderRadius: 10, padding: "27px 24px 22px 24px",
        boxShadow: "0 10px 38px #001a36cc", display: "flex", flexDirection: "column"
      }}>
        <h3 style={{ color: COLORS.primary, marginBottom: 10, fontWeight: 700 }}>
          Execution Results History
        </h3>
        <div style={{ fontSize: 15, color: "#888", marginBottom: 12 }}>{results.length ? results.length + " result(s)" : "No results found"}</div>
        {results.map(r => (
          <div key={r.id}
            style={{
              borderLeft: `5px solid ${r.result.success ? "#39cd3a" : "#d61440"}`,
              background: r.result.success ? "#f7fff9" : "#fff6f9",
              marginBottom: 11,
              borderRadius: 5,
              padding: "7px 12px",
              fontSize: 14
            }}>
            <div>
              <b>#</b> {r.id.slice(0, 10) + "..."}
              &nbsp;|&nbsp; <b>Flow</b>: {(r.flow_id || "").slice(0, 4) + "..."}
              &nbsp;|&nbsp; <b>At</b>: {(r.timestamp ? (new Date(r.timestamp).toLocaleString()) : "")}
            </div>
            <div>
              <span style={{ color: r.result.success ? "#189800" : "#b71c1c", fontWeight: 600 }}>
                {r.result.success ? "Success" : "Error"}
              </span>
              &nbsp; | &nbsp;
              Output:&nbsp;
              <span style={{ fontFamily: "monospace", background: "#faf8ee", borderRadius: 4, padding: "2px 8px" }}>
                {(r.result.output || (r.result.error || "")).slice(0, 60) + (r.result.output && r.result.output.length > 60 ? "..." : "")}
              </span>
            </div>
          </div>
        ))}
        <button style={{ ...navBtnStyle, background: COLORS.primary, color: "#fff", minWidth: 110, marginTop: 22, alignSelf: "center" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// --- LOADING SCREEN ---
function LoadingScreen() {
  return (
    <div style={{
      width: "100vw", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 600, fontSize: 21, color: COLORS.primary
    }}>
      Loading...
    </div>
  );
}

export default App;
