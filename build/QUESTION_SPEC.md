# Question record format

Every question is one JSON object in a JSON array. Fields:

| field | type | notes |
|---|---|---|
| `id` | string | unique, e.g. `pyq-2019-jun-s1-q014` or `prac-u5-0032` |
| `src` | `"pyq"` or `"practice"` | `pyq` ONLY for verbatim real exam questions with a verified key |
| `year` | number or null | exam year for pyq, null for practice |
| `session` | string or null | e.g. `"June 2019 Shift I"`, `"December 2018"` |
| `num` | number or null | original question number in that paper |
| `unit` | number 1-10 | syllabus unit |
| `topic` | string | topic id from build/curriculum.json, e.g. `"5.7"` |
| `q` | string | question stem, Markdown. Use `$...$` / `$$...$$` for math, fenced blocks for code |
| `opts` | array of 4 strings | Markdown allowed |
| `ans` | number 0-3 | index of the correct option |
| `exp` | string | ORIGINAL explanation, 2-6 sentences, Markdown. Explain WHY, show the working |
| `trick` | string or "" | one-line shortcut for this question type, if a real one exists |
| `diff` | `"easy"`,`"medium"`,`"hard"` | |
| `tags` | array of strings | lowercase concepts, e.g. `["banker's algorithm","deadlock avoidance"]` |
| `srcUrl` | string or "" | page the pyq was verified from |

## Hard rules
- `ans` must be 0-based and must match the verified official key.
- Exactly 4 options. No "All of the above" unless the original had it.
- `exp` must be written from scratch in your own words. Never copy an explanation from a website.
- Question stems for `src:"pyq"` must be the real exam wording, reconstructed faithfully. If a source only
  paraphrases a question and you cannot recover the real wording and data, DROP it rather than guess.
- If a source's key is doubtful or two sources disagree, either resolve it by solving the question yourself
  and note it in `exp`, or drop the question. Never ship a wrong key.
- Escape correctly: valid JSON, no trailing commas, no literal newlines inside strings (use `\n`).
