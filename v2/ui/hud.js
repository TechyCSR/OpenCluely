/**
 * OpenCluely v2 Ghost HUD Client Script
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

// ── Streaming IPC Listeners ──
if (window.v2Api) {
  window.v2Api.onChunk((chunk) => {
    if (!isStreaming) {
      isStreaming = true;
      accumulatedMarkdown = "";
      updateHUDStatus("thinking");
    }
    accumulatedMarkdown += chunk;
    renderContent(accumulatedMarkdown);
  });

  window.v2Api.onDone((fullText) => {
    isStreaming = false;
    updateHUDStatus("ready");
    if (fullText) {
      accumulatedMarkdown = fullText;
      renderContent(accumulatedMarkdown);
    }
  });

  window.v2Api.onError((err) => {
    isStreaming = false;
    updateHUDStatus("ready");
    const errMsg = (err && err.message) || String(err);
    responseBody.innerHTML += `<div style="color: #ef4444; margin-top: 10px;">⚠️ Error: ${errMsg}</div>`;
  });

  window.v2Api.onAudioTranscript((data) => {
    if (data && data.text) {
      promptInput.value = data.text;
      // Auto-trigger solve if question looks complete
      if (data.isFinal || data.text.length > 20) {
        triggerSolve(data.text);
      }
    }
  });

  window.v2Api.onStatusChange((status) => {
    if (status.clickthrough !== undefined) {
      isClickthrough = status.clickthrough;
      clickthroughBtn.classList.toggle("active", isClickthrough);
    }
  });

  window.v2Api.onShortcutTrigger((action) => {
    if (action === "snip") {
      triggerSnip();
    } else if (action === "autotype") {
      triggerAutoType();
    } else if (action === "panic") {
      triggerPanic();
    }
  });
}

// ── Solve Action ──
async function triggerSolve(customPrompt = null, imageBase64 = null) {
  const text = customPrompt !== null ? customPrompt : promptInput.value.trim();
  if (!text && !imageBase64) return;

  accumulatedMarkdown = "";
  renderContent("🧠 Solving problem with AI...");
  updateHUDStatus("thinking");

  if (window.v2Api) {
    try {
      await window.v2Api.sendPrompt({
        prompt: text || "Analyze this code/problem on screen and provide the optimal solution.",
        skill: activeSkill,
        language: activeLanguage,
        imageBase64: imageBase64
      });
    } catch (e) {
      renderContent(`⚠️ Error: ${e.message}`);
      updateHUDStatus("ready");
    }
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
  if (!window.v2Api) return;
  updateHUDStatus("thinking");
  responseBody.innerHTML = '<p style="color: #a5b4fc;">📸 Capturing screen & analyzing...</p>';

  try {
    const res = await window.v2Api.captureAndSolve({
      skill: activeSkill,
      language: activeLanguage,
      prompt: promptInput.value.trim() || "Identify the interview problem, state optimal approach, and write complete code."
    });
  } catch (err) {
    renderContent(`⚠️ Snip Error: ${err.message}`);
    updateHUDStatus("ready");
  }
}
snipBtn.addEventListener("click", triggerSnip);

// ── Auto-Type Action ──
async function triggerAutoType() {
  if (!accumulatedMarkdown) return;
  if (!window.v2Api) return;

  autoTypeBtn.classList.add("active");
  try {
    await window.v2Api.autoType(accumulatedMarkdown);
  } finally {
    autoTypeBtn.classList.remove("active");
  }
}
autoTypeBtn.addEventListener("click", triggerAutoType);

// ── Clickthrough Action ──
clickthroughBtn.addEventListener("click", async () => {
  if (!window.v2Api) return;
  const res = await window.v2Api.toggleClickthrough();
  isClickthrough = res.clickthrough;
  clickthroughBtn.classList.toggle("active", isClickthrough);
});

// ── Panic Action ──
function triggerPanic() {
  updateHUDStatus("panic");
  if (window.v2Api) {
    window.v2Api.panic();
  }
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

// ── Audio / Mic Toggle ──
micBtn.addEventListener("click", async () => {
  isListening = !isListening;
  micBtn.classList.toggle("active", isListening);
  micLabel.innerText = isListening ? "Listening" : "Mic";

  if (isListening) {
    updateHUDStatus("listening");
    if (window.v2Api) window.v2Api.startAudio();
    startBrowserAudioCapture();
  } else {
    updateHUDStatus("ready");
    if (window.v2Api) window.v2Api.stopAudio();
    stopBrowserAudioCapture();
  }
});

// Browser Web Speech fallback / Audio Worklet
let recognition = null;
function startBrowserAudioCapture() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim() && window.v2Api) {
          window.v2Api.feedAudioTranscript({
            text: transcript,
            channel: "interviewer",
            isFinal: event.results[event.results.length - 1].isFinal
          });
        }
      };

      recognition.onerror = () => {};
      recognition.start();
    } catch (_) {}
  }
}

function stopBrowserAudioCapture() {
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
}

// ── Personalization Profile Modal ──
profileBtn.addEventListener("click", async () => {
  if (window.v2Api) {
    const prof = await window.v2Api.getProfile();
    if (prof) {
      document.getElementById("profYoe").value = prof.yearsExperience || 3;
      document.getElementById("profLangs").value = (prof.primaryLanguages || []).join(", ");
      document.getElementById("profRole").value = prof.targetJobDescription || "";
      document.getElementById("profResume").value = prof.resumeText || "";
    }
  }
  profileModal.classList.add("active");
});

closeProfileBtn.addEventListener("click", () => {
  profileModal.classList.remove("active");
});

saveProfileBtn.addEventListener("click", async () => {
  const prof = {
    yearsExperience: parseInt(document.getElementById("profYoe").value) || 3,
    primaryLanguages: document.getElementById("profLangs").value.split(",").map(s => s.trim()),
    targetJobDescription: document.getElementById("profRole").value.trim(),
    resumeText: document.getElementById("profResume").value.trim()
  };

  if (window.v2Api) {
    await window.v2Api.saveProfile(prof);
  }
  profileModal.classList.remove("active");
});
