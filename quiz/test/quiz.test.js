/**
 * quiz.test.js — Headless behavioral test of the shared quiz engine.
 * Run: node quiz/test/quiz.test.js
 * Dev dependency: jsdom (not part of the deployed site)
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

async function loadPage(bookNum) {
  const html = fs.readFileSync(path.join(ROOT, `book${bookNum}.html`), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `book${bookNum}.json`), 'utf8'));

  const dom = new JSDOM(html, {
    url: `http://localhost/quiz/book${bookNum}.html`,
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
      window.addEventListener('error', (e) => { throw new Error('Window error: ' + e.message); });
    },
  });

  const { document } = dom.window;
  for (let i = 0; i < 100 && !document.querySelector('.question-text'); i++) await sleep(30);
  if (!document.querySelector('.question-text')) throw new Error(`Book ${bookNum}: quiz never initialised`);

  return { document, data };
}

function getOptions(doc) { return [...doc.querySelectorAll('.option')]; }
function $$(doc, sel)    { return doc.querySelector(sel); }

async function runScenario(label, bookNum, plan) {
  console.log(`\n── ${label} (book ${bookNum}) ──`);
  const { document, data } = await loadPage(bookNum);

  let correct = 0, wrong = 0, skipped = 0;
  const total = plan.length;

  for (let i = 0; i < total; i++) {
    const action = plan[i];
    const Q = data.questions[i];

    // ── Per-question structural checks (every question) ──
    assert($$(document, '#counter').textContent
           === `Question ${i + 1} of ${total}`,
           `Q${i+1}: counter shows "Question ${i+1} of ${total}"`);

    const pct = (i / total) * 100;
    assert(parseFloat($$(document, '#progress').style.width) === pct, `Q${i+1}: progress = ${pct}%`);

    assert($$(document, '#hintbox').hidden === true, `Q${i+1}: hint hidden by default`);
    assert($$(document, '#next-btn').disabled === true, `Q${i+1}: Next disabled before answering`);
    assert($$(document, '#skip-btn').disabled === false, `Q${i+1}: Skip enabled before answering`);
    assert(getOptions(document).length === 4, `Q${i+1}: 4 options rendered`);
    assert($$(document, '#qtext').textContent === Q.q, `Q${i+1}: question text from JSON`);

    // ── Action ──
    if (action === 'hint') {
      $$(document, '#hint-btn').click();
      assert($$(document, '#hintbox').hidden === false, `Q${i+1}: hint visible after click`);
      assert($$(document, '#hinttext').textContent === Q.hint, `Q${i+1}: hint text from JSON`);
      // then answer correctly
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

    // ── Post-answer checks ──
    if (action === 'correct' || action === 'hint') {
      assert(getOptions(document)[Q.answer].classList.contains('correct'), `Q${i+1}: correct option green`);
      assert(!getOptions(document)[Q.answer].classList.contains('wrong'), `Q${i+1}: correct not red`);
    }

    if (action === 'wrong') {
      const wrongIdx = (Q.answer + 1) % 4;
      assert(getOptions(document)[wrongIdx].classList.contains('wrong'), `Q${i+1}: wrong pick red`);
      assert(getOptions(document)[Q.answer].classList.contains('correct'), `Q${i+1}: correct revealed green after wrong`);
    }

    if (action === 'skip') {
      assert(getOptions(document)[Q.answer].classList.contains('correct'), `Q${i+1}: correct revealed after skip`);
    }

    assert($$(document, '#score').textContent === String(correct), `Q${i+1}: score = ${correct}`);
    assert($$(document, '#feedback').hidden === false, `Q${i+1}: feedback shown`);

    // Lock check: clicking another option should change nothing
    const before = getOptions(document).map(o => o.className + o.disabled).join('|');
    getOptions(document)[(Q.answer + 2) % 4].click();
    const after  = getOptions(document).map(o => o.className + o.disabled).join('|');
    assert(before === after, `Q${i+1}: answer locked after submission`);
    assert(getOptions(document).every(o => o.disabled), `Q${i+1}: all options disabled`);
    assert($$(document, '#skip-btn').disabled === true, `Q${i+1}: skip disabled after answering`);
    assert($$(document, '#next-btn').disabled === false, `Q${i+1}: Next enabled after answering`);

    $$(document, '#next-btn').click();
    await sleep(15);
  }

  // ── Results screen ──
  const pct = Math.round((correct / total) * 100);
  const passed = (correct / total) >= 0.80;

  const card = document.querySelector('.results-card');
  assert(!!card, 'results card rendered');
  assert(card.classList.contains(passed ? 'passed' : 'failed'), `pass/fail class correct at ${pct}%`);

  const stats = [...document.querySelectorAll('.stat-num')].map(s => Number(s.textContent));
  assert(stats[0] === total,   `results: total = ${total}`);
  assert(stats[1] === correct, `results: correct = ${correct}`);
  assert(stats[2] === wrong,   `results: incorrect = ${wrong}`);
  assert(stats[3] === skipped, `results: skipped = ${skipped}`);

  const shownPct = document.querySelector('.score-pct').textContent;
  assert(shownPct === pct + '%', `results: score ring = ${pct}%`);

  const badgeText = document.querySelector('.results-badge').textContent;
  assert(passed ? badgeText.includes('PASSED') : badgeText.includes('TRY'), `badge correct for ${passed ? 'pass' : 'fail'}`);

  assert(!!document.getElementById('retake'), 'retake button present');
  assert(!!document.querySelector('a.dashboard-btn'), 'dashboard link present');

  return { correct, wrong, skipped, pct, passed };
}

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

// ── Main ──
(async () => {
  validateData();
  validateHtml();

  await runScenario('All correct — perfect score (100% PASS)', 1, Array(20).fill('correct'));

  const plan80 = Array(20).fill('correct');
  plan80[2] = 'wrong'; plan80[5] = 'wrong'; plan80[9] = 'wrong'; plan80[14] = 'skip';
  await runScenario('16 correct, 3 wrong, 1 skip (80% → PASS boundary)', 2, plan80);

  const planFail = Array(20).fill('correct');
  planFail[0] = 'wrong'; planFail[7] = 'wrong'; planFail[11] = 'wrong'; planFail[18] = 'wrong'; planFail[19] = 'wrong';
  await runScenario('15 correct (75% → FAIL)', 3, planFail);

  const planHint = Array(20).fill('correct');
  planHint[0] = 'hint'; planHint[1] = 'skip'; planHint[3] = 'hint';
  await runScenario('Hint + skip behaviour on book 10', 10, planHint);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Total assertions: ${passes + failures}  |  Passed: ${passes}  |  Failed: ${failures}`);
  console.log(failures === 0 ? 'ALL TESTS PASSED ✅' : `${failures} FAILURE(S) ❌`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
