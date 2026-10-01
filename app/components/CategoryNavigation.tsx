'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type NavigationCategory = {
  slug: string;
  name: string;
  children?: NavigationCategory[];
};

export default function CategoryNavigation({ categories, value, onSelect }: {
  categories: NavigationCategory[];
  value: string;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 320 });
  const row = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusMenu = useRef(false);
  const menuId = useId();
  const expanded = categories.find(category => category.slug === open);

  useEffect(() => {
    const active = row.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active || !row.current) return;
    const container = row.current;
    container.scrollLeft = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
  }, [value, categories.length]);

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const top = anchor.bottom + 8;
      setPosition({
        left: Math.max(12, Math.min(anchor.left, window.innerWidth - 252)),
        top,
        maxHeight: Math.max(80, window.innerHeight - top - 12),
      });
    }
    function dismiss(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(null);
        trigger.current?.focus();
      }
    }
    reposition();
    if (focusMenu.current) {
      menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
      focusMenu.current = false;
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  function choose(slug: string) {
    onSelect(slug);
    setOpen(null);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <nav className="store-category-navigation" aria-label="商品分類">
      <div ref={row} className="store-category-row">
        {categories.map(category => {
          const active = value === category.slug || !!category.children?.some(child => child.slug === value);
          const hasChildren = !!category.children?.length;
          return (
            <button
              key={category.slug}
              type="button"
              className="store-category-button"
              aria-current={active ? 'page' : undefined}
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? open === category.slug : undefined}
              aria-controls={open === category.slug ? menuId : undefined}
              onClick={event => {
                if (hasChildren && open !== category.slug) {
                  trigger.current = event.currentTarget;
                  if (!active) onSelect(category.slug);
                  setOpen(category.slug);
                } else {
                  setOpen(null);
                  if (!hasChildren) onSelect(category.slug);
                }
              }}
              onKeyDown={event => {
                if (hasChildren && event.key === 'ArrowDown') {
                  event.preventDefault();
                  trigger.current = event.currentTarget;
                  if (open === category.slug) {
                    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
                    return;
                  }
                  focusMenu.current = true;
                  setOpen(category.slug);
                }
              }}
            >
              {category.slug === 'all' ? '全部商品' : category.name}
              {hasChildren ? <span className="store-category-chevron" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {expanded && createPortal(
        <div
          id={menuId}
          ref={menu}
          className="store-category-menu"
          role="menu"
          aria-label={`${expanded.name}子分類`}
          style={position}
          onKeyDown={event => {
            const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'ArrowDown' ? (index + 1) % items.length
              : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
            if (next >= 0) {
              event.preventDefault();
              items[next]?.focus();
            }
            if (event.key === 'Tab') setOpen(null);
          }}
        >
          {[{ slug: expanded.slug, name: `全部${expanded.name}` }, ...(expanded.children ?? [])].map(child => (
            <button
              key={child.slug}
              type="button"
              role="menuitemradio"
              aria-checked={value === child.slug}
              onClick={() => choose(child.slug)}
            >
              {child.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </nav>
  );
}
