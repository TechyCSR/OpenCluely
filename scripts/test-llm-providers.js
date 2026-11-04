/**
 * Provider routing + request-shaping checks for the Gemini/Muse LLM paths.
 *
 * No test framework, no network: external SDKs are stubbed and the Muse
 * transport is replaced with a capture stub, so this verifies routing,
 * chat-completions request shaping, return/metadata shape, counters,
 * language enforcement, and fallback behavior only.
 *
 * Usage: node scripts/test-llm-providers.js
 */
const Module = require('module');

// ── Stub external modules that are not needed for these checks ──
const noop = () => {};
const winstonStub = {
  format: {
    combine: (...args) => args,
    timestamp: () => ({}),
    errors: () => ({}),
    printf: () => ({}),
    colorize: () => ({}),
    json: () => ({}),
    simple: () => ({})
  },
  transports: { Console: function () {}, File: function () {} },
  createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop })
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'winston') return winstonStub;
  if (request === 'winston-daily-rotate-file') return function () {};
  if (request === '@google/genai') {
    return { GoogleGenAI: class { constructor() { this.models = {}; } } };
  }
  return origLoad.apply(this, arguments);
};

// Start from a clean provider env so defaults are exercised first.
delete process.env.LLM_PROVIDER;
delete process.env.MODEL_API_KEY;
delete process.env.MUSE_MODEL;
delete process.env.GEMINI_API_KEY;
delete process.env.MUSE_BASE_URL;

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const config = require('../src/core/config');
const { MuseProvider, geminiRequestToChatMessages } = require('../src/services/muse.provider');

let passed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed++; console.log(`ok - ${name}`); })
    .catch((error) => {
      console.error(`FAIL - ${name}: ${error.message}`);
      process.exitCode = 1;
    });
}

