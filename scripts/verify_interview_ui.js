const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING INTERVIEW UI & DWELL VERIFICATION ---');

const htmlPath = path.join(__dirname, '..', 'llm-response.html');
assert(fs.existsSync(htmlPath), 'llm-response.html must exist');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify CSS rules for Arrow scaling (Strictly NO SCALE)
console.log('1. Checking No Scale rules...');
const navBtnRuleMatch = htmlContent.match(/\.nav-arrow-btn\s*\{[^}]+\}/s);
assert(navBtnRuleMatch, '.nav-arrow-btn CSS rule must exist');
assert(navBtnRuleMatch[0].includes('transform: none !important'), '.nav-arrow-btn must have transform: none !important');

const navBtnHoverMatch = htmlContent.match(/\.nav-arrow-btn:not\(\.disabled\):hover\s*\{[^}]+\}/s);
assert(navBtnHoverMatch, '.nav-arrow-btn hover CSS rule must exist');
assert(navBtnHoverMatch[0].includes('transform: none !important'), '.nav-arrow-btn:hover must strictly have transform: none !important (no scale)');
assert(!navBtnHoverMatch[0].includes('scale'), '.nav-arrow-btn:hover must NOT contain scale');

// 2. Verify Dwell progress bar element and CSS
console.log('2. Checking Dwell progress bar...');
assert(htmlContent.includes('<span class="nav-dwell-progress"></span>'), 'HTML must contain nav-dwell-progress elements');
const dwellProgressCss = htmlContent.match(/\.nav-arrow-btn\s+\.nav-dwell-progress\s*\{[^}]+\}/s);
assert(dwellProgressCss, '.nav-dwell-progress CSS rule must exist');
assert(dwellProgressCss[0].includes('position: absolute'), 'Progress must be absolute positioned');

// 3. Verify Layout and Spacing CSS
console.log('3. Checking Layout & Spacing improvements...');
const scrollWrapperCss = htmlContent.match(/\.interview-scroll-wrapper\s*\{[^}]+\}/s);
assert(scrollWrapperCss, '.interview-scroll-wrapper must exist');
assert(scrollWrapperCss[0].includes('overflow: hidden !important'), 'Strict zero scroll must be enforced');
assert(scrollWrapperCss[0].includes('padding: 14px 22px 16px 22px;'), 'Padding must be 14px 22px 16px 22px');

const interviewFlowCss = htmlContent.match(/\.interview-flow\s*\{[^}]+\}/s);
assert(interviewFlowCss, '.interview-flow must exist');
assert(interviewFlowCss[0].includes('gap: 13px;'), 'Flow gap must be 13px');

const introCss = htmlContent.match(/\.intro-spoken-text\s*\{[^}]+\}/s);
assert(introCss, '.intro-spoken-text must exist');
assert(introCss[0].includes('border-left: 3px solid #10b981;'), 'Intro spoken text must have 3px emerald left accent border');

const takeawayCardCss = htmlContent.match(/\.takeaway-card\s*\{[^}]+\}/s);
assert(takeawayCardCss, '.takeaway-card must exist');
assert(takeawayCardCss[0].includes('background: rgba(16, 185, 129, 0.08);'), 'Takeaway card must have soft background highlight');
assert(takeawayCardCss[0].includes('border: 1px solid rgba(16, 185, 129, 0.24);'), 'Takeaway card must have border highlight');

// 4. Verify attachNavDwell logic and 1000ms hover dwell auto-click
console.log('4. Checking attachNavDwell implementation...');
assert(htmlContent.includes('function attachNavDwell(btn, delta)'), 'attachNavDwell function must exist');
assert(htmlContent.includes('width 1000ms linear'), 'Dwell progress transition must be 1000ms linear');
assert(htmlContent.includes('setTimeout(') && htmlContent.includes('1000);'), 'setTimeout must be 1000ms for dwell auto-click');
assert(htmlContent.includes('attachNavDwell(prevBtn, -1);'), 'Previous button must be attached with delta -1');
assert(htmlContent.includes('attachNavDwell(nextBtn, 1);'), 'Next button must be attached with delta 1');

