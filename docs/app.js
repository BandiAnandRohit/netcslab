/* NET CS Lab — UGC NET Computer Science and Applications (Paper 2, code 87)
   Static, offline-first study app. No server, no login, no tracking. */
(function () {
"use strict";

/* ============================ tiny helpers ============================ */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k === "text") n.textContent = attrs[k];
    else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
    if (c == null) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
  return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ":" + pad(m) : m) + ":" + pad(s);
}
function shuffle(a, rnd) {
  a = a.slice(); rnd = rnd || Math.random;
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
function todayKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function dayNum(t) { return Math.floor((t == null ? Date.now() : t) / 86400000); }
function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

/* ============================ persistent store ============================ */
var KEY = "net:v1:";
var Store = {
  get: function (k, d) {
    try { var v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(KEY + k); } catch (e) {} },
  keys: function () {
    var out = []; try { for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i); if (k.indexOf(KEY) === 0) out.push(k.slice(KEY.length)); } } catch (e) {}
    return out;
  }
};
/* state shape:
   read      : { topicId: ts }                        lessons marked complete
   att       : { qid: {n, ok, last, lastPick} }       per-question attempt record
   srs       : { cardId: {due, ivl, ease, reps, lapses} }
   mocks     : [ {id, ts, kind, score, total, correct, wrong, skipped, secs, byUnit:{}} ]
   streak    : { last: "YYYY-MM-DD", n, days: {} }
   settings  : { shuffleOpts, instant, fontSize } */
var S = {
  read: Store.get("read", {}), att: Store.get("att", {}), srs: Store.get("srs", {}),
  mocks: Store.get("mocks", []), streak: Store.get("streak", { last: "", n: 0, days: {} }),
  settings: Store.get("settings", { shuffleOpts: false, instant: true })
};
function save(k) { Store.set(k, S[k]); }
function touchStreak() {
  var t = todayKey(); if (S.streak.last === t) return;
  var y = new Date(Date.now() - 86400000); y = y.getFullYear() + "-" + pad(y.getMonth() + 1) + "-" + pad(y.getDate());
  S.streak.n = (S.streak.last === y) ? (S.streak.n || 0) + 1 : 1;
  S.streak.last = t; S.streak.days[t] = 1; save("streak");
}
function recordAttempt(qid, ok, pick) {
  var a = S.att[qid] || { n: 0, ok: 0, last: 0, lastPick: -1 };
  a.n++; if (ok) a.ok++; a.last = Date.now(); a.lastPick = pick;
  S.att[qid] = a; save("att"); touchStreak();
}

/* ============================ markdown + math ============================ */
var MATH = [];
function protectMath(src) {
  MATH = [];
  return String(src == null ? "" : src)
    .replace(/\$\$([\s\S]+?)\$\$/g, function (_, m) { MATH.push({ t: m, d: true }); return "\u0000M" + (MATH.length - 1) + "\u0000"; })
    .replace(/(^|[^\\$])\$([^\n$]+?)\$/g, function (_, p, m) { MATH.push({ t: m, d: false }); return p + "\u0000M" + (MATH.length - 1) + "\u0000"; });
}
function restoreMath(html) {
  return html.replace(/\u0000M(\d+)\u0000/g, function (_, i) {
    var m = MATH[+i]; if (!m) return "";
    try { return katex.renderToString(m.t, { displayMode: m.d, throwOnError: false, output: "html" }); }
    catch (e) { return "<code>" + esc(m.t) + "</code>"; }
  });
}
if (window.marked) marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
function md(src) {
  if (src == null) return "";
  var t = protectMath(src);
  var html = window.marked ? marked.parse(t) : "<p>" + esc(t) + "</p>";
  return restoreMath(html);
}
function mdInline(src) {
  if (src == null) return "";
  var t = protectMath(src);
  var html = window.marked ? marked.parseInline(t) : esc(t);
  return restoreMath(html);
}

/* ============================ data layer ============================ */
var DATA = { cur: null, units: {}, qs: {}, cards: {}, allQ: null, qIndex: null };
function j(url) {
  return fetch(url, { cache: "no-cache" }).then(function (r) {
    if (!r.ok) throw new Error(url + " → " + r.status); return r.json();
  });
}
function loadCurriculum() {
  if (DATA.cur) return Promise.resolve(DATA.cur);
  return j("data/index.json").then(function (d) {
    DATA.cur = d;
    d.topicById = {}; d.unitByN = {};
    d.units.forEach(function (u) {
      d.unitByN[u.n] = u;
      u.topics.forEach(function (t) { t.unit = u.n; t.unitTitle = u.title; d.topicById[t.id] = t; });
    });
    return d;
  });
}
function loadUnit(n) {
  if (DATA.units[n]) return Promise.resolve(DATA.units[n]);
  return j("data/units/u" + n + ".json").then(function (d) { DATA.units[n] = d; return d; })
    .catch(function () { DATA.units[n] = { unit: n, topics: [] }; return DATA.units[n]; });
}
function loadQs(n) {
  if (DATA.qs[n]) return Promise.resolve(DATA.qs[n]);
  return j("data/questions/u" + n + ".json").then(function (d) { DATA.qs[n] = d; return d; })
    .catch(function () { DATA.qs[n] = []; return []; });
}
function loadCards(n) {
  if (DATA.cards[n]) return Promise.resolve(DATA.cards[n]);
  return j("data/cards/u" + n + ".json").then(function (d) { DATA.cards[n] = d; return d; })
    .catch(function () { DATA.cards[n] = []; return []; });
}
function loadAllQ() {
  if (DATA.allQ) return Promise.resolve(DATA.allQ);
  return loadCurriculum().then(function (c) {
    return Promise.all(c.units.map(function (u) { return loadQs(u.n); }));
  }).then(function (all) {
    DATA.allQ = [].concat.apply([], all);
    return DATA.allQ;
  });
}
function loadAllCards() {
  return loadCurriculum().then(function (c) {
    return Promise.all(c.units.map(function (u) { return loadCards(u.n); }));
  }).then(function (all) { return [].concat.apply([], all); });
}
function topicLesson(tid) {
  var t = DATA.cur.topicById[tid]; if (!t) return Promise.resolve(null);
  return loadUnit(t.unit).then(function (u) {
    return (u.topics || []).filter(function (x) { return x.id === tid; })[0] || null;
  });
}

/* ============================ shell: sidebar & theme ============================ */
function buildTree() {
  var tree = $("#tree"); if (!tree || !DATA.cur) return;
  tree.innerHTML = "";
  DATA.cur.units.forEach(function (u) {
    var list = el("div", { class: "tlist" }, u.topics.map(function (t) {
      return el("a", { href: "#/t/" + t.id, "data-tid": t.id,
        class: S.read[t.id] ? "done" : "" }, [el("span", { class: "tid", text: t.id }), el("span", { text: t.title })]);
    }));
    var d = el("details", { "data-unit": u.n }, [
      el("summary", {}, [el("span", { class: "caret", text: "▶" }), el("span", { class: "unum", text: u.n }),
        el("span", { class: "ttl", text: u.title })]),
      list
    ]);
    tree.appendChild(d);
  });
}
function syncTree() {
  var h = location.hash;
  $$("#side-links a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === h); });
  var tid = (h.match(/^#\/t\/([^?]+)/) || [])[1];
  $$("#tree .tlist a").forEach(function (a) {
    a.classList.toggle("on", a.getAttribute("data-tid") === tid);
    a.classList.toggle("done", !!S.read[a.getAttribute("data-tid")]);
  });
  var unit = tid ? (DATA.cur.topicById[tid] || {}).unit : (h.match(/^#\/u\/(\d+)/) || [])[1];
  if (unit) $$("#tree details").forEach(function (d) {
    if (+d.getAttribute("data-unit") === +unit) d.open = true;
  });
}
function initTheme() {
  $("#theme-btn").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var nx = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nx);
    try { localStorage.setItem("net:v1:theme", nx); } catch (e) {}
    this.textContent = nx === "dark" ? "☀" : "☾";
  });
  $("#theme-btn").textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀" : "☾";
  $("#menu-btn").addEventListener("click", function () { document.body.classList.toggle("nav"); });
  $("#scrim").addEventListener("click", function () { document.body.classList.remove("nav"); });
}

/* ============================ search ============================ */
var SEARCH = null;
function buildSearch() {
  if (SEARCH || !window.MiniSearch) return Promise.resolve();
  return Promise.all([loadAllQ(), loadCurriculum().then(function (c) {
    return Promise.all(c.units.map(function (u) { return loadUnit(u.n); }));
  })]).then(function (r) {
    var qs = r[0], units = r[1], docs = [];
    DATA.cur.units.forEach(function (u) {
      docs.push({ id: "u:" + u.n, kind: "Unit", title: "Unit " + u.n + ": " + u.title,
        body: (u.topics || []).map(function (t) { return t.title; }).join(" "), url: "#/u/" + u.n });
    });
    units.forEach(function (u) {
      (u.topics || []).forEach(function (t) {
        var body = (t.blocks || []).map(function (b) { return b.text || b.body || ""; }).join(" ");
        docs.push({ id: "t:" + t.id, kind: "Topic " + t.id, title: t.title,
          body: body.slice(0, 5000), url: "#/t/" + t.id });
        (t.tricks || []).forEach(function (k, i) {
          docs.push({ id: "k:" + t.id + ":" + i, kind: "Trick · " + t.id, title: k.title || "Shortcut",
            body: k.body || "", url: "#/t/" + t.id });
        });
      });
    });
    qs.forEach(function (q) {
      docs.push({ id: "q:" + q.id, kind: (q.src === "pyq" ? (q.session || q.year || "PYQ") : "Practice"),
        title: String(q.q || "").replace(/\s+/g, " ").slice(0, 110),
        body: (q.tags || []).join(" ") + " " + (q.exp || ""), url: "#/q/" + q.id });
    });
    SEARCH = new MiniSearch({ fields: ["title", "body", "kind"], storeFields: ["title", "kind", "url"],
      searchOptions: { boost: { title: 3, kind: 1.4 }, prefix: true, fuzzy: 0.16 } });
    SEARCH.addAll(docs);
  });
}
function initSearch() {
  var inp = $("#search"), box = $("#search-results"), sel = -1, items = [];
  function close() { box.classList.add("hidden"); sel = -1; }
  function run() {
    var q = inp.value.trim();
    if (q.length < 2) return close();
    buildSearch().then(function () {
      if (!SEARCH) return;
      items = SEARCH.search(q).slice(0, 14);
      box.innerHTML = "";
      if (!items.length) { box.appendChild(el("div", { class: "sr-empty", text: "No matches for “" + q + "”" })); }
      else items.forEach(function (r, i) {
        box.appendChild(el("a", { href: r.url, onclick: function () { close(); inp.blur(); } }, [
          el("div", { class: "sr-t", html: mdInline(r.title) }),
          el("div", { class: "sr-s", text: r.kind })
        ]));
      });
      box.classList.remove("hidden"); sel = -1;
    });
  }
  var timer;
  inp.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 130); });
  inp.addEventListener("focus", function () { if (inp.value.trim().length >= 2) run(); });
  inp.addEventListener("keydown", function (e) {
    var links = $$("a", box);
    if (e.key === "Escape") { close(); inp.blur(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!links.length) return; e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links.forEach(function (a, i) { a.classList.toggle("sel", i === sel); });
      links[sel].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && sel >= 0 && links[sel]) { location.hash = links[sel].getAttribute("href"); close(); inp.blur(); }
  });
  document.addEventListener("click", function (e) { if (!$("#search-wrap").contains(e.target)) close(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); inp.focus(); inp.select(); }
  });
}

/* ============================ lesson block renderer ============================ */
var CAL_LABEL = { trick: "Shortcut", trap: "Common trap", note: "Note", mnemonic: "Mnemonic",
  formula: "Formula", concept: "Concept" };
function renderBlocks(blocks, host) {
  (blocks || []).forEach(function (b) {
    if (b.t === "md") {
      var d = el("div", { html: md(b.text) });
      while (d.firstChild) host.appendChild(d.firstChild);
    } else if (b.t === "cal") {
      host.appendChild(el("div", { class: "cal " + (b.kind || "note") }, [
        el("div", { class: "cal-h", text: b.title || CAL_LABEL[b.kind] || "Note" }),
        el("div", { html: md(b.text) })
      ]));
    } else if (b.t === "ex") {
      host.appendChild(el("div", { class: "ex" }, [
        el("div", { class: "ex-h", html: mdInline(b.title || "Worked example") }),
        el("div", { class: "ex-b", html: md(b.text) })
      ]));
    } else if (b.t === "steps") {
      host.appendChild(el("ol", { class: "steps" }, (b.items || []).map(function (s) {
        return el("li", { html: md(s) });
      })));
    } else if (b.t === "lab") {
      host.appendChild(labCard(b.lab, b.title, b.note));
    } else if (b.t === "check") {
      host.appendChild(inlineCheck(b));
    }
  });
}
/* an inline "test yourself" question embedded in a lesson */
function inlineCheck(b) {
  var q = { id: b.id || ("chk-" + Math.random().toString(36).slice(2)), q: b.q, opts: b.opts,
    ans: b.ans, exp: b.exp, src: "check", diff: b.diff || "", tags: [] };
  return questionCard(q, { n: "Check yourself", instant: true, noMeta: true });
}

/* ============================ question card ============================ */
/* opts: {n, instant, noMeta, locked, pick, onPick, showAnsAlways} */
function questionCard(q, o) {
  o = o || {};
  var wrap = el("div", { class: "q", id: "q-" + q.id });
  var top = el("div", { class: "q-top" });
  if (o.n != null) top.appendChild(el("span", { class: "q-n", text: o.n }));
  if (!o.noMeta) {
    if (q.src === "pyq") top.appendChild(el("span", { class: "tag pyq", text: q.session || ("PYQ " + q.year) }));
    else if (q.src === "practice") top.appendChild(el("span", { class: "tag prac", text: "Practice" }));
    if (q.diff) top.appendChild(el("span", { class: "tag " + q.diff, text: q.diff }));
    var t = DATA.cur && DATA.cur.topicById[q.topic];
    if (t) top.appendChild(el("a", { class: "tag", href: "#/t/" + q.topic, text: q.topic + " " + t.title }));
    var a = S.att[q.id];
    if (a && a.n) top.appendChild(el("span", { class: "tag", title: "your history",
      text: a.ok + "/" + a.n + " correct" }));
  }
  if (top.childNodes.length) wrap.appendChild(top);
  wrap.appendChild(el("div", { class: "q-body", html: md(q.q) }));

  var order = [0, 1, 2, 3].slice(0, (q.opts || []).length);
  if (S.settings.shuffleOpts && !o.locked) order = shuffle(order);
  var optHost = el("div", { class: "opts" });
  var picked = (o.pick != null && o.pick >= 0) ? o.pick : -1;
  var done = o.locked || (picked >= 0 && (o.instant !== false));
  var btns = [];

  order.forEach(function (idx, pos) {
    var btn = el("button", { class: "opt", type: "button", "data-i": idx }, [
      el("span", { class: "k", text: "ABCD"[pos] }),
      el("span", { class: "v", html: md(q.opts[idx]) })
    ]);
    btns.push(btn);
    btn.addEventListener("click", function () {
      if (wrap.dataset.done === "1" && o.instant !== false) return;
      picked = idx;
      if (o.onPick) o.onPick(idx);
      if (o.instant === false) { paint(false); return; }
      wrap.dataset.done = "1";
      recordAttempt(q.id, idx === q.ans, idx);
      paint(true);
    });
    optHost.appendChild(btn);
  });
  wrap.appendChild(optHost);

  var expHost = el("div");
  wrap.appendChild(expHost);

  function paint(reveal) {
    btns.forEach(function (b) {
      var i = +b.getAttribute("data-i");
      b.className = "opt" + (i === picked ? " sel" : "");
      if (reveal) {
        b.classList.add("locked");
        b.classList.remove("sel");
        if (i === q.ans) b.classList.add("right");
        else if (i === picked) b.classList.add("wrong");
      }
    });
    expHost.innerHTML = "";
    if (reveal) {
      var ok = picked === q.ans;
      var box = el("div", { class: "q-exp" }, [
        el("div", { class: "eh", text: ok ? "Correct — why" : (picked < 0 ? "Answer" : "Not quite — why") ,
          style: ok || picked < 0 ? "" : "color:var(--bad)" }),
        el("div", { html: md(q.exp || "_No explanation recorded._") })
      ]);
      if (q.trick) box.appendChild(el("div", { class: "cal trick", style: "margin-top:12px" }, [
        el("div", { class: "cal-h", text: "Shortcut" }), el("div", { html: md(q.trick) })
      ]));
      if ((q.tags || []).length) box.appendChild(el("div", { class: "row tiny muted", style: "margin-top:10px" },
        q.tags.map(function (t) { return el("span", { class: "tag", text: t }); })));
      expHost.appendChild(box);
    }
  }
  if (done) { wrap.dataset.done = "1"; paint(true); }
  else if (picked >= 0) paint(false);

  if (!o.locked && o.instant !== false && !o.hideReveal) {
    var act = el("div", { class: "q-act" }, [
      el("button", { class: "btn sm ghost", type: "button", text: "Show answer", onclick: function () {
        if (wrap.dataset.done === "1") return;
        wrap.dataset.done = "1"; paint(true); this.remove();
      } })
    ]);
    wrap.appendChild(act);
  }
  wrap._paint = paint;
  wrap._pick = function () { return picked; };
  return wrap;
}

/* ============================ router ============================ */
var ROUTES = [];
function route(re, fn) { ROUTES.push([re, fn]); }
var CLEANUP = [];
function onLeave(fn) { CLEANUP.push(fn); }

function render() {
  CLEANUP.forEach(function (f) { try { f(); } catch (e) {} }); CLEANUP = [];
  var h = location.hash.replace(/^#/, "") || "/";
  var main = $("#main");
  main.innerHTML = "";
  $("#toc").innerHTML = "";
  document.body.classList.remove("nav");
  for (var i = 0; i < ROUTES.length; i++) {
    var m = h.match(ROUTES[i][0]);
    if (m) {
      var r = ROUTES[i][1](main, m);
      Promise.resolve(r).then(function () { syncTree(); buildToc(); }).catch(function (e) {
        main.innerHTML = "";
        main.appendChild(el("div", { class: "wrap" }, [el("h1", { text: "Something went wrong" }),
          el("p", { class: "muted", text: String(e && e.message || e) })]));
      });
      window.scrollTo(0, 0);
      return;
    }
  }
  main.appendChild(el("div", { class: "wrap" }, [el("h1", { text: "Page not found" }),
    el("p", {}, [el("a", { href: "#/", text: "Back to the dashboard" })])]));
}
function buildToc() {
  var toc = $("#toc"), main = $("#main");
  var hs = $$("h2[id], h3[id]", main);
  if (hs.length < 2) { toc.innerHTML = ""; return; }
  toc.innerHTML = "";
  toc.appendChild(el("div", { class: "toc-h", text: "On this page" }));
  hs.forEach(function (h) {
    toc.appendChild(el("a", { href: "#" + location.hash.replace(/^#/, "") , class: h.tagName === "H3" ? "l3" : "",
      text: h.textContent, onclick: function (e) { e.preventDefault(); h.scrollIntoView({ behavior: "smooth", block: "start" }); } }));
  });
  var obs = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = hs.indexOf(e.target);
      $$("a", toc).forEach(function (a, k) { a.classList.toggle("on", k === i); });
    });
  }, { rootMargin: "-70px 0px -72% 0px" });
  hs.forEach(function (h) { obs.observe(h); });
  onLeave(function () { obs.disconnect(); });
}
function headings(host) {
  $$("h2, h3", host).forEach(function (h, i) {
    if (!h.id) h.id = "s" + i + "-" + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  });
}
function crumb(parts) {
  var c = el("div", { class: "crumb" });
  parts.forEach(function (p, i) {
    if (i) c.appendChild(el("span", { text: "›" }));
    c.appendChild(p.href ? el("a", { href: p.href, text: p.text }) : el("span", { text: p.text }));
  });
  return c;
}