async function main() {
  // ── Config defaults: Gemini stays the default provider ──
  await check('default provider is gemini', () => {
    assert.strictEqual(config.getLLMProvider(), 'gemini');
  });

  await check('unknown LLM_PROVIDER falls back to gemini', () => {
    process.env.LLM_PROVIDER = 'something-else';
    assert.strictEqual(config.getLLMProvider(), 'gemini');
    delete process.env.LLM_PROVIDER;
  });

  await check('LLM_PROVIDER=muse selects muse', () => {
    process.env.LLM_PROVIDER = 'muse';
    assert.strictEqual(config.getLLMProvider(), 'muse');
  });

  await check('active key follows the provider', () => {
    process.env.MODEL_API_KEY = 'model-key-123';
    process.env.GEMINI_API_KEY = 'gemini-key-456';
    process.env.LLM_PROVIDER = 'muse';
    assert.strictEqual(config.getActiveLLMKey(), 'model-key-123');
    process.env.LLM_PROVIDER = 'gemini';
    assert.strictEqual(config.getActiveLLMKey(), 'gemini-key-456');
    process.env.LLM_PROVIDER = 'muse';
  });

  // ── Request shaping: Gemini request -> chat-completions messages ──
  await check('system instruction becomes a system message', () => {
    const messages = geminiRequestToChatMessages({
      systemInstruction: { parts: [{ text: 'You are a dsa coach.' }] },
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }]
    });
    assert.strictEqual(messages[0].role, 'system');
    assert.strictEqual(messages[0].content, 'You are a dsa coach.');
  });

  await check('model role becomes assistant, text is preserved', () => {
    const messages = geminiRequestToChatMessages({
      contents: [
        { role: 'user', parts: [{ text: 'q1' }] },
        { role: 'model', parts: [{ text: 'a1' }, { text: 'more' }] }
      ]
    });
    assert.deepStrictEqual(messages.map((m) => m.role), ['user', 'assistant']);
    assert.strictEqual(messages[1].content, 'a1\nmore');
  });

  await check('inlineData becomes an image_url data URI part', () => {
    const buf = Buffer.from('fake-png-bytes');
    const messages = geminiRequestToChatMessages({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Analyze this image' },
          { inlineData: { data: buf.toString('base64'), mimeType: 'image/png' } }
        ]
      }]
    });
    const content = messages[0].content;
    assert.ok(Array.isArray(content), 'image message content must be an array');
    const textPart = content.find((p) => p.type === 'text');
    const imagePart = content.find((p) => p.type === 'image_url');
    assert.ok(textPart && textPart.text === 'Analyze this image');
    assert.ok(imagePart, 'missing image_url part');
    assert.strictEqual(imagePart.image_url.url, `data:image/png;base64,${buf.toString('base64')}`);
  });

  // ── Muse provider: generation mapping + body shape ──
  const muse = new MuseProvider();
  await check('generation defaults map to chat-completions fields', () => {
    const defaults = muse.getChatDefaults();
    assert.strictEqual(typeof defaults.temperature, 'number');
    assert.strictEqual(typeof defaults.top_p, 'number');
    assert.strictEqual(typeof defaults.max_tokens, 'number');
    assert.ok(!('topK' in defaults) && !('thinkingConfig' in defaults),
      'Gemini-only fields must not leak into chat-completions');
  });

  await check('request body carries model, messages, and stream flag', () => {
    const body = muse.buildBody([{ role: 'user', content: 'hi' }], { stream: true });
    assert.strictEqual(body.model, 'muse-spark-1.1');
    assert.strictEqual(body.stream, true);
    assert.ok(Array.isArray(body.messages) && body.messages.length === 1);
    const plain = muse.buildBody([{ role: 'user', content: 'hi' }]);
    assert.ok(!('stream' in plain), 'non-streaming body must omit stream flag');
  });

  await check('bearer auth uses MODEL_API_KEY', () => {
    assert.strictEqual(muse.getApiKey(), 'model-key-123');
    assert.ok(muse.isConfigured());
  });

  // ── LLMService routing (Muse transport stubbed, no network) ──
  process.env.LLM_PROVIDER = 'muse';
  process.env.MODEL_API_KEY = 'model-key-123';
  const llmService = require('../src/services/llm.service');
  llmService.initializeClient();
  await check('muse client initializes from MODEL_API_KEY', () => {
    assert.strictEqual(llmService.getProvider(), 'muse');
    assert.strictEqual(llmService.isInitialized, true);
    assert.strictEqual(llmService.getStats().provider, 'muse');
  });

  let captured = null;
  llmService.muse.complete = async (messages) => {
    captured = messages;
    return 'stubbed muse answer ```python\nprint(1)\n```';
  };
  llmService.muse.completeStream = async (messages, onDelta) => {
    captured = messages;
    if (typeof onDelta === 'function') onDelta('chunk-');
    return 'chunk-full';
  };

  const before = llmService.requestCount;
  await check('processTextWithSkill routes to muse with same shape', async () => {
    const result = await llmService.processTextWithSkill('explain quicksort', 'dsa', [], 'python');
    assert.ok(captured.some((m) => m.role === 'system'), 'skill prompt must reach muse as system message');
    assert.ok(captured.some((m) => m.role === 'user'), 'user message must reach muse');
    assert.strictEqual(typeof result.response, 'string');
    assert.ok(result.response.includes('```python'), 'language enforcement must rewrite fences');
    assert.strictEqual(result.metadata.skill, 'dsa');
    assert.strictEqual(result.metadata.provider, 'muse');
    assert.strictEqual(result.metadata.usedFallback, false);
    assert.strictEqual(llmService.requestCount, before + 1);
  });

  await check('processTextWithSkillStream emits deltas', async () => {
    const deltas = [];
    const result = await llmService.processTextWithSkillStream('hi', 'dsa', [], null, (d) => deltas.push(d));
    assert.deepStrictEqual(deltas, ['chunk-']);
    assert.strictEqual(result.response, 'chunk-full');
    assert.strictEqual(result.metadata.streamed, true);
    assert.strictEqual(result.metadata.provider, 'muse');
  });

  await check('processImageWithSkill sends image_url content', async () => {
    const result = await llmService.processImageWithMuse(Buffer.from('img'), 'image/png', 'dsa', [], null);
    const userMsg = captured.find((m) => m.role === 'user');
    assert.ok(Array.isArray(userMsg.content), 'image message must use array content');
    assert.ok(userMsg.content.some((p) => p.type === 'image_url'
      && p.image_url.url.startsWith('data:image/png;base64,')), 'missing image_url data URI');
    assert.strictEqual(result.metadata.isImageAnalysis, true);
    assert.strictEqual(result.metadata.mimeType, 'image/png');
  });

  await check('processImageWithSkillStream falls back to non-streaming', async () => {
    llmService.muse.completeStream = async () => { throw new Error('sse down'); };
    const result = await llmService.processImageWithSkillStream(Buffer.from('img'), 'image/png', 'dsa', [], null);
    assert.ok(result.response.includes('stubbed muse answer'));
    assert.strictEqual(result.metadata.isImageAnalysis, true);
  });

  await check('transcription path routes to muse', async () => {
    llmService.muse.completeStream = async (messages, onDelta) => {
      captured = messages;
      if (typeof onDelta === 'function') onDelta('chunk-');
      return 'chunk-full';
    };
    const result = await llmService.processTranscriptionWithIntelligentResponse('what is a closure?', 'dsa');
    assert.ok(result.response.length > 0);
    assert.strictEqual(result.metadata.isTranscriptionResponse, true);
    assert.strictEqual(result.metadata.provider, 'muse');
    const streamed = await llmService.processTranscriptionWithIntelligentResponseStream(
      'what is a closure?', 'dsa', [], null, () => {});
    assert.strictEqual(streamed.metadata.streamed, true);
  });

  await check('muse failure increments errorCount and uses fallback', async () => {
    const errorsBefore = llmService.errorCount;
    llmService.muse.complete = async () => { throw new Error('boom'); };
    const result = await llmService.processTextWithSkill('hi', 'dsa');
    assert.strictEqual(result.metadata.usedFallback, true);
    assert.strictEqual(llmService.errorCount, errorsBefore + 1);
  });

  await check('gemini path is untouched when provider is gemini', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.MODEL_API_KEY;
    delete process.env.GEMINI_API_KEY;
    llmService.initializeClient();
    assert.strictEqual(llmService.getProvider(), 'gemini');
    assert.strictEqual(llmService.isInitialized, false);
    await assert.rejects(
      llmService.processTextWithSkill('hi', 'dsa'),
      /Check Gemini API key configuration/
    );
  });

  // ── First-run: only the active provider's key gates onboarding ──
  const FirstRunManager = require('../src/core/first-run');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-llm-'));
  const writeEnv = (text) => fs.writeFileSync(path.join(tmp, '.env'), text);
  const sentinel = path.join(tmp, '.sentinel');
  const mgr = new FirstRunManager({ cwd: tmp, envPath: path.join(tmp, '.env'), sentinelPath: sentinel });
  fs.writeFileSync(sentinel, 'x');

  await check('gemini default still requires GEMINI_API_KEY', () => {
    writeEnv('LLM_PROVIDER=gemini\nGEMINI_API_KEY=your_gemini_api_key_here\n');
    assert.strictEqual(mgr.needsOnboarding(), true);
    writeEnv('GEMINI_API_KEY=real-key\n');
    assert.strictEqual(mgr.needsOnboarding(), false);
  });

  await check('muse provider requires MODEL_API_KEY, not GEMINI_API_KEY', () => {
    writeEnv('LLM_PROVIDER=muse\nGEMINI_API_KEY=real-key\n');
    assert.strictEqual(mgr.needsOnboarding(), true);
    writeEnv('LLM_PROVIDER=muse\nMODEL_API_KEY=real-model-key\n');
    assert.strictEqual(mgr.needsOnboarding(), false);
    const status = mgr.getStatus();
    assert.strictEqual(status.llmProvider, 'muse');
    assert.strictEqual(status.modelConfigured, true);
  });

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
