"use client";

import { useEffect } from "react";

/**
 * Keeps a CSS variable --vh in sync with the real visual viewport height.
 * This avoids iOS Safari's 100vh bug and makes keyboard transitions smooth.
 * It also toggles a `keyboard-open` class on <body> while the soft keyboard is visible.
 */
export default function ViewportVH(): null {
  useEffect(() => {
    const setVh = () => {
      try {
        const vv: any = (window as any).visualViewport;
        const height = Math.max(200, Math.floor((vv?.height ?? window.innerHeight)));
        const offsetTop = Math.max(0, Math.floor(vv?.offsetTop ?? 0));
        // Traditional 1% unit for broader usage
        document.documentElement.style.setProperty("--vh", `${height * 0.01}px`);
        // Raw pixel helpers for precise alignment
        document.documentElement.style.setProperty("--vvh", `${height}px`);
        document.documentElement.style.setProperty("--vvt", `${offsetTop}px`);

        // Heuristic keyboard detection (more robust): consider offsetTop as well
        const isKeyboardOpen = vv ? (vv.offsetTop > 40 || (window.innerHeight - vv.height) > 80) : false;
        document.body.classList.toggle("keyboard-open", Boolean(isKeyboardOpen));
        document.body.classList.add("vv-ready");
      } catch {
        // best-effort only
      }
    };

    setVh();
    const vv: any = (window as any).visualViewport;
    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    if (vv && typeof vv.addEventListener === "function") {
      vv.addEventListener("resize", setVh);
      vv.addEventListener("scroll", setVh);
    }
    const interval = window.setInterval(setVh, 1500); // safety updater

    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
      if (vv && typeof vv.removeEventListener === "function") {
        vv.removeEventListener("resize", setVh);
        vv.removeEventListener("scroll", setVh);
      }
      window.clearInterval(interval);
      document.body.classList.remove("keyboard-open");
    };
  }, []);

  return null;
}