/* ============================ page: dashboard ============================ */
route(/^\/$/, function (main) {
  return Promise.all([loadCurriculum(), loadAllQ()]).then(function (r) {
    var c = r[0], qs = r[1];
    var totalT = c.units.reduce(function (a, u) { return a + u.topics.length; }, 0);
    var readN = Object.keys(S.read).length;
    var attempted = Object.keys(S.att).length;
    var correct = Object.keys(S.att).reduce(function (a, k) { return a + (S.att[k].ok ? 1 : 0); }, 0);
    var pyqN = qs.filter(function (q) { return q.src === "pyq"; }).length;
    var due = 0;
    var box = el("div", { class: "wide" });

    box.appendChild(el("h1", { text: "UGC NET — Computer Science and Applications" }));
    box.appendChild(el("p", { class: "lede", html: "Paper 2, subject code 87. Ten units, " + totalT +
      " topics, " + qs.length + " questions (" + pyqN + " from real past papers), interactive labs, " +
      "shortcuts and full-length mocks. Everything runs in your browser and your progress stays on this device." }));

    box.appendChild(el("div", { class: "grid g4", style: "margin-bottom:26px" }, [
      el("div", { class: "stat" }, [el("div", { class: "n", text: readN + "/" + totalT }), el("div", { class: "l", text: "topics studied" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(attempted) }), el("div", { class: "l", text: "questions attempted" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: attempted ? pct(correct, attempted) + "%" : "—" }), el("div", { class: "l", text: "first-try accuracy" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(S.streak.n || 0) }), el("div", { class: "l", text: "day streak" })])
    ]));

    box.appendChild(el("div", { class: "grid g3", style: "margin-bottom:30px" }, [
      quickCard("Continue studying", nextTopicLabel(c), nextTopicHref(c)),
      quickCard("Practice by topic", "Mixed questions from any unit, with instant explanations", "#/topicwise"),
      quickCard("Take a full mock", "100 questions · 2 hours · exam scoring", "#/mock"),
      quickCard("Review flashcards", "Spaced repetition over formulas and definitions", "#/cards"),
      quickCard("Past papers by year", "Solve a real paper session by session", "#/pyq"),
      quickCard("All shortcuts", "Every trick in one printable sheet", "#/tricks")
    ]));

    var h = el("h2", { text: "The syllabus" }); box.appendChild(h);
    box.appendChild(el("div", { class: "grid g2" }, c.units.map(function (u) {
      var done = u.topics.filter(function (t) { return S.read[t.id]; }).length;
      var qn = qs.filter(function (q) { return q.unit === u.n; }).length;
      return el("a", { class: "ucard", href: "#/u/" + u.n }, [
        el("div", { class: "un", text: "UNIT " + u.n }),
        el("div", { class: "ut", text: u.title }),
        el("div", { class: "us", text: u.topics.length + " topics · " + qn + " questions" }),
        el("div", { class: "bar" + (done === u.topics.length && done ? " ok" : ""), style: "margin-top:10px" },
          el("i", { style: "width:" + pct(done, u.topics.length) + "%" }))
      ]);
    })));

    box.appendChild(examCard(c));
    box.appendChild(siteFooter());
    main.appendChild(box);
    headings(box);
  });
});
function quickCard(t, s, href) {
  return el("a", { class: "ucard", href: href }, [
    el("div", { class: "ut", style: "margin-top:0", text: t }),
    el("div", { class: "us", text: s })
  ]);
}
function nextTopicLabel(c) {
  var t = firstUnread(c); return t ? (t.id + " " + t.title) : "You have read every topic — revise instead";
}
function nextTopicHref(c) { var t = firstUnread(c); return t ? "#/t/" + t.id : "#/cards"; }
function firstUnread(c) {
  for (var i = 0; i < c.units.length; i++) for (var k = 0; k < c.units[i].topics.length; k++)
    if (!S.read[c.units[i].topics[k].id]) return c.units[i].topics[k];
  return null;
}
function examCard(c) {
  var e = c.exam || {};
  return el("div", { class: "card", style: "margin-top:26px" }, [
    el("h3", { style: "margin-top:0", text: "Exam pattern at a glance" }),
    el("div", { class: "grid g4" }, [
      miniStat(e.questions + " questions", "Paper 2"),
      miniStat(e.marks + " marks", "+" + e.perCorrect + " each"),
      miniStat("No negative", "wrong answers cost nothing"),
      miniStat((e.durationMin / 60) + " hours", "Paper 1 + Paper 2 together")
    ]),
    el("p", { class: "small muted", style: "margin:13px 0 0", text: e.note || "" })
  ]);
}
function miniStat(n, l) {
  return el("div", {}, [el("div", { style: "font-weight:700", text: n }), el("div", { class: "tiny muted", text: l })]);
}
function siteFooter() {
  return el("footer", { class: "site" }, [
    el("p", { html: "Past-year questions are reproduced from publicly released UGC&nbsp;NET / NTA question papers for study purposes; " +
      "explanations, shortcuts, lessons and labs are original to this site. Not affiliated with UGC or NTA. " +
      "Verify anything critical against the official syllabus and answer keys at <a href='https://ugcnet.nta.ac.in' target='_blank' rel='noopener'>ugcnet.nta.ac.in</a>." }),
    el("p", {}, [el("a", { href: "#/settings", text: "Settings, backup and reset" })])
  ]);
}

/* ============================ page: unit ============================ */
route(/^\/u\/(\d+)$/, function (main, m) {
  var n = +m[1];
  return Promise.all([loadCurriculum(), loadUnit(n), loadQs(n)]).then(function (r) {
    var c = r[0], u = r[1], qs = r[2], cu = c.unitByN[n];
    if (!cu) throw new Error("No unit " + n);
    var box = el("div", { class: "wide" });
    box.appendChild(crumb([{ text: "Syllabus", href: "#/" }, { text: "Unit " + n }]));
    box.appendChild(el("h1", { text: "Unit " + n + ": " + cu.title }));
    if (u.summary) box.appendChild(el("p", { class: "lede", html: mdInline(u.summary) }));

    var pyq = qs.filter(function (q) { return q.src === "pyq"; }).length;
    box.appendChild(el("div", { class: "row", style: "margin-bottom:22px" }, [
      el("a", { class: "btn pri", href: "#/practice/u" + n, text: "Practice this unit (" + qs.length + " questions)" }),
      el("a", { class: "btn", href: "#/mock?unit=" + n, text: "Unit test" }),
      el("a", { class: "btn", href: "#/cards?unit=" + n, text: "Flashcards" }),
      el("span", { class: "tiny muted", text: pyq + " of them are real past-paper questions" })
    ]));

    box.appendChild(el("div", { class: "grid g2" }, cu.topics.map(function (t) {
      var lt = (u.topics || []).filter(function (x) { return x.id === t.id; })[0] || {};
      var qn = qs.filter(function (q) { return q.topic === t.id; }).length;
      return el("a", { class: "ucard", href: "#/t/" + t.id }, [
        el("div", { class: "un", text: t.id + (S.read[t.id] ? "  ✓" : "") }),
        el("div", { class: "ut", text: t.title }),
        el("div", { class: "us", text: (lt.summary ? lt.summary + " · " : "") + qn + " questions" })
      ]);
    })));
    box.appendChild(siteFooter());
    main.appendChild(box);
    headings(box);
  });
});

/* ============================ page: topic / lesson ============================ */
route(/^\/t\/([^?]+)$/, function (main, m) {
  var tid = decodeURIComponent(m[1]);
  return loadCurriculum().then(function (c) {
    var t = c.topicById[tid];
    if (!t) throw new Error("No topic " + tid);
    return Promise.all([topicLesson(tid), loadQs(t.unit)]).then(function (r) {
      var L = r[0] || {}, qs = r[1].filter(function (q) { return q.topic === tid; });
      var u = c.unitByN[t.unit];
      var box = el("div", { class: "wrap" });
      box.appendChild(crumb([{ text: "Syllabus", href: "#/" },
        { text: "Unit " + t.unit, href: "#/u/" + t.unit }, { text: tid }]));
      box.appendChild(el("h1", { text: t.title }));
      if (L.summary) box.appendChild(el("p", { class: "lede", html: mdInline(L.summary) }));

      if (!L.blocks || !L.blocks.length) {
        box.appendChild(el("div", { class: "empty" }, [
          el("p", { text: "The written lesson for this topic is not in this build yet." }),
          qs.length ? el("p", {}, [el("a", { class: "btn", href: "#/practice/t" + tid, text: "Practise its " + qs.length + " questions" })]) : null
        ]));
      } else {
        var body = el("div"); renderBlocks(L.blocks, body); box.appendChild(body);
      }

      if ((L.tricks || []).length) {
        box.appendChild(el("h2", { text: "Shortcuts for this topic" }));
        L.tricks.forEach(function (k) {
          box.appendChild(el("div", { class: "cal trick" }, [
            el("div", { class: "cal-h", text: k.title || "Shortcut" }),
            el("div", { html: md(k.body) })
          ]));
        });
      }
      if ((L.traps || []).length) {
        box.appendChild(el("h2", { text: "Traps the examiner sets" }));
        L.traps.forEach(function (k) {
          box.appendChild(el("div", { class: "cal trap" }, [
            el("div", { class: "cal-h", text: k.title || "Careful" }),
            el("div", { html: md(k.body) })
          ]));
        });
      }

      var doneBtn = el("button", { class: "btn " + (S.read[tid] ? "" : "pri"), type: "button",
        text: S.read[tid] ? "✓ Marked as studied" : "Mark as studied", onclick: function () {
          if (S.read[tid]) { delete S.read[tid]; this.textContent = "Mark as studied"; this.className = "btn pri"; }
          else { S.read[tid] = Date.now(); this.textContent = "✓ Marked as studied"; this.className = "btn"; touchStreak(); }
          save("read"); syncTree();
        } });
      box.appendChild(el("div", { class: "row", style: "margin-top:30px" }, [
        doneBtn,
        qs.length ? el("a", { class: "btn", href: "#/practice/t" + tid, text: "Practise " + qs.length + " questions" }) : null,
        el("a", { class: "btn", href: "#/cards?topic=" + encodeURIComponent(tid), text: "Flashcards" })
      ]));

      /* prev / next across the whole syllabus */
      var flat = []; c.units.forEach(function (uu) { uu.topics.forEach(function (tt) { flat.push(tt); }); });
      var i = flat.map(function (x) { return x.id; }).indexOf(tid);
      var pg = el("div", { class: "pager" });
      pg.appendChild(i > 0 ? el("a", { href: "#/t/" + flat[i - 1].id, html: "← " + esc(flat[i - 1].title) }) : el("span"));
      pg.appendChild(i < flat.length - 1 ? el("a", { href: "#/t/" + flat[i + 1].id, style: "text-align:right",
        html: esc(flat[i + 1].title) + " →" }) : el("span"));
      box.appendChild(pg);
      box.appendChild(siteFooter());
      main.appendChild(box);
      headings(box);
    });
  });
});

