"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./showcase.module.css";

export default function FloatingShowcase({
  children,
}: {
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const panels = Array.from(
      element.querySelectorAll<HTMLElement>("[data-floating-panel]"),
    );
    let frame = 0;
    let visible = false;

    const update = () => {
      frame = 0;
      panels.forEach((panel) => {
        const rect = panel.getBoundingClientRect();
        const progress = motion.matches
          ? 0.5
          : Math.max(
              0,
              Math.min(
                1,
                (innerHeight - rect.top) / (innerHeight + rect.height),
              ),
            );
        panel.style.setProperty("--float-y", `${(0.5 - progress) * 42}px`);
        panel.style.setProperty("--float-turn", `${(0.5 - progress) * 7}deg`);
        panel.style.setProperty(
          "--screen-scroll",
          `${motion.matches ? 0 : -Math.max(0, progress - 0.6) * 20}%`,
        );
      });
    };
    const schedule = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) update();
      },
      { rootMargin: "100px" },
    );
    observer.observe(element);
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", update);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", update);
    };
  }, []);

  return (
    <section
      ref={root}
      id="spaces"
      className={styles.spaces}
      aria-label="LINK、SHOP 與 BRAND 產品服務"
    >
      {children}
    </section>
  );
}
