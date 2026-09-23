# NET CS Lab — UGC NET Computer Science and Applications (Paper 2, code 87)

An interactive, offline-first study site covering the complete UGC NET Paper 2 syllabus: concept
lessons for all 100 syllabus topics, 17 runnable labs, previous year questions browsable by year and
by topic, exam shortcuts, spaced-repetition flashcards, and full-length timed mock tests.

It is a plain folder of static files. No server, no build step, no login, no tracking, no network
calls at run time. Your progress lives in your browser's `localStorage` and never leaves your device.

## What is inside

| | |
|---|---|
| Syllabus topics with written lessons | **100 of 100** |
| Lesson prose | ~197,000 words |
| Questions | **667** — 187 real past-paper questions plus 480 practice questions |
| Flashcards | **1,124** |
| Interactive labs | **17** |
| Exam shortcuts and traps | ~450 |

### Per unit

| Unit | Topics | Words | Questions | of which real PYQ | Cards |
|---|---|---|---|---|---|
| 1. Discrete Structures and Optimization | 7 | 17,892 | 43 | 21 | 38 |
| 2. Computer System Architecture | 11 | 22,534 | 41 | 19 | 140 |
| 3. Programming Languages and Computer Graphics | 8 | 7,668 | 57 | 17 | 47 |
| 4. Database Management Systems | 9 | 18,758 | 81 | 16 | 136 |
| 5. System Software and Operating System | 13 | 18,064 | 90 | 15 | 112 |
| 6. Software Engineering | 8 | 21,822 | 84 | 15 | 125 |
| 7. Data Structures and Algorithms | 12 | 24,415 | 86 | 18 | 138 |
| 8. Theory of Computation and Compilers | 10 | 25,630 | 38 | 16 | 128 |
| 9. Data Communication and Computer Networks | 13 | 19,552 | 106 | 31 | 130 |
| 10. Artificial Intelligence | 9 | 20,957 | 41 | 19 | 130 |

## Running it

Opening `dist/index.html` by double-clicking will **not** work — browsers block `fetch` on `file://`
addresses, so the lesson data cannot load. Serve the folder over HTTP instead:

```bash
cd dist
python3 -m http.server 8080
# then open http://localhost:8080/
```

Any static host works with no configuration: GitHub Pages, Netlify, Cloudflare Pages, Vercel, an S3
bucket, or your own nginx. Point it at `dist/` and you are done. All URLs are relative, so it works
at a domain root or under a `/repo-name/` sub-path.

### GitHub Pages, step by step

A workflow is already included at `.github/workflows/deploy.yml`, so you do not need to configure a
build. From this folder:

```bash
git init
git add .
git commit -m "NET CS Lab"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then on GitHub go to **Settings → Pages → Build and deployment** and set **Source** to
**GitHub Actions**. Push once more (or run the workflow manually from the **Actions** tab) and the
site appears at `https://<your-username>.github.io/<repo-name>/` after a minute or two.

The repository must be **public** for Pages on a free account. If you prefer not to use Actions, the
alternative is to rename `dist/` to `docs/` and set **Settings → Pages → Source** to *Deploy from a
branch*, `main`, folder `/docs`.

## Using it

- **Dashboard** (`#/`) tracks how much of the syllabus you have read and how accurate you are.
- **Lessons** — one page per syllabus topic, each ending with shortcuts and the traps examiners set.
  Mark a topic studied and it is ticked in the sidebar.
- **Interactive labs** — run the algorithm on your own input instead of reading about it: page
  replacement, CPU and disk scheduling, Banker's algorithm, K-maps, IEEE 754, cache address splitting,
  pipeline speedup, subnetting, CRC and Hamming codes, functional dependencies and normal forms, a
  SQL sandbox, finite automata, FIRST/FOLLOW and the LL(1) table, sorting, graph algorithms, Huffman
  coding, and alpha–beta pruning.
- **PYQs by year** — solve a real sitting end to end, with the official key and a worked explanation.
- **PYQs by topic** — drill one topic until it is solid; the progress bar tracks each one.
- **Shortcuts & tricks** — every shortcut from every lesson on one printable page.
- **Flashcards** — spaced repetition. Cards you find hard return tomorrow; cards you know drift weeks out.
- **Mock tests** — a 100-question, two-hour Paper 2 simulation whose unit mix mirrors the real papers,
  plus unit tests, a past-paper-only set, and a weak-areas set. Exam scoring: +2 a correct answer,
  nothing deducted for a wrong one. The review screen shows what you got wrong and what to revise.
- **Progress** — accuracy by unit, your weakest topics ranked, and your mock scores over time.
- **Search** — press `/` anywhere. Searches lessons, questions and shortcuts together.

Keyboard: `/` focuses search; in flashcards, space reveals the answer and `1`–`4` grade it.

### Back up your progress

Everything is stored in this browser only. Clearing site data or switching device loses it.
**Settings → Export progress** writes a JSON backup you can import anywhere.

## Exam pattern

Paper 2 is 100 questions for 200 marks. Paper 1 (50 questions, 100 marks) and Paper 2 are attempted
in a single three-hour computer-based session. Two marks for a correct answer and **no negative
marking** — so never leave a question blank.

## Rebuilding after editing content

`dist/data/` is generated. The editable sources are in `content/`:

| Path | Holds |
|---|---|
| `build/curriculum.json` | the syllabus: units, topic ids and titles, exam pattern |
| `build/CONTENT_SPEC.md` | the authoring format for lessons, cards and questions |
| `build/QUESTION_SPEC.md` | the question record format |
| `content/units/uN.json` | lessons, shortcuts and traps for unit N |
| `content/cards/uN.json` | flashcards for unit N |
| `content/questions/uN-practice.json` | practice questions for unit N |
| `raw/*.json` | harvested real past-paper questions |
| `dist/app.js`, `dist/app.css` | the application itself (vanilla JS, no framework) |

```bash
python3 build/build.py      # regenerate dist/data from content/ and raw/
python3 tools/validate.py   # deep QA: keys, duplicates, math delimiters, coverage
```

The validator checks that every question has exactly four options and a valid key, that no two
questions are duplicates, that every explanation is substantial, that math delimiters balance, that
every topic has lesson content and shortcuts, and that every embedded lab id exists.

There are also browser tests, which need Node and a Chromium binary:

```bash
node tools/e2e.mjs          # 36 end-to-end checks including a full mock run
node tools/verify-labs.mjs  # checks lab output against textbook answers
```

## A note on accuracy

The labs were verified against standard textbook examples — the FIFO/LRU/Optimal page-fault counts
for the classic reference string, FCFS scheduling averages, SSTF and FCFS head movement, the Banker's
algorithm safe sequence, Huffman's 224-bit encoding, and the K-map minimal SOP cross-checked against an
independent Quine–McCluskey solver.

That said, this is study material, not an official source. Verify anything that matters against the
official syllabus and answer keys at [ugcnet.nta.ac.in](https://ugcnet.nta.ac.in). Past-year questions
are reproduced from publicly released UGC NET / NTA papers for study purposes; the explanations,
shortcuts, lessons and labs are original to this site. Not affiliated with UGC or NTA.

Bundled libraries — KaTeX, marked and MiniSearch — are each under their own permissive licence.
