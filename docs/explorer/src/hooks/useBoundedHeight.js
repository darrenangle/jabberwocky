import { useCallback, useEffect, useState } from "react";

export function useBoundedHeight(ref, { bottomPadding = 16, min = 360 } = {}) {
  const [height, setHeight] = useState(min);

  const compute = useCallback(() => {
    const el = ref?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const available = Math.max(min, Math.floor(vh - rect.top - bottomPadding));
    setHeight(available);
  }, [ref, bottomPadding, min]);

  useEffect(() => {
    compute();
    let rAF;
    const onResize = () => {
      cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(compute);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    // recompute after fonts/layout paint
    const t = setTimeout(compute, 50);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(rAF);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [compute]);

  return height;
}

