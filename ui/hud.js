/**
 * OpenCluely v2 Native HUD Client Script (Tauri Core)
 */

let activeSkill = "dsa";
let activeLanguage = "cpp";
let accumulatedMarkdown = "";
let isListening = false;
let isStreaming = false;
let isClickthrough = false;

// DOM Elements
const statusDot = document.getElementById("statusDot");
const langSelect = document.getElementById("langSelect");
const responseBody = document.getElementById("responseBody");
const responseTitle = document.getElementById("responseTitle");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const micLabel = document.getElementById("micLabel");
const snipBtn = document.getElementById("snipBtn");
const autoTypeBtn = document.getElementById("autoTypeBtn");
const clickthroughBtn = document.getElementById("clickthroughBtn");
const panicBtn = document.getElementById("panicBtn");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const clearBtn = document.getElementById("clearBtn");
const profileBtn = document.getElementById("profileBtn");
const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");

// Skill Pills
document.querySelectorAll(".skill-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".skill-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    activeSkill = pill.getAttribute("data-skill");
  });
});

// Language Select
langSelect.addEventListener("change", (e) => {
  activeLanguage = e.target.value;
});

// Markdown Renderer configuration
if (window.marked) {
  marked.setOptions({
    gfm: true,
    breaks: true
  });
}

function updateHUDStatus(state) {
  statusDot.className = "status-dot";
  if (state === "listening") {
    statusDot.classList.add("listening");
  } else if (state === "thinking") {
    statusDot.classList.add("thinking");
  } else if (state === "panic") {
    statusDot.classList.add("panic");
  }
}

function renderContent(mdText) {
  if (!mdText) {
    responseBody.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">Awaiting question or screen snip...</p>';
    return;
  }
  if (window.marked) {
    responseBody.innerHTML = marked.parse(mdText);
    if (window.Prism) {
      Prism.highlightAllUnder(responseBody);
    }
  } else {
    responseBody.innerText = mdText;
  }
  responseBody.scrollTop = responseBody.scrollHeight;
}

// Helper to call Tauri IPC or fallback
async function tauriInvoke(cmd, args = {}) {
  if (window.__TAURI__ && window.__TAURI__.core) {
    return await window.__TAURI__.core.invoke(cmd, args);
  } else if (window.__TAURI__ && window.__TAURI__.tauri) {
    return await window.__TAURI__.tauri.invoke(cmd, args);
  }
  console.log(`[Tauri Mock Invoke] ${cmd}:`, args);
  return null;
}

// ── Solve Action ──
async function triggerSolve(customPrompt = null) {
  const text = customPrompt !== null ? customPrompt : promptInput.value.trim();
  if (!text) return;

  accumulatedMarkdown = "";
  renderContent("🧠 Solving with Native AI Router...");
  updateHUDStatus("thinking");

  try {
    const res = await tauriInvoke("send_prompt", {
      prompt: text,
      skill: activeSkill,
      language: activeLanguage
    });
    if (res) {
      accumulatedMarkdown = res;
      renderContent(res);
    }
    updateHUDStatus("ready");
  } catch (e) {
    renderContent(`⚠️ Error: ${e}`);
    updateHUDStatus("ready");
  }
}

sendBtn.addEventListener("click", () => triggerSolve());
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    triggerSolve();
  }
});

// ── Snip Screen Action ──
async function triggerSnip() {
  updateHUDStatus("thinking");
  responseBody.innerHTML = '<p style="color: #a5b4fc;">📸 Capturing screen natively & solving...</p>';

  try {
    const res = await tauriInvoke("capture_screen");
    if (res) {
      accumulatedMarkdown = res;
      renderContent(res);
    }
    updateHUDStatus("ready");
  } catch (err) {
    renderContent(`⚠️ Snip Error: ${err}`);
    updateHUDStatus("ready");
  }
}
snipBtn.addEventListener("click", triggerSnip);

// ── Auto-Type Action ──
async function triggerAutoType() {
  if (!accumulatedMarkdown) return;
  autoTypeBtn.classList.add("active");
  try {
    await tauriInvoke("auto_type", { text: accumulatedMarkdown });
  } finally {
    autoTypeBtn.classList.remove("active");
  }
}
autoTypeBtn.addEventListener("click", triggerAutoType);

// ── Clickthrough Action ──
clickthroughBtn.addEventListener("click", async () => {
  const res = await tauriInvoke("toggle_clickthrough");
  isClickthrough = !res;
  clickthroughBtn.classList.toggle("active", isClickthrough);
});

// ── Panic Action ──
function triggerPanic() {
  updateHUDStatus("panic");
  tauriInvoke("trigger_panic");
}
panicBtn.addEventListener("click", triggerPanic);

// ── Copy Code Action ──
copyCodeBtn.addEventListener("click", () => {
  const codeBlocks = responseBody.querySelectorAll("pre code");
  if (codeBlocks.length > 0) {
    const code = Array.from(codeBlocks).map(cb => cb.innerText).join("\n\n");
    navigator.clipboard.writeText(code);
    copyCodeBtn.innerText = "✓ Copied";
    setTimeout(() => { copyCodeBtn.innerText = "Copy Code"; }, 1500);
  } else {
    navigator.clipboard.writeText(accumulatedMarkdown);
    copyCodeBtn.innerText = "✓ Copied All";
    setTimeout(() => { copyCodeBtn.innerText = "Copy Code"; }, 1500);
  }
});

// ── Clear Action ──
clearBtn.addEventListener("click", () => {
  accumulatedMarkdown = "";
  renderContent("");
  promptInput.value = "";
  updateHUDStatus("ready");
});

// ── Profile Modal ──
profileBtn.addEventListener("click", async () => {
  const prof = await tauriInvoke("get_profile");
  if (prof) {
    document.getElementById("profYoe").value = prof.years_experience || 3;
    document.getElementById("profLangs").value = (prof.primary_languages || []).join(", ");
    document.getElementById("profRole").value = prof.target_job_description || "";
    document.getElementById("profResume").value = prof.resume_text || "";
  }
  profileModal.classList.add("active");
});

closeProfileBtn.addEventListener("click", () => {
  profileModal.classList.remove("active");
});

saveProfileBtn.addEventListener("click", async () => {
  const prof = {
    years_experience: parseInt(document.getElementById("profYoe").value) || 3,
    primary_languages: document.getElementById("profLangs").value.split(",").map(s => s.trim()),
    target_job_description: document.getElementById("profRole").value.trim(),
    resume_text: document.getElementById("profResume").value.trim()
  };

  await tauriInvoke("save_profile", { profile: prof });
  profileModal.classList.remove("active");
});
