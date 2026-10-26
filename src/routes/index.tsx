import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import mark from "@/assets/pagewright-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pagewright — rewrite any website to your liking" },
      {
        name: "description",
        content:
          "A Chrome extension that reshapes any website on request: dark mode, move things, hide clutter, sort feeds. Point, whisper, keep.",
      },
      { property: "og:title", content: "Pagewright — rewrite any website to your liking" },
      {
        property: "og:description",
        content: "Point at a page, say what you want, watch it rearrange itself. Then share your spell.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ZIP = "/pagewright-extension.zip";

function download() {
  fetch(ZIP)
    .then((res) => {
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pagewright-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch((err) => alert(err.message));
}

/* ---------------- Sparkle trail ---------------- */

type Spark = { id: number; x: number; y: number; dx: number; dy: number; c: string };

function SparkleTrail() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const last = useRef(0);
  const id = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last.current < 40) return;
      last.current = now;
      const s: Spark = {
        id: id.current++,
        x: e.clientX,
        y: e.clientY,
        dx: (Math.random() - 0.5) * 40,
        dy: 10 + Math.random() * 30,
        c: Math.random() > 0.5 ? "var(--gold)" : "var(--signal)",
      };
      setSparks((p) => [...p.slice(-18), s]);
      setTimeout(() => setSparks((p) => p.filter((x) => x.id !== s.id)), 900);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {sparks.map((s) => (
        <span
          key={s.id}
          className="animate-spark absolute text-xs"
          style={
            {
              left: s.x,
              top: s.y,
              color: s.c,
              "--dx": `${s.dx}px`,
              "--dy": `${s.dy}px`,
            } as React.CSSProperties
          }
        >
          ✦
        </span>
      ))}
    </div>
  );
}

/* ---------------- The spell demo ---------------- */

const SPELLS = [
  { say: "dark mode, please", step: "Dimmed the lights" },
  { say: "move the search bar to the bottom", step: "Moved search to the bottom" },
  { say: "hide the promoted stuff", step: "Hid 1 promoted post" },
  { say: "newest posts first", step: "Sorted 4 posts by time" },
  { say: "make the text bigger", step: "Enlarged the post text" },
  { say: "add a note: stay focused", step: "Pinned your note at the top" },
] as const;

const POSTS = [
  { key: "a", name: "Jan de Vries", time: "3d", text: "Our Q3 results are finally in…", age: 72 },
  { key: "ad", name: "Promoted", time: "", text: "Grow your network 10× overnight!", age: -1 },
  { key: "b", name: "Sara Bakker", time: "5h", text: "Hiring two designers in Amsterdam.", age: 5 },
  { key: "c", name: "Pieter Smit", time: "20m", text: "Notes from today's product review.", age: 0.3 },
  { key: "d", name: "Noor Jansen", time: "1d", text: "A tiny thread on kerning.", age: 24 },
];

const SEARCH_H = 48;
const NOTE_H = 44;
const POST_H = 64;
const GAP = 10;

