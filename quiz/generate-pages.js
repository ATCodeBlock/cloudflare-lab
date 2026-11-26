/**
 * generate-pages.js — Generate all 10 book quiz HTML pages.
 * Run once: node quiz/generate-pages.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const outDir = path.join(__dirname);

const books = [
  { num: 1,  title: 'Dinosaurs Before Dark',      emoji: '🦕', accent: '#e74c3c', accentDark: '#c0392b', accentLt: '#fdecea' },
  { num: 2,  title: 'The Knight at Dawn',          emoji: '⚔️', accent: '#8e44ad', accentDark: '#7d3c98', accentLt: '#f4ecfb' },
  { num: 3,  title: 'Mummies in the Morning',      emoji: '🏺', accent: '#b7950b', accentDark: '#9a7d0a', accentLt: '#fef9e7' },
  { num: 4,  title: 'Pirates Past Noon',           emoji: '🏴‍☠️', accent: '#2980b9', accentDark: '#2471a3', accentLt: '#eaf4fb' },
  { num: 5,  title: 'Night of the Ninjas',         emoji: '🥷', accent: '#16a085', accentDark: '#138d75', accentLt: '#e8f8f5' },
  { num: 6,  title: 'Afternoon on the Amazon',     emoji: '🌿', accent: '#27ae60', accentDark: '#229954', accentLt: '#eafaf1' },
  { num: 7,  title: 'Sunset of the Sabertooth',    emoji: '🦣', accent: '#d35400', accentDark: '#ba4a00', accentLt: '#fdf2e9' },
  { num: 8,  title: 'Midnight on the Moon',        emoji: '🌙', accent: '#2471a3', accentDark: '#1f618d', accentLt: '#eaf4fb' },
  { num: 9,  title: 'Dolphins at Daybreak',        emoji: '🐬', accent: '#1abc9c', accentDark: '#17a589', accentLt: '#e8f8f5' },
  { num: 10, title: 'Ghost Town at Sundown',       emoji: '👻', accent: '#7f8c8d', accentDark: '#717d7e', accentLt: '#f2f3f4' },
];

for (const b of books) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quiz — Book ${b.num}: ${b.title} — Avinash Cloud Lab</title>
  <link rel="stylesheet" href="quiz.css" />
  <style>
    :root {
      --accent:      ${b.accent};
      --accent-dark: ${b.accentDark};
      --accent-lt:   ${b.accentLt};
    }
  </style>
</head>
<body>

  <!-- Site nav -->
  <header class="quiz-site-nav">
    <div class="nav-inner">
      <a href="../index.html" class="logo">☁ Avinash Cloud Lab</a>
      <nav>
        <a href="../index.html#cloudflare">Cloudflare</a>
        <a href="../index.html#rest-api">REST APIs</a>
        <a href="../index.html#websockets">WebSockets</a>
        <a href="../contact.html">Contact</a>
      </nav>
    </div>
  </header>

  <!-- Quiz engine mounts here -->
  <main id="quiz-app" data-book="${b.num}"></main>

  <footer style="text-align:center;padding:1.5rem 1rem;color:#999;font-size:0.8rem;border-top:1px solid #e0d8c8;margin-top:2rem;">
    Magic Tree House is a series by Mary Pope Osborne &mdash; <a href="index.html" style="color:var(--accent)">Back to Quizzes</a>
  </footer>

  <script src="quiz-engine.js"></script>
</body>
</html>
`;
  const file = path.join(outDir, `book${b.num}.html`);
  fs.writeFileSync(file, html, 'utf8');
  console.log(`Wrote ${file}`);
}
console.log('All pages generated.');
