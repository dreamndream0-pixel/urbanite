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
    const phoneLayout = window.matchMedia("(max-width: 760px)");
    // 量「一定看得到的畫面高度」(100svh)
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
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
      // 手機版:一開始讓手機示意圖落在畫面裡的手上(手大約在主視覺 82% 高的位置),往下滑再升起
      const front = element.querySelector<HTMLElement>("[data-hero-phone]");
      if (phoneLayout.matches && front) {
        const rest = Math.max(0, stage.offsetHeight * 0.82 - (front.offsetTop + front.offsetHeight));
        element.style.setProperty("--rise", `${Math.round((1 - eased) * rest)}px`);
      } else {
        element.style.setProperty("--rise", `${(1 - eased) * 21}%`);
      }
      element.style.setProperty("--spread", `${eased * 5}%`);
      element.style.setProperty("--tilt", `${(1 - eased) * 5 + 8}deg`);
      // 主視覺上方還露出公告條 / 表頭時,底部的輸入框與箭頭跟著往上抬
      // 主視覺超出「看得到的畫面」底部多少;iPhone Chrome 的 innerHeight 含底部工具列後方,改用 svh 實際高度
      const visible = Math.min(window.innerHeight, probe.offsetHeight || window.innerHeight);
      const overflow = rect.top + stage.offsetHeight - visible;
      element.style.setProperty("--shift", `${Math.max(0, Math.min(Math.round(rect.top), Math.round(overflow)))}px`);
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
      probe.remove();
    };
  }, []);

  return (
    <section ref={root} className={styles.scrollHero}>
      <div className={styles.hero}>{children}</div>
    </section>
  );
}
