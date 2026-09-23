#!/usr/bin/env python3
"""Assemble dist/data from build/curriculum.json, raw PYQ files and content/ unit files."""
import json, os, glob, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B    = os.path.join(ROOT, "build")
DIST = os.path.join(ROOT, "dist", "data")
RAW  = os.path.join(ROOT, "raw")
CONT = os.path.join(ROOT, "content")

cur = json.load(open(os.path.join(B, "curriculum.json")))
valid_topics = {t["id"] for u in cur["units"] for t in u["topics"]}
topic_unit   = {t["id"]: u["n"] for u in cur["units"] for t in u["topics"]}

def die(msg): print("ERROR:", msg); sys.exit(1)

# ---------------------------------------------------------------- questions
questions, seen_ids, problems = [], set(), []
for path in sorted(glob.glob(os.path.join(RAW, "*.json"))) + sorted(glob.glob(os.path.join(CONT, "questions", "*.json"))):
    try:
        data = json.load(open(path))
    except Exception as e:
        problems.append(f"{os.path.basename(path)}: unreadable ({e})"); continue
    if not isinstance(data, list):
        problems.append(f"{os.path.basename(path)}: not a JSON array"); continue
    for q in data:
        qid = q.get("id")
        if not qid or qid in seen_ids:
            problems.append(f"{os.path.basename(path)}: duplicate/missing id {qid!r}"); continue
        if not isinstance(q.get("opts"), list) or len(q["opts"]) != 4:
            problems.append(f"{qid}: needs exactly 4 options"); continue
        if not isinstance(q.get("ans"), int) or not 0 <= q["ans"] <= 3:
            problems.append(f"{qid}: bad ans {q.get('ans')!r}"); continue
        if not q.get("q") or not str(q.get("exp", "")).strip():
            problems.append(f"{qid}: empty stem or explanation"); continue
        # normalise topic / unit
        topic = str(q.get("topic", "")).strip()
        if topic not in valid_topics:
            unit = q.get("unit")
            guess = next((t for t in valid_topics if t.startswith(f"{unit}.")), None)
            if not guess:
                problems.append(f"{qid}: unknown topic {topic!r}"); continue
            problems.append(f"{qid}: topic {topic!r} unknown → {guess}")
            topic = guess
        q["topic"] = topic
        q["unit"]  = topic_unit[topic]
        q.setdefault("src", "practice")
        q.setdefault("diff", "medium")
        q.setdefault("tags", [])
        q.setdefault("trick", "")
        seen_ids.add(qid)
        questions.append(q)

os.makedirs(os.path.join(DIST, "questions"), exist_ok=True)
by_unit = collections.defaultdict(list)
for q in questions: by_unit[q["unit"]].append(q)
for u in cur["units"]:
    qs = sorted(by_unit[u["n"]], key=lambda x: (x.get("src") != "pyq", -(x.get("year") or 0), x.get("num") or 0, x["id"]))
    json.dump(qs, open(os.path.join(DIST, "questions", f'u{u["n"]}.json'), "w"), ensure_ascii=False, separators=(",", ":"))

# ---------------------------------------------------------------- units (lessons)
os.makedirs(os.path.join(DIST, "units"), exist_ok=True)
os.makedirs(os.path.join(DIST, "cards"), exist_ok=True)
lesson_counts, card_counts = {}, {}
for u in cur["units"]:
    n = u["n"]
    src = os.path.join(CONT, "units", f"u{n}.json")
    unit = json.load(open(src)) if os.path.exists(src) else {"unit": n, "topics": []}
    unit["unit"] = n
    known = {t["id"] for t in unit.get("topics", [])}
    for t in u["topics"]:
        if t["id"] not in known:
            unit.setdefault("topics", []).append({"id": t["id"], "title": t["title"], "blocks": [], "tricks": []})
    for t in unit["topics"]:
        cu = next((x for x in u["topics"] if x["id"] == t["id"]), None)
        if cu: t["title"] = t.get("title") or cu["title"]
    unit["topics"].sort(key=lambda t: [int(p) for p in t["id"].split(".")])
    json.dump(unit, open(os.path.join(DIST, "units", f"u{n}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    lesson_counts[n] = sum(1 for t in unit["topics"] if t.get("blocks"))

    csrc = os.path.join(CONT, "cards", f"u{n}.json")
    cards = json.load(open(csrc)) if os.path.exists(csrc) else []
    for c in cards:
        c.setdefault("unit", n)
    json.dump(cards, open(os.path.join(DIST, "cards", f"u{n}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    card_counts[n] = len(cards)

# ---------------------------------------------------------------- index
idx = {"exam": cur["exam"], "built": __import__("datetime").date.today().isoformat(),
       "units": [{"n": u["n"], "title": u["title"],
                  "topics": [{"id": t["id"], "title": t["title"]} for t in u["topics"]]} for u in cur["units"]]}
json.dump(idx, open(os.path.join(DIST, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))

# ---------------------------------------------------------------- report
pyq = sum(1 for q in questions if q.get("src") == "pyq")
print(f"questions : {len(questions):4d}  ({pyq} real PYQ, {len(questions)-pyq} practice)")
print(f"lessons   : {sum(lesson_counts.values()):4d} of 100 topics written")
print(f"cards     : {sum(card_counts.values()):4d}")
print("per unit  : " + "  ".join(f"u{u['n']}={len(by_unit[u['n']])}/{lesson_counts[u['n']]}L" for u in cur["units"]))
if problems:
    print(f"\n{len(problems)} content problem(s):")
    for p in problems[:40]: print("  -", p)
