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
assert(speechServiceContent.includes('return 280; // Fast end-of-speech flush'), 'SpeechService must have 280ms silence hangover');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
assert(mainJsContent.includes('isQuestionMark ? 150 : (isOtherPunctuation ? 220 : 350)'), 'main.js must have 150ms question debounce');

const workerPyPath = path.join(__dirname, '..', 'scripts', 'whisper_worker.py');
const workerPyContent = fs.readFileSync(workerPyPath, 'utf8');
assert(workerPyContent.includes('beam_size=1'), 'whisper_worker.py must use greedy beam_size=1 decoding');

const promptMdPath = path.join(__dirname, '..', 'prompts', 'interview.md');
const promptMdContent = fs.readFileSync(promptMdPath, 'utf8');
assert(promptMdContent.includes('SENTENCE-TO-SAY WISE — STRICTLY NO BULLET POINTS'), 'interview.md must enforce sentence-to-say without bullets');

const llmServicePath = path.join(__dirname, '..', 'src', 'services', 'llm.service.js');
const llmServiceContent = fs.readFileSync(llmServicePath, 'utf8');
assert(llmServiceContent.includes('SENTENCE-TO-SAY WISE: Strictly NO bullet points'), 'llm.service.js must enforce sentence-to-say without bullets');

// 7. Verify Parallel Speculative Pipeline, Multi-Turn Question Merging, and Non-Wiping UI
console.log('7. Checking Parallel Speculative Pipeline & Non-Wiping Multi-Turn UI...');
assert(mainJsContent.includes('this._speculativeGraceMs = 3200'), 'main.js must define speculative continuation grace window');
assert(mainJsContent.includes('_mergeQuestionFragments'), 'main.js must define _mergeQuestionFragments helper');
assert(mainJsContent.includes('sessionManager.replaceLastUserInput'), 'main.js must replace last user input on merged question');

const sessionManagerPath = path.join(__dirname, '..', 'src', 'managers', 'session.manager.js');
const sessionManagerContent = fs.readFileSync(sessionManagerPath, 'utf8');
assert(sessionManagerContent.includes('replaceLastUserInput(text)'), 'session.manager.js must implement replaceLastUserInput');
assert(sessionManagerContent.includes('replaceOrRemoveLastModelResponse'), 'session.manager.js must implement replaceOrRemoveLastModelResponse');

const llmResponseHtmlPath = path.join(__dirname, '..', 'llm-response.html');
const llmResponseHtmlContent = fs.readFileSync(llmResponseHtmlPath, 'utf8');
assert(llmResponseHtmlContent.includes('isMergedUpdate && answerHistory.length > 0'), 'llm-response.html must rewrite active answer in-place on merged update');
assert(llmResponseHtmlContent.includes('if (hasVisibleAnswer && !forceOverlay)'), 'llm-response.html must not wipe or obscure visible answer with loading backdrop');

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

// 8. Verify Zero-EC2 Truth, Serverless Neon DB, and Low-Latency Whisper Config
console.log('8. Checking Zero-EC2 Truth, Serverless Neon DB, and Speech Service Latency...');
const configJsPath = path.join(__dirname, '..', 'src', 'core', 'config.js');
const configJsContent = fs.readFileSync(configJsPath, 'utf8');
assert(configJsContent.includes("model: 'base'"), 'config.js must set whisper model to base');
assert(configJsContent.includes("language: 'en'"), 'config.js must set whisper language to en to skip multi-lingual detection');
assert(configJsContent.includes('silenceHangoverMs: 280'), 'config.js must set silenceHangoverMs to 280ms');
assert(configJsContent.includes('maxUtteranceMs: 7500'), 'config.js must set maxUtteranceMs to 7500ms');

assert(speechServiceContent.includes("this.emit('status', 'Processing speech…')"), 'speech.service.js must emit processing status upon pause and flush');

assert(!promptMdContent.includes('AWS (S3, EC2)'), 'interview.md must NOT mention AWS EC2');
assert(!promptMdContent.includes('EC2 virtual machines are used'), 'interview.md must NOT claim EC2 virtual machines');
assert(promptMdContent.includes('Serverless PostgreSQL (Neon DB)'), 'interview.md must specify Serverless PostgreSQL on Neon DB');
assert(promptMdContent.includes('Where is your backend hosted?'), 'interview.md must include explicit backend hosting question');

console.log('✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
