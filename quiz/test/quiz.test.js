/**
 * quiz.test.js — Headless behavioral test of the shared quiz engine.
 * Run: node quiz/test/quiz.test.js
 * Dev dependency: jsdom (not part of the deployed site)
 *
 * Covers:
 *  - Data validation (all 10 books)
 *  - HTML structure checks
 *  - Core quiz flow: counters, progress, options, locking, navigation
 *  - Score displayed as correct/attempted (unattempted not counted)
 *  - Hint toggle (master enable/disable)
 *  - Per-question Show Hint button
 *  - Skip behaviour
 *  - Results screen accuracy and pass/fail logic
 *  - Speak button rendered (or hidden when API unavailable)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Serve local files via jsdom ResourceLoader
class FileLoader extends ResourceLoader {
  fetch(url) {
    const rel = url.replace('http://localhost/quiz/', '');
    const file = path.join(ROOT, rel.split('?')[0]);
    try { return Promise.resolve(fs.readFileSync(file)); }
    catch (e) { return Promise.reject(e); }
  }
}

let failures = 0;
let passes   = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passes++; }
  else      { console.error('  ✗ FAIL: ' + msg); failures++; }
}

/** Load a quiz page and wait for the engine to initialise. */
async function loadPage(bookNum, { mockSpeech = true, mockNavigate = false } = {}) {
  const html = fs.readFileSync(path.join(ROOT, `book${bookNum}.html`), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `book${bookNum}.json`), 'utf8'));

  const dom = new JSDOM(html, {
    url: `http://localhost/quiz/book${bookNum}.html`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: new FileLoader(),
    beforeParse(window) {
      // Shim fetch to read local JSON files
      window.fetch = (url) => {
        const rel = url.replace(/^https?:\/\/[^/]+\/quiz\//, '');
        const file = path.join(ROOT, rel.split('?')[0]);
        try {
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8')))
          });
        } catch (e) {
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(e) });
        }
      };

      if (mockNavigate) {
        // Seam the engine's __navigate hook so exit can be verified without
        // actually leaving the page (jsdom cannot navigate)
        window.__navigate = (url) => { window.__navTarget = url; };
      }

      if (mockSpeech) {
        // Minimal Web Speech API shim so engine speech path is exercised
        const utters = [];
        window.SpeechSynthesisUtterance = class {
          constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
        };
        window.speechSynthesis = {
          speak(u)  { utters.push(u); if (u.onend) setTimeout(() => u.onend(), 20); },
          cancel()  { },
          getVoices() {
            return [
              { lang: 'en-US', name: 'Test Voice' },
              { lang: 'en-GB', name: 'UK Voice' },
            ];
          },
        };
        window.__utters = utters; // expose for assertions
      }

      window.addEventListener('error', (e) => { throw new Error('Window error: ' + e.message); });
    },
  });

  const { document } = dom.window;
  for (let i = 0; i < 100 && !document.querySelector('.question-text'); i++) await sleep(30);
  if (!document.querySelector('.question-text')) throw new Error(`Book ${bookNum}: quiz never initialised`);

  return { document, data, window: dom.window };
}

function getOptions(doc) { return [...doc.querySelectorAll('.option')]; }
function $$(doc, sel)    { return doc.querySelector(sel); }

// ── Validation: all 10 JSON files have exactly 20 questions with 4 opts, hint, valid answer ──
function validateData() {
  console.log('\n── Data validation (all 10 books) ──');
  let totalQ = 0;
  for (let n = 1; n <= 10; n++) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `book${n}.json`), 'utf8'));
    assert(data.questions.length === 20, `Book ${n}: 20 questions`);
    const badOpts = data.questions.filter(q => q.options.length !== 4).length;
    assert(badOpts === 0, `Book ${n}: all questions have 4 options`);
    const badHints = data.questions.filter(q => !q.hint || !q.hint.trim()).length;
    assert(badHints === 0, `Book ${n}: all questions have a hint`);
    const badAns = data.questions.filter(q => q.answer < 0 || q.answer > 3).length;
    assert(badAns === 0, `Book ${n}: all answers in range 0–3`);
    totalQ += data.questions.length;
  }
  assert(totalQ === 200, `Total questions across all books = 200`);
}

