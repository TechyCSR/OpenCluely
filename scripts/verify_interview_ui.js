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
assert(mainJsContent.includes('isQuestionMark ? 220 : (isOtherPunctuation ? 300 : 420)'), 'main.js must have 220ms question debounce');

const promptMdPath = path.join(__dirname, '..', 'prompts', 'interview.md');
const promptMdContent = fs.readFileSync(promptMdPath, 'utf8');
assert(promptMdContent.includes('SENTENCE-TO-SAY WISE — STRICTLY NO BULLET POINTS'), 'interview.md must enforce sentence-to-say without bullets');

const llmServicePath = path.join(__dirname, '..', 'src', 'services', 'llm.service.js');
const llmServiceContent = fs.readFileSync(llmServicePath, 'utf8');
assert(llmServiceContent.includes('SENTENCE-TO-SAY WISE: Strictly NO bullet points'), 'llm.service.js must enforce sentence-to-say without bullets');

console.log('✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