/* ============================ page: PYQ by year ============================ */
route(/^\/pyq$/, function (main) {
  return loadAllQ().then(function (qs) {
    var pyq = qs.filter(function (q) { return q.src === "pyq"; });
    var bySession = {};
    pyq.forEach(function (q) {
      var k = q.session || ("Year " + q.year);
      (bySession[k] = bySession[k] || []).push(q);
    });
    var keys = Object.keys(bySession).sort(function (a, b) {
      var ya = (bySession[a][0] || {}).year || 0, yb = (bySession[b][0] || {}).year || 0;
      return yb - ya || a.localeCompare(b);
    });
    var box = el("div", { class: "wide" });
    box.appendChild(el("h1", { text: "Previous year questions, by paper" }));
    box.appendChild(el("p", { class: "lede", text: pyq.length + " questions recovered from " + keys.length +
      " released sittings, each with the official key and a worked explanation. Pick a sitting to solve it end to end." }));
    box.appendChild(el("div", { class: "grid g3" }, keys.map(function (k) {
      var list = bySession[k];
      var seen = list.filter(function (q) { return S.att[q.id]; }).length;
      return el("a", { class: "yr", href: "#/practice/s" + encodeURIComponent(k) }, [
        el("div", { class: "yn", text: k }),
        el("div", { class: "ys", text: list.length + " questions" + (seen ? " · " + seen + " attempted" : "") }),
        el("div", { class: "bar", style: "margin-top:9px" }, el("i", { style: "width:" + pct(seen, list.length) + "%" }))
      ]);
    })));
    box.appendChild(el("h2", { text: "Spread across the syllabus" }));
    box.appendChild(el("p", { class: "muted small", text:
      "How the recovered past questions fall across the ten units — a rough guide to where the marks live." }));
    var byUnit = {};
    pyq.forEach(function (q) { byUnit[q.unit] = (byUnit[q.unit] || 0) + 1; });
    var mx = Math.max.apply(null, Object.keys(byUnit).map(function (k) { return byUnit[k]; }).concat([1]));
    DATA.cur.units.forEach(function (u) {
      var v = byUnit[u.n] || 0;
      box.appendChild(el("div", { class: "hbar" }, [
        el("a", { class: "hl", href: "#/u/" + u.n, text: u.n + ". " + u.title }),
        el("div", { class: "hv" }, el("div", { class: "bar" }, el("i", { style: "width:" + pct(v, mx) + "%" }))),
        el("div", { class: "hn", text: v + " Q" })
      ]));
    });
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});

/* ============================ page: PYQ by topic ============================ */
route(/^\/topicwise$/, function (main) {
  return Promise.all([loadCurriculum(), loadAllQ()]).then(function (r) {
    var c = r[0], qs = r[1];
    var box = el("div", { class: "wide" });
    box.appendChild(el("h1", { text: "Questions by topic" }));
    box.appendChild(el("p", { class: "lede", text:
      "Every question is tagged to a syllabus topic. Work a topic until it is solid, then move on — this is the fastest route to marks." }));
    c.units.forEach(function (u) {
      var uq = qs.filter(function (q) { return q.unit === u.n; });
      if (!uq.length) return;
      var det = el("details", { open: false, style: "margin-bottom:10px" });
      det.appendChild(el("summary", { style: "cursor:pointer;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-weight:620" },
        "Unit " + u.n + " · " + u.title + "  (" + uq.length + ")"));
      var inner = el("div", { style: "padding:10px 4px 14px" });
      u.topics.forEach(function (t) {
        var tq = uq.filter(function (q) { return q.topic === t.id; });
        if (!tq.length) return;
        var att = tq.filter(function (q) { return S.att[q.id]; });
        var ok = att.filter(function (q) { return S.att[q.id].ok; }).length;
        inner.appendChild(el("div", { class: "hbar" }, [
          el("a", { class: "hl", href: "#/practice/t" + t.id, title: t.title, text: t.id + " " + t.title }),
          el("div", { class: "hv" }, el("div", { class: "bar" + (att.length === tq.length ? " ok" : "") },
            el("i", { style: "width:" + pct(att.length, tq.length) + "%" }))),
          el("div", { class: "hn", text: att.length ? ok + "/" + att.length : tq.length + " Q" })
        ]));
      });
      det.appendChild(inner);
      box.appendChild(det);
    });
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});

/* ============================ page: practice sets ============================ */
/* #/practice/u3      whole unit
   #/practice/t4.5    single topic
   #/practice/sJune 2019 Shift I   one sitting
   #/practice/wrong   everything you have got wrong
   #/practice/all     everything */
route(/^\/practice\/(.+)$/, function (main, m) {
  var spec = decodeURIComponent(m[1]);
  return Promise.all([loadCurriculum(), loadAllQ()]).then(function (r) {
    var c = r[0], all = r[1], title = "Practice", sub = "", qs = [];
    if (spec[0] === "u" && /^\d+$/.test(spec.slice(1))) {
      var n = +spec.slice(1); qs = all.filter(function (q) { return q.unit === n; });
      title = "Unit " + n + " · " + c.unitByN[n].title;
    } else if (spec[0] === "t") {
      var tid = spec.slice(1); var t = c.topicById[tid];
      qs = all.filter(function (q) { return q.topic === tid; });
      title = t ? (tid + " " + t.title) : tid;
      sub = t ? "Unit " + t.unit + " · " + t.unitTitle : "";
    } else if (spec[0] === "s") {
      var ses = spec.slice(1);
      qs = all.filter(function (q) { return (q.session || ("Year " + q.year)) === ses; })
              .sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
      title = ses; sub = "Real paper, official key";
    } else if (spec === "wrong") {
      qs = all.filter(function (q) { var a = S.att[q.id]; return a && a.n && a.lastPick !== q.ans; });
      title = "Questions you got wrong"; sub = "Clear these and they leave the list";
    } else if (spec === "unseen") {
      qs = all.filter(function (q) { return !S.att[q.id]; });
      title = "Questions you have not seen"; sub = "";
    } else { qs = all; title = "All questions"; }

    var box = el("div", { class: "wrap" });
    box.appendChild(crumb([{ text: "Practice", href: "#/topicwise" }, { text: title }]));
    box.appendChild(el("h1", { text: title }));
    if (sub) box.appendChild(el("p", { class: "lede", text: sub }));
    if (!qs.length) {
      box.appendChild(el("div", { class: "empty", text: "Nothing here right now." }));
      main.appendChild(box); return;
    }

    var order = qs.slice();
    var ctl = el("div", { class: "row", style: "margin-bottom:20px" });
    var host = el("div");
    function draw() {
      host.innerHTML = "";
      order.forEach(function (q, i) {
        host.appendChild(questionCard(q, { n: "Q" + (i + 1), instant: true }));
      });
    }
    ctl.appendChild(el("span", { class: "tag", text: qs.length + " questions" }));
    ctl.appendChild(el("button", { class: "btn sm", type: "button", text: "Shuffle", onclick: function () {
      order = shuffle(order); draw(); } }));
    ctl.appendChild(el("button", { class: "btn sm", type: "button", text: "Reveal all", onclick: function () {
      $$(".q", host).forEach(function (n) { if (n.dataset.done !== "1") { n.dataset.done = "1"; n._paint(true); } }); } }));
    ctl.appendChild(el("a", { class: "btn sm", href: "#/mock?set=" + encodeURIComponent(spec), text: "Test mode (timed)" }));
    box.appendChild(ctl);
    box.appendChild(host);
    draw();
    box.appendChild(siteFooter());
    main.appendChild(box);
  });
});

/* single question permalink (used by search) */
route(/^\/q\/(.+)$/, function (main, m) {
  var id = decodeURIComponent(m[1]);
  return loadAllQ().then(function (all) {
    var q = all.filter(function (x) { return x.id === id; })[0];
    var box = el("div", { class: "wrap" });
    if (!q) { box.appendChild(el("div", { class: "empty", text: "That question is not in this build." })); }
    else {
      var t = DATA.cur.topicById[q.topic];
      box.appendChild(crumb([{ text: "Unit " + q.unit, href: "#/u/" + q.unit },
        t ? { text: q.topic + " " + t.title, href: "#/t/" + q.topic } : { text: q.topic }]));
      box.appendChild(el("h1", { text: q.src === "pyq" ? (q.session || ("PYQ " + q.year)) : "Practice question" }));
      box.appendChild(questionCard(q, { instant: true }));
      if (t) box.appendChild(el("div", { class: "row" }, [
        el("a", { class: "btn", href: "#/t/" + q.topic, text: "Read the topic" }),
        el("a", { class: "btn", href: "#/practice/t" + q.topic, text: "More from this topic" })
      ]));
    }
    main.appendChild(box);
  });
});

/* ============================ page: all tricks ============================ */
route(/^\/tricks$/, function (main) {
  return loadCurriculum().then(function (c) {
    return Promise.all(c.units.map(function (u) { return loadUnit(u.n); })).then(function (units) {
      var box = el("div", { class: "wrap" });
      box.appendChild(el("h1", { text: "Shortcuts and tricks" }));
      box.appendChild(el("p", { class: "lede", text:
        "Every shortcut from every lesson, collected. Two hours for 150 questions means roughly 48 seconds each — " +
        "these are what buy that time back. Print this page for a last-week revision sheet." }));
      var any = false;
      units.forEach(function (u, i) {
        var cu = c.units[i];
        var ts = (u.topics || []).filter(function (t) { return (t.tricks || []).length; });
        if (!ts.length) return;
        any = true;
        box.appendChild(el("h2", { text: "Unit " + cu.n + " · " + cu.title }));
        ts.forEach(function (t) {
          box.appendChild(el("h3", {}, [el("a", { href: "#/t/" + t.id, text: t.id + " " + (t.title || "") })]));
          (t.tricks || []).forEach(function (k) {
            box.appendChild(el("div", { class: "cal trick" }, [
              el("div", { class: "cal-h", text: k.title || "Shortcut" }),
              el("div", { html: md(k.body) })
            ]));
          });
        });
      });
      if (!any) box.appendChild(el("div", { class: "empty", text: "No shortcuts in this build yet." }));
      box.appendChild(siteFooter());
      main.appendChild(box); headings(box);
    });
  });
});

/* ============================ mock test engine ============================ */
function pickQuestions(all, n, filter) {
  var pool = all.filter(filter || function () { return true; });
  return shuffle(pool).slice(0, n);
}
/* Build a paper that mirrors the real spread: proportional to how many PYQs each unit has. */
function blueprint(all, n) {
  var pyq = all.filter(function (q) { return q.src === "pyq"; });
  var w = {}, tot = 0;
  DATA.cur.units.forEach(function (u) {
    var c = pyq.filter(function (q) { return q.unit === u.n; }).length || 1;
    w[u.n] = c; tot += c;
  });
  var out = [], used = {};
  DATA.cur.units.forEach(function (u) {
    var want = Math.round(n * w[u.n] / tot);
    var pool = shuffle(all.filter(function (q) { return q.unit === u.n; }));
    pool.slice(0, want).forEach(function (q) { out.push(q); used[q.id] = 1; });
  });
  var rest = shuffle(all.filter(function (q) { return !used[q.id]; }));
  while (out.length < n && rest.length) out.push(rest.pop());
  return shuffle(out).slice(0, n);
}
route(/^\/mock(\?.*)?$/, function (main, m) {
  var qp = new URLSearchParams((m[1] || "").replace(/^\?/, ""));
  return Promise.all([loadCurriculum(), loadAllQ()]).then(function (r) {
    var c = r[0], all = r[1];
    var box = el("div", { class: "wide" });
    box.appendChild(el("h1", { text: "Mock tests" }));
    box.appendChild(el("p", { class: "lede", text:
      "Exam conditions: a countdown, a question palette, no explanations until you submit, and UGC NET scoring — " +
      "two marks a correct answer and nothing deducted for a wrong one. Because nothing is deducted, never leave a question blank." }));

    var live = Store.get("live", null);
    if (live && live.qids && live.qids.length) {
      box.appendChild(el("div", { class: "cal note", style: "margin-bottom:20px" }, [
        el("div", { class: "cal-h", text: "Test in progress" }),
        el("div", {}, [el("p", { text: live.title + " — " + live.qids.length + " questions, " +
          fmtTime(live.endsAt ? (live.endsAt - Date.now()) / 1000 : 0) + " left." }),
          el("div", { class: "row" }, [
            el("a", { class: "btn pri", href: "#/mock/run", text: "Resume" }),
            el("button", { class: "btn", type: "button", text: "Discard", onclick: function () {
              Store.del("live"); render(); } })
          ])])
      ]));
    }

    function starter(title, n, mins, filter, desc) {
      return el("div", { class: "card" }, [
        el("div", { style: "font-weight:650", text: title }),
        el("div", { class: "small muted", style: "margin:4px 0 11px", text: desc }),
        el("button", { class: "btn pri sm", type: "button", text: "Start", onclick: function () {
          var qs = filter === "blueprint" ? blueprint(all, n) : pickQuestions(all, n, filter);
          if (!qs.length) { alert("Not enough questions for that test yet."); return; }
          startMock(title, qs, mins);
        } })
      ]);
    }
    var grid = el("div", { class: "grid g2" });
    grid.appendChild(starter("Full Paper 2 simulation", 100, 120, "blueprint",
      "100 questions spread across the ten units in the same proportion the real papers use. Two hours."));
    grid.appendChild(starter("Quick 25", 25, 30, null, "A short mixed set when you have half an hour."));
    grid.appendChild(starter("Past-paper questions only", 50, 60, function (q) { return q.src === "pyq"; },
      "50 real questions drawn at random from every recovered sitting."));
    grid.appendChild(starter("Weak areas", 40, 48, function (q) {
      var a = S.att[q.id]; return !a || a.lastPick !== q.ans;
    }, "Questions you have never seen or have got wrong before."));
    c.units.forEach(function (u) {
      var uq = all.filter(function (q) { return q.unit === u.n; });
      if (uq.length < 5) return;
      grid.appendChild(starter("Unit " + u.n + " test", Math.min(30, uq.length),
        Math.max(12, Math.min(36, uq.length)), function (q) { return q.unit === u.n; },
        u.title + " — " + Math.min(30, uq.length) + " questions."));
    });
    box.appendChild(grid);

    if (S.mocks.length) {
      box.appendChild(el("h2", { text: "Your past attempts" }));
      var tb = el("table", {}, [el("thead", {}, el("tr", {}, [
        el("th", { text: "Test" }), el("th", { text: "When" }), el("th", { text: "Score" }),
        el("th", { text: "Accuracy" }), el("th", { text: "Time" }), el("th", { text: "" })]))]);
      var tbody = el("tbody");
      S.mocks.slice().reverse().slice(0, 25).forEach(function (mk) {
        tbody.appendChild(el("tr", {}, [
          el("td", { text: mk.title || mk.kind || "Test" }),
          el("td", { class: "tiny", text: new Date(mk.ts).toLocaleDateString() }),
          el("td", { text: mk.score + " / " + (mk.total * 2) }),
          el("td", { text: pct(mk.correct, mk.total) + "%" }),
          el("td", { class: "tiny", text: fmtTime(mk.secs) }),
          el("td", {}, el("a", { class: "tiny", href: "#/mock/result/" + mk.id, text: "review" }))
        ]));
      });
      tb.appendChild(tbody);
      box.appendChild(tb);
    }
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});

function startMock(title, qs, mins) {
  Store.set("live", {
    title: title, qids: qs.map(function (q) { return q.id; }),
    picks: {}, marks: {}, startedAt: Date.now(), endsAt: Date.now() + mins * 60000, mins: mins
  });
  location.hash = "#/mock/run";
}
route(/^\/mock\/run$/, function (main) {
  var live = Store.get("live", null);
  if (!live) { location.hash = "#/mock"; return; }
  return loadAllQ().then(function (all) {
    var byId = {}; all.forEach(function (q) { byId[q.id] = q; });
    var qs = live.qids.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!qs.length) { Store.del("live"); location.hash = "#/mock"; return; }
    var i = 0;
    var box = el("div", { class: "wide" });
    var bar = el("div", { class: "mock-bar" });
    var timerEl = el("div", { class: "timer", text: "--:--" });
    var pos = el("div", { class: "small muted" });
    var host = el("div", { style: "margin-bottom:24px" });
    var palHost = el("div", { class: "palette", style: "margin-top:14px" });

    bar.appendChild(timerEl);
    bar.appendChild(pos);
    bar.appendChild(el("div", { style: "flex:1" }));
    bar.appendChild(el("button", { class: "btn sm", type: "button", text: "◀ Prev", onclick: function () { go(i - 1); } }));
    bar.appendChild(el("button", { class: "btn sm", type: "button", text: "Next ▶", onclick: function () { go(i + 1); } }));
    bar.appendChild(el("button", { class: "btn sm", type: "button", text: "Mark for review", onclick: function () {
      live.marks[qs[i].id] = !live.marks[qs[i].id]; Store.set("live", live); paintPal(); } }));
    bar.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Submit", onclick: submit }));

    box.appendChild(el("h1", { style: "font-size:1.25rem", text: live.title }));
    box.appendChild(bar);
    box.appendChild(host);
    box.appendChild(el("div", { class: "sep" }));
    box.appendChild(el("div", { class: "legend" }, [
      el("span", { html: "<i style='background:var(--ok)'></i>answered" }),
      el("span", { html: "<i style='background:var(--warn)'></i>marked for review" }),
      el("span", { html: "<i style='background:var(--bg);border:1px solid var(--line-str)'></i>not answered" })
    ]));
    box.appendChild(palHost);
    main.appendChild(box);
    draw();

    function go(n) {
      if (n < 0 || n >= qs.length) return;
      i = n; draw();
    }
    function draw() {
      var q = qs[i];
      host.innerHTML = "";
      pos.textContent = "Question " + (i + 1) + " of " + qs.length;
      var card = questionCard(q, {
        n: "Q" + (i + 1), noMeta: true, instant: false, hideReveal: true,
        pick: live.picks[q.id] == null ? -1 : live.picks[q.id],
        onPick: function (idx) { live.picks[q.id] = idx; Store.set("live", live); paintPal(); }
      });
      host.appendChild(card);
      paintPal();
    }
    function paintPal() {
      palHost.innerHTML = "";
      qs.forEach(function (q, k) {
        var cl = "pal" + (live.picks[q.id] != null ? " ans" : "") + (live.marks[q.id] ? " mark" : "") + (k === i ? " cur" : "");
        palHost.appendChild(el("button", { class: cl, type: "button", text: k + 1, onclick: function () { go(k); } }));
      });
    }
    function tick() {
      var left = (live.endsAt - Date.now()) / 1000;
      timerEl.textContent = fmtTime(left);
      timerEl.classList.toggle("low", left < 300);
      if (left <= 0) { clearInterval(iv); submit(true); }
    }
    var iv = setInterval(tick, 500); tick();
    onLeave(function () { clearInterval(iv); });

    function submit(auto) {
      if (!auto) {
        var blank = qs.filter(function (q) { return live.picks[q.id] == null; }).length;
        var msg = blank ? (blank + " question" + (blank > 1 ? "s are" : " is") +
          " still blank. There is no negative marking, so a guess costs nothing. Submit anyway?") : "Submit the test?";
        if (!confirm(msg)) return;
      }
      clearInterval(iv);
      var correct = 0, wrong = 0, skipped = 0, byUnit = {}, byTopic = {};
      qs.forEach(function (q) {
        var p = live.picks[q.id];
        var u = byUnit[q.unit] = byUnit[q.unit] || { n: 0, ok: 0 };
        var t = byTopic[q.topic] = byTopic[q.topic] || { n: 0, ok: 0 };
        u.n++; t.n++;
        if (p == null) skipped++;
        else if (p === q.ans) { correct++; u.ok++; t.ok++; recordAttempt(q.id, true, p); }
        else { wrong++; recordAttempt(q.id, false, p); }
      });
      var rec = {
        id: "m" + Date.now(), ts: Date.now(), title: live.title, total: qs.length,
        correct: correct, wrong: wrong, skipped: skipped, score: correct * 2,
        secs: Math.round((Date.now() - live.startedAt) / 1000),
        byUnit: byUnit, byTopic: byTopic,
        qids: qs.map(function (q) { return q.id; }), picks: live.picks
      };
      S.mocks.push(rec); if (S.mocks.length > 60) S.mocks = S.mocks.slice(-60);
      save("mocks"); Store.del("live");
      location.hash = "#/mock/result/" + rec.id;
    }
  });
});

route(/^\/mock\/result\/(.+)$/, function (main, m) {
  var id = m[1];
  var rec = S.mocks.filter(function (x) { return x.id === id; })[0];
  if (!rec) { main.appendChild(el("div", { class: "empty", text: "That result is no longer stored." })); return; }
  return Promise.all([loadCurriculum(), loadAllQ()]).then(function (r) {
    var c = r[0], all = r[1], byId = {};
    all.forEach(function (q) { byId[q.id] = q; });
    var box = el("div", { class: "wide" });
    box.appendChild(crumb([{ text: "Mock tests", href: "#/mock" }, { text: "Result" }]));
    box.appendChild(el("h1", { text: rec.title || "Test result" }));
    box.appendChild(el("p", { class: "lede", text: new Date(rec.ts).toLocaleString() + " · " + fmtTime(rec.secs) +
      " taken · " + Math.round(rec.secs / Math.max(1, rec.total)) + " s per question" }));
    box.appendChild(el("div", { class: "grid g4", style: "margin-bottom:26px" }, [
      el("div", { class: "stat" }, [el("div", { class: "n", text: rec.score + "/" + rec.total * 2 }), el("div", { class: "l", text: "marks" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", style: "color:var(--ok)", text: String(rec.correct) }), el("div", { class: "l", text: "correct" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", style: "color:var(--bad)", text: String(rec.wrong) }), el("div", { class: "l", text: "wrong" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(rec.skipped) }), el("div", { class: "l", text: "left blank" })])
    ]));
    if (rec.skipped) box.appendChild(el("div", { class: "cal trap" }, [
      el("div", { class: "cal-h", text: "You left marks on the table" }),
      el("div", { html: md("You skipped **" + rec.skipped + "** question" + (rec.skipped > 1 ? "s" : "") +
        ". UGC NET has no negative marking, so a blind guess on all of them would have been worth about **" +
        Math.round(rec.skipped * 0.25 * 2) + " marks** on average, and an educated guess far more. Never leave a blank.") })
    ]));

    box.appendChild(el("h2", { text: "Unit by unit" }));
    c.units.forEach(function (u) {
      var v = rec.byUnit[u.n]; if (!v) return;
      box.appendChild(el("div", { class: "hbar" }, [
        el("a", { class: "hl", href: "#/u/" + u.n, text: u.n + ". " + u.title }),
        el("div", { class: "hv" }, el("div", { class: "bar" + (v.ok === v.n ? " ok" : "") },
          el("i", { style: "width:" + pct(v.ok, v.n) + "%" }))),
        el("div", { class: "hn", text: v.ok + "/" + v.n })
      ]));
    });

    var weak = Object.keys(rec.byTopic || {}).map(function (t) {
      return { t: t, v: rec.byTopic[t] }; }).filter(function (x) { return x.v.ok < x.v.n; })
      .sort(function (a, b) { return (a.v.ok / a.v.n) - (b.v.ok / b.v.n); }).slice(0, 8);
    if (weak.length) {
      box.appendChild(el("h2", { text: "Revise these first" }));
      box.appendChild(el("div", { class: "grid g2" }, weak.map(function (x) {
        var t = c.topicById[x.t];
        return el("a", { class: "ucard", href: "#/t/" + x.t }, [
          el("div", { class: "un", text: x.t }),
          el("div", { class: "ut", text: t ? t.title : x.t }),
          el("div", { class: "us", text: "you scored " + x.v.ok + " of " + x.v.n + " here" })
        ]);
      })));
    }

    box.appendChild(el("h2", { text: "Full review" }));
    var filt = el("div", { class: "row", style: "margin-bottom:16px" });
    var host = el("div");
    var mode = "wrong";
    function drawList() {
      host.innerHTML = "";
      rec.qids.forEach(function (qid, k) {
        var q = byId[qid]; if (!q) return;
        var p = rec.picks[qid]; p = (p == null ? -1 : p);
        var ok = p === q.ans;
        if (mode === "wrong" && ok) return;
        if (mode === "blank" && p >= 0) return;
        host.appendChild(questionCard(q, { n: "Q" + (k + 1), locked: true, pick: p }));
      });
      if (!host.childNodes.length) host.appendChild(el("div", { class: "empty", text: "Nothing in this filter — well done." }));
    }
    [["wrong", "Wrong only"], ["blank", "Blank only"], ["all", "Everything"]].forEach(function (p) {
      filt.appendChild(el("button", { class: "btn sm" + (p[0] === mode ? " pri" : ""), type: "button", text: p[1],
        onclick: function () { mode = p[0]; $$("button", filt).forEach(function (b) { b.className = "btn sm"; });
          this.className = "btn sm pri"; drawList(); } }));
    });
    box.appendChild(filt); box.appendChild(host); drawList();
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});

/* ============================ flashcards (SM-2 style scheduler) ============================ */
function srsOf(id) { return S.srs[id] || { due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 }; }
function grade(id, g) {            /* g: 0 again, 1 hard, 2 good, 3 easy */
  var c = srsOf(id);
  if (g === 0) { c.lapses++; c.reps = 0; c.ivl = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.due = dayNum(); }
  else {
    c.reps++;
    if (c.reps === 1) c.ivl = g === 1 ? 1 : (g === 3 ? 3 : 1);
    else if (c.reps === 2) c.ivl = g === 1 ? 3 : (g === 3 ? 8 : 6);
    else c.ivl = Math.max(1, Math.round(c.ivl * (g === 1 ? 1.2 : (g === 3 ? c.ease * 1.35 : c.ease))));
    c.ease = Math.max(1.3, Math.min(3.2, c.ease + (g === 1 ? -0.15 : (g === 3 ? 0.12 : 0))));
    c.due = dayNum() + c.ivl;
  }
  S.srs[id] = c; save("srs"); touchStreak();
  return c;
}
function cardsFromTricks(units, cur) {
  var out = [];
  units.forEach(function (u, i) {
    (u.topics || []).forEach(function (t) {
      (t.tricks || []).forEach(function (k, n) {
        out.push({ id: "tk:" + t.id + ":" + n, unit: cur.units[i].n, topic: t.id,
          front: k.title || ("Shortcut for " + t.title), back: k.body, kind: "shortcut" });
      });
    });
  });
  return out;
}
function allCards() {
  return loadCurriculum().then(function (c) {
    return Promise.all([loadAllCards(), Promise.all(c.units.map(function (u) { return loadUnit(u.n); }))])
      .then(function (r) { return r[0].concat(cardsFromTricks(r[1], c)); });
  });
}
route(/^\/cards(\?.*)?$/, function (main, m) {
  var qp = new URLSearchParams((m[1] || "").replace(/^\?/, ""));
  var fUnit = qp.get("unit"), fTopic = qp.get("topic");
  return allCards().then(function (cards) {
    if (fUnit) cards = cards.filter(function (c) { return +c.unit === +fUnit; });
    if (fTopic) cards = cards.filter(function (c) { return c.topic === fTopic; });
    var today = dayNum();
    var due = cards.filter(function (c) { return srsOf(c.id).due <= today; });
    var fresh = due.filter(function (c) { return !srsOf(c.id).reps; });
    var box = el("div", { class: "wrap" });
    box.appendChild(el("h1", { text: "Flashcards" }));
    box.appendChild(el("p", { class: "lede", text:
      "Definitions, formulas and shortcuts on a spaced-repetition schedule: cards you find hard come back tomorrow, " +
      "cards you know drift weeks out. Ten minutes a day keeps the whole syllabus warm." }));
    box.appendChild(el("div", { class: "grid g4", style: "margin-bottom:22px" }, [
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(due.length) }), el("div", { class: "l", text: "due now" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(fresh.length) }), el("div", { class: "l", text: "never seen" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(cards.length) }), el("div", { class: "l", text: "cards in scope" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(Object.keys(S.srs).length) }), el("div", { class: "l", text: "cards started" })])
    ]));
    if (!cards.length) { box.appendChild(el("div", { class: "empty", text: "No cards here yet." })); main.appendChild(box); return; }
    if (!due.length) {
      var soon = cards.map(function (c) { return srsOf(c.id).due; }).filter(function (d) { return d > today; }).sort()[0];
      box.appendChild(el("div", { class: "empty" }, [
        el("p", { text: "Nothing due. Next review " + (soon ? "in " + (soon - today) + " day" + (soon - today > 1 ? "s" : "") : "later") + "." }),
        el("button", { class: "btn", type: "button", text: "Study ahead anyway", onclick: function () { run(shuffle(cards).slice(0, 20)); } })
      ]));
      main.appendChild(box); return;
    }
    var startWrap = el("div", { class: "row" }, [
      el("button", { class: "btn pri", type: "button", text: "Review " + Math.min(due.length, 30) + " cards",
        onclick: function () { run(shuffle(due).slice(0, 30)); } }),
      el("a", { class: "btn", href: "#/stats", text: "See progress" })
    ]);
    box.appendChild(startWrap);
    var stage = el("div", { style: "margin-top:20px" });
    box.appendChild(stage);
    main.appendChild(box);

    function run(deck) {
      startWrap.classList.add("hidden");
      var k = 0, done = 0;
      function show() {
        stage.innerHTML = "";
        if (k >= deck.length) {
          stage.appendChild(el("div", { class: "empty" }, [
            el("p", { text: "Session finished — " + done + " cards reviewed." }),
            el("div", { class: "row", style: "justify-content:center" }, [
              el("button", { class: "btn pri", type: "button", text: "Another round", onclick: function () { render(); } }),
              el("a", { class: "btn", href: "#/", text: "Back to dashboard" })])
          ]));
          return;
        }
        var c = deck[k];
        var t = DATA.cur.topicById[c.topic];
        var back = el("div", { class: "fa hidden", html: md(c.back) });
        var card = el("div", { class: "fc" }, [
          el("div", { class: "tiny muted", style: "margin-bottom:9px",
            text: (k + 1) + " / " + deck.length + (t ? "  ·  " + c.topic + " " + t.title : "") }),
          el("div", { class: "fq", html: md(c.front) }),
          back
        ]);
        var rate = el("div", { class: "rate hidden" });
        [["Again", 0, "1 day"], ["Hard", 1, ""], ["Good", 2, ""], ["Easy", 3, ""]].forEach(function (g) {
          rate.appendChild(el("button", { class: "btn sm" + (g[1] === 2 ? " pri" : ""), type: "button", text: g[0],
            onclick: function () { grade(c.id, g[1]); done++; k++; show(); } }));
        });
        var reveal = el("button", { class: "btn pri", style: "margin-top:14px", type: "button", text: "Show answer  (space)",
          onclick: function () { back.classList.remove("hidden"); rate.classList.remove("hidden"); this.classList.add("hidden"); } });
        stage.appendChild(card); stage.appendChild(reveal); stage.appendChild(rate);
        var keyh = function (e) {
          if (e.key === " " && !reveal.classList.contains("hidden")) { e.preventDefault(); reveal.click(); }
          else if (!rate.classList.contains("hidden") && /^[1-4]$/.test(e.key)) { e.preventDefault(); $$("button", rate)[+e.key - 1].click(); }
        };
        document.addEventListener("keydown", keyh);
        onLeave(function () { document.removeEventListener("keydown", keyh); });
      }
      show();
    }
  });
});

/* ============================ progress & analytics ============================ */
route(/^\/stats$/, function (main) {
  return Promise.all([loadCurriculum(), loadAllQ()]).then(function (r) {
    var c = r[0], all = r[1];
    var box = el("div", { class: "wide" });
    box.appendChild(el("h1", { text: "Your progress" }));
    var att = Object.keys(S.att);
    var tot = att.length;
    var ok = att.filter(function (k) { return S.att[k].lastPick === (byIdOf(all)[k] || {}).ans; }).length;
    var topics = c.units.reduce(function (a, u) { return a + u.topics.length; }, 0);
    var readN = Object.keys(S.read).length;
    box.appendChild(el("div", { class: "grid g4", style: "margin-bottom:26px" }, [
      el("div", { class: "stat" }, [el("div", { class: "n", text: pct(readN, topics) + "%" }), el("div", { class: "l", text: "syllabus read" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: tot + "/" + all.length }), el("div", { class: "l", text: "questions seen" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: tot ? pct(ok, tot) + "%" : "—" }), el("div", { class: "l", text: "currently correct" })]),
      el("div", { class: "stat" }, [el("div", { class: "n", text: String(S.mocks.length) }), el("div", { class: "l", text: "tests taken" })])
    ]));

    if (S.mocks.length > 1) {
      box.appendChild(el("h2", { text: "Mock scores over time" }));
      box.appendChild(sparkChart(S.mocks.map(function (m) { return pct(m.correct, m.total); })));
      box.appendChild(el("p", { class: "tiny muted", text: "Accuracy per test, oldest on the left." }));
    }

    box.appendChild(el("h2", { text: "Accuracy by unit" }));
    var byId = byIdOf(all);
    c.units.forEach(function (u) {
      var uq = all.filter(function (q) { return q.unit === u.n; });
      var seen = uq.filter(function (q) { return S.att[q.id]; });
      var good = seen.filter(function (q) { return S.att[q.id].lastPick === q.ans; }).length;
      box.appendChild(el("div", { class: "hbar" }, [
        el("a", { class: "hl", href: "#/u/" + u.n, text: u.n + ". " + u.title }),
        el("div", { class: "hv" }, el("div", { class: "bar" + (seen.length && good === seen.length ? " ok" : "") },
          el("i", { style: "width:" + pct(good, Math.max(1, seen.length)) + "%" }))),
        el("div", { class: "hn", text: seen.length ? good + "/" + seen.length : "—" })
      ]));
    });

    var weak = [];
    c.units.forEach(function (u) { u.topics.forEach(function (t) {
      var tq = all.filter(function (q) { return q.topic === t.id; });
      var seen = tq.filter(function (q) { return S.att[q.id]; });
      if (seen.length < 2) return;
      var good = seen.filter(function (q) { return S.att[q.id].lastPick === q.ans; }).length;
      weak.push({ t: t, r: good / seen.length, n: seen.length, ok: good });
    }); });
    weak.sort(function (a, b) { return a.r - b.r; });
    if (weak.length) {
      box.appendChild(el("h2", { text: "Weakest topics" }));
      box.appendChild(el("p", { class: "muted small", text: "Ranked by how often you currently get them right. Start at the top." }));
      box.appendChild(el("div", { class: "grid g2" }, weak.slice(0, 8).map(function (w) {
        return el("a", { class: "ucard", href: "#/t/" + w.t.id }, [
          el("div", { class: "un", text: w.t.id }),
          el("div", { class: "ut", text: w.t.title }),
          el("div", { class: "us", text: w.ok + " of " + w.n + " right (" + Math.round(w.r * 100) + "%)" })
        ]);
      })));
    }
    box.appendChild(el("div", { class: "row", style: "margin-top:26px" }, [
      el("a", { class: "btn pri", href: "#/practice/wrong", text: "Redo everything I got wrong" }),
      el("a", { class: "btn", href: "#/practice/unseen", text: "Show unseen questions" }),
      el("a", { class: "btn", href: "#/settings", text: "Backup or reset" })
    ]));
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});
function byIdOf(all) { var m = {}; all.forEach(function (q) { m[q.id] = q; }); return m; }
function sparkChart(vals) {
  var w = el("div", { class: "bars" });
  vals.slice(-40).forEach(function (v) {
    w.appendChild(el("i", { style: "height:" + Math.max(3, v) + "%", title: v + "%" }));
  });
  return w;
}

/* ============================ settings ============================ */
route(/^\/settings$/, function (main) {
  var box = el("div", { class: "wrap" });
  box.appendChild(el("h1", { text: "Settings, backup and reset" }));
  box.appendChild(el("p", { class: "lede", text:
    "Everything you do here is stored in this browser only — nothing is uploaded anywhere. " +
    "Clearing site data or switching device loses it, so export a backup now and then." }));

  var sh = el("input", { type: "checkbox" }); sh.checked = !!S.settings.shuffleOpts;
  sh.addEventListener("change", function () { S.settings.shuffleOpts = sh.checked; save("settings"); });
  box.appendChild(el("div", { class: "card", style: "margin-bottom:16px" }, [
    el("label", { class: "row", style: "cursor:pointer" }, [sh, el("span", { text: "Shuffle answer options in practice (stops you memorising option positions)" })])
  ]));

  box.appendChild(el("h2", { text: "Backup" }));
  box.appendChild(el("div", { class: "row" }, [
    el("button", { class: "btn pri", type: "button", text: "Export progress (.json)", onclick: function () {
      var dump = {}; Store.keys().forEach(function (k) { dump[k] = Store.get(k, null); });
      var blob = new Blob([JSON.stringify({ app: "net-cs-lab", v: 1, at: Date.now(), data: dump }, null, 1)],
        { type: "application/json" });
      var a = el("a", { href: URL.createObjectURL(blob), download: "netcslab-progress-" + todayKey() + ".json" });
      document.body.appendChild(a); a.click(); a.remove();
    } }),
    (function () {
      var f = el("input", { type: "file", accept: ".json", class: "hidden" });
      f.addEventListener("change", function () {
        var file = f.files[0]; if (!file) return;
        file.text().then(function (txt) {
          try {
            var d = JSON.parse(txt); if (!d || !d.data) throw new Error("not a backup file");
            Object.keys(d.data).forEach(function (k) { Store.set(k, d.data[k]); });
            alert("Progress restored. Reloading."); location.reload();
          } catch (e) { alert("Could not read that file: " + e.message); }
        });
      });
      var b = el("button", { class: "btn", type: "button", text: "Import a backup", onclick: function () { f.click(); } });
      var span = el("span"); span.appendChild(b); span.appendChild(f); return span;
    })()
  ]));

  box.appendChild(el("h2", { text: "Reset" }));
  box.appendChild(el("div", { class: "row" }, [
    el("button", { class: "btn", type: "button", text: "Clear question attempts", onclick: function () {
      if (confirm("Forget every answer you have given?")) { S.att = {}; save("att"); alert("Cleared."); } } }),
    el("button", { class: "btn", type: "button", text: "Clear flashcard schedule", onclick: function () {
      if (confirm("Reset all spaced-repetition scheduling?")) { S.srs = {}; save("srs"); alert("Cleared."); } } }),
    el("button", { class: "btn", type: "button", text: "Clear test history", onclick: function () {
      if (confirm("Delete all stored mock results?")) { S.mocks = []; save("mocks"); alert("Cleared."); } } }),
    el("button", { class: "btn", type: "button", style: "color:var(--bad);border-color:var(--bad)", text: "Erase everything",
      onclick: function () { if (confirm("Erase all progress on this device? This cannot be undone.")) {
        Store.keys().forEach(function (k) { Store.del(k); }); location.reload(); } } })
  ]));
  box.appendChild(siteFooter());
  main.appendChild(box); headings(box);
});

/* ============================ interactive labs ============================ */
var LABS = {};
function deflab(id, meta) { LABS[id] = meta; }
function labCard(id, title, note) {
  var L = LABS[id];
  if (!L) return el("div", { class: "empty", text: "Lab “" + id + "” is not in this build." });
  var body = el("div", { class: "lab-b" });
  var card = el("div", { class: "lab" }, [
    el("div", { class: "lab-h" }, [el("span", { text: title || L.title }),
      el("a", { class: "tiny muted", href: "#/lab/" + id, text: "open full screen ↗" })]),
    body
  ]);
  if (note) body.appendChild(el("p", { class: "small muted", html: mdInline(note) }));
  try { L.build(body); } catch (e) { body.appendChild(el("p", { class: "small", text: "Lab error: " + e.message })); }
  return card;
}
function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
function parseNums(s) {
  return String(s || "").split(/[^0-9.\-]+/).filter(function (x) { return x !== "" && x !== "-"; }).map(Number);
}
function ctlRow() { return el("div", { class: "ctl" }); }
function inp(val, w, ph) { return el("input", { type: "text", value: val, style: "width:" + (w || 200) + "px", placeholder: ph || "" }); }
function sel(opts, v) {
  var s = el("select", {}, opts.map(function (o) {
    var t = Array.isArray(o) ? o[1] : o, val = Array.isArray(o) ? o[0] : o;
    return el("option", { value: val, selected: val === v ? "selected" : null }, t);
  }));
  return s;
}
function outBox() { return el("pre", { class: "out" }); }

route(/^\/labs$/, function (main) {
  return loadCurriculum().then(function (c) {
    var box = el("div", { class: "wide" });
    box.appendChild(el("h1", { text: "Interactive labs" }));
    box.appendChild(el("p", { class: "lede", text:
      "Reading that FIFO can beat LRU is one thing; watching it happen on your own reference string is another. " +
      "Each lab runs the algorithm step by step on input you choose, so you can check your hand-working in seconds." }));
    var byUnit = {};
    Object.keys(LABS).forEach(function (id) { var L = LABS[id]; (byUnit[L.unit] = byUnit[L.unit] || []).push([id, L]); });
    Object.keys(byUnit).sort(function (a, b) { return a - b; }).forEach(function (u) {
      var cu = c.unitByN[u];
      box.appendChild(el("h2", { text: "Unit " + u + " · " + (cu ? cu.title : "") }));
      box.appendChild(el("div", { class: "grid g2" }, byUnit[u].map(function (p) {
        return el("a", { class: "ucard", href: "#/lab/" + p[0] }, [
          el("div", { class: "ut", style: "margin-top:0", text: p[1].title }),
          el("div", { class: "us", text: p[1].desc })
        ]);
      })));
    });
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});
route(/^\/lab\/(.+)$/, function (main, m) {
  var id = m[1], L = LABS[id];
  return loadCurriculum().then(function (c) {
    var box = el("div", { class: "wrap" });
    if (!L) { box.appendChild(el("div", { class: "empty", text: "No lab called “" + id + "”." })); main.appendChild(box); return; }
    box.appendChild(crumb([{ text: "Labs", href: "#/labs" }, { text: L.title }]));
    box.appendChild(el("h1", { text: L.title }));
    box.appendChild(el("p", { class: "lede", text: L.desc }));
    var body = el("div"); L.build(body); box.appendChild(body);
    if ((L.topics || []).length) {
      box.appendChild(el("div", { class: "sep" }));
      box.appendChild(el("div", { class: "row" }, L.topics.map(function (t) {
        var tt = c.topicById[t];
        return el("a", { class: "btn sm", href: "#/t/" + t, text: tt ? ("Read " + t + " " + tt.title) : t });
      })));
    }
    box.appendChild(siteFooter());
    main.appendChild(box); headings(box);
  });
});

/* ---------- Unit 5: page replacement ---------- */
deflab("pagerepl", { title: "Page replacement simulator", unit: 5, topics: ["5.9"],
  desc: "Run FIFO, LRU, Optimal, Second-chance and LFU over one reference string and compare the fault counts side by side.",
  build: function (host) {
    var refI = inp("7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1", 330);
    var frI = inp("3", 60);
    var algS = sel([["FIFO", "FIFO"], ["LRU", "LRU"], ["OPT", "Optimal"], ["SC", "Second chance"], ["LFU", "LFU"]], "LRU");
    var out = el("div");
    var row = ctlRow();
    row.appendChild(el("label", {}, ["Reference string", refI]));
    row.appendChild(el("label", {}, ["Frames", frI]));
    row.appendChild(el("label", {}, ["Algorithm", algS]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Run", onclick: run }));
    row.appendChild(el("button", { class: "btn sm", type: "button", text: "Compare all", onclick: compare }));
    host.appendChild(row); host.appendChild(out);

    function sim(ref, F, alg) {
      var fr = [], hist = [], meta = [], faults = 0;
      var loadTime = {}, useTime = {}, freq = {}, ptr = 0, ref2 = {};
      ref.forEach(function (p, t) {
        var hit = fr.indexOf(p) >= 0, victim = -1;
        if (hit) { useTime[p] = t; freq[p] = (freq[p] || 0) + 1; ref2[p] = 1; }
        else {
          faults++;
          if (fr.length < F) fr.push(p);
          else {
            var vi = 0;
            if (alg === "FIFO") { vi = 0; var oldest = Infinity;
              fr.forEach(function (x, i) { if (loadTime[x] < oldest) { oldest = loadTime[x]; vi = i; } }); }
            else if (alg === "LRU") { var lru = Infinity;
              fr.forEach(function (x, i) { var u = useTime[x] == null ? -1 : useTime[x]; if (u < lru) { lru = u; vi = i; } }); }
            else if (alg === "OPT") { var far = -1;
              fr.forEach(function (x, i) { var nx = ref.indexOf(x, t + 1); if (nx === -1) nx = Infinity;
                if (nx > far) { far = nx; vi = i; } }); }
            else if (alg === "LFU") { var lo = Infinity;
              fr.forEach(function (x, i) { var f = freq[x] || 1; if (f < lo || (f === lo && loadTime[x] < loadTime[fr[vi]])) { lo = f; vi = i; } }); }
            else if (alg === "SC") {
              for (var g = 0; g < F * 2 + 2; g++) {
                var cand = ptr % fr.length;
                if (ref2[fr[cand]]) { ref2[fr[cand]] = 0; ptr = (ptr + 1) % fr.length; }
                else { vi = cand; ptr = (cand + 1) % fr.length; break; }
              }
            }
            victim = fr[vi]; fr[vi] = p;
          }
          loadTime[p] = t; useTime[p] = t; freq[p] = 1; ref2[p] = 1;
        }
        hist.push(fr.slice()); meta.push({ hit: hit, victim: victim, page: p });
      });
      return { faults: faults, hist: hist, meta: meta, hits: ref.length - faults };
    }
    function run() {
      var ref = parseNums(refI.value), F = Math.max(1, Math.min(9, num(frI.value, 3)));
      if (!ref.length) { out.innerHTML = "<p class='small'>Enter a reference string.</p>"; return; }
      var alg = algS.value, r = sim(ref, F, alg);
      out.innerHTML = "";
      out.appendChild(el("div", { class: "row", style: "margin-bottom:11px" }, [
        el("span", { class: "tag hard", text: r.faults + " page faults" }),
        el("span", { class: "tag easy", text: r.hits + " hits" }),
        el("span", { class: "tag", text: "hit ratio " + (r.hits / ref.length).toFixed(3) })
      ]));
      var viz = el("div", { class: "viz" }), grid = el("div", { class: "frames" });
      ref.forEach(function (p, t) {
        var col = el("div", { class: "col" });
        col.appendChild(el("div", { class: "hd", text: p }));
        for (var f = 0; f < F; f++) {
          var v = r.hist[t][f];
          col.appendChild(el("div", { class: "cell " + (v == null ? "blank" : (r.hist[t][f] === p && !r.meta[t].hit ? "fault" : (r.meta[t].hit && v === p ? "hit" : ""))),
            text: v == null ? "·" : v }));
        }
        col.appendChild(el("div", { class: "hd", style: "color:" + (r.meta[t].hit ? "var(--ok)" : "var(--bad)"),
          text: r.meta[t].hit ? "H" : "F" }));
        grid.appendChild(col);
      });
      viz.appendChild(grid); out.appendChild(viz);
      var steps = r.meta.map(function (m, t) {
        return "t=" + (t + 1) + "  page " + m.page + "  " + (m.hit ? "hit" :
          (m.victim >= 0 ? "fault, evict " + m.victim : "fault, free frame")) + "   [" + r.hist[t].join(" ") + "]";
      }).join("\n");
      var pre = outBox(); pre.textContent = steps;
      out.appendChild(el("details", { style: "margin-top:12px" }, [el("summary", { class: "small", style: "cursor:pointer" }, "Step-by-step trace"), pre]));
    }
    function compare() {
      var ref = parseNums(refI.value), F = Math.max(1, Math.min(9, num(frI.value, 3)));
      if (!ref.length) return;
      out.innerHTML = "";
      var t = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Algorithm" }),
        el("th", { text: "Faults" }), el("th", { text: "Hits" }), el("th", { text: "Hit ratio" })]))]);
      var tb = el("tbody");
      [["FIFO", "FIFO"], ["LRU", "LRU"], ["OPT", "Optimal"], ["SC", "Second chance"], ["LFU", "LFU"]].forEach(function (a) {
        var r = sim(ref, F, a[0]);
        tb.appendChild(el("tr", {}, [el("td", { text: a[1] }), el("td", { text: r.faults }),
          el("td", { text: r.hits }), el("td", { text: (r.hits / ref.length).toFixed(3) })]));
      });
      t.appendChild(tb); out.appendChild(t);
      out.appendChild(el("p", { class: "small muted", text:
        "Optimal is the lower bound no real algorithm can beat — if your hand-computed answer is below it, you have made a mistake." }));
    }
    run();
  } });

/* ---------- Unit 5: CPU scheduling ---------- */
deflab("cpusched", { title: "CPU scheduling — Gantt chart", unit: 5, topics: ["5.6"],
  desc: "FCFS, SJF, SRTF, Round Robin and Priority scheduling with a drawn Gantt chart and the average waiting and turnaround times.",
  build: function (host) {
    var atI = inp("0 1 2 3", 170), btI = inp("5 3 8 6", 170), prI = inp("2 1 4 3", 170), qI = inp("2", 55);
    var algS = sel([["FCFS", "FCFS"], ["SJF", "SJF (non-preemptive)"], ["SRTF", "SRTF (preemptive)"],
      ["RR", "Round Robin"], ["PRI", "Priority (non-preemptive)"], ["PRIP", "Priority (preemptive)"]], "FCFS");
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Arrival", atI]));
    row.appendChild(el("label", {}, ["Burst", btI]));
    row.appendChild(el("label", {}, ["Priority", prI]));
    row.appendChild(el("label", {}, ["Quantum", qI]));
    row.appendChild(el("label", {}, ["Algorithm", algS]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Run", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    algS.addEventListener("change", run);

    function run() {
      var at = parseNums(atI.value), bt = parseNums(btI.value), pr = parseNums(prI.value);
      var n = Math.min(at.length, bt.length); if (!n) { out.innerHTML = "<p class='small'>Enter arrival and burst times.</p>"; return; }
      var alg = algS.value, q = Math.max(1, num(qI.value, 2));
      var rem = bt.slice(0, n), done = 0, t = 0, gantt = [], comp = new Array(n).fill(0), started = new Array(n).fill(-1);
      var rrq = [], inq = new Array(n).fill(false), guard = 0;
      while (done < n && guard++ < 20000) {
        var ready = [];
        for (var i = 0; i < n; i++) if (at[i] <= t && rem[i] > 0) ready.push(i);
        if (!ready.length) {
          var nxt = Infinity; for (var k = 0; k < n; k++) if (rem[k] > 0) nxt = Math.min(nxt, at[k]);
          if (!isFinite(nxt)) break;
          gantt.push({ p: -1, s: t, e: nxt }); t = nxt; continue;
        }
        var pick, run_for;
        if (alg === "FCFS") { pick = ready.sort(function (a, b) { return at[a] - at[b] || a - b; })[0]; run_for = rem[pick]; }
        else if (alg === "SJF") { pick = ready.sort(function (a, b) { return rem[a] - rem[b] || at[a] - at[b] || a - b; })[0]; run_for = rem[pick]; }
        else if (alg === "PRI") { pick = ready.sort(function (a, b) { return (pr[a] || 0) - (pr[b] || 0) || at[a] - at[b]; })[0]; run_for = rem[pick]; }
        else if (alg === "SRTF" || alg === "PRIP") {
          pick = ready.sort(function (a, b) { return alg === "SRTF" ? (rem[a] - rem[b] || at[a] - at[b])
            : ((pr[a] || 0) - (pr[b] || 0) || at[a] - at[b]); })[0];
          var nextArr = Infinity;
          for (var z = 0; z < n; z++) if (at[z] > t && rem[z] > 0) nextArr = Math.min(nextArr, at[z]);
          run_for = Math.min(rem[pick], isFinite(nextArr) ? nextArr - t : rem[pick]);
          run_for = Math.max(1, run_for);
        } else { /* RR */
          for (var a2 = 0; a2 < n; a2++) if (at[a2] <= t && rem[a2] > 0 && !inq[a2]) { rrq.push(a2); inq[a2] = true; }
          if (!rrq.length) { t++; continue; }
          pick = rrq.shift(); inq[pick] = false; run_for = Math.min(q, rem[pick]);
        }
        if (started[pick] < 0) started[pick] = t;
        var last = gantt[gantt.length - 1];
        if (last && last.p === pick) last.e = t + run_for; else gantt.push({ p: pick, s: t, e: t + run_for });
        rem[pick] -= run_for; t += run_for;
        if (alg === "RR") {
          for (var a3 = 0; a3 < n; a3++) if (at[a3] <= t && rem[a3] > 0 && !inq[a3] && a3 !== pick) { rrq.push(a3); inq[a3] = true; }
          if (rem[pick] > 0) { rrq.push(pick); inq[pick] = true; }
        }
        if (rem[pick] === 0) { comp[pick] = t; done++; }
      }
      var tat = [], wt = [], rt = [];
      for (var i2 = 0; i2 < n; i2++) { tat[i2] = comp[i2] - at[i2]; wt[i2] = tat[i2] - bt[i2]; rt[i2] = started[i2] - at[i2]; }
      out.innerHTML = "";
      var g = el("div", { class: "gantt" });
      gantt.forEach(function (b) {
        g.appendChild(el("div", { class: b.p < 0 ? "idle" : "", title: b.s + " → " + b.e },
          (b.p < 0 ? "idle" : "P" + (b.p + 1)) + "\n" + b.s + "–" + b.e));
      });
      out.appendChild(el("div", { class: "viz" }, g));
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, ["Process", "Arrival", "Burst",
        "Priority", "Completion", "Turnaround", "Waiting", "Response"].map(function (h) { return el("th", { text: h }); })))]);
      var body = el("tbody");
      for (var i3 = 0; i3 < n; i3++) body.appendChild(el("tr", {}, [
        el("td", { text: "P" + (i3 + 1) }), el("td", { text: at[i3] }), el("td", { text: bt[i3] }),
        el("td", { text: pr[i3] == null ? "—" : pr[i3] }), el("td", { text: comp[i3] }),
        el("td", { text: tat[i3] }), el("td", { text: wt[i3] }), el("td", { text: rt[i3] })]));
      tb.appendChild(body); out.appendChild(tb);
      var avg = function (a) { return (a.reduce(function (x, y) { return x + y; }, 0) / a.length).toFixed(2); };
      out.appendChild(el("div", { class: "row" }, [
        el("span", { class: "tag", text: "avg turnaround " + avg(tat) }),
        el("span", { class: "tag", text: "avg waiting " + avg(wt) }),
        el("span", { class: "tag", text: "avg response " + avg(rt) }),
        el("span", { class: "tag", text: "throughput " + (n / t).toFixed(3) + "/unit" })
      ]));
      out.appendChild(el("p", { class: "small muted", text:
        "Waiting time = turnaround − burst. SJF/SRTF always give the minimum average waiting time for a fixed set of jobs; " +
        "if another algorithm beats them in your working, recheck it." }));
    }
    run();
  } });

/* ---------- Unit 5: disk scheduling ---------- */
deflab("disksched", { title: "Disk scheduling head movement", unit: 5, topics: ["5.10"],
  desc: "FCFS, SSTF, SCAN, C-SCAN, LOOK and C-LOOK — total head movement and the order the requests are served.",
  build: function (host) {
    var reqI = inp("98 183 37 122 14 124 65 67", 300), headI = inp("53", 60), maxI = inp("199", 60);
    var dirS = sel([["right", "towards higher"], ["left", "towards lower"]], "right");
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Requests", reqI]));
    row.appendChild(el("label", {}, ["Head at", headI]));
    row.appendChild(el("label", {}, ["Last cylinder", maxI]));
    row.appendChild(el("label", {}, ["Direction", dirS]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Compare", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function walk(seq, head) { var tot = 0, c = head; seq.forEach(function (x) { tot += Math.abs(x - c); c = x; }); return tot; }
    function run() {
      var R = parseNums(reqI.value), h = num(headI.value, 53), mx = num(maxI.value, 199), right = dirS.value === "right";
      if (!R.length) return;
      var res = {};
      res.FCFS = R.slice();
      var rem = R.slice(), c = h, s = [];
      while (rem.length) { var b = 0; for (var i = 1; i < rem.length; i++) if (Math.abs(rem[i] - c) < Math.abs(rem[b] - c)) b = i;
        c = rem[b]; s.push(c); rem.splice(b, 1); }
      res.SSTF = s;
      var lo = R.filter(function (x) { return x < h; }).sort(function (a, b) { return b - a; });
      var hi = R.filter(function (x) { return x >= h; }).sort(function (a, b) { return a - b; });
      res.SCAN = right ? hi.concat([mx]).concat(lo) : lo.concat([0]).concat(hi);
      res["C-SCAN"] = right ? hi.concat([mx, 0]).concat(lo.slice().reverse()) : lo.concat([0, mx]).concat(hi.slice().reverse());
      res.LOOK = right ? hi.concat(lo) : lo.concat(hi);
      res["C-LOOK"] = right ? hi.concat(lo.slice().reverse()) : lo.concat(hi.slice().reverse());
      out.innerHTML = "";
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Algorithm" }),
        el("th", { text: "Total head movement" }), el("th", { text: "Service order" })]))]);
      var body = el("tbody");
      var best = Infinity;
      Object.keys(res).forEach(function (k) { best = Math.min(best, walk(res[k], h)); });
      Object.keys(res).forEach(function (k) {
        var m = walk(res[k], h);
        body.appendChild(el("tr", {}, [el("td", { text: k }),
          el("td", { html: "<b" + (m === best ? " style='color:var(--ok)'" : "") + ">" + m + "</b>" }),
          el("td", { class: "tiny", text: h + " → " + res[k].join(" → ") })]));
      });
      tb.appendChild(body); out.appendChild(tb);
      out.appendChild(el("p", { class: "small muted", text:
        "SCAN and C-SCAN run to the very end of the disk; LOOK and C-LOOK turn around at the last request. " +
        "That single difference is what most exam questions are actually testing." }));
    }
    run();
  } });