// ── Dashboard / HTML structure checks ──
function validateHtml() {
  console.log('\n── HTML structure checks ──');
  const dash = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (let n = 1; n <= 10; n++) {
    assert(dash.includes(`book${n}.html`), `Dashboard links book${n}.html`);
  }

  for (let n = 1; n <= 10; n++) {
    const page = fs.readFileSync(path.join(ROOT, `book${n}.html`), 'utf8');
    assert(page.includes('quiz-engine.js'), `book${n}.html includes quiz-engine.js`);
    assert(page.includes(`data-book="${n}"`), `book${n}.html has data-book="${n}"`);
    assert(page.includes('quiz.css'), `book${n}.html includes quiz.css`);
    assert(page.includes('index.html'), `book${n}.html has back-to-dashboard link`);
  }
}

// ── Score displayed as correct/attempted ──
async function testScoreDisplay() {
  console.log('\n── Score display: correct/attempted format ──');
  const { document, data } = await loadPage(1);

  // Initial score before any answer
  assert($$(document, '#score').textContent === '0/0',
    'Initial score shows 0/0');

  // Answer Q1 correctly
  getOptions(document)[data.questions[0].answer].click();
  assert($$(document, '#score').textContent === '1/1',
    'After 1 correct: score = 1/1');

  $$(document, '#next-btn').click();
  await sleep(15);

  // Answer Q2 wrong
  const wrongIdx = (data.questions[1].answer + 1) % 4;
  getOptions(document)[wrongIdx].click();
  assert($$(document, '#score').textContent === '1/2',
    'After 1 correct + 1 wrong: score = 1/2');

  $$(document, '#next-btn').click();
  await sleep(15);

  // Skip Q3
  $$(document, '#skip-btn').click();
  assert($$(document, '#score').textContent === '1/3',
    'After skip Q3: score = 1/3 (skip counts as attempted, not correct)');
}

// ── Hint toggle: master switch behaviour ──
async function testHintToggle() {
  console.log('\n── Hint toggle ──');
  const { document, data } = await loadPage(2);

  // Default: hints OFF, hint box hidden
  assert($$(document, '#hint-toggle').checked === false, 'Hint toggle off by default');
  assert($$(document, '#hintbox').hidden === true, 'Hint box hidden by default');
  assert($$(document, '#hint-btn').disabled === false, 'Show Hint button enabled by default');

  // Enable toggle → hint for current Q immediately visible
  $$(document, '#hint-toggle').checked = true;
  $$(document, '#hint-toggle').dispatchEvent(new document.defaultView.Event('change'));
  assert($$(document, '#hintbox').hidden === false, 'Hint box visible after enabling toggle');
  assert($$(document, '#hinttext').textContent === data.questions[0].hint,
    'Hint text matches JSON when toggle enabled');
  assert($$(document, '#hint-btn').disabled === true,
    'Show Hint button disabled when toggle is on');

  // Disable toggle → hint hidden again
  $$(document, '#hint-toggle').checked = false;
  $$(document, '#hint-toggle').dispatchEvent(new document.defaultView.Event('change'));
  assert($$(document, '#hintbox').hidden === true, 'Hint box hidden again after disabling toggle');
  assert($$(document, '#hint-btn').disabled === false,
    'Show Hint button re-enabled after disabling toggle');

  // Toggle persists to next question
  $$(document, '#hint-toggle').checked = true;
  $$(document, '#hint-toggle').dispatchEvent(new document.defaultView.Event('change'));
  getOptions(document)[data.questions[0].answer].click(); // answer Q1
  $$(document, '#next-btn').click();
  await sleep(20);
  // Q2 should auto-show hint since toggle is on
  assert($$(document, '#hintbox').hidden === false,
    'Hint auto-shown on Q2 when toggle was left on');
  assert($$(document, '#hinttext').textContent === data.questions[1].hint,
    'Q2 hint text matches JSON');
}

