# Authoring a unit

You write THREE files for your unit N:

1. `content/units/uN.json`      — lessons, shortcuts and traps
2. `content/cards/uN.json`      — flashcards
3. `content/questions/uN-practice.json` — practice questions (format: build/QUESTION_SPEC.md)

Topic ids and titles come from `build/curriculum.json`. Cover EVERY topic of your unit.

---

## 1. content/units/uN.json

```json
{ "unit": N,
  "summary": "one sentence on what this unit is and where its marks come from",
  "topics": [
    { "id": "5.7",
      "title": "Deadlocks",
      "summary": "one short line shown on cards and lists",
      "blocks": [ ...see below... ],
      "tricks": [ {"title": "...", "body": "markdown"} ],
      "traps":  [ {"title": "...", "body": "markdown"} ]
    }
  ]
}
```

### Block types

| block | shape | use for |
|---|---|---|
| md | `{"t":"md","text":"markdown"}` | ordinary prose, headings (`## ...`), tables, lists |
| cal | `{"t":"cal","kind":"note|formula|mnemonic|trap|trick","title":"...","text":"markdown"}` | a boxed aside |
| ex | `{"t":"ex","title":"Worked example — ...","text":"markdown"}` | a fully worked numerical/derivation with the arithmetic shown |
| steps | `{"t":"steps","items":["step one","step two"]}` | a numbered procedure |
| lab | `{"t":"lab","lab":"pagerepl","title":"Try it","note":"one line"}` | embed an interactive lab |
| check | `{"t":"check","id":"chk-5.7-1","q":"...","opts":["a","b","c","d"],"ans":0,"exp":"..."}` | a quick self-test inside the lesson |

### What a good topic looks like
- 700–1400 words of real teaching, not a definition dump. Explain the mechanism, then the exam angle.
- Open with what the idea IS and why it exists, in plain language, before any formalism.
- Use `##` headings so the on-page table of contents works. Never use `#`.
- At least one `ex` worked example with the actual numbers carried through.
- At least one `check` block so the reader performs what they just read.
- Embed the relevant `lab` block if one exists for your unit (list below).
- 2–5 `tricks`: genuine, specific time-savers. "Learn the formula" is not a trick.
  A trick is "block size = 256 − interesting mask octet, so /26 → blocks of 64, networks at .0/.64/.128/.192".
- 1–3 `traps`: the specific confusion the examiner exploits (LOOK vs SCAN, overloading vs overriding,
  `char*` vs `char[]`, 2NF vs 3NF, FIRST vs FOLLOW).
- Math in `$...$` / `$$...$$` (KaTeX). Code in fenced blocks. Tables are Markdown tables.

### Labs available (embed only these ids, only in the listed unit)
- unit 2: `kmap`, `numbase`, `cache`, `pipeline`
- unit 4: `fdtool`, `sql`
- unit 5: `pagerepl`, `cpusched`, `disksched`, `banker`
- unit 7: `sortviz`, `graphalgo`, `huffman`
- unit 8: `dfa`, `firstfollow`
- unit 9: `subnet`, `errdet`
- unit 10: `alphabeta`
(`kmap` may also be embedded in topic 1.6; `graphalgo` in 1.5.)

---

## 2. content/cards/uN.json

A JSON array:
```json
[ {"id":"c5.7-1","unit":5,"topic":"5.7","front":"Four necessary conditions for deadlock?",
   "back":"Mutual exclusion, hold and wait, no preemption, circular wait. Break **any one** and deadlock cannot occur.",
   "kind":"definition"} ]
```
8–16 cards per topic-heavy unit. Fronts are questions or prompts, never bare nouns.
Backs are short — one or two sentences, a formula, or a 3-item list. Markdown and `$math$` allowed.

## 3. content/questions/uN-practice.json

Follow `build/QUESTION_SPEC.md` exactly. `src` is `"practice"`, `year` and `session` are `null`.
Write 45–70 questions spread across ALL topics of the unit, weighted towards the topics that
carry the most marks. Mix difficulty roughly 30% easy / 50% medium / 20% hard.
Model the style on real UGC NET questions: match-the-list items, "which of the following statements
is/are true", numericals with clean answers, and code-output questions.
Every `exp` shows the working. Add a `trick` wherever a real shortcut exists.

---

## Rules
- Valid JSON, UTF-8, no trailing commas, `\n` for newlines inside strings.
- Be factually careful. A wrong answer key or a wrong formula is worse than a missing topic.
- Write in clear prose. Do not pad. Do not use emoji.
- Do not copy text from textbooks or websites — write it yourself.

## Verify before you finish
```
python3 - <<'PY'
import json,sys
N=<your unit number>
u=json.load(open(f'/home/claude/ugcnet/content/units/u{N}.json'))
c=json.load(open(f'/home/claude/ugcnet/content/cards/u{N}.json'))
q=json.load(open(f'/home/claude/ugcnet/content/questions/u{N}-practice.json'))
cur=json.load(open('/home/claude/ugcnet/build/curriculum.json'))
want={t['id'] for x in cur['units'] if x['n']==N for t in x['topics']}
have={t['id'] for t in u['topics']}
assert not want-have, f"missing topics: {want-have}"
for t in u['topics']:
    assert t.get('blocks'), f"{t['id']} has no blocks"
    assert t.get('tricks'), f"{t['id']} has no tricks"
for x in q:
    assert len(x['opts'])==4 and 0<=x['ans']<=3 and x['exp'] and x['topic'] in want, x['id']
print(f"unit {N}: {len(u['topics'])} topics, {len(c)} cards, {len(q)} questions  OK")
PY
```
