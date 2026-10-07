"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./hero.module.css";

export default function ScrollHero({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia("(max-height: 570px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const stage = element.firstElementChild as HTMLElement;
      const distance = Math.max(1, element.offsetHeight - stage.offsetHeight);
      const progress =
        motion.matches || compact.matches
          ? 0.55
          : Math.min(1, Math.max(0, -rect.top / distance));
      const reveal = Math.min(1, progress / 0.55);
      const eased = 1 - Math.pow(1 - reveal, 3);
      element.style.setProperty("--rise", `${(1 - eased) * 21}%`);
      element.style.setProperty("--spread", `${eased * 5}%`);
      element.style.setProperty("--tilt", `${(1 - eased) * 5 + 8}deg`);
      // 主視覺上方還露出公告條 / 表頭時,底部的輸入框與箭頭跟著往上抬
      element.style.setProperty("--shift", `${Math.max(0, Math.round(rect.top))}px`);
      // 往下滑的提示箭頭:快滑到底時淡出
      element.style.setProperty("--hint", progress > 0.92 ? "0" : "1");
      element.style.setProperty(
        "--screen-scroll",
        `${-Math.max(0, (progress - 0.55) / 0.45) * 18}%`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      resize.disconnect();
    };
  }, []);

  return (
    <section ref={root} className={styles.scrollHero}>
      <div className={styles.hero}>{children}</div>
    </section>
  );
}