// ── Per-question Show Hint button (manual reveal, toggle off) ──
async function testManualHintButton() {
  console.log('\n── Manual Show Hint button ──');
  const { document, data } = await loadPage(3);

  // Toggle is off — hint box hidden
  assert($$(document, '#hintbox').hidden === true, 'Hint hidden before click');
  $$(document, '#hint-btn').click();
  assert($$(document, '#hintbox').hidden === false, 'Hint visible after click');
  assert($$(document, '#hinttext').textContent === data.questions[0].hint,
    'Manual hint text matches JSON');
  assert($$(document, '#hint-btn').disabled === true,
    'Show Hint button disabled after click');
}

// ── Speak button: rendered, toggles, and fires SpeechSynthesis ──
async function testSpeakButton() {
  console.log('\n── Speak button (TTS) ──');
  const { document, data, window } = await loadPage(1, { mockSpeech: true });

  const btn = $$(document, '#speak-btn');
  assert(!!btn, 'Speak button rendered in DOM');
  assert(btn.style.display !== 'none', 'Speak button visible (speech API shimmed)');
  assert(btn.textContent === '🔊', 'Speak button shows 🔊 by default');

  // Click to start speech
  btn.click();
  await sleep(5);
  assert(window.__utters.length >= 1, 'SpeechSynthesisUtterance was created');
  const utter = window.__utters[0];
  assert(utter.text === data.questions[0].q, 'Utterance text matches question text');
  assert(utter.lang === 'en-US', 'Utterance language is en-US');
  assert(utter.rate === 0.8, 'Utterance rate is 0.8');

  // After speech ends (simulated), button resets
  await sleep(50);
  assert(btn.textContent === '🔊', 'Speak button returns to 🔊 after speech ends');

  // Test: speak button hidden when speechSynthesis not available
  const html = fs.readFileSync(path.join(ROOT, 'book1.html'), 'utf8');
  const domNoSpeech = new JSDOM(html, {
    url: 'http://localhost/quiz/book1.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: new FileLoader(),
    beforeParse(window) {
      window.fetch = (url) => {
        const rel = url.replace(/^https?:\/\/[^/]+\/quiz\//, '');
        const file = path.join(ROOT, rel.split('?')[0]);
        try {
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8')))
          });
        } catch (e) {
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(e) });
        }
      };
      // No speechSynthesis on this window — engine should hide the button
      delete window.speechSynthesis;
      delete window.SpeechSynthesisUtterance;
    },
  });
  const docNoSpeech = domNoSpeech.window.document;
  for (let i = 0; i < 80 && !docNoSpeech.querySelector('.question-text'); i++) await sleep(30);
  const speakBtnNoSpeech = docNoSpeech.querySelector('#speak-btn');
  assert(!speakBtnNoSpeech || speakBtnNoSpeech.style.display === 'none',
    'Speak button hidden when speechSynthesis unavailable');
}

