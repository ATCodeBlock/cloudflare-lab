/**
 * parse-md.js — Run once with Node to regenerate all book JSON files.
 * Usage: node quiz/parse-md.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const mdPath  = path.join(__dirname, '../../magic_tree_house_quizzes_books_1-10.md');
const outDir  = path.join(__dirname, 'data');

const BOOK_EMOJIS = ['🦕','⚔️','🏺','🏴‍☠️','🥷','🌿','🦣','🌙','🐬','👻'];

const md = fs.readFileSync(mdPath, 'utf8');

// Split by horizontal rules; each chunk belongs to one Q block.
// First chunk has the preamble + first question header info.
const books = [];
let currentBook  = null;
let currentQ     = null;

const lines = md.split(/\r?\n/);

for (const raw of lines) {
  const line = raw.trim();

  // Book header: ## Book 3: Mummies in the Morning
  const bookMatch = line.match(/^## Book (\d+): (.+)/);
  if (bookMatch) {
    if (currentQ) currentBook.questions.push(finalise(currentQ)); // flush Q before closing book
    if (currentBook) books.push(currentBook);
    currentBook = {
      book:      parseInt(bookMatch[1], 10),
      title:     bookMatch[2].trim(),
      emoji:     BOOK_EMOJIS[parseInt(bookMatch[1], 10) - 1],
      questions: []
    };
    currentQ = null;
    continue;
  }

  // Question header: ### Question 7: What does...
  const qMatch = line.match(/^### Question \d+: (.+)/);
  if (qMatch) {
    if (currentQ) currentBook.questions.push(finalise(currentQ));
    currentQ = { q: qMatch[1].trim(), options: [], hint: '', answer: -1 };
    continue;
  }

  if (!currentQ) continue;

  // Option line: -   A. Some text
  const optMatch = line.match(/^-\s+([A-D])\.\s+(.+)/);
  if (optMatch) {
    currentQ.options.push(optMatch[2].trim());
    continue;
  }

  // Hint: **Hint:** Some text
  const hintMatch = line.match(/^\*\*Hint:\*\*\s+(.+)/);
  if (hintMatch) {
    currentQ.hint = hintMatch[1].trim();
    continue;
  }

  // Answer: **Answer:** C. Some text
  const ansMatch = line.match(/^\*\*Answer:\*\*\s+([A-D])\./);
  if (ansMatch) {
    currentQ.answer = 'ABCD'.indexOf(ansMatch[1]);
    continue;
  }
}

// Push last Q and last book
if (currentQ)   currentBook.questions.push(finalise(currentQ));
if (currentBook) books.push(currentBook);

function finalise(q) {
  if (q.answer === -1) throw new Error(`No answer found for: ${q.q}`);
  if (q.options.length !== 4) throw new Error(`Expected 4 options for: ${q.q}`);
  return q;
}

// Validate
let total = 0;
for (const b of books) {
  total += b.questions.length;
  if (b.questions.length !== 20) {
    console.error(`Book ${b.book} has ${b.questions.length} questions (expected 20)`);
  }
}
console.log(`Parsed ${books.length} books, ${total} questions total.`);

// Write JSON
fs.mkdirSync(outDir, { recursive: true });
for (const b of books) {
  const file = path.join(outDir, `book${b.book}.json`);
  fs.writeFileSync(file, JSON.stringify(b, null, 2), 'utf8');
  console.log(`  Wrote ${file}  (${b.questions.length} questions)`);
}
console.log('Done.');
