import { useEffect, useState } from "react";

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = () => setMatches(m.matches);
    handler();
    m.addEventListener ? m.addEventListener('change', handler) : m.addListener(handler);
    return () => {
      m.removeEventListener ? m.removeEventListener('change', handler) : m.removeListener(handler);
    };
  }, [query]);
  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 640px)');
}

export function useIsCompact() {
  return useMediaQuery('(max-width: 1024px)');
}
