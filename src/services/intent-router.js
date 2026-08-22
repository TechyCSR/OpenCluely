'use strict';

const resumeService = require('./resume.service');

/**
 * Intent Router — classifies a user's question into one of three modes:
 *
 *   'code'    — looks like a concrete coding / algorithm / implementation problem
 *   'explain' — system design, architecture, theory, concept walkthroughs
 *   'general' — candidate resume/project experience, behavioral, HR, conversational
 *
 * Priority Order:
 *   1. Explicit CODE / IMPLEMENT signals & LeetCode problem patterns
 *   2. Explicit DESIGN / Architecture signals
 *   3. Explicit GENERAL / BEHAVIORAL signals
 *   4. EXPLAIN signals (definitions, concept queries)
 *   5. RESUME_ENTITY_CHECK (entities present in uploaded resume)
 *   6. Safe default: 'general' (candidate voice)
 *
 * Routing does not consult activeSkill. DSA is one explicit mode, not a default.
 */

// 1. Explicit code / implementation requests and LeetCode problem patterns
const IMPLEMENT_SIGNALS = [
  /\b(write|implement|code|program|solve)\s+.*\b(function|method|class|solution|algorithm|api|rest\s*api|endpoint|service|system|controller|query|script|routine|code)\b/i,
  /\b(write|implement|code|program)\s+(a|an|the|this|me)\b/i,
  // Explicit "implement trie" / "write a heap" — coding intent without a global DSA skill.
  /\b(write|implement|code|program|solve)\s+(?:(?:a|an|the|this|me)\s+)?(?:trie|heap|stack|queue|graph|trees?|linked.?lists?|hash.?maps?|hash.?tables?|binary.?trees?|bst|avl.?tree|matrix)\b/i,
  /\bgiven\s+an?\s+(array|list|string|integer|number|matrix|tree|graph)\b/i,
  /\breturn\s+the\b/i,
  /\bfind\s+(all|the|a|two|three)\s+.*\s+(in|of)\s+an?\s+(array|list|string|matrix|tree|graph)\b/i,
  /\bminimum|maximum|longest|shortest\s+(subarray|subsequence|substring|path|depth)\b/i,
  /```|\{|\[|\(.*\).*=>|function\s+\w+|def\s+\w+|class\s+\w+/,
  /O\s*\(/
];

// Algorithm / complexity keywords when used as direct problem statements
const ALGO_KEYWORDS = [
  /\b(merge\s+sort|quick\s+sort|heap\s+sort|bubble\s+sort|insertion\s+sort|radix\s+sort)\b/i,
  /\b(binary\s+search|dijkstra|kmp|bfs|dfs|backtracking|dynamic\s+programming|memoization)\b/i,
  /\b(two\s+pointers?|sliding\s+window)\b/i
];

// 2. System design / architecture signals
const DESIGN_SIGNALS = [
  /\b(design|architect)\s+.*\b(system|service|platform|architecture|application|infrastructure|pipeline|database|cache|api|solution)\b/i,
  /\b(design|architect)\s+(a|an|the|this)\b/i,
  /\bhow\s+would\s+you\s+(design|architect|scale|structure|build)\b/i,
  /\b(system\s+design|high\s+level\s+design|hld|low\s+level\s+design|lld)\b/i,
  /\bbuild\s+(a|an|the)?\s*(microservices?|platform|distributed\s+system|infrastructure|pipeline|architecture)\b/i,
  /\b(scalability|sharding|replication|load\s+balancer|api\s+gateway|cap\s+theorem|consistent\s+hashing)\b/i
];

// 3. General / Behavioral / HR signals
const GENERAL_SIGNALS = [
  /\b(tell\s+me\s+about\s+(your|yourself|my|the|our)|introduce\s+yourself)\b/i,
  /\b(strength|weakness|challenge|achievement|conflict|teamwork|leadership|collaboration)\b/i,
  /\b(experience|background|project|past\s+role|previous\s+job|career)\b/i,
  /\b(why\s+do\s+you\s+want|why\s+this\s+(company|role|job)|where\s+do\s+you\s+see)\b/i,
  /\b(salary|compensation|notice\s+period|availability)\b/i,
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank\s+you)[\s,!.]*$/i
];

// 4. Explanation signals (definitions, concepts, trade-offs)
const EXPLAIN_SIGNALS = [
  /^(what|how|why|when|where|which)\s+/i,
  /\b(explain|describe|definition|difference\s+between|compare|pros?\s+and\s+cons?|trade.?off|concept|theory)\b/i,
  /\bwhen\s+should\s+(i|we|you)\b/i,
  /\bhow\s+does\b/i
];

/**
 * @param {string} text - Raw user question text.
 * @param {string} [_activeSkill] - Ignored. Kept so existing call sites do not break.
 * @returns {{ mode: 'code'|'explain'|'general', reason: string }}
 */
function routeIntent(text, _activeSkill) {
  if (!text || typeof text !== 'string') {
    return { mode: 'general', reason: 'empty input' };
  }
  const t = text.trim();

  // 1. Explicit CODE / IMPLEMENT signals & LeetCode patterns
  for (const pattern of IMPLEMENT_SIGNALS) {
    if (pattern.test(t)) {
      return { mode: 'code', reason: `implement/code signal: ${pattern}` };
    }
  }

  // Check direct algorithm names (e.g. "merge sort", "binary search")
  for (const pattern of ALGO_KEYWORDS) {
    if (pattern.test(t)) {
      return { mode: 'code', reason: `algorithm keyword: ${pattern}` };
    }
  }

  // 2. DESIGN / Architecture signals
  for (const pattern of DESIGN_SIGNALS) {
    if (pattern.test(t)) {
      return { mode: 'explain', reason: `design signal: ${pattern}` };
    }
  }

  // 3. GENERAL / BEHAVIORAL explicit signals
  for (const pattern of GENERAL_SIGNALS) {
    if (pattern.test(t)) {
      return { mode: 'general', reason: `general signal: ${pattern}` };
    }
  }

  // 4. EXPLAIN signals (definitions, conceptual questions)
  for (const pattern of EXPLAIN_SIGNALS) {
    if (pattern.test(t)) {
      return { mode: 'explain', reason: `explain signal: ${pattern}` };
    }
  }

  // 5. RESUME_ENTITY_CHECK: If question matches specific entities in candidate's resume
  try {
    const snippet = resumeService.getRelevantSnippet(t);
    if (snippet && snippet.trim().length > 0) {
      return { mode: 'general', reason: 'resume entity match' };
    }
  } catch (_) {
    // Non-blocking fallback
  }

  // 6. Safe default: candidate voice (never code by default)
  return { mode: 'general', reason: 'safe default fallback' };
}

module.exports = { routeIntent };
