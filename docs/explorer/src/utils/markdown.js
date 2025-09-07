import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
});

export function mdInline(text) {
  try { return marked.parseInline(String(text || "")); } catch { return String(text || ""); }
}

export function mdBlock(text) {
  try { return marked.parse(String(text || "")); } catch { return String(text || ""); }
}

