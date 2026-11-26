/**
 * quiz-engine.js — Shared quiz engine for all Magic Tree House quiz pages.
 * Each quiz page has: <main id="quiz-app" data-book="1"></main>
 * The engine fetches data/book<N>.json and drives the quiz.
 * Books are added by dropping a JSON file and a book<N>.html page.
 */
'use strict';

(function () {
  const app = document.getElementById('quiz-app');
  if (!app) return;

  const bookNum  = app.dataset.book;
  const dataUrl  = `data/book${bookNum}.json`;
  const PASS_MARK = 0.80;

  // ── State ──
  let quiz    = null;   // { book, title, emoji, questions: [] }
  let index   = 0;      // current question index
  let score   = 0;      // correct count
  let skipped = 0;
  let answered = false;  // answered/skipped current question?

  // ── DOM refs (built once) ──
  app.innerHTML = `
    <header class="quiz-header">
      <a href="index.html" class="quiz-back">&larr; All Quizzes</a>
      <h1 class="quiz-title"><span class="quiz-emoji"></span></h1>
      <p class="quiz-meta">Book <span class="quiz-booknum"></span> &middot; 20 questions</p>
    </header>
    <div class="quiz-status">
      <div class="quiz-score">Score: <span id="score">0</span></div>
      <div class="quiz-counter" id="counter">Question 1 of 20</div>
    </div>
    <div class="progress-track"><div class="progress-fill" id="progress"></div></div>
    <section class="quiz-card" id="card" aria-live="polite">
      <h2 class="question-text" id="qtext"></h2>
      <div class="options" id="options"></div>
      <div class="hint-box" id="hintbox" hidden>
        <strong>Hint:</strong> <span id="hinttext"></span>
      </div>
      <div class="feedback" id="feedback" hidden></div>
      <div class="quiz-controls">
        <button class="btn hint-btn" id="hint-btn">💡 Show Hint</button>
        <div class="spacer"></div>
        <button class="btn skip-btn" id="skip-btn">Skip Question</button>
        <button class="btn next-btn" id="next-btn" disabled>Next Question &rarr;</button>
      </div>
    </section>
  `;

  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), counterEl = $('counter'), progressEl = $('progress');
  const qtextEl = $('qtext'), optionsEl = $('options');
  const hintBox = $('hintbox'), hintText = $('hinttext'), hintBtn = $('hint-btn');
  const feedbackEl = $('feedback');
  const skipBtn = $('skip-btn'), nextBtn = $('next-btn');

  // ── Load data ──
  fetch(dataUrl)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      quiz = data;
      document.querySelector('.quiz-emoji').textContent = `${quiz.emoji} `;
      document.querySelector('.quiz-booknum').textContent = `#${quiz.book}`;
      document.title = `Quiz — Book ${quiz.book}: ${quiz.title}`;
      document.querySelector('.quiz-title').append(quiz.title);
      renderQuestion();
    })
    .catch(err => {
      app.innerHTML = `<p class="quiz-error">Could not load quiz data (${err.message}).
        <a href="index.html">Back to all quizzes</a></p>`;
    });

  // ── Render one question ──
  function renderQuestion() {
    answered = false;
    const q = quiz.questions[index];

    counterEl.textContent = `Question ${index + 1} of ${quiz.questions.length}`;
    progressEl.style.width = `${(index / quiz.questions.length) * 100}%`;
    qtextEl.textContent = q.q;

    hintBox.hidden = true;
    hintText.textContent = q.hint;
    hintBtn.disabled = false;
    hintBtn.textContent = '💡 Show Hint';
    feedbackEl.hidden = true;
    feedbackEl.textContent = '';
    skipBtn.disabled = false;
    nextBtn.disabled = true;
    nextBtn.textContent = (index === quiz.questions.length - 1)
      ? 'See Results 🎉' : 'Next Question →';

    optionsEl.innerHTML = '';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.dataset.i = i;
      btn.textContent = `${'ABCD'[i]}. ${opt}`;
      btn.addEventListener('click', () => choose(i));
      optionsEl.appendChild(btn);
    });
  }

  // ── Answer selection ──
  function choose(i) {
    if (answered) return;
    answered = true;
    const q = quiz.questions[index];
    const correct = i === q.answer;

    if (correct) score++;

    updateScore();
    paintOptions(q.answer, i);
    showFeedback(correct ? '✅ Correct! Great job!' : '❌ Not quite — the correct answer is highlighted in green.');
    lockControls();
  }

  // ── Skip ──
  skipBtn.addEventListener('click', () => {
    if (answered) return;
    answered = true;
    const q = quiz.questions[index];
    skipped++;
    paintOptions(q.answer, -1);
    showFeedback('👀 Skipped! The correct answer is shown in green.');
    lockControls();
  });

  function paintOptions(correctIdx, chosenIdx) {
    [...optionsEl.children].forEach((btn, i) => {
      btn.disabled = true;
      if (i === correctIdx) btn.classList.add('correct');
      if (i === chosenIdx && chosenIdx !== correctIdx) btn.classList.add('wrong');
    });
  }

  function showFeedback(msg) {
    feedbackEl.textContent = msg;
    feedbackEl.hidden = false;
  }

  function updateScore() {
    scoreEl.textContent = score;
  }

  function lockControls() {
    hintBtn.disabled = true;
    skipBtn.disabled = true;
    nextBtn.disabled = false;
  }

  // ── Hint ──
  hintBtn.addEventListener('click', () => {
    hintBox.hidden = false;
    hintBtn.disabled = true;
    hintBtn.textContent = '💡 Hint Shown';
  });

  // ── Next / Results ──
  nextBtn.addEventListener('click', () => {
    if (!answered) return;
    index++;
    if (index < quiz.questions.length) {
      renderQuestion();
    } else {
      renderResults();
    }
  });

  // ── Results screen ──
  function renderResults() {
    const total = quiz.questions.length;
    const correct = score;
    const incorrect = total - correct - skipped;
    const pct = Math.round((correct / total) * 100);
    const passed = (correct / total) >= PASS_MARK;

    const msg = passed
      ? (pct === 100
          ? '🌟 WOW! A perfect score! You are a true Magic Tree House expert!'
          : '🎉 Fantastic work! You really know this book. Keep reading and exploring!')
      : (correct >= total * 0.6
          ? '💪 Good effort! You know a lot about this book. A little more reading and you\'ll ace it!'
          : '🌱 Every adventure takes practice! Re-read the book and try again — you\'ve got this!');

    app.innerHTML = `
      <header class="quiz-header">
        <a href="index.html" class="quiz-back">&larr; All Quizzes</a>
        <h1 class="quiz-title">${quiz.emoji} ${quiz.title}</h1>
      </header>
      <section class="results-card ${passed ? 'passed' : 'failed'}" aria-live="polite">
        <div class="results-badge">${passed ? '🏆 PASSED' : '📚 TRY AGAIN'}</div>
        <h2 class="results-heading">${passed ? 'You Passed!' : 'Almost There!'}</h2>
        <p class="results-message">${msg}</p>
        <div class="results-grid">
          <div class="stat"><span class="stat-num">${total}</span><span class="stat-label">Questions</span></div>
          <div class="stat"><span class="stat-num">${correct}</span><span class="stat-label">Correct</span></div>
          <div class="stat"><span class="stat-num">${incorrect}</span><span class="stat-label">Incorrect</span></div>
          <div class="stat"><span class="stat-num">${skipped}</span><span class="stat-label">Skipped</span></div>
        </div>
        <div class="score-ring">
          <span class="score-pct">${pct}%</span>
          <span class="score-sub">final score &middot; ${passed ? 'pass' : 'fail'} (need 80%)</span>
        </div>
        <div class="results-actions">
          <button class="btn retake-btn" id="retake">🔄 Retake Quiz</button>
          <a class="btn dashboard-btn" href="index.html">🏠 Back to Dashboard</a>
        </div>
      </section>
    `;
    document.getElementById('retake').addEventListener('click', () => location.reload());
  }
})();
