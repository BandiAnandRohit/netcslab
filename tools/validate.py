#!/usr/bin/env python3
"""Deep content QA over dist/data."""
import json, glob, os, re, collections, sys
D="dist/data"
idx=json.load(open(f"{D}/index.json"))
topics={t["id"]:t for u in idx["units"] for t in u["topics"]}
issues=collections.defaultdict(list)
def bad(kind,msg): issues[kind].append(msg)

# ---- questions ----
QS=[]
for u in idx["units"]:
    QS += json.load(open(f"{D}/questions/u{u['n']}.json"))
seen_id, seen_stem = set(), {}
ansdist = collections.Counter()
for q in QS:
    i=q["id"]
    if i in seen_id: bad("dup-id", i)
    seen_id.add(i)
    if len(q["opts"])!=4: bad("opts", f"{i}: {len(q['opts'])} options")
    if len(set(map(str.strip, map(str,q["opts"]))))!=4: bad("dup-option", f"{i}: identical options")
    if not isinstance(q["ans"],int) or not 0<=q["ans"]<=3: bad("ans", i)
    if q["topic"] not in topics: bad("topic", f"{i}: {q['topic']}")
    exp=str(q.get("exp","")).strip()
    if len(exp)<40: bad("thin-exp", f"{i}: {len(exp)} chars")
    stem=(re.sub(r"\s+"," ",str(q["q"]))+"||"+str(q["opts"][0])).strip().lower()[:200]
    if stem in seen_stem: bad("dup-stem", f"{i} ~ {seen_stem[stem]}")
    seen_stem[stem]=i
    ansdist[q["ans"]]+=1
    if q.get("src")=="pyq" and not q.get("year"): bad("pyq-noyear", i)
    # unbalanced math delimiters
    def odd(t): return str(t).replace("\\$","").count("$")%2
    if odd(q["q"]): bad("math", f"{i}: odd $ count in stem")
    for k,o in enumerate(q["opts"]):
        if odd(o): bad("math", f"{i}: odd $ count in option {k}")
    if odd(exp): bad("math", f"{i}: odd $ count in exp")
    if q.get("src")=="practice" and re.search(r"\boption\s*\(?[A-D1-4]\)?\b|\b(first|second|third|fourth)\s+option\b", exp, re.I):
        bad("positional-ref", f"{i}: explanation names an option by position")

# ---- lessons ----
LAB_IDS=set(re.findall(r'deflab\("([a-z]+)"', open("dist/app.js").read()))
tcount=0; wcount=0
for u in idx["units"]:
    unit=json.load(open(f"{D}/units/u{u['n']}.json"))
    ids={t["id"] for t in unit["topics"]}
    want={t["id"] for t in u["topics"]}
    if want-ids: bad("missing-topic", f"u{u['n']}: {want-ids}")
    for t in unit["topics"]:
        tcount+=1
        if not t.get("blocks"): bad("empty-topic", t["id"]); continue
        w=sum(len(str(b.get("text") or " ".join(b.get("items",[])) or "").split()) for b in t["blocks"])
        wcount+=w
        if w<400: bad("short-topic", f"{t['id']}: {w} words")
        if not t.get("tricks"): bad("no-tricks", t["id"])
        for b in t["blocks"]:
            if b["t"]=="lab" and b.get("lab") not in LAB_IDS: bad("bad-lab", f"{t['id']}: {b.get('lab')}")
            if b["t"]=="check":
                if len(b.get("opts",[]))!=4 or not 0<=b.get("ans",-1)<=3: bad("bad-check", f"{t['id']}:{b.get('id')}")
                if not str(b.get("exp","")).strip(): bad("bad-check", f"{t['id']}: check has no explanation")
            txt=str(b.get("text",""))
            if txt.replace("\\$","").count("$")%2: bad("math", f"{t['id']}: odd $ count in a block")
            if re.search(r"^# ", txt, re.M): bad("h1", f"{t['id']}: uses '# ' heading")

# ---- cards ----
CC=0
for u in idx["units"]:
    for c in json.load(open(f"{D}/cards/u{u['n']}.json")):
        CC+=1
        if c.get("topic") not in topics: bad("card-topic", f"{c.get('id')}: {c.get('topic')}")
        if not str(c.get("front","")).strip() or not str(c.get("back","")).strip():
            bad("card-empty", c.get("id"))

print(f"topics {tcount}  lesson words {wcount:,}  questions {len(QS)}  cards {CC}")
print("answer key distribution A/B/C/D:", [ansdist[i] for i in range(4)])
pyq=[q for q in QS if q.get("src")=="pyq"]
print(f"PYQ {len(pyq)} across {len(set(q.get('session') for q in pyq))} sittings; practice {len(QS)-len(pyq)}")
per=collections.Counter(q["topic"] for q in QS)
empty=[t for t in topics if per[t]==0]
if empty: print(f"topics with zero questions ({len(empty)}):", ", ".join(sorted(empty)[:20]))
print()
if not issues: print("NO ISSUES")
for k,v in sorted(issues.items(), key=lambda x:-len(x[1])):
    print(f"{k}: {len(v)}")
    for m in v[:6]: print("   ", m)
