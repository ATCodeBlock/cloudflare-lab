/**
 * quiz-engine.js — Shared quiz engine for all Magic Tree House quiz pages.
 * Each quiz page has: <main id="quiz-app" data-book="1"></main>
 * The engine fetches data/book<N>.json and drives the quiz.
 *
 * Features:
 * - One question at a time, instant feedback, skip support
 * - Hint toggle (auto-show hints) + per-question Show Hint button
 * - Score displayed as correct/attempted
 * - Question read-aloud via Web Speech API (no external dependencies)
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
  let attempted = 0;    // answered + skipped so far
  let answered = false;  // answered/skipped current question?
  let hintsEnabled = false; // master hint toggle
  let speaking = false;   // TTS currently playing

  const SPEECH_RATE = 0.8;      // slower for young readers
  const SPEECH_LANG = 'en-US'; // US English

  const speechOK = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && 'SpeechSynthesisUtterance' in window;

  // ── DOM (built once) ──
  app.innerHTML = `
    <header class="quiz-header">
      <a href="index.html" class="quiz-back">&larr; All Quizzes</a>
      <h1 class="quiz-title"><span class="quiz-emoji"></span></h1>
      <p class="quiz-meta">Book <span class="quiz-booknum"></span> &middot; 20 questions</p>
    </header>
    <div class="quiz-status">
      <div class="quiz-score">Score: <span id="score">0/0</span></div>
      <label class="hint-toggle" title="Turn hints on or off">
        <input type="checkbox" id="hint-toggle" />
        <span class="hint-toggle-track"><span class="hint-toggle-knob"></span></span>
        <span class="hint-toggle-label">💡 Hints</span>
      </label>
      <div class="quiz-counter" id="counter">Question 1 of 20</div>
    </div>
    <div class="progress-track"><div class="progress-fill" id="progress"></div></div>
    <section class="quiz-card" id="card" aria-live="polite">
      <div class="question-row">
        <h2 class="question-text" id="qtext"></h2>
        <button class="speak-btn" id="speak-btn" type="button"
                aria-label="Listen to the question" title="Listen to the question">🔊</button>
      </div>
      <div class="options" id="options"></div>
      <div class="hint-box" id="hintbox" hidden>
        <strong>Hint:</strong> <span id="hinttext"></span>
      </div>
      <div class="feedback" id="feedback" hidden></div>
      <div class="quiz-controls">
        <button class="btn exit-btn" id="exit-btn" type="button"
                aria-haspopup="dialog">🚪 Exit Quiz</button>
        <button class="btn hint-btn" id="hint-btn">💡 Show Hint</button>
        <div class="spacer"></div>
        <button class="btn skip-btn" id="skip-btn">Skip Question</button>
        <button class="btn next-btn" id="next-btn" disabled>Next Question &rarr;</button>
      </div>
    </section>

    <!-- Exit confirmation modal -->
    <div class="modal-overlay" id="exit-modal" hidden>
      <div class="modal" role="dialog" aria-modal="true"
           aria-labelledby="exit-modal-title">
        <div class="modal-icon">🚪</div>
        <h3 class="modal-title" id="exit-modal-title">Are you sure you want to exit the quiz?</h3>
        <p class="modal-sub">If you leave now, your progress in this quiz will be lost.</p>
        <div class="modal-actions">
          <button class="btn modal-exit-btn" id="exit-confirm" type="button">Exit Quiz</button>
          <button class="btn modal-continue-btn" id="exit-cancel" type="button">Continue Quiz</button>
        </div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), counterEl = $('counter'), progressEl = $('progress');
  const qtextEl = $('qtext'), optionsEl = $('options');
  const hintBox = $('hintbox'), hintText = $('hinttext'), hintBtn = $('hint-btn');
  const hintToggle = $('hint-toggle');
  const speakBtn = $('speak-btn');
  const feedbackEl = $('feedback');
  const skipBtn = $('skip-btn'), nextBtn = $('next-btn');
  const exitBtn = $('exit-btn'), exitModal = $('exit-modal');
  const exitConfirm = $('exit-confirm'), exitCancel = $('exit-cancel');

  // Hide the speaker button entirely when speech is not supported
  if (!speechOK) {
    speakBtn.style.display = 'none';
  }

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

    // Hint visibility follows the master toggle
    hintText.textContent = q.hint;
    syncHintVisibility();

    feedbackEl.hidden = true;
    feedbackEl.textContent = '';
    skipBtn.disabled = false;
    nextBtn.disabled = true;
    nextBtn.textContent = (index === quiz.questions.length - 1)
      ? 'See Results 🎉' : 'Next Question →';

    resetSpeakButton();

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
    attempted++;
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
    attempted++;
    const q = quiz.questions[index];
    skippedCount++;
    paintOptions(q.answer, -1);
    showFeedback('👀 Skipped! The correct answer is shown in green.');
    lockControls();
  });

  let skippedCount = 0;

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
    // correct / attempted — unattempted questions do not count
    scoreEl.textContent = `${score}/${attempted}`;
  }

  function lockControls() {
    hintBtn.disabled = true;
    skipBtn.disabled = true;
    nextBtn.disabled = false;
    updateScore();
  }

  // ── Hint master toggle ──
  hintToggle.addEventListener('change', () => {
    hintsEnabled = hintToggle.checked;
    syncHintVisibility();
  });

  function syncHintVisibility() {
    if (hintsEnabled) {
      hintBox.hidden = false;
      hintBtn.disabled = true;
      hintBtn.textContent = '💡 Hint Shown';
    } else {
      hintBox.hidden = true;
      if (!answered) {
        hintBtn.disabled = false;
        hintBtn.textContent = '💡 Show Hint';
      }
    }
  }

  // ── Per-question Show Hint button (manual reveal) ──
  hintBtn.addEventListener('click', () => {
    hintBox.hidden = false;
    hintBtn.disabled = true;
    hintBtn.textContent = '💡 Hint Shown';
  });

  // ── Text-to-speech (Web Speech API, no external deps) ──
  speakBtn.addEventListener('click', () => {
    if (!speechOK) return;
    const synth = window.speechSynthesis;

    // Toggle: stop playback if already speaking
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }

    // Stop any existing audio before starting new playback
    synth.cancel();

    const text = quiz.questions[index].q;
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = SPEECH_LANG;
    utter.rate = SPEECH_RATE;

    // Prefer a US English voice, fall back to any English voice
    const voices = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
    const voice = voices.find(v => v && v.lang === 'en-US')
      || voices.find(v => v && typeof v.lang === 'string' && v.lang.toLowerCase().startsWith('en'));
    if (voice) utter.voice = voice;

    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);

    setSpeaking(true);
    synth.speak(utter);
  });

  function setSpeaking(on) {
    speaking = on;
    speakBtn.textContent = on ? '⏹️' : '🔊';
    speakBtn.classList.toggle('speaking', on);
    speakBtn.title = on ? 'Stop reading' : 'Listen to the question';
    speakBtn.setAttribute('aria-label', speakBtn.title);
  }

  function resetSpeakButton() {
    if (speechOK && speaking) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

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

  // ── Exit Quiz (with confirmation to prevent accidental exits) ──
  exitBtn.addEventListener('click', () => {
    // Stop any audio while the dialog is up
    if (speechOK) window.speechSynthesis.cancel();
    exitModal.hidden = false;
    exitConfirm.focus();
  });

  exitCancel.addEventListener('click', () => {
    exitModal.hidden = true;
    exitBtn.focus();
  });

  exitConfirm.addEventListener('click', () => {
    // __navigate is a test seam; in the real browser location.href does the job
    if (typeof window.__navigate === 'function') {
      window.__navigate('index.html');
    } else {
      window.location.href = 'index.html';
    }
  });

  // Escape key closes the dialog (same as Continue Quiz)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !exitModal.hidden) {
      exitModal.hidden = true;
      exitBtn.focus();
    }
  });

  // ── Results screen ──
  function renderResults() {
    const total = quiz.questions.length;
    const correct = score;
    const incorrect = attempted - correct - skippedCount;
    const pct = Math.round((correct / total) * 100);
    const passed = (correct / total) >= PASS_MARK;

    const msg = passed
      ? (pct === 100
          ? '🌟 WOW! A perfect score! You are a true Magic Tree House expert!'
          : '🎉 Fantastic work! You really know this book. Keep reading and exploring!')
      : (correct >= total * 0.6
          ? '💪 Good effort! You know a lot about this book. A little more reading and you\'ll ace it!'
          : '🌱 Every adventure takes practice! Re-read the book and try again — you\'ve got this!');

    // Stop any audio still playing when the quiz ends
    if (speechOK) window.speechSynthesis.cancel();

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
          <div class="stat"><span class="stat-num">${skippedCount}</span><span class="stat-label">Skipped</span></div>
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
