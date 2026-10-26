import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDownToLine, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import mark from "@/assets/pagewright-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pagewright — ask any page to rearrange itself" },
      {
        name: "description",
        content:
          "Chrome extension: type “sort this feed chronologically” and the page changes, right in your browser.",
      },
      { property: "og:title", content: "Pagewright — ask any page to rearrange itself" },
      {
        property: "og:description",
        content: "Sort, filter, hide or restyle any website with a plain-language request.",
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

const POSTS = [
  { name: "Jan de Vries", time: "3 d", text: "Excited to share our Q3 results…", age: 3 * 24 },
  { name: "Sara Bakker", time: "5 u", text: "We're hiring two designers in Amsterdam.", age: 5 },
  { name: "Promoted", time: "1 w", text: "Grow your network 10x with…", age: 7 * 24 },
  { name: "Pieter Smit", time: "20 m", text: "Notes from today's product review.", age: 0.3 },
];

const PROMPT = "sort the feed in chronological order";

function Demo() {
  const [typed, setTyped] = useState(0);
  const [sorted, setSorted] = useState(false);

  useEffect(() => {
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (i <= PROMPT.length) {
        setTyped(i++);
        t = setTimeout(tick, 45);
      } else {
        t = setTimeout(() => {
          setSorted(true);
          t = setTimeout(() => {
            setSorted(false);
            i = 0;
            setTyped(0);
            t = setTimeout(tick, 600);
          }, 3200);
        }, 500);
      }
    };
    t = setTimeout(tick, 800);
    return () => clearTimeout(t);
  }, []);

  const order = sorted ? [...POSTS].sort((a, b) => a.age - b.age) : POSTS;
  const ROW = 76;

  return (
    <div className="relative rounded-2xl border-2 border-primary bg-card shadow-offset">
      <div className="flex items-center gap-2 border-b-2 border-primary px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
        <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
        <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
        <span className="label-mono ml-3 text-muted-foreground">linkedin.com/feed</span>
      </div>
      <div className="relative px-4 pt-4" style={{ height: POSTS.length * ROW + 16 }}>
        {POSTS.map((p) => {
          const idx = order.indexOf(p);
          return (
            <div
              key={p.name}
              className="absolute inset-x-4 top-4 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{ transform: `translateY(${idx * ROW}px)`, height: ROW - 10 }}
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-paper-deep" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <span
                    className={`label-mono transition-colors ${sorted ? "text-signal" : "text-muted-foreground"}`}
                  >
                    {p.time}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{p.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute -bottom-7 left-6 right-6 rounded-xl border-2 border-primary bg-primary px-4 py-3 text-primary-foreground sm:left-10 sm:right-10">
        <span className="label-mono mr-2 text-signal">Ask</span>
        <span className="font-mono text-sm">{PROMPT.slice(0, typed)}</span>
        <span className="animate-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-signal" />
      </div>
    </div>
  );
}

const STEPS = [
  "Unzip the downloaded file.",
  "Open chrome://extensions in Chrome, Edge, Brave or Arc.",
  "Turn on Developer mode (top right).",
  "Click Load unpacked and pick the unzipped folder.",
];

const EXAMPLES = [
  "sort the posts chronologically, newest first",
  "hide every promoted post",
  "only show posts that mention AI",
  "sort these products by price, low to high",
  "make the text bigger and the page wider",
  "dark mode please",
];

function Index() {
  return (
    <div className="paper-grid min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src={mark} alt="" width={32} height={32} className="rounded-lg" />
          <span className="font-display text-2xl">Pagewright</span>
        </div>
        <Button variant="paper" size="sm" onClick={download}>
          <ArrowDownToLine /> Download
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-16 pb-24 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <p className="label-mono mb-6 text-signal">Chrome extension · works on any site</p>
            <h1 className="font-display text-6xl leading-[0.95] sm:text-7xl lg:text-[5.5rem]">
              Ask any page to <em className="text-signal">rearrange</em> itself.
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Type what you want — “sort this feed chronologically” — and the page changes right in
              your browser. Nothing on the website itself is touched.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Button variant="hero" size="xl" onClick={download}>
                <ArrowDownToLine /> Download for Chrome
              </Button>
              <span className="label-mono text-muted-foreground">Free · ⌘⇧K to open</span>
            </div>
          </div>
          <div className="pb-8">
            <Demo />
          </div>
        </section>

        <section className="grid gap-12 border-t-2 border-primary py-16 md:grid-cols-2">
          <div>
            <p className="label-mono mb-4 text-muted-foreground">Install in a minute</p>
            <ol className="space-y-4">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="font-display text-3xl leading-none text-signal">{i + 1}</span>
                  <span className="pt-1 text-base">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="label-mono mb-4 text-muted-foreground">Things to ask</p>
            <ul className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <li
                  key={e}
                  className="rounded-full border border-primary bg-card px-4 py-2 font-mono text-sm"
                >
                  {e}
                </li>
              ))}
            </ul>
            <ul className="mt-8 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 text-signal" /> Reload the page to undo.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 text-signal" /> “Keep on this site” re-applies a
                change every visit, also as new posts load.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 text-signal" /> Only a short outline of the page is
                sent to AI to plan the change.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10">
        <p className="label-mono text-muted-foreground">Pagewright · local page edits, on request</p>
      </footer>
    </div>
  );
}