/* ---------- Unit 5: banker's algorithm ---------- */
deflab("banker", { title: "Banker's algorithm — safe sequence", unit: 5, topics: ["5.7"],
  desc: "Enter allocation, maximum demand and available vectors; get the need matrix, whether the state is safe, and the safe sequence.",
  build: function (host) {
    var allocI = el("textarea", { class: "inp", rows: 5 }); allocI.value = "0 1 0\n2 0 0\n3 0 2\n2 1 1\n0 0 2";
    var maxI = el("textarea", { class: "inp", rows: 5 }); maxI.value = "7 5 3\n3 2 2\n9 0 2\n2 2 2\n4 3 3";
    var availI = inp("3 3 2", 150);
    var out = el("div");
    host.appendChild(el("div", { class: "grid g2" }, [
      el("div", {}, [el("div", { class: "tiny muted", text: "Allocation (one process per line)" }), allocI]),
      el("div", {}, [el("div", { class: "tiny muted", text: "Max (one process per line)" }), maxI])
    ]));
    var row = ctlRow();
    row.appendChild(el("label", {}, ["Available", availI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Check safety", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function mat(s) { return String(s).trim().split(/\n+/).map(function (l) { return parseNums(l); }).filter(function (r) { return r.length; }); }
    function run() {
      var A = mat(allocI.value), M = mat(maxI.value), av = parseNums(availI.value);
      if (!A.length || A.length !== M.length) { out.innerHTML = "<p class='small'>Allocation and Max need the same number of rows.</p>"; return; }
      var n = A.length, m = av.length;
      var need = A.map(function (r, i) { return r.map(function (v, j) { return (M[i][j] || 0) - v; }); });
      var work = av.slice(), fin = new Array(n).fill(false), seq = [], log = [];
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < n; i++) {
          if (fin[i]) continue;
          var can = true;
          for (var j = 0; j < m; j++) if (need[i][j] > work[j]) { can = false; break; }
          if (can) {
            log.push("P" + i + ": need [" + need[i].join(" ") + "] ≤ work [" + work.join(" ") + "] → run, release [" + A[i].join(" ") + "]");
            for (var j2 = 0; j2 < m; j2++) work[j2] += A[i][j2];
            fin[i] = true; seq.push("P" + i); changed = true;
            log.push("        work becomes [" + work.join(" ") + "]");
          }
        }
      }
      var safe = fin.every(Boolean);
      out.innerHTML = "";
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "P" }),
        el("th", { text: "Allocation" }), el("th", { text: "Max" }), el("th", { text: "Need = Max − Alloc" })]))]);
      var body = el("tbody");
      need.forEach(function (r, i) { body.appendChild(el("tr", {}, [el("td", { text: "P" + i }),
        el("td", { text: A[i].join(" ") }), el("td", { text: M[i].join(" ") }), el("td", { html: "<b>" + r.join(" ") + "</b>" })])); });
      tb.appendChild(body); out.appendChild(tb);
      out.appendChild(el("div", { class: "cal " + (safe ? "formula" : "trap") }, [
        el("div", { class: "cal-h", text: safe ? "Safe state" : "Unsafe state" }),
        el("div", { html: safe ? "<p>A safe sequence is <b>&lt;" + seq.join(", ") + "&gt;</b>. Note that other safe sequences may also exist — " +
          "any one of them is a valid answer.</p>" : "<p>No process can finish from here, so the state is unsafe. " +
          "Unsafe does not mean deadlocked yet — it means the system can no longer guarantee it will avoid deadlock.</p>" })
      ]));
      var pre = outBox(); pre.textContent = log.join("\n") || "(no process could proceed)";
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "Safety algorithm trace"), pre]));
    }
    run();
  } });