function SpellDemo() {
  const [spell, setSpell] = useState(-1); // index of last cast spell
  const [typed, setTyped] = useState(0);
  const [casting, setCasting] = useState(0); // which spell is being typed

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let i = 0;
    let s = 0;
    const type = () => {
      const text = SPELLS[s]!.say;
      if (i <= text.length) {
        setTyped(i++);
        t = setTimeout(type, 42);
      } else {
        t = setTimeout(() => {
          setSpell(s);
          t = setTimeout(() => {
            s = s + 1;
            i = 0;
            if (s >= SPELLS.length) {
              t = setTimeout(() => {
                setSpell(-1);
                s = 0;
                setCasting(0);
                setTyped(0);
                t = setTimeout(type, 900);
              }, 2200);
              return;
            }
            setCasting(s);
            setTyped(0);
            t = setTimeout(type, 400);
          }, 1500);
        }, 350);
      }
    };
    t = setTimeout(type, 900);
    return () => clearTimeout(t);
  }, []);

  const dark = spell >= 0;
  const searchBottom = spell >= 1;
  const hideAd = spell >= 2;
  const sorted = spell >= 3;
  const bigger = spell >= 4;
  const note = spell >= 5;

  const layout = useMemo(() => {
    let posts = POSTS.filter((p) => !(hideAd && p.key === "ad"));
    if (sorted) posts = [...posts].sort((a, b) => a.age - b.age);
    const ys: Record<string, number> = {};
    let y = (searchBottom ? 0 : SEARCH_H + GAP) + (note ? NOTE_H + GAP : 0);
    posts.forEach((p) => {
      ys[p.key] = y;
      y += POST_H + GAP;
    });
    const searchY = searchBottom ? y : 0;
    const height = y + (searchBottom ? SEARCH_H : -GAP);
    return { ys, searchY, height };
  }, [searchBottom, hideAd, sorted, note]);

  const page = dark ? "bg-card text-foreground" : "bg-page text-page-foreground";
  const tile = dark ? "bg-secondary border-border" : "bg-background/[0.03] border-page-muted";

  return (
    <div className="relative grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* the website */}
      <div className="overflow-hidden rounded-3xl border border-border shadow-glow">
        <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
          <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
          <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
          <span className="label-mono ml-3 text-muted-foreground">anysite.com/feed</span>
        </div>
        <div className={`p-5 transition-colors duration-700 ${page}`}>
          <div className="relative" style={{ height: layout.height, transition: "height 600ms" }}>
            <div
              className={`absolute inset-x-0 flex items-center gap-2 rounded-full border px-4 transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${tile}`}
              style={{ height: SEARCH_H, transform: `translateY(${layout.searchY}px)` }}
            >
              <Search className="h-4 w-4 opacity-60" />
              <span className="text-sm opacity-60">Search</span>
            </div>
            {note && (
              <div
                className="absolute inset-x-0 flex items-center gap-2 rounded-2xl border border-gold/50 bg-gold/10 px-4 font-display text-sm italic text-gold transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
                style={{
                  height: NOTE_H,
                  transform: `translateY(${searchBottom ? 0 : SEARCH_H + GAP}px)`,
                }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" /> stay focused today — pinned by you
              </div>
            )}
            {POSTS.map((p) => {
              const hidden = hideAd && p.key === "ad";
              const y = layout.ys[p.key] ?? layout.ys["a"] ?? 0;
              return (
                <div
                  key={p.key}
                  className={`absolute inset-x-0 flex items-center gap-3 rounded-2xl border px-4 transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${tile}`}
                  style={{
                    height: POST_H,
                    transform: `translateY(${y}px) scale(${hidden ? 0.9 : 1})`,
                    opacity: hidden ? 0 : 1,
                    filter: hidden ? "blur(6px)" : "none",
                  }}
                >
                  <div
                    className={`${bigger ? "h-11 w-11" : "h-9 w-9"} shrink-0 rounded-full ${p.key === "ad" ? "bg-signal/70" : "bg-paper-deep/60"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`${bigger ? "text-base" : "text-sm"} font-semibold`}>{p.name}</span>
                      <span className={`label-mono ${sorted ? "text-signal" : "opacity-50"}`}>
                        {p.time}
                      </span>
                    </div>
                    <p className={`${bigger ? "text-base" : "text-sm"} truncate opacity-70`}>{p.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* the side panel */}
      <aside className="flex flex-col rounded-3xl border border-border bg-card/70 p-5 backdrop-blur">
        <div className="mb-4 flex items-center gap-2">
          <img src={mark} alt="" width={22} height={22} className="rounded-md" />
          <span className="font-display text-xl">Pagewright</span>
        </div>
        <div className="rounded-2xl border border-gold/40 bg-background/60 p-3 font-mono text-sm">
          <span className="text-gold">› </span>
          {SPELLS[casting]!.say.slice(0, typed)}
          <span className="animate-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-gold" />
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {SPELLS.map((s, i) => (
            <li
              key={s.step}
              className={`flex items-center gap-2 transition-all duration-500 ${
                i <= spell ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-gold" /> {s.step}
            </li>
          ))}
        </ul>
        <p className="label-mono mt-auto pt-6 text-muted-foreground">Saved for this site ✓</p>
      </aside>
    </div>
  );
}

/* ---------------- Page ---------------- */

const GESTURES = [
  {
    n: "I",
    title: "Point",
    body: "Hover anything on a page — a sidebar, a search bar, a feed. Click to say “this one.”",
  },
  {
    n: "II",
    title: "Whisper",
    body: "Say what you wish in your own words. “Make this smaller.” “Hide these.” “Dark mode.”",
  },
  {
    n: "III",
    title: "Keep",
    body: "The change stays every visit — on one site or all of them. Undo whenever you like.",
  },
];

const INCANTATIONS = [
  { t: "dark mode, everywhere", r: -4 },
  { t: "move search to the bottom", r: 3 },
  { t: "hide every promoted post", r: -2 },
  { t: "only show posts about design", r: 5 },
  { t: "make this text bigger", r: -6 },
  { t: "sort by price, low to high", r: 2 },
  { t: "put the sidebar on the left", r: -3 },
  { t: "remove the cookie nagging", r: 4 },
];

const SHARED = [
  { site: "reddit.com", title: "Quiet Reddit", by: "mila", n: 214 },
  { site: "linkedin.com", title: "Just my people, newest first", by: "joris", n: 187 },
  { site: "youtube.com", title: "No Shorts, wide grid", by: "anon", n: 96 },
];

const STEPS = [
  "Unzip the downloaded file.",
  "Open chrome://extensions in Chrome, Edge, Brave or Arc.",
  "Switch on Developer mode, top right.",
  "Click Load unpacked and choose the unzipped folder.",
];

function Index() {
  return (
    <div className="night-sky min-h-screen overflow-x-hidden">
      <SparkleTrail />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src={mark} alt="" width={32} height={32} className="rounded-lg" />
          <span className="font-display text-2xl">Pagewright</span>
        </div>
        <Button variant="paper" size="sm" onClick={download}>
          <ArrowDownToLine /> Get it
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="pb-16 pt-12 text-center lg:pt-20">
          <h1 className="mx-auto max-w-4xl font-display text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
            Every website, <em className="text-shimmer">rewritten</em> to your liking.
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg text-muted-foreground">
            Say what you wish a page looked like. Pagewright quietly rearranges it — right there in
            your browser, and only for you.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
            <Button variant="hero" size="xl" onClick={download}>
              <ArrowDownToLine /> Download for Chrome
            </Button>
            <span className="label-mono text-muted-foreground">free · opens with ⌘⇧K</span>
          </div>
        </section>

        <section className="pb-28">
          <SpellDemo />
        </section>

        {/* Gestures */}
        <section className="grid gap-10 border-t border-border py-20 md:grid-cols-3">
          {GESTURES.map((g) => (
            <div key={g.n}>
              <span className="font-display text-5xl italic text-gold">{g.n}</span>
              <h2 className="mt-3 font-display text-4xl">{g.title}</h2>
              <p className="mt-3 text-muted-foreground">{g.body}</p>
            </div>
          ))}
        </section>

        {/* Spellbook */}
        <section className="py-20">
          <h2 className="mx-auto max-w-2xl text-center font-display text-4xl leading-tight sm:text-5xl">
            Anything you can say, the page can become.
          </h2>
          <ul className="mx-auto mt-14 flex max-w-4xl flex-wrap justify-center gap-x-4 gap-y-7">
            {INCANTATIONS.map((x, i) => (
              <li
                key={x.t}
                className="animate-float rounded-2xl border border-border bg-card px-5 py-3 font-display text-xl italic transition-colors hover:border-gold hover:text-gold"
                style={{ "--r": `${x.r}deg`, animationDelay: `${i * -0.7}s` } as React.CSSProperties}
              >
                “{x.t}”
              </li>
            ))}
          </ul>
        </section>

        {/* Community */}
        <section className="grid items-center gap-12 border-t border-border py-20 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">Borrow someone else's magic.</h2>
            <p className="mt-5 max-w-md text-muted-foreground">
              Made Reddit calm or LinkedIn bearable? Share your setup. Others find it by website and
              try it in one click — no prompt needed.
            </p>
          </div>
          <div className="grid gap-4">
            {SHARED.map((s, i) => (
              <div
                key={s.title}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-1"
                style={{ marginLeft: `${i * 24}px` }}
              >
                <div>
                  <span className="label-mono text-signal">{s.site}</span>
                  <p className="font-display text-2xl">{s.title}</p>
                  <span className="text-xs text-muted-foreground">
                    by {s.by} · {s.n} tried
                  </span>
                </div>
                <span className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-accent-foreground">
                  Try it
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Install */}
        <section className="border-t border-border py-20">
          <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="font-display text-4xl leading-tight sm:text-5xl">Install in a minute.</h2>
              <Button variant="hero" size="lg" className="mt-8" onClick={download}>
                <ArrowDownToLine /> Download
              </Button>
            </div>
            <ol className="space-y-6">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-baseline gap-5">
                  <span className="font-display text-4xl italic text-gold">{i + 1}</span>
                  <span className="text-lg">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-border px-6 py-10 text-center">
        <p className="font-display text-2xl italic text-muted-foreground">
          The web, the way you'd have made it.
        </p>
        <p className="label-mono mt-3 text-muted-foreground">
          Pagewright · changes stay in your browser
        </p>
      </footer>
    </div>
  );
}