// ── Exit Quiz modal ──
async function testExitModal() {
  console.log('\n── Exit Quiz modal ──');
  const { document, window } = await loadPage(4, { mockSpeech: true, mockNavigate: true });

  const exitBtn    = $$(document, '#exit-btn');
  const exitModal  = $$(document, '#exit-modal');
  const exitConfirm = $$(document, '#exit-confirm');
  const exitCancel  = $$(document, '#exit-cancel');

  assert(!!exitBtn,    'Exit Quiz button present');
  assert(!!exitModal,  'Exit modal element present');
  assert(exitModal.hidden === true, 'Modal hidden on quiz start');

  // Open modal
  exitBtn.click();
  assert(exitModal.hidden === false, 'Modal visible after clicking Exit Quiz');

  // "Continue Quiz" closes modal without navigating
  exitCancel.click();
  assert(exitModal.hidden === true,  'Modal hidden after clicking Continue Quiz');
  assert(window.__navTarget === undefined, 'No navigation after Continue Quiz');

  // Open again, then confirm exit
  exitBtn.click();
  assert(exitModal.hidden === false, 'Modal re-opens on second click');
  exitConfirm.click();
  assert(window.__navTarget === 'index.html', 'Confirmed exit navigates to index.html');

  // ── Escape key dismisses the modal ──
  // Reset
  window.__navTarget = undefined;
  exitBtn.click();
  assert(exitModal.hidden === false, 'Modal visible for Escape key test');
  const escEvent = new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  document.dispatchEvent(escEvent);
  assert(exitModal.hidden === true, 'Escape key dismisses the modal');
  assert(window.__navTarget === undefined, 'Escape key does not navigate');

  // ── Modal stays hidden during normal quiz interaction ──
  window.__navTarget = undefined;
  const data = JSON.parse(require('fs').readFileSync(require('path').join(ROOT, 'data', 'book4.json'), 'utf8'));
  getOptions(document)[data.questions[0].answer].click(); // answer Q1
  assert(exitModal.hidden === true, 'Modal stays closed after answering a question');
}
async function runFullScenario(label, bookNum, plan) {
  console.log(`\n── ${label} (book ${bookNum}) ──`);
  const { document, data } = await loadPage(bookNum);

  let correct = 0, wrong = 0, skipped = 0;
  const total = plan.length;

  for (let i = 0; i < total; i++) {
    const action = plan[i];
    const Q = data.questions[i];

    // Counter
    assert($$(document, '#counter').textContent === `Question ${i + 1} of ${total}`,
      `Q${i+1}: counter = "Question ${i+1} of ${total}"`);

    // Exit button always present during quiz
    assert($$(document, '#exit-btn') !== null, `Q${i+1}: exit button present`);
    assert($$(document, '#exit-modal').hidden === true, `Q${i+1}: exit modal closed`);

    // Progress bar
    const pct = (i / total) * 100;
    assert(parseFloat($$(document, '#progress').style.width) === pct,
      `Q${i+1}: progress = ${pct}%`);

    // Score before answering: should still show previous attempted count
    assert($$(document, '#score').textContent === `${correct}/${correct + wrong + skipped}`,
      `Q${i+1}: score before = ${correct}/${correct + wrong + skipped}`);

    // Hint hidden by default (toggle is off)
    assert($$(document, '#hintbox').hidden === true, `Q${i+1}: hint hidden by default`);
    assert($$(document, '#next-btn').disabled === true, `Q${i+1}: Next disabled before answering`);
    assert($$(document, '#skip-btn').disabled === false, `Q${i+1}: Skip enabled before answering`);
    assert(getOptions(document).length === 4, `Q${i+1}: 4 options rendered`);
    assert($$(document, '#qtext').textContent === Q.q, `Q${i+1}: question text from JSON`);

    if (action === 'hint') {
      $$(document, '#hint-btn').click();
      assert($$(document, '#hintbox').hidden === false, `Q${i+1}: hint visible after click`);
      assert($$(document, '#hinttext').textContent === Q.hint, `Q${i+1}: hint text from JSON`);
      getOptions(document)[Q.answer].click();
      correct++;
    } else if (action === 'correct') {
      getOptions(document)[Q.answer].click();
      correct++;
    } else if (action === 'wrong') {
      const wrongIdx = (Q.answer + 1) % 4;
      getOptions(document)[wrongIdx].click();
      wrong++;
    } else if (action === 'skip') {
      $$(document, '#skip-btn').click();
      skipped++;
    }

    const attempted = correct + wrong + skipped;

    // Score after answering: correct/attempted
    assert($$(document, '#score').textContent === `${correct}/${attempted}`,
      `Q${i+1}: score after = ${correct}/${attempted}`);

    // Colour feedback
    if (action === 'correct' || action === 'hint') {
      assert(getOptions(document)[Q.answer].classList.contains('correct'),
        `Q${i+1}: correct option green`);
    }
    if (action === 'wrong') {
      const wrongIdx = (Q.answer + 1) % 4;
      assert(getOptions(document)[wrongIdx].classList.contains('wrong'),
        `Q${i+1}: wrong pick red`);
      assert(getOptions(document)[Q.answer].classList.contains('correct'),
        `Q${i+1}: correct revealed green after wrong`);
    }
    if (action === 'skip') {
      assert(getOptions(document)[Q.answer].classList.contains('correct'),
        `Q${i+1}: correct revealed after skip`);
    }

    // Lock check
    const before = getOptions(document).map(o => o.className + o.disabled).join('|');
    getOptions(document)[(Q.answer + 2) % 4].click();
    const after  = getOptions(document).map(o => o.className + o.disabled).join('|');
    assert(before === after, `Q${i+1}: answer locked after submission`);
    assert(getOptions(document).every(o => o.disabled), `Q${i+1}: all options disabled`);
    assert($$(document, '#next-btn').disabled === false, `Q${i+1}: Next enabled after answering`);

    $$(document, '#next-btn').click();
    await sleep(15);
  }

  // ── Results screen ──
  const pct = Math.round((correct / total) * 100);
  const passed = (correct / total) >= 0.80;

  const card = document.querySelector('.results-card');
  assert(!!card, 'results card rendered');
  assert(card.classList.contains(passed ? 'passed' : 'failed'),
    `pass/fail class correct at ${pct}%`);

  const stats = [...document.querySelectorAll('.stat-num')].map(s => Number(s.textContent));
  assert(stats[0] === total,   `results: total = ${total}`);
  assert(stats[1] === correct, `results: correct = ${correct}`);
  assert(stats[2] === wrong,   `results: incorrect = ${wrong}`);
  assert(stats[3] === skipped, `results: skipped = ${skipped}`);

  assert(document.querySelector('.score-pct').textContent === pct + '%',
    `results: score ring = ${pct}%`);

  const badgeText = document.querySelector('.results-badge').textContent;
  assert(passed ? badgeText.includes('PASSED') : badgeText.includes('TRY'),
    `badge correct for ${passed ? 'pass' : 'fail'}`);

  assert(!!document.getElementById('retake'), 'retake button present');
  assert(!!document.querySelector('a.dashboard-btn'), 'dashboard link present');
}

