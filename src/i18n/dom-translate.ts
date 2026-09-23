import type { AppLanguage } from "./catalog";

type Dict = Record<string, [string, string, string, string]>;

const INDEX: Record<string, number> = { "zh-TW": 0, "zh-CN": 1, en: 2, ja: 3 };

let dictPromise: Promise<Dict> | null = null;
let dict: Dict | null = null;

function loadDict() {
  if (!dictPromise) {
    dictPromise = import("./ui-dictionary.json")
      .then((mod) => {
        dict = (mod.default ?? mod) as unknown as Dict;
        return dict;
      })
      .catch(() => ({}) as Dict);
  }
  return dictPromise;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT", "SVG", "svg"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();

function skipped(node: Node | null): boolean {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : ((node?.parentElement ?? null) as HTMLElement | null);
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.hasAttribute?.("data-no-translate")) return true;
    el = el.parentElement;
  }
  return false;
}

let lowerIndex: Map<string, [string, string, string, string]> | null = null;

function lower(): Map<string, [string, string, string, string]> {
  if (!lowerIndex) {
    lowerIndex = new Map();
    for (const [key, value] of Object.entries(dict ?? {})) {
      const normalized = key.toLowerCase();
      if (!lowerIndex.has(normalized)) lowerIndex.set(normalized, value);
    }
  }
  return lowerIndex;
}

const TRAILING = /[:：.!?？！…]+$/;

function lookup(text: string, idx: number): string | null {
  if (!dict) return null;
  const direct = dict[text]?.[idx];
  if (direct) return direct;
  const loose = lower().get(text.toLowerCase())?.[idx];
  if (loose) return loose;
  const tail = text.match(TRAILING)?.[0];
  if (tail) {
    const base = text.slice(0, text.length - tail.length).trim();
    if (base.length >= 2) {
      const hit = dict[base]?.[idx] ?? lower().get(base.toLowerCase())?.[idx];
      if (hit) return hit + tail;
    }
  }
  return null;
}

/** Exact-match translation of a system string; dynamic user content never matches. */
function convert(raw: string, idx: number): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return null;
  const next = lookup(trimmed.replace(/\s+/g, " "), idx);
  if (!next || next === trimmed) return null;
  const at = raw.indexOf(trimmed);
  return raw.slice(0, at) + next + raw.slice(at + trimmed.length);
}

function applyToRoot(root: Node, language: AppLanguage) {
  const toVi = language === "vi";
  const idx = INDEX[language] ?? -1;
  if (!toVi && idx < 0) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) texts.push(root as Text);
  let current = walker.nextNode();
  while (current) {
    texts.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of texts) {
    if (skipped(node)) continue;
    const original = textOriginals.get(node) ?? node.nodeValue ?? "";
    if (toVi) {
      if (textOriginals.has(node) && node.nodeValue !== original) node.nodeValue = original;
      continue;
    }
    const next = convert(original, idx);
    if (next && next !== node.nodeValue) {
      textOriginals.set(node, original);
      node.nodeValue = next;
    }
  }

  const scope: Element | null =
    root.nodeType === Node.ELEMENT_NODE ? (root as Element) : (root.parentElement ?? document.body);
  if (!scope) return;
  const elements: Element[] = [scope, ...Array.from(scope.querySelectorAll("*"))];
  for (const el of elements) {
    if (skipped(el)) continue;
    const saved = attrOriginals.get(el) ?? {};
    for (const attr of ATTRS) {
      const currentValue = el.getAttribute(attr);
      if (currentValue === null && saved[attr] === undefined) continue;
      const original = saved[attr] ?? currentValue ?? "";
      if (toVi) {
        if (saved[attr] !== undefined && currentValue !== original) el.setAttribute(attr, original);
        continue;
      }
      const next = convert(original, idx);
      if (next && next !== currentValue) {
        saved[attr] = original;
        attrOriginals.set(el, saved);
        el.setAttribute(attr, next);
      }
    }
  }
}

let observer: MutationObserver | null = null;
let currentLanguage: AppLanguage = "vi";
let pending: Node[] = [];
let frame = 0;

function flush() {
  frame = 0;
  const nodes = pending;
  pending = [];
  if (!nodes.length) return;
  observer?.disconnect();
  for (const node of nodes) {
    if (node.isConnected) applyToRoot(node, currentLanguage);
  }
  connect();
}

function schedule(node: Node) {
  pending.push(node);
  if (frame) return;
  frame = window.requestAnimationFrame(flush);
}

function connect() {
  if (!observer) return;
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: [...ATTRS],
  });
}

/** Translate all system text currently in the DOM and keep future renders translated. */
export function syncDomLanguage(language: AppLanguage) {
  if (typeof document === "undefined") return;
  currentLanguage = language;

  const run = () => {
    observer?.disconnect();
    applyToRoot(document.body, language);
    if (!observer) {
      observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "characterData") schedule(record.target);
          else if (record.type === "attributes" && record.target) schedule(record.target);
          else record.addedNodes.forEach((node) => schedule(node));
        }
      });
    }
    connect();
  };

  if (language === "vi") {
    run();
    return;
  }
  void loadDict().then(run);
}
