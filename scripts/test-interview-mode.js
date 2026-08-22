'use strict';

const { InterviewSession } = require('../src/services/interview-session');

const cases = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  cases.push({ name, ok, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`      expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

const session = new InterviewSession();
check('legacy voice auto-sends when interview mode is off', session.shouldAutoSendToLlm(), true);
check('starts idle', session.state, 'idle');

session.enable();
check('enable → listening', session.state, 'listening');
check('interview mode does not auto-send', session.shouldAutoSendToLlm(), false);
check('empty transcript cannot submit', session.canSubmit(), false);

const rolling = new InterviewSession();
rolling.enable();
rolling.setRollingParts('tell me about', 'kafka');
check('rolling parts combine for display', rolling.displayText(), 'tell me about kafka');
check('Space snapshot uses rolling committed + tail', rolling.beginSubmit(), 'tell me about kafka');

const noRollback = new InterviewSession();
noRollback.enable();
noRollback.setRollingParts('tell me about yourself', '');
noRollback.setRollingParts('yourself', '');
check('rolling committed does not roll back', noRollback.committed, 'tell me about yourself');
check('Space still includes the frozen prefix', noRollback.beginSubmit(), 'tell me about yourself');
noRollback.finishAnswer();
noRollback.disable();
rolling.finishAnswer();
rolling.disable();

session.appendFinal('Tell me about Kafka');
session.setInterim('and inventory');
check('display combines final + interim', session.displayText(), 'Tell me about Kafka and inventory');
check('can submit while listening with text', session.canSubmit(), true);
check('still must not auto-send after fragments', session.shouldAutoSendToLlm(), false);

const shot = new InterviewSession();
shot.enable();
check('screenshot analyze can enter thinking without a transcript', shot.beginAnalyze(), true);
check('screenshot analyze → thinking', shot.state, 'thinking');
shot.finishAnswer();

const rejectedDuringSubmitPrep = session.beginSubmit();
check('Space snapshot is the frozen transcript', rejectedDuringSubmitPrep, 'Tell me about Kafka and inventory');
check('after Space → thinking', session.state, 'thinking');
check('cannot submit again while thinking', session.canSubmit(), false);
check('fragments ignored while thinking', session.appendFinal('extra words'), false);
check('interim ignored while thinking', session.setInterim('partial'), false);
check('frozen text kept while thinking', session.displayText(), 'Tell me about Kafka and inventory');

session.markAnswering();
check('first token → answering', session.state, 'answering');

const resumed = session.finishAnswer();
check('after answer, resume listening', resumed, true);
check('state is listening again', session.state, 'listening');
check('transcript cleared for next question', session.displayText(), '');
check('still no auto-send after resume', session.shouldAutoSendToLlm(), false);

session.appendFinal('Next question');
session.clearTranscript();
check('Esc clears transcript', session.displayText(), '');
check('Esc keeps listening', session.state, 'listening');

session.disable();
check('F8 off → idle', session.state, 'idle');
check('legacy voice may auto-send again', session.shouldAutoSendToLlm(), true);
check('finishAnswer does not resume when disabled', session.finishAnswer(), false);

const failed = cases.filter((c) => !c.ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
