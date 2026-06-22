#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mobileJs = fs.readFileSync(path.join(ROOT, 'public', 'mobile', 'mobile.js'), 'utf8');
const mobileApi = fs.readFileSync(path.join(ROOT, 'electron', 'mobile.js'), 'utf8');
const runnerSrc = fs.readFileSync(path.join(ROOT, 'electron', 'mobile-agent-runner.js'), 'utf8');
const runner = require(path.join(ROOT, 'electron', 'mobile-agent-runner.js'));

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  \u2713 ' + name);
  } else {
    fail += 1;
    console.error('  \u2717 ' + name);
  }
}

(async () => {
  console.log('\n[UI-A8-5-P2] agent switch isolation');
  ok('switchAgent clears chat messages', /function\s+switchAgent[\s\S]{0,900}S\.messages\s*=\s*\[\]/.test(mobileJs));
  ok('switchAgent clears active session id', /function\s+switchAgent[\s\S]{0,900}S\.sessionId\s*=\s*["']{2}/.test(mobileJs));
  ok('switchAgent removes SESSION_KEY', /function\s+switchAgent[\s\S]{0,900}localStorage\.removeItem\(SESSION_KEY\)/.test(mobileJs));
  ok('switchAgent returns home to empty state', /function\s+switchAgent[\s\S]{0,900}exitChatState\(\)/.test(mobileJs));

  console.log('\n[UI-A8-5-P2] thinking + tool-call style chat rows');
  ok('doSend creates pending assistant message before api call', /doSend[\s\S]{0,900}role:\s*["']assistant["'][\s\S]{0,220}status:\s*["']running["']/.test(mobileJs));
  ok('renderMessages renders running assistant bubble', /renderMessages[\s\S]{0,2500}msg\.status\s*===\s*["']running["'][\s\S]{0,800}思考中/.test(mobileJs));
  ok('renderMessages supports agent trace/tool rows', /function\s+renderAgentTrace[\s\S]{0,2000}tool-call/.test(mobileJs));
  ok('doSend updates pending assistant instead of appending separate final bubble', /pendingAssistant[\s\S]{0,2500}\.content\s*=/.test(mobileJs));

  console.log('\n[UI-A8-5-P2] selected skill is sent to agent');
  ok('useSkillInChat stores selected skill object', /S\.currentSkill\s*=\s*\{[\s\S]{0,250}id:\s*skill\.id/.test(mobileJs));
  ok('doSend includes skillId in request body', /skillId:\s*S\.currentSkill\s*\?/.test(mobileJs));
  ok('doSend includes skillName in request body', /skillName:\s*S\.currentSkill\s*\?/.test(mobileJs));
  ok('backend accepts skillId/skillName fields', /skillId[\s\S]{0,500}skillName/.test(mobileApi));
  ok('backend prefixes message with selected skill instruction', /Use the selected skill/.test(mobileApi));

  console.log('\n[UI-A8-5-P2] qoder detection');
  ok('qoder candidates include qodercli', /qoder:\s*\{[\s\S]{0,160}qodercli/.test(runnerSrc));
  const qoderResolved = await runner.resolveAgentCommand('qoder');
  ok('qoder resolver returns ready when qodercli exists', qoderResolved && qoderResolved.status === 'ready' && qoderResolved.commandFound === true);
  ok('qoder failure text can surface upgrade required', /upgrade required|error_code/.test(runnerSrc));

  console.log('\n[DONE]');
  console.log(`Result: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
