'use client';

import { useEffect, useRef, useState } from 'react';

// 輪播圖統一輸出尺寸(4:5,手機版完整顯示;電腦版同一張圖以中央裁切滿版)
const OUTPUT_W = 1080;
const OUTPUT_H = 1350;
const MAX_ZOOM = 4;

type Point = { x: number; y: number };

// 固定 4:5 取景框:框不動,照片可拖曳移動、雙指/滑桿/滾輪縮放。
// 首頁輪播圖與活動頁首圖共用。
export default function FixedBannerCropModal({
  file,
  busy,
  title = '輪播圖 — 固定首頁比例取景',
  onCancel,
  onConfirm,
}: {
  file: File;
  busy: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob, filename: string) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  // zoom = 1 代表照片剛好填滿取景框(cover);小於 1 可縮小看全圖,空白處補底色
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [background, setBackground] = useState('#ffffff');
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ pan: Point; zoom: number; mid: Point; dist: number } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ready = natural.w > 0 && frame.w > 0;
  const cover = ready ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;
  const contain = ready ? Math.min(frame.w / natural.w, frame.h / natural.h) : 1;
  const minZoom = contain / cover;

  function size(z: number) {
    return { w: natural.w * cover * z, h: natural.h * cover * z };
  }

  // 照片比框大時,邊緣不能拉進框內;比框小時,只能在框內移動
  function clamp(next: Point, z: number): Point {
    const s = size(z);
    const limitX = Math.abs(s.w - frame.w) / 2;
    const limitY = Math.abs(s.h - frame.h) / 2;
    return {
      x: Math.min(limitX, Math.max(-limitX, next.x)),
      y: Math.min(limitY, Math.max(-limitY, next.y)),
    };
  }

  // 以取景框內某一點為中心縮放(雙指中點/滑鼠位置/框中央)
  function zoomAt(nextZoom: number, focus: Point, from = { pan, zoom }) {
    const z = Math.min(MAX_ZOOM, Math.max(minZoom, nextZoom));
    const ratio = z / from.zoom;
    const fx = focus.x - frame.w / 2;
    const fy = focus.y - frame.h / 2;
    setZoom(z);
    setPan(clamp({ x: fx - (fx - from.pan.x) * ratio, y: fy - (fy - from.pan.y) * ratio }, z));
  }

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = frameRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function startGesture() {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { pan, zoom, mid, dist };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, localPoint(e));
    startGesture();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    e.preventDefault();
    pointers.current.set(e.pointerId, localPoint(e));
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length > 1 && g.dist > 0) {
      // 雙指:縮放 + 跟著中點移動
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const moved = { x: g.pan.x + mid.x - g.mid.x, y: g.pan.y + mid.y - g.mid.y };
      zoomAt(g.zoom * (dist / g.dist), mid, { pan: moved, zoom: g.zoom });
      return;
    }
    setPan(clamp({ x: g.pan.x + pts[0].x - g.mid.x, y: g.pan.y + pts[0].y - g.mid.y }, zoom));
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture();
    else gesture.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!ready) return;
    zoomAt(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), localPoint(e));
  }

  function apply() {
    const img = imageRef.current;
    if (!ready || !img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
    const k = OUTPUT_W / frame.w;
    const s = size(zoom);
    ctx.drawImage(img, ((frame.w - s.w) / 2 + pan.x) * k, ((frame.h - s.h) / 2 + pan.y) * k, s.w * k, s.h * k);
    const base = file.name.replace(/\.[^.]+$/, '') || 'banner';
    canvas.toBlob((blob) => blob && onConfirm(blob, `${base}.jpg`), 'image/jpeg', 0.9);
  }

  const shown = size(zoom);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[#6b6156]">
          取景框固定 4:5（輸出 1080 × 1350 px）。拖曳照片移動位置，雙指或滑桿縮放；手機版完整顯示框內範圍，電腦版以中央為基準自動裁切成滿版，模特兒與主要商品請放在中央。
        </p>
        <div
          ref={frameRef}
          className="relative mx-auto mt-5 aspect-[4/5] w-full max-w-sm cursor-grab touch-none select-none overflow-hidden rounded-md border-2 border-[#1f1b19] active:cursor-grabbing"
          style={{ backgroundColor: background }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          {/* 單一圖片元素:同時用於預覽與輸出,用 left/top 定位避免 iOS transform 殘影 */}
          <img
            ref={imageRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute max-w-none"
            style={{
              visibility: ready ? 'visible' : 'hidden',
              width: `${shown.w}px`,
              height: `${shown.h}px`,
              left: `${(frame.w - shown.w) / 2 + pan.x}px`,
              top: `${(frame.h - shown.h) / 2 + pan.y}px`,
            }}
          />
          {/* 中央輔助線:電腦版以中央裁切 */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/70" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-white/70" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[#6b6156]">
          <label className="flex min-w-[220px] flex-1 items-center gap-2">
            縮放
            <input
              type="range"
              min={minZoom}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              onChange={(e) => zoomAt(Number(e.target.value), { x: frame.w / 2, y: frame.h / 2 })}
              className="flex-1 accent-[#1f1b19]"
            />
            <span className="w-12 text-right">{zoom.toFixed(2)}x</span>
          </label>
          <label className="flex items-center gap-2">
            補底色
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-8 w-10 rounded border border-[#d7c9bd] p-0.5" />
          </label>
          <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs font-semibold">
            重設
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-full border border-[#d7c9bd] px-5 py-2 text-sm font-semibold">取消</button>
          <button type="button" onClick={apply} disabled={busy || !ready} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '上傳中...' : '套用並上傳'}</button>
        </div>
      </div>
    </div>
  );
}
