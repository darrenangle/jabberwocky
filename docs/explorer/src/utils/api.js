// Fetch and URL helpers

export function addCacheBust(url, cacheBust) {
  try {
    const urlObj = new URL(url, window.location.href);
    urlObj.searchParams.set("v", cacheBust || Date.now());
    return urlObj.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${cacheBust || Date.now()}`;
  }
}

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

export function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

