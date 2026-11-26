# Avinash Cloud Lab — v1.1

A static learning website covering Cloudflare, Java REST APIs, WebSockets, and
interactive Magic Tree House reading quizzes for grades 2–3.

## Structure

```
Project1/
├── index.html            # Main site
├── contact.html
├── css/styles.css        # Main site styles
├── js/app.js             # Main site JS
├── quiz/
│   ├── index.html        # Magic Tree House Quiz Dashboard
│   ├── quiz.css          # Shared quiz styles
│   ├── quiz-engine.js    # Shared quiz engine (all 10 books)
│   ├── book1.html … book10.html
│   ├── data/book1.json … book10.json   # 200 questions
│   ├── parse-md.js       # Utility: regenerate JSON from source markdown
│   ├── generate-pages.js # Utility: regenerate the 10 book pages
│   └── test/quiz.test.js # Headless test suite (jsdom)
├── README.md
└── .gitignore
```

## Topics Covered

- **Cloudflare** — Pages, Workers, CDN & Security
- **Java REST APIs** — Spring Boot, CRUD patterns, best practices
- **WebSockets** — Protocol basics, Cloudflare Durable Objects
- **Magic Tree House Quizzes** — Books 1–10, 20 questions each

## Magic Tree House Quizzes

- Dashboard with all 10 books, each linking to its own quiz page
- One question at a time (SPA-style, no page reloads)
- Hints on demand, instant correct/incorrect feedback, skip support
- Results screen with 80% pass threshold and encouraging messages
- Fully static — no backend, no frameworks; deployable on Cloudflare Pages

Run the quiz test suite (requires Node):

```
npm install
node quiz/test/quiz.test.js
```

## Deployment

This site is a fully static site — no build step required.

Deploy to Cloudflare Pages:
1. Push this folder to a GitHub repository
2. Connect the repo in the Cloudflare Pages dashboard
3. Set build command to (none) and output directory to `/`

## Tech Stack

- HTML5
- CSS3 (custom properties, CSS Grid, responsive)
- Vanilla JavaScript (ES6+)
- jsdom (dev-only, for the quiz test suite)