/* ---------- Unit 2: K-map ---------- */
deflab("kmap", { title: "Karnaugh map simplifier", unit: 2, topics: ["2.1", "1.6"],
  desc: "Click cells to set minterms (click again for a don't-care) and read off a minimal sum-of-products with the prime implicants marked.",
  build: function (host) {
    var nS = sel([["3", "3 variables (A B C)"], ["4", "4 variables (A B C D)"]], "4");
    var mI = inp("0 1 2 5 6 7 8 9 10 14", 260), dI = inp("", 140);
    var out = el("div"), gridHost = el("div", { style: "margin-bottom:14px" });
    var row = ctlRow();
    row.appendChild(el("label", {}, ["Variables", nS]));
    row.appendChild(el("label", {}, ["Minterms", mI]));
    row.appendChild(el("label", {}, ["Don't care", dI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Simplify", onclick: build }));
    host.appendChild(row); host.appendChild(gridHost); host.appendChild(out);
    nS.addEventListener("change", build);
    var state = {};
    function gray(b) { return b ^ (b >> 1); }
    function build() {
      var n = +nS.value, N = 1 << n;
      state = {};
      parseNums(mI.value).forEach(function (m) { if (m < N) state[m] = 1; });
      parseNums(dI.value).forEach(function (m) { if (m < N) state[m] = 2; });
      draw();
    }
    function draw() {
      var n = +nS.value;
      gridHost.innerHTML = "";
      var rows = n === 3 ? 2 : 4, cols = 4;
      var rowBits = n === 3 ? 1 : 2, colBits = 2;
      var t = el("table", { class: "kmap" });
      var head = el("tr", {}, [el("th", { text: n === 3 ? "A\\BC" : "AB\\CD" })]);
      for (var c = 0; c < cols; c++) head.appendChild(el("th", { text: bits(gray(c), colBits) }));
      t.appendChild(head);
      for (var r = 0; r < rows; r++) {
        var tr = el("tr", {}, [el("th", { text: bits(gray(r), rowBits) })]);
        for (var c2 = 0; c2 < cols; c2++) {
          var idx = (gray(r) << colBits) | gray(c2);
          (function (idx) {
            var v = state[idx] || 0;
            tr.appendChild(el("td", { class: v === 1 ? "on" : (v === 2 ? "dc" : ""), title: "m" + idx,
              text: v === 1 ? "1" : (v === 2 ? "X" : "0"),
              onclick: function () { state[idx] = ((state[idx] || 0) + 1) % 3; sync(); draw(); } }));
          })(idx);
        }
        t.appendChild(tr);
      }
      gridHost.appendChild(t);
      solve();
    }
    function sync() {
      var ones = [], dcs = [];
      Object.keys(state).forEach(function (k) { if (state[k] === 1) ones.push(+k); else if (state[k] === 2) dcs.push(+k); });
      mI.value = ones.sort(function (a, b) { return a - b; }).join(" ");
      dI.value = dcs.sort(function (a, b) { return a - b; }).join(" ");
    }
    function bits(v, w) { var s = v.toString(2); while (s.length < w) s = "0" + s; return s; }
    function solve() {
      var n = +nS.value, N = 1 << n, names = ["A", "B", "C", "D"].slice(0, n);
      var ones = [], dcs = [];
      for (var i = 0; i < N; i++) { if (state[i] === 1) ones.push(i); else if (state[i] === 2) dcs.push(i); }
      out.innerHTML = "";
      if (!ones.length) { out.appendChild(el("p", { class: "small muted", text: "F = 0 — no minterms selected." })); return; }
      if (ones.length + dcs.length === N) { out.appendChild(el("p", { class: "small", html: md("**F = 1** — every cell is 1 or don't-care.") })); return; }
      /* Quine-McCluskey */
      var terms = ones.concat(dcs).map(function (m) { return { mask: 0, val: m, cov: [m], used: false }; });
      var primes = [], cur = terms;
      while (cur.length) {
        var next = [], seen = {};
        for (var a = 0; a < cur.length; a++) for (var b = a + 1; b < cur.length; b++) {
          var x = cur[a], y = cur[b];
          if (x.mask !== y.mask) continue;
          var d = x.val ^ y.val;
          if (d && (d & (d - 1)) === 0) {
            x.used = y.used = true;
            var nm = x.mask | d, nv = x.val & ~d, key = nm + ":" + nv;
            if (!seen[key]) { seen[key] = 1; next.push({ mask: nm, val: nv, cov: uniq(x.cov.concat(y.cov)), used: false }); }
          }
        }
        cur.forEach(function (t2) { if (!t2.used) primes.push(t2); });
        cur = next;
      }
      /* Petrick-lite: essential primes first, then greedy */
      var need = ones.slice(), chosen = [];
      var chart = {};
      need.forEach(function (m) { chart[m] = primes.filter(function (p) { return p.cov.indexOf(m) >= 0; }); });
      Object.keys(chart).forEach(function (m) {
        if (chart[m].length === 1 && chosen.indexOf(chart[m][0]) < 0) chosen.push(chart[m][0]);
      });
      function covered() { var s = {}; chosen.forEach(function (p) { p.cov.forEach(function (m) { s[m] = 1; }); }); return s; }
      var guard = 0;
      while (need.some(function (m) { return !covered()[m]; }) && guard++ < 64) {
        var cv = covered(), best = null, bn = -1;
        primes.forEach(function (p) {
          if (chosen.indexOf(p) >= 0) return;
          var c = p.cov.filter(function (m) { return need.indexOf(m) >= 0 && !cv[m]; }).length;
          if (c > bn) { bn = c; best = p; }
        });
        if (!best || bn <= 0) break;
        chosen.push(best);
      }
      function lit(p) {
        var s = "";
        for (var i = 0; i < n; i++) {
          var bit = 1 << (n - 1 - i);
          if (p.mask & bit) continue;
          s += names[i] + ((p.val & bit) ? "" : "'");
        }
        return s || "1";
      }
      var expr = chosen.map(lit).join(" + ");
      out.appendChild(el("div", { class: "cal formula" }, [
        el("div", { class: "cal-h", text: "Minimal sum of products" }),
        el("div", { html: md("$$F = " + expr.replace(/'/g, "'").replace(/\+/g, "+") + "$$") })
      ]));
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Prime implicant" }),
        el("th", { text: "Covers minterms" }), el("th", { text: "Size" }), el("th", { text: "In answer" })]))]);
      var body = el("tbody");
      primes.sort(function (a, b) { return b.cov.length - a.cov.length; }).forEach(function (p) {
        body.appendChild(el("tr", {}, [el("td", { text: lit(p) }),
          el("td", { class: "tiny", text: p.cov.slice().sort(function (a, b) { return a - b; }).join(", ") }),
          el("td", { text: p.cov.length }),
          el("td", { html: chosen.indexOf(p) >= 0 ? "<b style='color:var(--ok)'>yes</b>" : "—" })]));
      });
      tb.appendChild(body);
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "All prime implicants"), tb]));
      out.appendChild(el("p", { class: "small muted", text: "Literals in the answer: " +
        chosen.reduce(function (a, p) { return a + lit(p).replace(/'/g, "").length; }, 0) +
        ", groups: " + chosen.length + ". Bigger groups mean fewer literals, so always grow a group as far as it will go." }));
    }
    build();
  } });

/* ---------- Unit 2: number systems ---------- */
deflab("numbase", { title: "Number systems and machine representation", unit: 2, topics: ["2.2"],
  desc: "Convert between bases and see sign-magnitude, 1's complement, 2's complement, excess-127 and IEEE 754 single precision side by side.",
  build: function (host) {
    var vI = inp("-45.625", 150), bI = sel([["10", "decimal"], ["2", "binary"], ["8", "octal"], ["16", "hex"]], "10");
    var wI = sel([["8", "8-bit"], ["16", "16-bit"], ["32", "32-bit"]], "8");
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Value", vI]));
    row.appendChild(el("label", {}, ["Input base", bI]));
    row.appendChild(el("label", {}, ["Word size", wI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Convert", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    [vI, bI, wI].forEach(function (x) { x.addEventListener("change", run); });
    vI.addEventListener("input", run);
    function run() {
      var raw = vI.value.trim(), base = +bI.value, W = +wI.value;
      var neg = raw[0] === "-"; if (neg) raw = raw.slice(1);
      var parts = raw.split("."), ip = parts[0] || "0", fp = parts[1] || "";
      var iv = parseInt(ip, base); if (!isFinite(iv)) iv = 0;
      var fv = 0; for (var i = 0; i < fp.length; i++) { var d = parseInt(fp[i], base); if (isFinite(d)) fv += d / Math.pow(base, i + 1); }
      var val = (iv + fv) * (neg ? -1 : 1);
      out.innerHTML = "";
      var rows = [
        ["Decimal", String(val)],
        ["Binary", toBase(val, 2)], ["Octal", toBase(val, 8)], ["Hexadecimal", toBase(val, 16).toUpperCase()]
      ];
      var iVal = Math.trunc(Math.abs(val)), max = Math.pow(2, W - 1);
      if (iVal < max) {
        var mag = iVal.toString(2).padStart(W - 1, "0");
        rows.push(["Sign–magnitude (" + W + " bit)", (val < 0 ? "1" : "0") + mag]);
        var ones = val < 0 ? flip("0" + mag) : "0" + mag;
        rows.push(["1's complement", ones]);
        var two = val < 0 ? add1(flip("0" + mag)) : "0" + mag;
        rows.push(["2's complement", two]);
        rows.push(["Unsigned range for " + W + " bits", "0 … " + (Math.pow(2, W) - 1)]);
        rows.push(["Signed 2's complement range", (-max) + " … " + (max - 1)]);
      } else rows.push([W + "-bit fields", "value does not fit in " + W + " bits"]);
      var f = ieee(val);
      rows.push(["IEEE 754 single", f.sign + " " + f.exp + " " + f.man]);
      rows.push(["→ as hex", f.hex]);
      rows.push(["→ biased exponent", f.e + " (unbiased " + (f.e - 127) + ", bias 127)"]);
      var tb = el("table", { class: "tbl-sm" }); var body = el("tbody");
      rows.forEach(function (r) { body.appendChild(el("tr", {}, [el("td", { style: "width:240px", text: r[0] }),
        el("td", {}, el("code", { text: r[1] }))])); });
      tb.appendChild(body); out.appendChild(tb);
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("To take a 2's complement by hand: copy bits from the right up to and **including the first 1**, then flip everything to the left of it. No borrowing, no adding 1.") })]));
    }
    function toBase(v, b) {
      var neg = v < 0; v = Math.abs(v);
      var ip = Math.trunc(v), fp = v - ip, s = ip.toString(b);
      if (fp > 1e-12) { s += "."; var g = 0; while (fp > 1e-12 && g++ < 20) { fp *= b; var d = Math.trunc(fp); s += d.toString(b); fp -= d; } }
      return (neg ? "-" : "") + s;
    }
    function flip(s) { return s.replace(/[01]/g, function (c) { return c === "0" ? "1" : "0"; }); }
    function add1(s) {
      var a = s.split(""), i = a.length - 1;
      while (i >= 0) { if (a[i] === "0") { a[i] = "1"; break; } a[i] = "0"; i--; }
      return a.join("");
    }
    function ieee(v) {
      var buf = new ArrayBuffer(4), dv = new DataView(buf);
      dv.setFloat32(0, v);
      var u = dv.getUint32(0), b = u.toString(2).padStart(32, "0");
      return { sign: b[0], exp: b.slice(1, 9), man: b.slice(9), e: parseInt(b.slice(1, 9), 2),
        hex: "0x" + u.toString(16).toUpperCase().padStart(8, "0") };
    }
    run();
  } });

