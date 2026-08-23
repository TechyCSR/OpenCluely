'use strict';

/**
 * Mirrors the interview overlay history rules in llm-response.html.
 * If these fail, the in-page rememberTurn / navigateHistory logic drifted.
 */

function createHistory() {
  const MAX = 25;
  const state = { turns: [], index: -1, viewing: false };

  function remember(question, response) {
    const q = String(question || '').trim();
    const r = String(response || '').trim();
    if (!r) return;
    const last = state.turns[state.turns.length - 1];
    if (last && last.question === q && last.response === r) {
      if (!state.viewing) state.index = state.turns.length - 1;
      return;
    }
    if (last && last.question === q && r.startsWith(last.response)) {
      last.response = r;
      if (!state.viewing) state.index = state.turns.length - 1;
      return;
    }
    state.turns.push({ question: q, response: r });
    if (state.turns.length > MAX) {
      state.turns.shift();
      if (state.viewing && state.index > 0) state.index -= 1;
    }
    if (!state.viewing) state.index = state.turns.length - 1;
  }

  function navigate(direction) {
    if (state.turns.length === 0) return null;
    const current = state.viewing ? state.index : state.turns.length - 1;
    const next = current + direction;
    if (next < 0 || next >= state.turns.length) return null;
    state.viewing = next < state.turns.length - 1;
    state.index = next;
    return state.turns[next];
  }

  return { state, remember, navigate };
}

const cases = [];
function check(name, ok, detail) {
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const h = createHistory();
h.remember('Tell me about Kafka', 'I used Kafka for inventory sync.');
h.remember('Tell me about Kafka', 'I used Kafka for inventory sync. Partitions keep order.');
check('streaming updates the same turn', h.state.turns.length === 1);
h.remember('Write two-sum', '```java\nclass Solution');
check('next question is a new turn', h.state.turns.length === 2, `n=${h.state.turns.length}`);

const prev = h.navigate(-1);
check('Alt+Left shows the earlier answer', !!(prev && prev.question === 'Tell me about Kafka'));
check('viewing older answer does not move the live index yet', h.state.viewing === true && h.state.index === 0);

h.remember('Write two-sum', '```java\nclass Solution { int[] twoSum() { return new int[]{0,1}; } }\n```');
check('finishing the live stream does not kick you off the previous answer', h.state.viewing === true && h.state.index === 0);
check('the latest coding answer is still stored', h.state.turns[1].response.includes('twoSum'));

const latest = h.navigate(1);
check('Alt+Right returns to the coding answer', !!(latest && latest.question === 'Write two-sum'));
check('latest is not marked as history viewing', h.state.viewing === false);

const failed = cases.filter((ok) => !ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
