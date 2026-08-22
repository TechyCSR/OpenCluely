const fs = require('fs');
const path = require('path');
const os = require('os');

const RESUME_PATH = path.join(os.homedir(), '.OpenCluely', 'resume.json');
const MAX_SNIPPET_WORDS = 150;
const MAX_OVERVIEW_WORDS = 350;

// Patterns that signal broad, open-ended resume/background queries
const BROAD_OVERVIEW_PATTERNS = [
  /\b(tell\s+me\s+about\s+(your|yourself)|introduce\s+yourself)\b/i,
  /\b(walk\s+me\s+through\s+(your\s+)?(resume|background|experience|career))\b/i,
  /\b(summarize\s+(your\s+)?(resume|background|experience|work\s+history))\b/i,
  /\b(overview\s+of\s+(your\s+)?(background|experience|career))\b/i,
  /\b(who\s+are\s+you|what\s+is\s+your\s+background)\b/i,
  /\b(what\s+(have\s+you\s+worked\s+on|are\s+your\s+key\s+projects))\b/i
];

const STOP_WORDS = new Set([
  'a','an','the','is','in','it','of','to','and','or','for','on','at',
  'i','my','me','with','this','that','be','can','do','what','how',
  'are','was','were','has','have','had','will','would','should','could',
  'tell','about','your','you','explain','give','please'
]);

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

  // ── Query Analysis ────────────────────────────────────────────────────────

  isBroadOverviewQuery(question) {
    if (!question || typeof question !== 'string') return false;
    return BROAD_OVERVIEW_PATTERNS.some(pattern => pattern.test(question.trim()));
  }

  // ── Grounding Extraction ──────────────────────────────────────────────────

  /**
   * Primary entry point for prompt grounding.
   * Resolves query into structured context (OVERVIEW, TARGETED, or NONE).
   *
   * @param {string} question - The user query or transcription
   * @param {string|null} intentMode - The classified intent mode (e.g. 'RESUME_PROJECT', 'BEHAVIORAL')
   * @returns {{ hasResume: boolean, type: 'OVERVIEW'|'TARGETED'|'NONE', context: string, wordCount: number }}
   */
  getGroundingContext(question, intentMode = null) {
    const resume = this.loadResume();
    if (!resume || !resume.text) {
      return { hasResume: false, type: 'NONE', context: '', wordCount: 0 };
    }

    const cleanQuestion = (question || '').trim();

    // 1. If broad overview query or explicit broad intent, return profile overview
    if (this.isBroadOverviewQuery(cleanQuestion)) {
      const overview = this._getOverview(resume.text);
      return {
        hasResume: true,
        type: 'OVERVIEW',
        context: overview,
        wordCount: overview.split(/\s+/).length
      };
    }

    // 2. Otherwise, attempt targeted line-level extraction
    const targetedSnippet = this._getTargetedSnippet(resume.text, cleanQuestion);
    if (targetedSnippet) {
      return {
        hasResume: true,
        type: 'TARGETED',
        context: targetedSnippet,
        wordCount: targetedSnippet.split(/\s+/).length
      };
    }

    // 3. Fallback: if intent is RESUME_PROJECT or BEHAVIORAL but keyword matching had 0 hits,
    // fallback to overview so the model has grounding facts rather than 0 context.
    if (intentMode === 'RESUME_PROJECT' || intentMode === 'BEHAVIORAL') {
      const overview = this._getOverview(resume.text);
      return {
        hasResume: true,
        type: 'OVERVIEW',
        context: overview,
        wordCount: overview.split(/\s+/).length
      };
    }

    return { hasResume: true, type: 'NONE', context: '', wordCount: 0 };
  }

  /**
   * Backward-compatible helper for existing call sites.
   */
  getRelevantSnippet(question) {
    const grounding = this.getGroundingContext(question);
    return grounding.context || '';
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  _getOverview(resumeText) {
    const words = resumeText.split(/\s+/);
    if (words.length <= MAX_OVERVIEW_WORDS) {
      return resumeText.trim();
    }
    return words.slice(0, MAX_OVERVIEW_WORDS).join(' ') + '...';
  }

  _getTargetedSnippet(resumeText, question) {
    const keywords = question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    if (keywords.length === 0) return '';

    const lines = resumeText.split('\n').filter(l => l.trim().length > 0);
    const scored = lines.map(line => {
      const lower = line.toLowerCase();
      const hits = keywords.filter(kw => lower.includes(kw)).length;
      return { line, hits };
    });

    const relevant = scored
      .filter(s => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    if (relevant.length === 0) return '';

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