/* ---------- Unit 2: cache mapping ---------- */
deflab("cache", { title: "Cache address breakdown", unit: 2, topics: ["2.10"],
  desc: "Split a physical address into tag, index/set and offset for direct-mapped, fully associative and k-way set associative caches, and get the effective access time.",
  build: function (host) {
    var addrI = inp("32", 60), csI = inp("64", 70), blI = inp("16", 60), wayI = inp("4", 55);
    var hitI = inp("10", 60), missI = inp("100", 65), hrI = inp("0.9", 60);
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Address bits", addrI]));
    row.appendChild(el("label", {}, ["Cache size (KB)", csI]));
    row.appendChild(el("label", {}, ["Block (bytes)", blI]));
    row.appendChild(el("label", {}, ["Ways", wayI]));
    host.appendChild(row);
    var row2 = ctlRow();
    row2.appendChild(el("label", {}, ["Hit time (ns)", hitI]));
    row2.appendChild(el("label", {}, ["Memory time (ns)", missI]));
    row2.appendChild(el("label", {}, ["Hit ratio", hrI]));
    row2.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Compute", onclick: run }));
    host.appendChild(row2); host.appendChild(out);
    function run() {
      var A = num(addrI.value, 32), CS = num(csI.value, 64) * 1024, B = num(blI.value, 16), k = Math.max(1, num(wayI.value, 4));
      var blocks = Math.floor(CS / B), off = Math.log2(B);
      out.innerHTML = "";
      if (off % 1 || Math.log2(blocks) % 1) { out.appendChild(el("p", { class: "small", text: "Use powers of two for block size and cache size." })); return; }
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, ["Organisation", "Sets", "Offset bits",
        "Index/set bits", "Tag bits", "Tag directory (bits)"].map(function (h) { return el("th", { text: h }); })))]);
      var body = el("tbody");
      function line(name, sets) {
        var idx = Math.log2(sets), tag = A - idx - off;
        var entries = blocks;
        body.appendChild(el("tr", {}, [el("td", { text: name }), el("td", { text: sets }),
          el("td", { text: off }), el("td", { text: idx }), el("td", { html: "<b>" + tag + "</b>" }),
          el("td", { text: (tag * entries).toLocaleString() })]));
      }
      line("Direct mapped", blocks);
      line(k + "-way set associative", blocks / k);
      line("Fully associative", 1);
      tb.appendChild(body); out.appendChild(tb);
      var h = num(hitI.value, 10), mm = num(missI.value, 100), hr = num(hrI.value, .9);
      out.appendChild(el("div", { class: "cal formula" }, [el("div", { class: "cal-h", text: "Effective access time" }),
        el("div", { html: md(
          "Simultaneous (parallel) lookup: $EAT = h\\cdot t_c + (1-h)\\cdot t_m = " + (hr * h + (1 - hr) * mm).toFixed(2) + "$ ns\n\n" +
          "Hierarchical (cache first, then memory): $EAT = h\\cdot t_c + (1-h)\\cdot(t_c+t_m) = " +
          (hr * h + (1 - hr) * (h + mm)).toFixed(2) + "$ ns\n\n" +
          "Exam papers are often sloppy about which model they want. If your answer is not an option, try the other one.") })]));
      out.appendChild(el("p", { class: "small muted", text:
        "Blocks in cache = " + blocks + ". Offset bits come from the block size only — never from the cache size." }));
    }
    run();
  } });

/* ---------- Unit 2: pipeline ---------- */
deflab("pipeline", { title: "Pipeline speedup and hazards", unit: 2, topics: ["2.8"],
  desc: "Compare a non-pipelined processor with a k-stage pipeline: cycle time, speedup, efficiency, throughput, and the cost of stalls.",
  build: function (host) {
    var stI = inp("60 50 90 80", 200), latI = inp("5", 55), nI = inp("1000", 80), stallI = inp("0", 60);
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Stage delays (ns)", stI]));
    row.appendChild(el("label", {}, ["Latch (ns)", latI]));
    row.appendChild(el("label", {}, ["Instructions", nI]));
    row.appendChild(el("label", {}, ["Stalls/instr", stallI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Compute", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function run() {
      var st = parseNums(stI.value), lat = num(latI.value, 0), n = num(nI.value, 1000), stall = num(stallI.value, 0);
      if (!st.length) return;
      var k = st.length, sum = st.reduce(function (a, b) { return a + b; }, 0);
      var tp = Math.max.apply(null, st) + lat;
      var nonPipe = n * sum;
      var pipe = (k + (n - 1) * (1 + stall)) * tp;
      var ideal = (k + n - 1) * tp;
      out.innerHTML = "";
      out.appendChild(el("table", { class: "tbl-sm" }, [el("tbody", {}, [
        tr("Pipeline cycle time", "max(stage) + latch = " + Math.max.apply(null, st) + " + " + lat + " = <b>" + tp + " ns</b>"),
        tr("Non-pipelined time", n + " × " + sum + " = " + nonPipe.toLocaleString() + " ns"),
        tr("Pipelined time (ideal)", "(" + k + " + " + (n - 1) + ") × " + tp + " = " + ideal.toLocaleString() + " ns"),
        tr("Pipelined time (with stalls)", pipe.toLocaleString() + " ns"),
        tr("Speedup", "<b>" + (nonPipe / pipe).toFixed(3) + "×</b> (ideal limit is k = " + k + ")"),
        tr("Efficiency", ((nonPipe / pipe) / k * 100).toFixed(1) + "%"),
        tr("Throughput", (n / pipe * 1000).toFixed(3) + " instructions/μs")
      ])]));
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("For large $n$ the $(k-1)$ fill term vanishes, so speedup tends to $\\frac{\\sum t_i}{\\max t_i + d}$. " +
          "If a question says “for a large number of instructions”, go straight to that ratio.") })]));
    }
    function tr(a, b) { return el("tr", {}, [el("td", { style: "width:250px", text: a }), el("td", { html: b })]); }
    run();
  } });

/* ---------- Unit 9: subnetting ---------- */
deflab("subnet", { title: "IPv4 subnet calculator", unit: 9, topics: ["9.7"],
  desc: "Give an address and a prefix and get the network, broadcast, host range, mask, class and the subnet/host split — plus the FLSM table when you ask for n subnets.",
  build: function (host) {
    var ipI = inp("192.168.10.77", 160), pfI = inp("26", 55), subI = inp("4", 55);
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Address", ipI]));
    row.appendChild(el("label", {}, ["Prefix /", pfI]));
    row.appendChild(el("label", {}, ["Split into", subI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Calculate", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    ipI.addEventListener("input", run); pfI.addEventListener("input", run);
    function n2i(s) { var p = s.split("."); return ((+p[0] << 24) >>> 0) + ((+p[1] || 0) << 16) + ((+p[2] || 0) << 8) + (+p[3] || 0); }
    function i2n(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join("."); }
    function i2b(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
      .map(function (x) { return x.toString(2).padStart(8, "0"); }).join("."); }
    function run() {
      var ip = n2i(ipI.value.trim()), p = Math.max(0, Math.min(32, num(pfI.value, 24)));
      var mask = p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
      var net = (ip & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
      var hosts = p >= 31 ? (p === 32 ? 1 : 2) : Math.pow(2, 32 - p) - 2;
      var first = (+ipI.value.split(".")[0]) || 0;
      var cls = first < 128 ? "A" : first < 192 ? "B" : first < 224 ? "C" : first < 240 ? "D (multicast)" : "E (reserved)";
      var defPfx = cls === "A" ? 8 : cls === "B" ? 16 : cls === "C" ? 24 : null;
      out.innerHTML = "";
      var tb = el("table", { class: "tbl-sm" }), body = el("tbody");
      function r(a, b) { body.appendChild(el("tr", {}, [el("td", { style: "width:200px", text: a }), el("td", {}, el("code", { text: b }))])); }
      r("Network address", i2n(net) + "/" + p);
      r("Subnet mask", i2n(mask));
      r("Wildcard mask", i2n(~mask >>> 0));
      r("Broadcast address", i2n(bc));
      r("Usable host range", p >= 31 ? "—" : i2n(net + 1) + "  →  " + i2n(bc - 1));
      r("Usable hosts", hosts.toLocaleString());
      r("Total addresses", Math.pow(2, 32 - p).toLocaleString());
      r("Class (classful)", cls + (defPfx ? "  (default /" + defPfx + ")" : ""));
      if (defPfx && p > defPfx) { r("Borrowed subnet bits", (p - defPfx) + "  → " + Math.pow(2, p - defPfx) + " subnets"); }
      r("Address in binary", i2b(ip));
      r("Mask in binary", i2b(mask));
      tb.appendChild(body); out.appendChild(tb);
      var k = Math.max(1, num(subI.value, 4));
      var need = Math.ceil(Math.log2(k)), np = p + need;
      if (np <= 32) {
        out.appendChild(el("h3", { text: "Split " + i2n(net) + "/" + p + " into " + k + " equal subnets" }));
        out.appendChild(el("p", { class: "small muted", text: "Borrow " + need + " bit" + (need === 1 ? "" : "s") +
          " → /" + np + ", giving " + Math.pow(2, need) + " subnets of " + (Math.pow(2, 32 - np) - 2) + " usable hosts each." }));
        var t2 = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, ["#", "Network", "First host", "Last host", "Broadcast"]
          .map(function (h) { return el("th", { text: h }); })))]);
        var b2 = el("tbody");
        for (var i = 0; i < Math.min(Math.pow(2, need), 32); i++) {
          var sn = (net + i * Math.pow(2, 32 - np)) >>> 0, sb = (sn + Math.pow(2, 32 - np) - 1) >>> 0;
          b2.appendChild(el("tr", {}, [el("td", { text: i + 1 }), el("td", {}, el("code", { text: i2n(sn) + "/" + np })),
            el("td", { class: "tiny", text: i2n(sn + 1) }), el("td", { class: "tiny", text: i2n(sb - 1) }),
            el("td", { class: "tiny", text: i2n(sb) })]));
        }
        t2.appendChild(b2); out.appendChild(t2);
      }
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("Block size = $256 - \\text{(interesting octet of the mask)}$. Subnets then start at multiples of the block size, " +
          "so for /26 the mask octet is 192, block size 64, and networks are .0, .64, .128, .192. No binary needed.") })]));
    }
    run();
  } });

/* ---------- Unit 9: error detection ---------- */
deflab("errdet", { title: "CRC, checksum and Hamming code", unit: 9, topics: ["9.3"],
  desc: "Generate and verify a CRC remainder, an Internet checksum, and a Hamming single-error-correcting codeword — with the long division shown.",
  build: function (host) {
    var dataI = inp("1101011011", 240), genI = inp("10011", 140);
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Data bits", dataI]));
    row.appendChild(el("label", {}, ["CRC generator", genI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Compute", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function xorDiv(bits, gen) {
      var b = bits.split(""), g = gen.split(""), steps = [];
      for (var i = 0; i + g.length <= b.length; i++) {
        if (b[i] !== "1") continue;
        steps.push("pos " + i + ": " + b.join("").slice(i, i + g.length) + " ⊕ " + gen);
        for (var j = 0; j < g.length; j++) b[i + j] = (b[i + j] === g[j]) ? "0" : "1";
      }
      return { rem: b.join("").slice(-(gen.length - 1)), steps: steps };
    }
    function run() {
      var d = (dataI.value || "").replace(/[^01]/g, ""), g = (genI.value || "").replace(/[^01]/g, "");
      out.innerHTML = "";
      if (!d || g.length < 2) { out.appendChild(el("p", { class: "small", text: "Enter binary data and a generator of at least 2 bits." })); return; }
      var r = xorDiv(d + "0".repeat(g.length - 1), g);
      out.appendChild(el("div", { class: "cal formula" }, [el("div", { class: "cal-h", text: "CRC" }),
        el("div", { html: md("Append " + (g.length - 1) + " zeros, divide by the generator modulo-2.\n\n" +
          "Remainder (CRC) = `" + r.rem + "`\n\nTransmitted frame = `" + d + r.rem + "`\n\n" +
          "At the receiver the whole frame divided by the generator gives remainder `" +
          xorDiv(d + r.rem, g).rem + "` — all zeros means no detected error.") })]));
      /* Hamming */
      var m = d.length, p = 0; while (Math.pow(2, p) < m + p + 1) p++;
      var codeLen = m + p, code = new Array(codeLen + 1).fill(0), di = 0;
      for (var i = 1; i <= codeLen; i++) if ((i & (i - 1)) !== 0) code[i] = +d[di++];
      for (var b = 0; b < p; b++) {
        var pos = Math.pow(2, b), par = 0;
        for (var i2 = 1; i2 <= codeLen; i2++) if ((i2 & pos) && i2 !== pos) par ^= code[i2];
        code[pos] = par;
      }
      var cw = code.slice(1).join("");
      out.appendChild(el("div", { class: "cal formula" }, [el("div", { class: "cal-h", text: "Hamming code (even parity)" }),
        el("div", { html: md("With $m = " + m + "$ data bits, $2^p \\ge m + p + 1$ gives $p = " + p + "$ parity bits, " +
          "codeword length " + codeLen + ".\n\nCodeword = `" + cw + "`   (parity bits sit at positions 1, 2, 4, 8 …)") })]));
      var chk = el("div", { class: "ctl" });
      var flipI = inp("3", 55);
      chk.appendChild(el("label", {}, ["Flip bit position", flipI]));
      chk.appendChild(el("button", { class: "btn sm", type: "button", text: "Corrupt and correct", onclick: function () {
        var f = num(flipI.value, 1), c2 = code.slice();
        if (f >= 1 && f <= codeLen) c2[f] = c2[f] ? 0 : 1;
        var syn = 0;
        for (var b2 = 0; b2 < p; b2++) {
          var pos2 = Math.pow(2, b2), par2 = 0;
          for (var i3 = 1; i3 <= codeLen; i3++) if (i3 & pos2) par2 ^= c2[i3];
          if (par2) syn += pos2;
        }
        res.innerHTML = "";
        res.appendChild(el("div", { class: "cal " + (syn ? "trap" : "note") }, [
          el("div", { class: "cal-h", text: syn ? "Error detected" : "No error" }),
          el("div", { html: md("Received: `" + c2.slice(1).join("") + "`\n\nSyndrome = **" + syn + "**" +
            (syn ? " → bit " + syn + " is wrong; flip it and the codeword is restored." :
              " → every parity check passes.")) })]));
      } }));
      var res = el("div");
      out.appendChild(chk); out.appendChild(res);
      var pre = outBox(); pre.textContent = r.steps.join("\n");
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "Modulo-2 division steps"), pre]));
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("A generator with **more than one term** catches all single-bit errors; a generator with the factor $(x+1)$ catches all **odd** numbers of bit errors. " +
          "Degree $r$ means an $r$-bit CRC and detection of every burst of length $\\le r$.") })]));
    }
    run();
  } });

/* ---------- Unit 4: functional dependencies ---------- */
deflab("fdtool", { title: "Functional dependencies, keys and normal forms", unit: 4, topics: ["4.5"],
  desc: "Enter a relation and its FDs to get attribute closures, all candidate keys, prime attributes, the highest normal form and which dependencies break it.",
  build: function (host) {
    var relI = inp("A B C D E", 220);
    var fdI = el("textarea", { class: "inp", rows: 5 }); fdI.value = "A -> B C\nC D -> E\nB -> D\nE -> A";
    var out = el("div");
    host.appendChild(el("div", { class: "ctl" }, [el("label", {}, ["Attributes", relI])]));
    host.appendChild(el("div", { class: "tiny muted", text: "Functional dependencies, one per line, e.g.  A B -> C" }));
    host.appendChild(fdI);
    host.appendChild(el("div", { class: "ctl", style: "margin-top:10px" }, [
      el("button", { class: "btn sm pri", type: "button", text: "Analyse", onclick: run })]));
    host.appendChild(out);
    function parseFDs(s) {
      return String(s).split(/\n+/).map(function (l) {
        var m = l.split(/->|→|=>/); if (m.length < 2) return null;
        return { l: toks(m[0]), r: toks(m[1]) };
      }).filter(Boolean);
    }
    function toks(s) { return String(s).trim().split(/[\s,]+/).filter(Boolean); }
    function closure(set, fds) {
      var c = set.slice(), changed = true;
      while (changed) { changed = false;
        fds.forEach(function (f) {
          if (f.l.every(function (a) { return c.indexOf(a) >= 0; }))
            f.r.forEach(function (a) { if (c.indexOf(a) < 0) { c.push(a); changed = true; } });
        });
      }
      return c.sort();
    }
    function run() {
      var attrs = toks(relI.value), fds = parseFDs(fdI.value);
      out.innerHTML = "";
      if (!attrs.length) return;
      /* candidate keys by subset search (attributes kept small on purpose) */
      var keys = [], n = attrs.length;
      if (n <= 12) {
        for (var mask = 1; mask < (1 << n); mask++) {
          var set = []; for (var i = 0; i < n; i++) if (mask & (1 << i)) set.push(attrs[i]);
          if (closure(set, fds).length !== n) continue;
          var minimal = keys.every(function (k) { return !k.every(function (a) { return set.indexOf(a) >= 0; }); });
          if (minimal) keys.push(set);
        }
        keys = keys.filter(function (k) {
          return !keys.some(function (o) { return o !== k && o.length < k.length && o.every(function (a) { return k.indexOf(a) >= 0; }); });
        });
      }
      var prime = {}; keys.forEach(function (k) { k.forEach(function (a) { prime[a] = 1; }); });
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Attribute set" }),
        el("th", { text: "Closure" }), el("th", { text: "Superkey?" })]))]);
      var body = el("tbody");
      attrs.forEach(function (a) {
        var c = closure([a], fds);
        body.appendChild(el("tr", {}, [el("td", {}, el("code", { text: a })), el("td", {}, el("code", { text: c.join(" ") })),
          el("td", { text: c.length === n ? "yes" : "no" })]));
      });
      fds.forEach(function (f) {
        var c = closure(f.l, fds);
        body.appendChild(el("tr", {}, [el("td", {}, el("code", { text: f.l.join(" ") })),
          el("td", {}, el("code", { text: c.join(" ") })), el("td", { text: c.length === n ? "yes" : "no" })]));
      });
      tb.appendChild(body); out.appendChild(tb);
      out.appendChild(el("div", { class: "cal formula" }, [el("div", { class: "cal-h", text: "Candidate keys" }),
        el("div", { html: md(keys.length ? keys.map(function (k) { return "`" + k.join("") + "`"; }).join(", ") +
          "\n\nPrime attributes: " + Object.keys(prime).sort().join(", ") +
          "\n\nNon-prime: " + attrs.filter(function (a) { return !prime[a]; }).join(", ") || "none"
          : "Could not enumerate (too many attributes).") })]));
      /* normal form */
      var viol2 = [], viol3 = [], violB = [];
      fds.forEach(function (f) {
        var lc = closure(f.l, fds), isSuper = lc.length === n;
        var lhsProper = keys.some(function (k) { return f.l.length < k.length && f.l.every(function (a) { return k.indexOf(a) >= 0; }); });
        f.r.forEach(function (r) {
          if (f.l.indexOf(r) >= 0) return;
          if (!isSuper) {
            violB.push(f.l.join("") + "→" + r);
            if (!prime[r]) { viol3.push(f.l.join("") + "→" + r);
              if (lhsProper) viol2.push(f.l.join("") + "→" + r); }
          }
        });
      });
      var nf = violB.length ? (viol3.length ? (viol2.length ? "1NF" : "2NF") : "3NF") : "BCNF";
      out.appendChild(el("div", { class: "cal " + (nf === "BCNF" ? "formula" : "trap") }, [
        el("div", { class: "cal-h", text: "Highest normal form: " + nf }),
        el("div", { html: md(
          (viol2.length ? "**Partial dependencies (break 2NF):** " + uniq(viol2).join(", ") + "\n\n" : "") +
          (viol3.length ? "**Transitive / non-prime dependencies (break 3NF):** " + uniq(viol3).join(", ") + "\n\n" : "") +
          (violB.length ? "**LHS is not a superkey (breaks BCNF):** " + uniq(violB).join(", ") : "Every determinant is a superkey, so the relation is in BCNF.")
        ) })]));
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("An attribute that never appears on the right of any FD **must** be in every candidate key. " +
          "Start your closure from exactly those attributes — it usually lands on the key in one step.") })]));
    }
    run();
  } });

