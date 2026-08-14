const fs = require('fs');
const path = require('path');
const os = require('os');

const RESUME_PATH = path.join(os.homedir(), '.OpenCluely', 'resume.json');
const MAX_SNIPPET_WORDS = 150;

class ResumeService {
  constructor() {
    this._cache = null; // { text, wordCount, savedAt }
  }

  // ── Disk I/O ──────────────────────────────────────────────────────────────

  loadResume() {
    if (this._cache) return this._cache;
    try {
      if (!fs.existsSync(RESUME_PATH)) return null;
      const raw = fs.readFileSync(RESUME_PATH, 'utf8');
      this._cache = JSON.parse(raw);
      return this._cache;
    } catch (_) {
      return null;
    }
  }

  saveResume(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Resume text is empty.');
    }
    const cleaned = text.trim();
    const wordCount = cleaned.split(/\s+/).length;
    const savedAt = new Date().toISOString();
    const record = { text: cleaned, wordCount, savedAt };

    const dir = path.dirname(RESUME_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RESUME_PATH, JSON.stringify(record), 'utf8');
    this._cache = record;
    return { wordCount, savedAt };
  }

  deleteResume() {
    this._cache = null;
    if (fs.existsSync(RESUME_PATH)) fs.unlinkSync(RESUME_PATH);
    return { deleted: true };
  }

  getMeta() {
    const resume = this.loadResume();
    if (!resume) return null;
    return { hasResume: true, wordCount: resume.wordCount, savedAt: resume.savedAt };
  }

  // ── Relevance extraction ──────────────────────────────────────────────────
  // Splits resume into lines, scores each by keyword overlap with the question,
  // returns top-scoring lines up to MAX_SNIPPET_WORDS total. Returns "" if
  // no resume is loaded or no overlap found.

  getRelevantSnippet(question) {
    const resume = this.loadResume();
    if (!resume) return '';

    const STOP_WORDS = new Set([
      'a','an','the','is','in','it','of','to','and','or','for','on','at',
      'i','my','me','with','this','that','be','can','do','what','how',
      'are','was','were','has','have','had','will','would','should','could'
    ]);

    // Keywords from the question (lowercased, no stop-words, length ≥ 3)
    const keywords = question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    if (keywords.length === 0) return '';

    // Score each non-empty line
    const lines = resume.text.split('\n').filter(l => l.trim().length > 0);
    const scored = lines.map(line => {
      const lower = line.toLowerCase();
      const hits = keywords.filter(kw => lower.includes(kw)).length;
      return { line, hits };
    });

    // Keep lines with at least 1 hit, descending by score
    const relevant = scored
      .filter(s => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    if (relevant.length === 0) return '';

    // Accumulate lines until we'd exceed MAX_SNIPPET_WORDS
    const out = [];
    let total = 0;
    for (const { line } of relevant) {
      const words = line.split(/\s+/).length;
      if (total + words > MAX_SNIPPET_WORDS) break;
      out.push(line);
      total += words;
    }

    return out.join('\n');
  }
}

module.exports = new ResumeService();