// 5. Test mock execution of attachNavDwell
console.log('5. Simulating mock event lifecycle for attachNavDwell...');
class MockElement {
    constructor() {
        this.classes = new Set();
        this.classList = {
            add: (c) => this.classes.add(c),
            remove: (c) => this.classes.delete(c),
            contains: (c) => this.classes.has(c)
        };
        this.style = {};
        this.listeners = {};
        this.progressChild = null;
    }
    querySelector(sel) {
        if (sel === '.nav-dwell-progress') return this.progressChild;
        return null;
    }
    addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
    }
    trigger(evt, eventObj = {}) {
        if (this.listeners[evt]) {
            for (const fn of this.listeners[evt]) fn(eventObj);
        }
    }
}

// Extract attachNavDwell and test in isolated context
const fnCode = htmlContent.match(/function attachNavDwell\(btn, delta\)\s*\{[\s\S]*?\n        \}/)[0];
let navigatedDelta = null;
function navigateHistory(delta) {
    navigatedDelta = delta;
}

// Build clean testable function
const testFn = new Function('navigateHistory', `
    ${fnCode}
    return attachNavDwell;
`)(navigateHistory);

// Create mock button
const mockBtn = new MockElement();
mockBtn.classList = {
    classes: new Set(),
    add(c) { this.classes.add(c); },
    remove(c) { this.classes.delete(c); },
    contains(c) { return this.classes.has(c); }
};
const mockProgress = { style: {} };
mockBtn.progressChild = mockProgress;

testFn(mockBtn, 1);

// Test A: Mouseenter + mouseleave before 1s (cancels dwell)
mockBtn.trigger('mouseenter');
assert(mockBtn.classList.contains('dwelling'), 'Must add dwelling class on mouseenter');
assert.strictEqual(mockProgress.style.width, '100%', 'Must set progress width to 100%');
mockBtn.trigger('mouseleave');
assert(!mockBtn.classList.contains('dwelling'), 'Must remove dwelling class on mouseleave');
assert.strictEqual(mockProgress.style.width, '0%', 'Must reset progress width to 0%');
assert.strictEqual(navigatedDelta, null, 'Must NOT navigate if left before 1s');

// Test B: Mouseenter and dwell completes at 1s
let timerFired = false;
const origSetTimeout = global.setTimeout;
let capturedCallback = null;
let capturedDelay = null;
global.setTimeout = (cb, delay) => {
    capturedCallback = cb;
    capturedDelay = delay;
    return 12345;
};

mockBtn.trigger('mouseenter');
assert.strictEqual(capturedDelay, 1000, 'Dwell timer delay must be exactly 1000ms');
capturedCallback(); // Fire 1-second timeout
assert.strictEqual(navigatedDelta, 1, 'Must have auto-clicked and called navigateHistory(1) after 1s');
assert(!mockBtn.classList.contains('dwelling'), 'Must remove dwelling class after auto-click');

// Test C: Direct manual click
navigatedDelta = null;
mockBtn.trigger('click', { stopPropagation: () => {} });
assert.strictEqual(navigatedDelta, 1, 'Direct click must navigate immediately');

// Restore setTimeout
global.setTimeout = origSetTimeout;

// 6. Verify Speech Hangover, Coalesce Latencies, and Interview Prompt Templates
console.log('6. Checking Low-Latency Speech & Sentence-to-Say Prompts...');
const speechServicePath = path.join(__dirname, '..', 'src', 'services', 'speech.service.js');
const speechServiceContent = fs.readFileSync(speechServicePath, 'utf8');
assert(speechServiceContent.includes('return 480;'), 'SpeechService must have 480ms natural pause silence hangover');
assert(speechServiceContent.includes('warmup()'), 'SpeechService must implement warmup()');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
assert(mainJsContent.includes('isQuestionMark ? 500 : (isOtherPunctuation ? 550 : 600)'), 'main.js must have 500ms conversational question debounce');

const workerPyPath = path.join(__dirname, '..', 'scripts', 'whisper_worker.py');
const workerPyContent = fs.readFileSync(workerPyPath, 'utf8');
assert(workerPyContent.includes('beam_size=1'), 'whisper_worker.py must use greedy beam_size=1 decoding');