/* ---------- Unit 4: SQL sandbox ---------- */
deflab("sql", { title: "SQL sandbox", unit: 4, topics: ["4.4", "4.3"],
  desc: "Run SELECT queries against a small in-memory employee/department schema — WHERE, GROUP BY, HAVING, ORDER BY, aggregates and joins.",
  build: function (host) {
    var DB = {
      emp: [
        { eid: 1, name: "Asha", dept: 10, sal: 62000, age: 31, mgr: 4 },
        { eid: 2, name: "Bhaskar", dept: 20, sal: 48000, age: 45, mgr: 4 },
        { eid: 3, name: "Chitra", dept: 10, sal: 75000, age: 38, mgr: null },
        { eid: 4, name: "Dev", dept: 30, sal: 91000, age: 52, mgr: null },
        { eid: 5, name: "Esha", dept: 20, sal: 48000, age: 27, mgr: 2 },
        { eid: 6, name: "Faiz", dept: 10, sal: 55000, age: 29, mgr: 3 },
        { eid: 7, name: "Gita", dept: 30, sal: 67000, age: 41, mgr: 4 }
      ],
      dept: [
        { dept: 10, dname: "Research", city: "Pune" },
        { dept: 20, dname: "Sales", city: "Delhi" },
        { dept: 30, dname: "Admin", city: "Pune" },
        { dept: 40, dname: "Legal", city: "Chennai" }
      ]
    };
    var qI = el("textarea", { class: "inp", rows: 4 });
    qI.value = "SELECT dept, COUNT(*) AS n, AVG(sal) AS avgsal\nFROM emp\nGROUP BY dept\nHAVING COUNT(*) > 1\nORDER BY avgsal DESC";
    var out = el("div");
    host.appendChild(el("div", { class: "tiny muted", text: "Tables: emp(eid, name, dept, sal, age, mgr) · dept(dept, dname, city)" }));
    host.appendChild(qI);
    var row = ctlRow();
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Run query", onclick: run }));
    ["SELECT * FROM emp", "SELECT name, sal FROM emp WHERE sal > 60000 ORDER BY sal DESC",
     "SELECT e.name, d.dname FROM emp e, dept d WHERE e.dept = d.dept",
     "SELECT dept, MAX(sal), MIN(sal) FROM emp GROUP BY dept",
     "SELECT COUNT(DISTINCT dept) FROM emp"].forEach(function (s) {
      row.appendChild(el("button", { class: "btn sm ghost", type: "button", text: s.slice(0, 26) + "…",
        title: s, onclick: function () { qI.value = s; run(); } }));
    });
    host.appendChild(row); host.appendChild(out);
    function run() {
      out.innerHTML = "";
      try { show(query(qI.value)); }
      catch (e) { out.appendChild(el("div", { class: "cal trap" }, [el("div", { class: "cal-h", text: "Query error" }),
        el("div", { text: e.message })])); }
    }
    function show(res) {
      if (!res.rows.length) { out.appendChild(el("p", { class: "small muted", text: "0 rows." })); return; }
      var t = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {},
        res.cols.map(function (c) { return el("th", { text: c }); })))]);
      var b = el("tbody");
      res.rows.forEach(function (r) {
        b.appendChild(el("tr", {}, res.cols.map(function (c) {
          var v = r[c]; return el("td", { text: v == null ? "NULL" : (typeof v === "number" ? (Math.round(v * 100) / 100) : v) });
        })));
      });
      t.appendChild(b); out.appendChild(t);
      out.appendChild(el("p", { class: "tiny muted", text: res.rows.length + " row" + (res.rows.length === 1 ? "" : "s") + " returned." }));
    }
    /* a deliberately small SQL subset: SELECT ... FROM a[,b] [WHERE] [GROUP BY] [HAVING] [ORDER BY] [LIMIT] */
    function query(sql) {
      var s = sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
      var m = /^SELECT\s+(.+?)\s+FROM\s+(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP BY\s+(.+?))?(?:\s+HAVING\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i.exec(s);
      if (!m) throw new Error("Only single SELECT statements are supported here.");
      var selRaw = m[1], fromRaw = m[2], whereRaw = m[3], groupRaw = m[4], havingRaw = m[5], orderRaw = m[6], limitRaw = m[7];
      var srcs = fromRaw.split(",").map(function (f) {
        var p = f.trim().split(/\s+/); var name = p[0].toLowerCase(), al = (p[1] || p[0]).toLowerCase();
        if (!DB[name]) throw new Error("No table called " + p[0]);
        return { name: name, al: al };
      });
      var rows = [{}];
      srcs.forEach(function (src) {
        var nr = [];
        rows.forEach(function (base) {
          DB[src.name].forEach(function (r) {
            var o = Object.assign({}, base);
            Object.keys(r).forEach(function (k) { o[k] = r[k]; o[src.al + "." + k] = r[k]; });
            nr.push(o);
          });
        });
        rows = nr;
      });
      function expr(e, r, grp) {
        e = e.trim();
        var ag = /^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?(.+?)\s*\)$/i.exec(e);
        if (ag) {
          var fn = ag[1].toUpperCase(), dist = !!ag[2], arg = ag[3];
          var vals = (grp || [r]).map(function (x) { return arg === "*" ? 1 : expr(arg, x); })
            .filter(function (v) { return arg === "*" || v != null; });
          if (dist) vals = uniq(vals);
          if (fn === "COUNT") return vals.length;
          if (!vals.length) return null;
          if (fn === "SUM") return vals.reduce(function (a, b) { return a + b; }, 0);
          if (fn === "AVG") return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
          if (fn === "MIN") return vals.reduce(function (a, b) { return a < b ? a : b; });
          if (fn === "MAX") return vals.reduce(function (a, b) { return a > b ? a : b; });
        }
        if (/^-?\d+(\.\d+)?$/.test(e)) return +e;
        if (/^'.*'$/.test(e)) return e.slice(1, -1);
        var key = e.toLowerCase();
        if (r && key in r) return r[key];
        return null;
      }
      function cond(c, r, grp) {
        if (!c) return true;
        return c.split(/\s+AND\s+/i).every(function (part) {
          return part.split(/\s+OR\s+/i).some(function (p) {
            var mm = /^(.+?)\s*(>=|<=|<>|!=|=|>|<|\bLIKE\b|\bIS NOT NULL\b|\bIS NULL\b)\s*(.*)$/i.exec(p.trim());
            if (!mm) return !!expr(p, r, grp);
            var a = expr(mm[1], r, grp), op = mm[2].toUpperCase(), b = mm[3] ? expr(mm[3], r, grp) : null;
            if (op === "IS NULL") return a == null;
            if (op === "IS NOT NULL") return a != null;
            if (op === "LIKE") return new RegExp("^" + String(b).replace(/%/g, ".*").replace(/_/g, ".") + "$", "i").test(String(a));
            if (op === "=") return a == b; if (op === "<>" || op === "!=") return a != b;
            if (op === ">") return a > b; if (op === "<") return a < b;
            if (op === ">=") return a >= b; return a <= b;
          });
        });
      }
      rows = rows.filter(function (r) { return cond(whereRaw, r); });
      var sels = splitTop(selRaw).map(function (x) {
        var am = /^(.+?)\s+AS\s+(\w+)$/i.exec(x.trim());
        return am ? { e: am[1].trim(), as: am[2] } : { e: x.trim(), as: x.trim() };
      });
      var groups = null;
      if (groupRaw) {
        var gk = splitTop(groupRaw).map(function (x) { return x.trim(); });
        var map = {};
        rows.forEach(function (r) {
          var k = gk.map(function (g) { return expr(g, r); }).join("\u0001");
          (map[k] = map[k] || []).push(r);
        });
        groups = Object.keys(map).map(function (k) { return map[k]; });
      } else if (sels.some(function (s2) { return /^(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(s2.e); })) {
        groups = rows.length ? [rows] : [[]];
      }
      var outRows;
      if (groups) {
        outRows = groups.filter(function (g) { return cond(havingRaw, g[0] || {}, g); })
          .map(function (g) {
            var o = {};
            sels.forEach(function (s2) {
              if (s2.e === "*") { Object.keys(g[0] || {}).forEach(function (k) { if (k.indexOf(".") < 0) o[k] = g[0][k]; }); }
              else o[s2.as] = expr(s2.e, g[0] || {}, g);
            });
            return o;
          });
      } else {
        outRows = rows.map(function (r) {
          var o = {};
          sels.forEach(function (s2) {
            if (s2.e === "*") { Object.keys(r).forEach(function (k) { if (k.indexOf(".") < 0) o[k] = r[k]; }); }
            else o[s2.as] = expr(s2.e, r);
          });
          return o;
        });
        if (/^SELECT\s+DISTINCT/i.test(s)) { /* handled loosely */ }
      }
      if (orderRaw) {
        var ob = splitTop(orderRaw).map(function (x) {
          var p = x.trim().split(/\s+/); return { k: p[0], d: (p[1] || "ASC").toUpperCase() === "DESC" ? -1 : 1 }; });
        outRows.sort(function (a, b) {
          for (var i = 0; i < ob.length; i++) {
            var ka = a[ob[i].k] != null ? a[ob[i].k] : expr(ob[i].k, a);
            var kb = b[ob[i].k] != null ? b[ob[i].k] : expr(ob[i].k, b);
            if (ka < kb) return -ob[i].d; if (ka > kb) return ob[i].d;
          }
          return 0;
        });
      }
      if (limitRaw) outRows = outRows.slice(0, +limitRaw);
      var cols = outRows.length ? Object.keys(outRows[0]) : [];
      return { cols: cols, rows: outRows };
    }
    function splitTop(s) {
      var out2 = [], d = 0, cur = "";
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (c === "(") d++; if (c === ")") d--;
        if (c === "," && d === 0) { out2.push(cur); cur = ""; } else cur += c;
      }
      if (cur.trim()) out2.push(cur);
      return out2;
    }
    run();
  } });

/* ---------- Unit 8: finite automaton simulator ---------- */
deflab("dfa", { title: "Finite automaton simulator", unit: 8, topics: ["8.2"],
  desc: "Define a DFA or NFA as a transition table and trace any input string symbol by symbol; NFAs are run by subset construction so you see the whole live state set.",
  build: function (host) {
    var defI = el("textarea", { class: "inp", rows: 6 });
    defI.value = "# state, symbol, next   (| separates NFA targets)\nq0,0,q0\nq0,1,q1\nq1,0,q2\nq1,1,q1\nq2,0,q2\nq2,1,q1\nstart: q0\naccept: q2";
    var strI = inp("1001010", 200);
    var out = el("div");
    host.appendChild(defI);
    var row = ctlRow();
    row.appendChild(el("label", {}, ["Input string", strI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Trace", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function parse(t) {
      var d = { tr: {}, start: null, acc: {}, states: {}, syms: {} };
      String(t).split(/\n+/).forEach(function (l) {
        l = l.replace(/#.*/, "").trim(); if (!l) return;
        var sm = /^start\s*:\s*(.+)$/i.exec(l); if (sm) { d.start = sm[1].trim(); return; }
        var am = /^accept\s*:\s*(.+)$/i.exec(l);
        if (am) { am[1].split(/[\s,]+/).filter(Boolean).forEach(function (x) { d.acc[x] = 1; }); return; }
        var p = l.split(",").map(function (x) { return x.trim(); });
        if (p.length < 3) return;
        d.states[p[0]] = 1; d.syms[p[1]] = 1;
        var tgts = p[2].split("|").map(function (x) { return x.trim(); }).filter(Boolean);
        tgts.forEach(function (x) { d.states[x] = 1; });
        (d.tr[p[0] + "," + p[1]] = d.tr[p[0] + "," + p[1]] || []).push.apply(d.tr[p[0] + "," + p[1]], tgts);
      });
      return d;
    }
    function run() {
      var d = parse(defI.value), s = strI.value.trim();
      out.innerHTML = "";
      if (!d.start) { out.appendChild(el("p", { class: "small", text: "Add a line like  start: q0" })); return; }
      var isNFA = Object.keys(d.tr).some(function (k) { return d.tr[k].length > 1; });
      var cur = [d.start], trace = [{ i: -1, set: cur.slice(), sym: "" }];
      for (var i = 0; i < s.length; i++) {
        var nx = [];
        cur.forEach(function (q) { (d.tr[q + "," + s[i]] || []).forEach(function (t) { if (nx.indexOf(t) < 0) nx.push(t); }); });
        cur = nx; trace.push({ i: i, set: cur.slice(), sym: s[i] });
        if (!cur.length) break;
      }
      var accepted = cur.some(function (q) { return d.acc[q]; });
      var tape = el("div", { class: "dfa-tape" });
      s.split("").forEach(function (ch, i2) { tape.appendChild(el("span", { text: ch })); });
      out.appendChild(tape);
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Step" }),
        el("th", { text: "Read" }), el("th", { text: isNFA ? "Live states" : "State" }), el("th", { text: "" })]))]);
      var body = el("tbody");
      trace.forEach(function (t, k) {
        body.appendChild(el("tr", {}, [el("td", { text: k }), el("td", {}, el("code", { text: t.sym || "—" })),
          el("td", {}, el("code", { text: t.set.length ? "{" + t.set.join(", ") + "}" : "∅ (dead)" })),
          el("td", { class: "tiny", text: t.set.some(function (q) { return d.acc[q]; }) ? "final" : "" })]));
      });
      tb.appendChild(body); out.appendChild(tb);
      out.appendChild(el("div", { class: "cal " + (accepted ? "formula" : "trap") }, [
        el("div", { class: "cal-h", text: accepted ? "String ACCEPTED" : "String REJECTED" }),
        el("div", { html: md("Machine type: **" + (isNFA ? "NFA" : "DFA") + "**. Ended in " +
          (cur.length ? "{" + cur.join(", ") + "}" : "the empty set") + "; accepting states are {" +
          Object.keys(d.acc).join(", ") + "}." +
          (isNFA ? "\n\nAn NFA accepts when **any** live branch is final — one accepting path is enough." : "")) })]));
      /* transition table */
      var syms = Object.keys(d.syms).sort(), sts = Object.keys(d.states).sort();
      var t2 = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {},
        [el("th", { text: "δ" })].concat(syms.map(function (x) { return el("th", { text: x }); }))))]);
      var b2 = el("tbody");
      sts.forEach(function (q) {
        b2.appendChild(el("tr", {}, [el("td", { html: (q === d.start ? "→ " : "") + (d.acc[q] ? "*" : "") + q })]
          .concat(syms.map(function (a) { var t = d.tr[q + "," + a]; return el("td", { text: t ? t.join(", ") : "—" }); }))));
      });
      t2.appendChild(b2);
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "Transition table"), t2]));
    }
    run();
  } });

/* ---------- Unit 8: FIRST and FOLLOW ---------- */
deflab("firstfollow", { title: "FIRST, FOLLOW and the LL(1) table", unit: 8, topics: ["8.6"],
  desc: "Enter a grammar and get FIRST and FOLLOW for every non-terminal, the LL(1) parsing table, and every conflict that makes the grammar not LL(1).",
  build: function (host) {
    var gI = el("textarea", { class: "inp", rows: 7 });
    gI.value = "E -> T E'\nE' -> + T E' | e\nT -> F T'\nT' -> * F T' | e\nF -> ( E ) | id";
    var out = el("div");
    host.appendChild(el("div", { class: "tiny muted", text: "One production per line, alternatives with |. Use  e  for epsilon. First line's LHS is the start symbol." }));
    host.appendChild(gI);
    host.appendChild(el("div", { class: "ctl", style: "margin-top:10px" },
      [el("button", { class: "btn sm pri", type: "button", text: "Compute", onclick: run })]));
    host.appendChild(out);
    function run() {
      var prods = [], nts = {}, start = null;
      String(gI.value).split(/\n+/).forEach(function (l) {
        l = l.trim(); if (!l) return;
        var p = l.split(/->|→/); if (p.length < 2) return;
        var lhs = p[0].trim(); if (!start) start = lhs; nts[lhs] = 1;
        p[1].split("|").forEach(function (alt) {
          prods.push({ l: lhs, r: alt.trim().split(/\s+/).filter(Boolean) });
        });
      });
      out.innerHTML = "";
      if (!prods.length) return;
      var EPS = "e";
      function isNT(x) { return !!nts[x]; }
      var FIRST = {}, FOLLOW = {};
      Object.keys(nts).forEach(function (n) { FIRST[n] = {}; FOLLOW[n] = {}; });
      var changed = true, guard = 0;
      while (changed && guard++ < 200) {
        changed = false;
        prods.forEach(function (p) {
          var f = FIRST[p.l], allEps = true;
          for (var i = 0; i < p.r.length; i++) {
            var x = p.r[i];
            if (x === EPS) { if (!f[EPS]) { f[EPS] = 1; changed = true; } allEps = false; break; }
            if (!isNT(x)) { if (!f[x]) { f[x] = 1; changed = true; } allEps = false; break; }
            Object.keys(FIRST[x]).forEach(function (s) { if (s !== EPS && !f[s]) { f[s] = 1; changed = true; } });
            if (!FIRST[x][EPS]) { allEps = false; break; }
          }
          if (allEps && p.r.length && !f[EPS]) { f[EPS] = 1; changed = true; }
          if (!p.r.length && !f[EPS]) { f[EPS] = 1; changed = true; }
        });
      }
      function firstOf(seq) {
        var s = {}, allEps = true;
        for (var i = 0; i < seq.length; i++) {
          var x = seq[i];
          if (x === EPS) { s[EPS] = 1; return s; }
          if (!isNT(x)) { s[x] = 1; return s; }
          Object.keys(FIRST[x]).forEach(function (t) { if (t !== EPS) s[t] = 1; });
          if (!FIRST[x][EPS]) { allEps = false; break; }
        }
        if (allEps) s[EPS] = 1;
        return s;
      }
      FOLLOW[start]["$"] = 1;
      changed = true; guard = 0;
      while (changed && guard++ < 200) {
        changed = false;
        prods.forEach(function (p) {
          for (var i = 0; i < p.r.length; i++) {
            var B = p.r[i]; if (!isNT(B)) continue;
            var rest = p.r.slice(i + 1);
            var f = rest.length ? firstOf(rest) : { e: 1 };
            Object.keys(f).forEach(function (t) { if (t !== EPS && !FOLLOW[B][t]) { FOLLOW[B][t] = 1; changed = true; } });
            if (f[EPS] || !rest.length)
              Object.keys(FOLLOW[p.l]).forEach(function (t) { if (!FOLLOW[B][t]) { FOLLOW[B][t] = 1; changed = true; } });
          }
        });
      }
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Non-terminal" }),
        el("th", { text: "FIRST" }), el("th", { text: "FOLLOW" })]))]);
      var body = el("tbody");
      Object.keys(nts).forEach(function (n) {
        body.appendChild(el("tr", {}, [el("td", {}, el("code", { text: n })),
          el("td", {}, el("code", { text: "{ " + Object.keys(FIRST[n]).sort().join(", ") + " }" })),
          el("td", {}, el("code", { text: "{ " + Object.keys(FOLLOW[n]).sort().join(", ") + " }" }))]));
      });
      tb.appendChild(body); out.appendChild(tb);
      /* LL(1) table */
      var terms = {};
      prods.forEach(function (p) { p.r.forEach(function (x) { if (!isNT(x) && x !== EPS) terms[x] = 1; }); });
      terms["$"] = 1;
      var tcols = Object.keys(terms).sort(), table = {}, conflicts = [];
      prods.forEach(function (p) {
        var f = firstOf(p.r.length ? p.r : [EPS]);
        Object.keys(f).forEach(function (a) {
          if (a === EPS) return;
          var key = p.l + "," + a;
          if (table[key]) conflicts.push(key);
          table[key] = (table[key] ? table[key] + "  /  " : "") + p.l + " → " + p.r.join(" ");
        });
        if (f[EPS]) Object.keys(FOLLOW[p.l]).forEach(function (a) {
          var key = p.l + "," + a;
          if (table[key]) conflicts.push(key);
          table[key] = (table[key] ? table[key] + "  /  " : "") + p.l + " → " + p.r.join(" ");
        });
      });
      var t2 = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {},
        [el("th", { text: "" })].concat(tcols.map(function (t) { return el("th", { text: t }); }))))]);
      var b2 = el("tbody");
      Object.keys(nts).forEach(function (n) {
        b2.appendChild(el("tr", {}, [el("td", {}, el("code", { text: n }))].concat(tcols.map(function (t) {
          var v = table[n + "," + t];
          return el("td", { class: "tiny", style: conflicts.indexOf(n + "," + t) >= 0 ? "background:var(--bad-soft)" : "",
            text: v || "" });
        }))));
      });
      t2.appendChild(b2);
      out.appendChild(el("h3", { text: "LL(1) parsing table" }));
      out.appendChild(el("div", { class: "viz" }, t2));
      out.appendChild(el("div", { class: "cal " + (conflicts.length ? "trap" : "formula") }, [
        el("div", { class: "cal-h", text: conflicts.length ? "Not LL(1)" : "Grammar is LL(1)" }),
        el("div", { html: md(conflicts.length
          ? "Multiple entries in " + uniq(conflicts).length + " cell(s): " + uniq(conflicts).join(", ") +
            ". A grammar with left recursion or un-factored common prefixes always lands here."
          : "Every cell holds at most one production, so a predictive parser can choose without backtracking.") })]));
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("FOLLOW is only consulted when the non-terminal can derive ε. If no production is nullable, the LL(1) table is just FIRST — " +
          "and a left-recursive grammar is **never** LL(1), so you can reject it without building anything.") })]));
    }
    run();
  } });

