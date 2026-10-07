"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import type { TemplateCollection } from "./template-collections";
import styles from "./templates.module.css";

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotion = () => false;

export default function TemplateCarousel({
  collection,
}: {
  collection: TemplateCollection;
}) {
  const { id, eyebrow, title, label, basePath, templates } = collection;
  const titleId = `${id}-collection-title`;
  const viewportId = `${id}-collection-viewport`;
  const previewTitleId = `${id}-template-title`;
  const reduced = useSyncExternalStore(
    subscribeMotion,
    readMotion,
    serverMotion,
  );
  const [paused, setPaused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const plugins = useMemo(
    () => [
      AutoScroll({
        speed: 0.65,
        startDelay: 900,
        playOnInit: false,
        stopOnInteraction: true,
        stopOnMouseEnter: false,
        stopOnFocusIn: false,
      }),
    ],
    [],
  );
  const [viewport, api] = useEmblaCarousel(
    { loop: true, dragFree: true, align: "start" },
    plugins,
  );

  useEffect(() => {
    if (!api) return;
    const node = api.rootNode();
    const auto = api.plugins().autoScroll;
    let visible = false;
    let hovered =
      node.matches(":hover") && window.matchMedia("(hover: hover)").matches;
    let dragging = false;
    let focusFrame = 0;

    const sync = () => {
      auto.stop();
      if (
        visible &&
        !paused &&
        !reduced &&
        !modalOpen &&
        !document.hidden &&
        !hovered &&
        !dragging &&
        !node.contains(document.activeElement)
      )
        auto.play();
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        hovered = true;
        sync();
      }
    };
    const leave = () => {
      hovered = false;
      sync();
    };
    const down = () => {
      dragging = true;
      sync();
    };
    const up = () => {
      dragging = false;
      sync();
    };
    const focusOut = () => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(sync);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(node);
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("focusin", sync);
    node.addEventListener("focusout", focusOut);
    document.addEventListener("visibilitychange", sync);
    api.on("pointerDown", down).on("pointerUp", up).on("reInit", sync);
    return () => {
      auto.stop();
      observer.disconnect();
      cancelAnimationFrame(focusFrame);
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("focusin", sync);
      node.removeEventListener("focusout", focusOut);
      document.removeEventListener("visibilitychange", sync);
      api.off("pointerDown", down).off("pointerUp", up).off("reInit", sync);
    };
  }, [api, paused, reduced, modalOpen]);

  const step = (direction: number) => {
    api?.plugins().autoScroll.stop();
    setPaused(true);
    if (direction > 0) api?.scrollNext(reduced);
    else api?.scrollPrev(reduced);
  };
  const open = (index: number) => {
    api?.plugins().autoScroll.stop();
    setSelected(index);
    setModalOpen(true);
    dialog.current?.showModal();
  };
  const current = templates[selected];

  return (
    <section
      id={`${id}-templates`}
      className={styles.collection}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div>
          <p>{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="上一個設計"
            aria-controls={viewportId}
            title="上一個設計"
          >
            <ArrowLeft />
          </button>
          {!reduced && (
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "開始自動輪播" : "暫停自動輪播"}
              title={paused ? "開始自動輪播" : "暫停自動輪播"}
              aria-pressed={paused}
              aria-controls={viewportId}
            >
              {paused ? <Play /> : <Pause />}
            </button>
          )}
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="下一個設計"
            aria-controls={viewportId}
            title="下一個設計"
          >
            <ArrowRight />
          </button>
        </div>
      </header>
      <div
        ref={viewport}
        id={viewportId}
        className={styles.viewport}
        data-ready={Boolean(api)}
        role="region"
        aria-roledescription="輪播"
        aria-label={`${label}，共 ${templates.length} 款`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            step(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        <div className={styles.track}>
          {templates.map((template, index) => (
            <div
              className={styles.slide}
              key={template.key}
              role="group"
              aria-roledescription="投影片"
              aria-label={`${index + 1} / ${templates.length}`}
            >
              <button
                type="button"
                className={styles.preview}
                onClick={() => open(index)}
                aria-label={`放大查看 ${template.name} ${template.label}`}
              >
                <Image
                  src={`${basePath}/${template.key}.jpg`}
                  alt={`${template.name} ${template.label}完整網頁設計示意`}
                  width={575}
                  height={1280}
                  sizes="(max-width: 590px) 224px, (max-width: 1100px) 250px, 280px"
                  draggable={false}
                />
              </button>
              <div className={styles.caption}>
                <div>
                  <h3>{template.name}</h3>
                  <p>{template.label}</p>
                </div>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={previewTitleId}
        onClose={() => setModalOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogContent}>
          <header>
            <div>
              <h2 id={previewTitleId}>{current.name}</h2>
              <p>{current.label}</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => dialog.current?.close()}
              aria-label="關閉設計預覽"
              title="關閉設計預覽"
            >
              <X />
            </button>
          </header>
          <Image
            key={current.key}
            src={`${basePath}/${current.key}.jpg`}
            alt={`${current.name} 完整網頁示意`}
            width={575}
            height={1280}
            sizes="(max-width: 640px) 92vw, 575px"
          />
        </div>
      </dialog>
    </section>
  );
}