const promptMdPath = path.join(__dirname, '..', 'prompts', 'interview.md');
const promptMdContent = fs.readFileSync(promptMdPath, 'utf8');
assert(promptMdContent.includes('SENTENCE-TO-SAY WISE — STRICTLY'), 'interview.md must enforce sentence-to-say without bullets');

const llmServicePath = path.join(__dirname, '..', 'src', 'services', 'llm.service.js');
const llmServiceContent = fs.readFileSync(llmServicePath, 'utf8');
assert(llmServiceContent.includes('SENTENCE-TO-SAY WISE: Strictly NO bullet points'), 'llm.service.js must enforce sentence-to-say without bullets');

// 7. Verify Parallel Speculative Pipeline, Multi-Turn Question Merging, and Non-Wiping UI
console.log('7. Checking Parallel Speculative Pipeline & Non-Wiping Multi-Turn UI...');
const llmResponseHtmlPath = path.join(__dirname, '..', 'llm-response.html');
const llmResponseHtmlContent = fs.readFileSync(llmResponseHtmlPath, 'utf8');
assert(mainJsContent.includes('this._speculativeGraceMs = 3000'), 'main.js must define 3.0s speculative continuation grace window');
assert(llmResponseHtmlContent.includes('loadingWatchdogTimer = setTimeout'), 'llm-response.html must have failsafe watchdog preventing stuck processing state');
assert(mainJsContent.includes('_mergeQuestionFragments'), 'main.js must define _mergeQuestionFragments helper');
assert(mainJsContent.includes('sessionManager.replaceLastUserInput'), 'main.js must replace last user input on merged question');

const sessionManagerPath = path.join(__dirname, '..', 'src', 'managers', 'session.manager.js');
const sessionManagerContent = fs.readFileSync(sessionManagerPath, 'utf8');
assert(sessionManagerContent.includes('replaceLastUserInput(text)'), 'session.manager.js must implement replaceLastUserInput');
assert(sessionManagerContent.includes('replaceOrRemoveLastModelResponse'), 'session.manager.js must implement replaceOrRemoveLastModelResponse');

assert(llmResponseHtmlContent.includes('isMergedUpdate && answerHistory.length > 0'), 'llm-response.html must rewrite active answer in-place on merged update');
assert(llmResponseHtmlContent.includes('if (hasVisibleAnswer && !forceOverlay)'), 'llm-response.html must not wipe or obscure visible answer with loading backdrop');
assert(llmResponseHtmlContent.includes('if (!isStreaming)'), 'llm-response.html must guard window resizing during active streaming to prevent jitter');

// Test merge question logic extracted from main.js
const mergeQuestionMatch = mainJsContent.match(/_mergeQuestionFragments\(part1, part2\) \{([\s\S]*?)\n  \}/);
assert(mergeQuestionMatch, 'Must find _mergeQuestionFragments function body');
const mergeFn = new Function('part1', 'part2', mergeQuestionMatch[1]);

const testMerge1 = mergeFn('What is Docker containerization?', 'and how does it differ from a virtual machine?');
assert.strictEqual(testMerge1, 'What is Docker containerization and how does it differ from a virtual machine?', 'Merge must strip trailing question mark when followed by conjunction clause');

const testMerge2 = mergeFn('Can you explain indexing in PostgreSQL?', 'specifically B-tree and GiST?');
assert.strictEqual(testMerge2, 'Can you explain indexing in PostgreSQL specifically B-tree and GiST?', 'Merge must strip trailing punctuation when followed by lowercase or continuation clause');

const testMerge3 = mergeFn('What is microservices?', 'Can you give a production example?');
assert.strictEqual(testMerge3, 'What is microservices? Can you give a production example?', 'Merge must keep question mark between two independent full sentences');