// ── Main ──
(async () => {
  validateData();
  validateHtml();

  await testScoreDisplay();
  await testHintToggle();
  await testManualHintButton();
  await testSpeakButton();
  await testExitModal();

  // Full quiz flow scenarios
  await runFullScenario('All correct (100% PASS)', 1, Array(20).fill('correct'));

  const plan80 = Array(20).fill('correct');
  plan80[2] = 'wrong'; plan80[5] = 'wrong'; plan80[9] = 'wrong'; plan80[14] = 'skip';
  await runFullScenario('16 correct, 3 wrong, 1 skip (80% PASS boundary)', 2, plan80);

  const planFail = Array(20).fill('correct');
  planFail[0] = 'wrong'; planFail[7] = 'wrong'; planFail[11] = 'wrong';
  planFail[18] = 'wrong'; planFail[19] = 'wrong';
  await runFullScenario('15 correct (75% FAIL)', 3, planFail);

  const planHint = Array(20).fill('correct');
  planHint[0] = 'hint'; planHint[1] = 'skip'; planHint[3] = 'hint';
  await runFullScenario('Hint + skip (book 10)', 10, planHint);

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`Total assertions: ${passes + failures}  |  Passed: ${passes}  |  Failed: ${failures}`);
  console.log(failures === 0 ? 'ALL TESTS PASSED ✅' : `${failures} FAILURE(S) ❌`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
