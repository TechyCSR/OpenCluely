const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('ANTIGRAVITY');

class AntigravityService {
  constructor() {
    this.command = '';
    this.model = '';
    this.timeoutMs = 120000;
    this.refreshConfig();
  }

  refreshConfig() {
    this.command = process.env.ANTIGRAVITY_COMMAND ||
      path.join(os.homedir(), '.local', 'bin', 'agy');
    this.model = process.env.ANTIGRAVITY_MODEL || 'Gemini 3.1 Pro (Low)';
    this.timeoutMs = Number(process.env.ANTIGRAVITY_TIMEOUT_MS) || 120000;
  }

  isAvailable() {
    this.refreshConfig();
    return path.isAbsolute(this.command)
      ? fs.existsSync(this.command)
      : true;
  }

  requestToPrompt(request) {
    const sections = [
      'Answer the user directly. Do not modify files or run shell commands.',
      'Only use a file-viewing tool when an image path is explicitly supplied.'
    ];

    const systemText = (request?.systemInstruction?.parts || [])
      .map(part => part?.text || '')
      .filter(Boolean)
      .join('\n');
    if (systemText) {
      sections.push(`SYSTEM INSTRUCTIONS:\n${systemText}`);
    }

    for (const content of request?.contents || []) {
      const role = content?.role === 'model' ? 'ASSISTANT' : 'USER';
      const text = (content?.parts || [])
        .map(part => part?.text || '')
        .filter(Boolean)
        .join('\n');
      if (text) {
        sections.push(`${role}:\n${text}`);
      }
    }

    return sections.join('\n\n');
  }

  async generateFromRequest(request, onDelta = null) {
    return this.generate(this.requestToPrompt(request), onDelta);
  }

  async generateWithImage({
    imageBuffer,
    mimeType = 'image/png',
    instruction,
    systemInstruction = '',
    onDelta = null
  }) {
    const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    const cacheDir = path.join(process.cwd(), '.opencluely-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const imagePath = path.join(cacheDir, `capture-${process.pid}-${Date.now()}.${extension}`);
    fs.writeFileSync(imagePath, imageBuffer);

    const prompt = [
      'Answer the user directly. Do not modify files or run shell commands.',
      systemInstruction ? `SYSTEM INSTRUCTIONS:\n${systemInstruction}` : '',
      `Use the file-viewing tool to inspect this image: ${imagePath}`,
      `USER:\n${instruction}`
    ].filter(Boolean).join('\n\n');

    try {
      return await this.generate(prompt, onDelta);
    } finally {
      fs.promises.unlink(imagePath).catch(() => {});
    }
  }

  generate(prompt, onDelta = null) {
    this.refreshConfig();
    if (!this.isAvailable()) {
      return Promise.reject(new Error(`Antigravity CLI not found at ${this.command}`));
    }

    const timeoutSeconds = Math.max(30, Math.ceil(this.timeoutMs / 1000));
    const args = [
      '--sandbox',
      '--model', this.model,
      '--output-format', 'stream-json',
      '--print-timeout', `${timeoutSeconds}s`,
      '-p', prompt
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: [
            path.dirname(this.command),
            process.env.PATH || ''
          ].filter(Boolean).join(path.delimiter)
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutBuffer = '';
      let stderr = '';
      let finalResponse = '';
      let streamedText = '';
      let settled = false;
      let timer = null;

      const finish = (error, response = '') => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (error) reject(error);
        else resolve(response.trim());
      };

      const processLine = (line) => {
        if (!line.trim()) return;
        let event;
        try {
          event = JSON.parse(line);
        } catch (_) {
          return;
        }

        const delta = event?.step_update?.text_delta;
        if (typeof delta === 'string' && delta) {
          streamedText += delta;
          if (typeof onDelta === 'function') onDelta(delta);
        }

        if (event?.event === 'result') {
          if (event.result?.status && event.result.status !== 'SUCCESS') {
            finish(new Error(event.result?.error || `Antigravity returned ${event.result.status}`));
            return;
          }
          finalResponse = event.result?.response || streamedText;
        }
      };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        lines.forEach(processLine);
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => {
        stderr += chunk;
        if (stderr.length > 12000) stderr = stderr.slice(-12000);
      });

      child.on('error', error => finish(error));
      child.on('close', code => {
        if (stdoutBuffer) processLine(stdoutBuffer);
        if (code !== 0) {
          finish(new Error(`Antigravity CLI exited with code ${code}: ${stderr.trim() || 'no error output'}`));
          return;
        }
        const response = finalResponse || streamedText;
        if (!response.trim()) {
          finish(new Error(`Antigravity returned an empty response${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
          return;
        }
        finish(null, response);
      });

      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(new Error(`Antigravity request timed out after ${timeoutSeconds}s`));
      }, this.timeoutMs);

      logger.info('Antigravity request started', {
        model: this.model,
        promptLength: prompt.length
      });
    });
  }
}

module.exports = new AntigravityService();