// 8. Verify Stuck-State Protection & Warmup Queue Non-Blocking
console.log('8. Checking Stuck-State Protection & Warmup Non-Blocking...');
assert(llmResponseHtmlContent.includes('speechProcessingWatchdogTimer'), 'llm-response.html must have speechProcessingWatchdogTimer');
assert(speechServiceContent.includes("this.emit('status', 'Waiting for speech…')"), 'speech.service.js must reset status in finally');
assert(speechServiceContent.includes('configured (userData resolved)'), 'speech.service.js must resolve relative commands to absolute userData paths');
assert(workerPyContent.includes('already_warm'), 'whisper_worker.py must return immediately if model is already warm in RAM');

// 9. Verify Lowered Typing Speed & Settings Configuration
console.log('9. Checking Lowered Typing Speed & Settings Configuration...');
const settingsHtmlPath = path.join(__dirname, '..', 'settings.html');
const settingsHtmlContent = fs.readFileSync(settingsHtmlPath, 'utf8');
assert(settingsHtmlContent.includes('id="typingSpeed"'), 'settings.html must contain typingSpeed select');
assert(settingsHtmlContent.includes('id="typingMinWpm"'), 'settings.html must contain typingMinWpm input');
assert(settingsHtmlContent.includes('id="typingMaxWpm"'), 'settings.html must contain typingMaxWpm input');
assert(settingsHtmlContent.includes('value="natural" selected'), 'settings.html must default typingSpeed to natural (50-70 WPM)');

const settingsJsPath = path.join(__dirname, '..', 'src', 'ui', 'settings-window.js');
const settingsJsContent = fs.readFileSync(settingsJsPath, 'utf8');
assert(settingsJsContent.includes("document.getElementById('typingSpeed')"), 'settings-window.js must bind typingSpeed');
assert(settingsJsContent.includes('settings.typingSpeed = typingSpeedSelect.value'), 'settings-window.js must save typingSpeed');

const autotypeService = require('../src/services/autotype.service');
const defaultRange = autotypeService.getWpmRange();
assert(defaultRange.minWpm === 50 && defaultRange.maxWpm === 70, `Default typing speed must be lowered to 50-70 WPM (actual: ${defaultRange.minWpm}-${defaultRange.maxWpm})`);
const slowRange = autotypeService.getWpmRange({ speed: 'slow' });
assert(slowRange.minWpm === 35 && slowRange.maxWpm === 50, 'Slow preset must be 35-50 WPM');

assert(mainJsContent.includes('this.typingSpeed = process.env.AUTOTYPE_SPEED || "natural"'), 'main.js must initialize typingSpeed default');
assert(mainJsContent.includes('envUpdates.AUTOTYPE_SPEED = this.typingSpeed'), 'main.js must persist AUTOTYPE_SPEED to env');

// 10. Verify Python Default, Never Java, Optimal DSA, 1s Snippet Copy Dwell, and Snippet-First Rendering
console.log('10. Checking Python Default, Optimal DSA Rules & 1s Snippet Copy...');
assert(mainJsContent.includes('this.codingLanguage = "python"'), 'main.js must initialize codingLanguage default to python');
assert(promptMdContent.includes('ALWAYS USE PYTHON'), 'prompts/interview.md must enforce Python default');
assert(promptMdContent.includes('NEVER USE JAVA'), 'prompts/interview.md must enforce Never Java');
assert(promptMdContent.includes('STRICTLY ZERO COMMENTS'), 'prompts/interview.md must enforce comment-free snippets');
assert(llmServiceContent.includes('ALWAYS USE PYTHON. NEVER USE JAVA'), 'llm.service.js must enforce Python default and ban Java');
assert(llmResponseHtmlContent.includes('const DWELL_MS = 1000;'), 'llm-response.html must define 1000ms hover dwell auto-copy for code snippets');
assert(llmResponseHtmlContent.includes('// 1. Render Code Blocks FIRST with 1s Hover Copy Button'), 'llm-response.html must render code blocks first before explanation notes');

const promptLoaderPath = path.join(__dirname, '..', 'prompt-loader.js');
const promptLoaderContent = fs.readFileSync(promptLoaderPath, 'utf8');
assert(promptLoaderContent.includes("let norm = (programmingLanguage || 'python').toLowerCase();"), 'prompt-loader.js must default programmingLanguage to python');
assert(promptLoaderContent.includes('NEVER use Java'), 'prompt-loader.js must instruct to never use Java');

console.log('✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