/* ---------- Unit 7: sorting visualiser ---------- */
deflab("sortviz", { title: "Sorting algorithms — steps and complexity", unit: 7, topics: ["7.4"],
  desc: "Watch bubble, insertion, selection, merge, quick and heap sort run on your own array, with the real comparison and swap counts.",
  build: function (host) {
    var arrI = inp("38 27 43 3 9 82 10", 240);
    var algS = sel([["bubble", "Bubble"], ["insertion", "Insertion"], ["selection", "Selection"],
      ["merge", "Merge"], ["quick", "Quick (Lomuto)"], ["heap", "Heap"]], "quick");
    var out = el("div"), bars = el("div", { class: "bars", style: "margin-bottom:12px" });
    var row = ctlRow();
    row.appendChild(el("label", {}, ["Array", arrI]));
    row.appendChild(el("label", {}, ["Algorithm", algS]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Run", onclick: run }));
    row.appendChild(el("button", { class: "btn sm", type: "button", text: "Random", onclick: function () {
      var n = 12, a = []; for (var i = 0; i < n; i++) a.push(1 + Math.floor(Math.random() * 99));
      arrI.value = a.join(" "); run(); } }));
    row.appendChild(el("button", { class: "btn sm", type: "button", text: "Compare all", onclick: compare }));
    host.appendChild(row); host.appendChild(bars); host.appendChild(out);
    function sorters(a, S2) {
      a = a.slice();
      var cmp = 0, swp = 0, frames = [];
      function snap(hi) { if (frames.length < 400) frames.push({ a: a.slice(), hi: hi || [] }); }
      function sw(i, j) { var t = a[i]; a[i] = a[j]; a[j] = t; swp++; snap([i, j]); }
      snap([]);
      if (S2 === "bubble") {
        for (var i = 0; i < a.length - 1; i++) { var done = true;
          for (var j = 0; j < a.length - 1 - i; j++) { cmp++; if (a[j] > a[j + 1]) { sw(j, j + 1); done = false; } }
          if (done) break; }
      } else if (S2 === "insertion") {
        for (var i2 = 1; i2 < a.length; i2++) { var k = a[i2], j2 = i2 - 1;
          while (j2 >= 0) { cmp++; if (a[j2] <= k) break; a[j2 + 1] = a[j2]; swp++; j2--; snap([j2 + 1]); }
          a[j2 + 1] = k; snap([j2 + 1]); }
      } else if (S2 === "selection") {
        for (var i3 = 0; i3 < a.length - 1; i3++) { var mi = i3;
          for (var j3 = i3 + 1; j3 < a.length; j3++) { cmp++; if (a[j3] < a[mi]) mi = j3; }
          if (mi !== i3) sw(i3, mi); }
      } else if (S2 === "merge") {
        (function ms(lo, hi) {
          if (hi - lo < 2) return;
          var mid = (lo + hi) >> 1; ms(lo, mid); ms(mid, hi);
          var L = a.slice(lo, mid), R = a.slice(mid, hi), i4 = 0, j4 = 0, k4 = lo;
          while (i4 < L.length && j4 < R.length) { cmp++; a[k4++] = (L[i4] <= R[j4]) ? L[i4++] : R[j4++]; swp++; }
          while (i4 < L.length) { a[k4++] = L[i4++]; swp++; }
          while (j4 < R.length) { a[k4++] = R[j4++]; swp++; }
          snap([lo, hi - 1]);
        })(0, a.length);
      } else if (S2 === "quick") {
        (function qs(lo, hi) {
          if (lo >= hi) return;
          var p = a[hi], i5 = lo - 1;
          for (var j5 = lo; j5 < hi; j5++) { cmp++; if (a[j5] <= p) { i5++; if (i5 !== j5) sw(i5, j5); } }
          if (i5 + 1 !== hi) sw(i5 + 1, hi);
          qs(lo, i5); qs(i5 + 2, hi);
        })(0, a.length - 1);
      } else {
        var n2 = a.length;
        function heapify(n3, i6) {
          var lg = i6, l = 2 * i6 + 1, r2 = 2 * i6 + 2;
          if (l < n3) { cmp++; if (a[l] > a[lg]) lg = l; }
          if (r2 < n3) { cmp++; if (a[r2] > a[lg]) lg = r2; }
          if (lg !== i6) { sw(i6, lg); heapify(n3, lg); }
        }
        for (var i7 = (n2 >> 1) - 1; i7 >= 0; i7--) heapify(n2, i7);
        for (var i8 = n2 - 1; i8 > 0; i8--) { sw(0, i8); heapify(i8, 0); }
      }
      snap([]);
      return { a: a, cmp: cmp, swp: swp, frames: frames };
    }
    var timer = null;
    function run() {
      if (timer) clearInterval(timer);
      var a = parseNums(arrI.value); if (!a.length) return;
      var r = sorters(a, algS.value);
      out.innerHTML = "";
      var mx = Math.max.apply(null, r.a.concat(a));
      var k = 0;
      function paint(f) {
        bars.innerHTML = "";
        f.a.forEach(function (v, i) {
          bars.appendChild(el("i", { class: f.hi.indexOf(i) >= 0 ? "a" : "", title: v,
            style: "height:" + Math.max(4, v / mx * 100) + "%" }));
        });
      }
      timer = setInterval(function () {
        if (k >= r.frames.length) { clearInterval(timer); timer = null; paint({ a: r.a, hi: [] }); return; }
        paint(r.frames[k++]);
      }, Math.max(18, 700 / r.frames.length));
      onLeave(function () { if (timer) clearInterval(timer); });
      out.appendChild(el("div", { class: "row" }, [
        el("span", { class: "tag", text: r.cmp + " comparisons" }),
        el("span", { class: "tag", text: r.swp + " moves/swaps" }),
        el("span", { class: "tag", text: "sorted: " + r.a.join(" ") })
      ]));
    }
    function compare() {
      if (timer) clearInterval(timer);
      var a = parseNums(arrI.value); if (!a.length) return;
      out.innerHTML = "";
      var meta = { bubble: ["O(n²)", "O(n)", "O(1)", "yes"], insertion: ["O(n²)", "O(n)", "O(1)", "yes"],
        selection: ["O(n²)", "O(n²)", "O(1)", "no"], merge: ["O(n log n)", "O(n log n)", "O(n)", "yes"],
        quick: ["O(n²)", "O(n log n)", "O(log n)", "no"], heap: ["O(n log n)", "O(n log n)", "O(1)", "no"] };
      var t = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, ["Algorithm", "Comparisons here",
        "Moves here", "Worst", "Best", "Space", "Stable"].map(function (h) { return el("th", { text: h }); })))]);
      var b = el("tbody");
      Object.keys(meta).forEach(function (k) {
        var r = sorters(a, k);
        b.appendChild(el("tr", {}, [el("td", { text: k }), el("td", { text: r.cmp }), el("td", { text: r.swp })]
          .concat(meta[k].map(function (m) { return el("td", { class: "tiny", text: m }); }))));
      });
      t.appendChild(b); out.appendChild(t);
      out.appendChild(el("p", { class: "small muted", text:
        "Counts are for this exact input — try an already-sorted array and watch insertion sort collapse to O(n) while quick sort blows up." }));
    }
    run();
  } });

/* ---------- Unit 7: graph algorithms ---------- */
deflab("graphalgo", { title: "Graph algorithms", unit: 7, topics: ["7.10", "1.5"],
  desc: "BFS, DFS, Dijkstra, Prim and Kruskal on a weighted graph you type in, with the order of visits and the final cost.",
  build: function (host) {
    var gI = el("textarea", { class: "inp", rows: 6 });
    gI.value = "A B 4\nA C 2\nB C 5\nB D 10\nC E 3\nE D 4\nD F 11";
    var srcI = inp("A", 60);
    var algS = sel([["bfs", "BFS"], ["dfs", "DFS"], ["dij", "Dijkstra"], ["prim", "Prim MST"], ["kruskal", "Kruskal MST"]], "dij");
    var out = el("div");
    host.appendChild(el("div", { class: "tiny muted", text: "Edges, one per line:  u v weight   (undirected)" }));
    host.appendChild(gI);
    var row = ctlRow();
    row.appendChild(el("label", {}, ["Source", srcI]));
    row.appendChild(el("label", {}, ["Algorithm", algS]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Run", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    algS.addEventListener("change", run);
    function run() {
      var E = [], adj = {};
      String(gI.value).split(/\n+/).forEach(function (l) {
        var p = l.trim().split(/[\s,]+/).filter(Boolean); if (p.length < 2) return;
        var w = p.length > 2 ? +p[2] : 1;
        E.push({ u: p[0], v: p[1], w: w });
        (adj[p[0]] = adj[p[0]] || []).push({ n: p[1], w: w });
        (adj[p[1]] = adj[p[1]] || []).push({ n: p[0], w: w });
      });
      var V = Object.keys(adj).sort();
      out.innerHTML = "";
      if (!V.length) return;
      var s = srcI.value.trim() || V[0]; if (!adj[s]) s = V[0];
      var alg = algS.value, log = [], pre;
      if (alg === "bfs" || alg === "dfs") {
        var seen = {}, order = [], q = [s]; seen[s] = 1;
        if (alg === "bfs") {
          while (q.length) { var u = q.shift(); order.push(u);
            adj[u].map(function (x) { return x.n; }).sort().forEach(function (v) {
              if (!seen[v]) { seen[v] = 1; q.push(v); log.push("visit " + u + " → enqueue " + v); } }); }
        } else {
          (function dfs(u) { seen[u] = 1; order.push(u);
            adj[u].map(function (x) { return x.n; }).sort().forEach(function (v) {
              if (!seen[v]) { log.push(u + " → " + v); dfs(v); } }); })(s);
        }
        out.appendChild(el("div", { class: "cal formula" }, [
          el("div", { class: "cal-h", text: alg.toUpperCase() + " from " + s }),
          el("div", { html: md("Visit order: **" + order.join(" → ") + "**\n\n" +
            (order.length < V.length ? "Only " + order.length + " of " + V.length + " vertices reached — the graph is disconnected." :
              "All " + V.length + " vertices reached.")) })]));
      } else if (alg === "dij") {
        var dist = {}, prev = {}, done = {};
        V.forEach(function (v) { dist[v] = Infinity; }); dist[s] = 0;
        for (var it = 0; it < V.length; it++) {
          var u2 = null;
          V.forEach(function (v) { if (!done[v] && (u2 === null || dist[v] < dist[u2])) u2 = v; });
          if (u2 === null || dist[u2] === Infinity) break;
          done[u2] = 1; log.push("pick " + u2 + " (d=" + dist[u2] + ")");
          adj[u2].forEach(function (e) {
            if (dist[u2] + e.w < dist[e.n]) { dist[e.n] = dist[u2] + e.w; prev[e.n] = u2;
              log.push("   relax " + e.n + " → " + dist[e.n]); }
          });
        }
        var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, [el("th", { text: "Vertex" }),
          el("th", { text: "Shortest distance" }), el("th", { text: "Path" })]))]);
        var b = el("tbody");
        V.forEach(function (v) {
          var p = [], c = v; while (c) { p.unshift(c); c = prev[c]; }
          b.appendChild(el("tr", {}, [el("td", { text: v }),
            el("td", { html: "<b>" + (dist[v] === Infinity ? "∞" : dist[v]) + "</b>" }),
            el("td", { class: "tiny", text: dist[v] === Infinity ? "unreachable" : p.join(" → ") })]));
        });
        tb.appendChild(b); out.appendChild(tb);
        out.appendChild(el("div", { class: "cal trap" }, [el("div", { class: "cal-h", text: "Careful" }),
          el("div", { html: md("Dijkstra is only valid with **non-negative** weights. A single negative edge can make it settle a vertex too early — that is exactly what exam questions probe. Use Bellman–Ford there.") })]));
      } else {
        var mst = [], total = 0;
        if (alg === "kruskal") {
          var par = {}; V.forEach(function (v) { par[v] = v; });
          function find(x) { return par[x] === x ? x : (par[x] = find(par[x])); }
          E.slice().sort(function (a, b) { return a.w - b.w; }).forEach(function (e) {
            var a = find(e.u), b = find(e.v);
            if (a === b) { log.push("skip " + e.u + "-" + e.v + " (" + e.w + ") — would make a cycle"); return; }
            par[a] = b; mst.push(e); total += e.w; log.push("take " + e.u + "-" + e.v + " (" + e.w + ")");
          });
        } else {
          var inT = {}; inT[s] = 1;
          while (Object.keys(inT).length < V.length) {
            var best = null;
            E.forEach(function (e) {
              var a = inT[e.u], b = inT[e.v];
              if (a === b) return;
              if (!best || e.w < best.w) best = e;
            });
            if (!best) break;
            mst.push(best); total += best.w; inT[best.u] = 1; inT[best.v] = 1;
            log.push("add " + best.u + "-" + best.v + " (" + best.w + ")");
          }
        }
        out.appendChild(el("div", { class: "cal formula" }, [
          el("div", { class: "cal-h", text: (alg === "prim" ? "Prim" : "Kruskal") + " minimum spanning tree" }),
          el("div", { html: md("Edges: " + mst.map(function (e) { return "`" + e.u + "–" + e.v + "(" + e.w + ")`"; }).join(", ") +
            "\n\n**Total weight = " + total + "**, using " + mst.length + " edges for " + V.length + " vertices" +
            (mst.length === V.length - 1 ? " — exactly n−1, as an MST must." : " — fewer than n−1, so the graph is disconnected.")) })]));
      }
      pre = outBox(); pre.textContent = log.join("\n");
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "Step trace"), pre]));
    }
    run();
  } });

/* ---------- Unit 7: Huffman ---------- */
deflab("huffman", { title: "Huffman coding", unit: 7, topics: ["7.7"],
  desc: "Build the Huffman tree for any symbol/frequency list and get the codes, the average code length and the total encoded bits.",
  build: function (host) {
    var fI = inp("a:45 b:13 c:12 d:16 e:9 f:5", 340);
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["symbol:frequency", fI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Build", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function run() {
      var items = String(fI.value).split(/[\s,]+/).filter(Boolean).map(function (x) {
        var p = x.split(":"); return { s: p[0], f: +p[1] || 1 }; });
      out.innerHTML = "";
      if (items.length < 2) { out.appendChild(el("p", { class: "small", text: "Give at least two symbols." })); return; }
      var nodes = items.map(function (i) { return { f: i.f, s: i.s, leaf: true }; });
      var log = [];
      while (nodes.length > 1) {
        nodes.sort(function (a, b) { return a.f - b.f || (a.s || "").localeCompare(b.s || ""); });
        var a = nodes.shift(), b = nodes.shift();
        log.push("merge " + (a.s || "•") + "(" + a.f + ") + " + (b.s || "•") + "(" + b.f + ") = " + (a.f + b.f));
        nodes.push({ f: a.f + b.f, l: a, r: b });
      }
      var codes = {};
      (function walk(n, p) {
        if (!n) return;
        if (n.leaf) { codes[n.s] = p || "0"; return; }
        walk(n.l, p + "0"); walk(n.r, p + "1");
      })(nodes[0], "");
      var tot = items.reduce(function (a2, b2) { return a2 + b2.f; }, 0);
      var bits = items.reduce(function (a2, i) { return a2 + i.f * codes[i.s].length; }, 0);
      var tb = el("table", { class: "tbl-sm" }, [el("thead", {}, el("tr", {}, ["Symbol", "Frequency",
        "Probability", "Code", "Length"].map(function (h) { return el("th", { text: h }); })))]);
      var b3 = el("tbody");
      items.sort(function (a2, b2) { return b2.f - a2.f; }).forEach(function (i) {
        b3.appendChild(el("tr", {}, [el("td", {}, el("code", { text: i.s })), el("td", { text: i.f }),
          el("td", { text: (i.f / tot).toFixed(3) }), el("td", {}, el("code", { text: codes[i.s] })),
          el("td", { text: codes[i.s].length })]));
      });
      tb.appendChild(b3); out.appendChild(tb);
      out.appendChild(el("div", { class: "cal formula" }, [el("div", { class: "cal-h", text: "Results" }),
        el("div", { html: md("Total encoded size = **" + bits + " bits** (fixed-length would need " +
          (Math.ceil(Math.log2(items.length)) * tot) + " bits).\n\n" +
          "Average code length = " + (bits / tot).toFixed(4) + " bits/symbol.\n\n" +
          "Entropy = " + items.reduce(function (a2, i) { var p = i.f / tot; return a2 - p * Math.log2(p); }, 0).toFixed(4) +
          " bits/symbol — Huffman always sits between the entropy and entropy + 1.") })]));
      var pre = outBox(); pre.textContent = log.join("\n");
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "Merge order"), pre]));
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("You rarely need the tree. Total bits = **sum of all the internal node values** you create while merging. " +
          "Add up the merge results and you have the answer.") })]));
    }
    run();
  } });

/* ---------- Unit 10: alpha-beta ---------- */
deflab("alphabeta", { title: "Minimax with alpha–beta pruning", unit: 10, topics: ["10.2"],
  desc: "Enter the leaf values of a game tree and see the minimax value, which branches alpha–beta prunes, and how much work it saved.",
  build: function (host) {
    var lI = inp("3 5 6 9 1 2 0 -1", 300), bI = inp("2", 55);
    var out = el("div"), row = ctlRow();
    row.appendChild(el("label", {}, ["Leaf values (left to right)", lI]));
    row.appendChild(el("label", {}, ["Branching factor", bI]));
    row.appendChild(el("button", { class: "btn sm pri", type: "button", text: "Evaluate", onclick: run }));
    host.appendChild(row); host.appendChild(out);
    function run() {
      var leaves = parseNums(lI.value), b = Math.max(2, num(bI.value, 2));
      out.innerHTML = "";
      if (leaves.length < 2) return;
      var depth = Math.round(Math.log(leaves.length) / Math.log(b));
      if (Math.pow(b, depth) !== leaves.length) {
        out.appendChild(el("p", { class: "small", text: "Give exactly b^d leaves (e.g. 8 leaves with b = 2, or 9 with b = 3)." }));
        return;
      }
      var log = [], visited = 0, pruned = 0;
      function ab(idx, d, alpha, beta, maxing) {
        if (d === depth) { visited++; log.push(indent(d) + "leaf " + leaves[idx] + (maxing ? "" : "")); return leaves[idx]; }
        var best = maxing ? -Infinity : Infinity;
        for (var i = 0; i < b; i++) {
          var child = idx * b + i;
          var v = ab(child, d + 1, alpha, beta, !maxing);
          if (maxing) { best = Math.max(best, v); alpha = Math.max(alpha, best); }
          else { best = Math.min(best, v); beta = Math.min(beta, best); }
          if (beta <= alpha) {
            var skipped = (b - i - 1) * Math.pow(b, depth - d - 1);
            pruned += skipped;
            if (skipped) log.push(indent(d) + "✂ prune " + skipped + " leaf/leaves (α=" + alpha + " ≥ β=" + beta + ")");
            break;
          }
        }
        log.push(indent(d) + (maxing ? "MAX" : "MIN") + " node → " + best);
        return best;
      }
      function indent(d) { return "  ".repeat(d); }
      var val = ab(0, 0, -Infinity, Infinity, true);
      out.appendChild(el("div", { class: "cal formula" }, [el("div", { class: "cal-h", text: "Minimax value" }),
        el("div", { html: md("Root value = **" + val + "**  (depth " + depth + ", branching " + b + ")\n\n" +
          "Leaves examined: " + visited + " of " + leaves.length + ". Pruned: " + pruned + ".") })]));
      out.appendChild(el("div", { class: "cal trick" }, [el("div", { class: "cal-h", text: "Shortcut" }),
        el("div", { html: md("Alpha–beta never changes the answer — only the work. With perfect move ordering it examines about " +
          "$b^{d/2}$ leaves instead of $b^d$, which is why “what is the minimax value” and “how many nodes are pruned” are two separate questions. " +
          "Compute the value by plain minimax first, then worry about pruning.") })]));
      var pre = outBox(); pre.textContent = log.join("\n");
      out.appendChild(el("details", {}, [el("summary", { class: "small", style: "cursor:pointer" }, "Search trace"), pre]));
    }
    run();
  } });

/* ============================ boot ============================ */
function boot() {
  initTheme();
  initSearch();
  loadCurriculum().then(function () {
    buildTree();
    window.addEventListener("hashchange", render);
    render();
  }).catch(function (e) {
    $("#main").innerHTML = "<div class='wrap'><h1>Could not load the course data</h1>" +
      "<p class='muted'>" + esc(e.message) + "</p>" +
      "<p class='small muted'>If you opened this file directly from disk, browsers block the data files. " +
      "Serve the folder over HTTP instead — for example <code>python3 -m http.server</code> inside it — and reload.</p></div>";
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

})();
