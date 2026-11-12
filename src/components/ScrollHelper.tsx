import { useEffect, useState } from "react";
import { ChevronsDown, ChevronsUp } from "lucide-react";

/** Floating button on every page: scrolls down while there is more below, then back to the top. */
export function ScrollHelper() {
  const [state, setState] = useState<{ show: boolean; atBottom: boolean }>({ show: false, atBottom: false });
  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const room = el.scrollHeight - window.innerHeight;
      setState({ show: room > 160, atBottom: window.scrollY >= room - 80 });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); ro.disconnect(); };
  }, []);
  if (!state.show) return null;
  const up = state.atBottom;
  return (
    <button type="button" className="scroll-fab" aria-label={up ? "Scroll to top" : "Scroll down"} title={up ? "Back to top" : "Scroll down"}
      onClick={() => window.scrollTo({ top: up ? 0 : Math.min(window.scrollY + window.innerHeight * 0.8, document.documentElement.scrollHeight), behavior: "smooth" })}>
      {up ? <ChevronsUp className="h-5 w-5" /> : <ChevronsDown className="h-5 w-5 animate-bounce" />}
    </button>
  );
}
