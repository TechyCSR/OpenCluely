'use strict';

/**
 * Intent Router — classifies a user's question into one of three modes:
 *
 *   'code'    — looks like a concrete coding / algorithm problem
 *   'explain' — asking for explanation, theory, or conceptual walkthrough
 *   'general' — behavioral, HR, personal, or anything else
 *
 * Rules are local keyword signals; no AI call is made.
 * The result controls whether a programming language is forwarded to Gemini.
 */

// Patterns that strongly signal the user wants executable code produced.
const CODE_SIGNALS = [
  // Data structure names used as nouns (problem context)
  /\b(array|arrays|linked.?list|binary.?tree|graph|hash.?map|hash.?table|queue|stack|heap|trie|matrix)\b/i,
  // Algorithm / complexity keywords
  /\b(sort|search|dp|dynamic.?programming|memoiz|recursion|backtrack|greedy|sliding.?window|two.?pointer|bfs|dfs|dijkstra|kmp)\b/i,
  // Complexity notation
  /O\s*\(/,
  // LeetCode-style phrasing
  /\bgiven\s+an?\s+(array|list|string|integer|number)\b/i,
  /\breturn\s+the\b/i,
  /\bfind\s+(all|the|a)\b/i,
  /\bminimum|maximum|longest|shortest|subarray|subsequence|permutation|combination\b/i,
  // Code artifacts in the message itself
  /```|\{|\[|\(.*\).*=>|function\s+\w+|def\s+\w+|class\s+\w+/,
  // Explicit code requests
  /\b(write|implement|code|program|solve)\s+(a|an|the|this)?\s*(function|method|class|solution|algorithm)\b/i,
];

// Patterns that signal the user wants an explanation, not code.
const EXPLAIN_SIGNALS = [
  /^(what|how|why|when|where|which)\s+/i,
  /\b(explain|describe|definition|difference\s+between|compare|pros?\s+and\s+cons?|trade.?off|concept|theory)\b/i,
  /\bwhen\s+should\s+(i|we|you)\b/i,
  /\bhow\s+does\b/i,
];

// Patterns that signal a general / behavioral / HR question.
const GENERAL_SIGNALS = [
  /\b(tell\s+me\s+about\s+(your|yourself)|introduce\s+yourself)\b/i,
  /\b(strength|weakness|challenge|achievement|conflict|teamwork|leadership|collaboration)\b/i,
  /\b(experience|background|project|past\s+role|previous\s+job|career)\b/i,
  /\b(why\s+do\s+you\s+want|why\s+this\s+(company|role|job)|where\s+do\s+you\s+see)\b/i,
  /\b(salary|compensation|notice\s+period|availability)\b/i,
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank\s+you)[\s,!.]*$/i,
];

/**
 * @param {string} text       - Raw user question text.
 * @param {string} activeSkill - Current skill (e.g. 'dsa', 'behavioral').
 * @returns {{ mode: 'code'|'explain'|'general', reason: string }}
 */
function routeIntent(text, activeSkill) {
  if (!text || typeof text !== 'string') {
    return { mode: 'general', reason: 'empty input' };
  }
  const t = text.trim();

  // 1. General signals take top priority — don't accidentally produce code
  //    for "tell me about yourself" even when DSA mode is active.
  for (const pattern of GENERAL_SIGNALS) {
    if (pattern.test(t)) {
      return { mode: 'general', reason: `general signal: ${pattern}` };
    }
  }

  // 2. Explain signals — check BEFORE code signals so "what is a hash map"
  //    routes to explain rather than code (hash map is in CODE_SIGNALS).
  for (const pattern of EXPLAIN_SIGNALS) {
    if (pattern.test(t)) {
      return { mode: 'explain', reason: `explain signal: ${pattern}` };
    }
  }

  // 3. Only consider coding signals when the active skill is code-oriented.
  //    In non-coding skills we never produce code regardless of the text.
  const isCodingSkill = activeSkill === 'dsa' || activeSkill === 'programming';
  if (isCodingSkill) {
    for (const pattern of CODE_SIGNALS) {
      if (pattern.test(t)) {
        return { mode: 'code', reason: `code signal: ${pattern}` };
      }
    }
  }

  // 4. Default: if coding skill and question is short/direct, treat as code.
  //    Otherwise fall back to general (safe default).
  if (isCodingSkill && t.split(/\s+/).length <= 20) {
    return { mode: 'code', reason: 'short unclassified question in coding skill — defaulting to code' };
  }

  return { mode: 'general', reason: 'no strong signal matched' };
}

module.exports = { routeIntent };
