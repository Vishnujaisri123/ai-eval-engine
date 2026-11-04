/**
 * ThreeUI Community - Top Dock Spring Physics & Interaction Controller
 * Preserved from @designcodeio/threeui (topDockController)
 *
 * MIT License
 * Copyright (c) 2026 Meng To
 *
 * Features:
 * - Second-order spring physics simulation (spring: 0.19, damping: 0.7)
 * - Pointer proximity detection with cubic Hermite falloff
 * - Fitted strip distribution for retro variant (distribute: true)
 * - Proportional width expansion across active & neighbor cells
 * - Keyboard Tab navigation, Enter / Space activation
 * - Accessibility: prefers-reduced-motion: reduce bypass
 * - Mobile static fallback when viewport width <= 600px
 */

const clamp = (val: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, val));

export interface TopDockControllerConfig {
  proximity: number;
  spring: number;
  damping: number;
  widthGrowth: number;
  heightGrowth: number;
  drop: number;
  axis?: "x" | "y";
  distribute?: boolean;
  lockTrack?: boolean;
}

interface DockItemState {
  element: HTMLElement;
  baseWidth: number;
  baseHeight: number;
  value: number;
  velocity: number;
  target: number;
}

export function createTopDockController(
  container: HTMLElement,
  getConfig: () => TopDockControllerConfig
): () => void {
  const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointerMedia = window.matchMedia("(hover:hover) and (pointer:fine)");

  const itemElements = Array.from(
    container.querySelectorAll<HTMLElement>("[data-dock-item]")
  );

  const items: DockItemState[] = itemElements.map((el) => ({
    element: el,
    baseWidth: 0,
    baseHeight: 0,
    value: 0,
    velocity: 0,
    target: 0,
  }));

  let isEnabled = false;
  let isPointerActive = false;
  let needsAnimation = false;
  let animFrameId = 0;

  const checkEnabled = () =>
    !reducedMotionMedia.matches &&
    container.clientWidth > 0 &&
    window.innerWidth > 600 &&
    finePointerMedia.matches;

  const applyLayout = () => {
    const config = getConfig();

    if (config.distribute && config.axis !== "y") {
      const targetWidths = items.map(
        (it) => it.baseWidth + config.widthGrowth * clamp(it.value, 0, 1.08)
      );
      const totalExpanded = targetWidths.reduce((a, b) => a + b, 0);
      const totalBase = items.reduce((a, b) => a + b.baseWidth, 0);
      const clientW = container.clientWidth >= totalBase ? container.clientWidth : 0;

      items.forEach((it, idx) => {
        it.element.style.width = clientW
          ? `${((clientW * targetWidths[idx]) / totalExpanded).toFixed(2)}px`
          : "";
        it.element.style.height = "";
        it.element.style.transform = "";
      });
      return;
    }

    for (const it of items) {
      const factor = clamp(it.value, 0, 1.08);
      if (config.axis === "y") {
        it.element.style.width = "";
        it.element.style.height = `${(it.baseHeight + config.heightGrowth * factor).toFixed(2)}px`;
        it.element.style.transform = `translateX(${(factor * config.drop).toFixed(2)}px)`;
        continue;
      }
      const isLogo = it.element.classList.contains("animated-top-dock__logo");
      const wGrowth = isLogo
        ? config.widthGrowth * (14 / 17)
        : Math.min(config.widthGrowth, it.baseWidth * 0.24);
      const hGrowth = isLogo
        ? config.heightGrowth * (14 / 16)
        : config.heightGrowth;

      it.element.style.width = `${(it.baseWidth + wGrowth * factor).toFixed(2)}px`;
      it.element.style.height = `${(it.baseHeight + hGrowth * factor).toFixed(2)}px`;
      it.element.style.transform = `translateY(${(factor * config.drop).toFixed(2)}px)`;
    }
  };

  const measureAndReset = () => {
    isEnabled = checkEnabled();
    const config = getConfig();
    if (config.lockTrack) {
      container.style.width = "";
    }

    for (const it of items) {
      it.element.style.width = "";
      it.element.style.height = "";
      it.element.style.transform = "";
      it.element.dataset.dockNear = "false";
    }

    for (const it of items) {
      const rect = it.element.getBoundingClientRect();
      it.baseWidth = rect.width;
      it.baseHeight = rect.height;
      it.value = 0;
      it.velocity = 0;
      it.target = 0;
    }

    isPointerActive = false;
    needsAnimation = false;

    if (config.distribute) {
      applyLayout();
    }
    if (config.lockTrack) {
      container.style.width = `${container.getBoundingClientRect().width.toFixed(2)}px`;
    }

    container.dataset.dockState = isEnabled ? "idle" : "static";
    container.dataset.dockMax = "0.00";
  };

  const onPointerAt = (clientX: number, clientY: number) => {
    if (!isEnabled) return;
    const config = getConfig();
    const isY = config.axis === "y";
    const pointerPos = isY ? clientY : clientX;
    const rects = items.map((it) => it.element.getBoundingClientRect());

    for (let i = 0; i < items.length; i++) {
      const r = rects[i];
      const center = isY ? r.top + r.height * 0.5 : r.left + r.width * 0.5;
      const dist = Math.abs(pointerPos - center);
      const norm = clamp(1 - dist / Math.max(1, config.proximity), 0, 1);
      // Smooth cubic Hermite
      const curve = norm * norm * (3 - 2 * norm);

      items[i].target = curve;
      items[i].element.dataset.dockNear = curve > 0.08 ? "true" : "false";
    }

    isPointerActive = true;
    needsAnimation = true;
    container.dataset.dockState = "active";
  };

  const onFocusItem = (el: HTMLElement) => {
    if (!isEnabled) return;
    const idx = items.findIndex((it) => it.element === el);
    if (idx < 0) return;

    items.forEach((it, i) => {
      it.target = i === idx ? 1 : Math.abs(i - idx) === 1 ? 0.24 : 0;
      it.element.dataset.dockNear = it.target > 0.08 ? "true" : "false";
    });

    isPointerActive = false;
    needsAnimation = true;
    container.dataset.dockState = "focus";
  };

  const onPointerLeave = () => {
    isPointerActive = false;
    needsAnimation = true;
    items.forEach((it) => {
      it.target = 0;
      it.element.dataset.dockNear = "false";
    });
  };

  const tickPhysics = () => {
    if (isEnabled && needsAnimation) {
      const config = getConfig();
      let hasMovement = false;
      let maxVal = 0;

      for (const it of items) {
        it.velocity += (it.target - it.value) * config.spring;
        it.velocity *= config.damping;
        it.value += it.velocity;

        if (
          Math.abs(it.target - it.value) < 1e-3 &&
          Math.abs(it.velocity) < 1e-3
        ) {
          it.value = it.target;
          it.velocity = 0;
        } else {
          hasMovement = true;
        }
        maxVal = Math.max(maxVal, clamp(it.value, 0, 1.08));
      }

      applyLayout();
      container.dataset.dockMax = maxVal.toFixed(2);

      if (!hasMovement) {
        needsAnimation = false;
        if (items.every((it) => it.target === 0)) {
          container.dataset.dockState = "idle";
        }
      }
    }
    animFrameId = requestAnimationFrame(tickPhysics);
  };

  const handlePointerMove = (e: PointerEvent) => onPointerAt(e.clientX, e.clientY);

  const handleWindowPointerMove = (e: PointerEvent) => {
    if (!isPointerActive) return;
    const box = container.getBoundingClientRect();
    const itemRects = items.map((it) => it.element.getBoundingClientRect());
    const bottom = Math.max(box.bottom, ...itemRects.map((it) => it.bottom));

    if (
      e.clientX < box.left ||
      e.clientX > box.right ||
      e.clientY < box.top ||
      e.clientY > bottom
    ) {
      onPointerLeave();
    }
  };

  const handleFocusIn = (e: FocusEvent) => {
    const item = (e.target as HTMLElement)?.closest<HTMLElement>("[data-dock-item]");
    if (item) onFocusItem(item);
  };

  const handleFocusOut = () => {
    requestAnimationFrame(() => {
      if (!container.contains(document.activeElement)) {
        onPointerLeave();
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const item = (e.target as HTMLElement)?.closest<HTMLElement>("[data-dock-item]");
    if (item && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      item.click();
    }
  };

  let isDestroyed = false;
  const onFontsReady = () => {
    if (!isDestroyed) measureAndReset();
  };
  document.fonts?.ready.then(onFontsReady);

  const resizeObserver = new ResizeObserver(measureAndReset);
  resizeObserver.observe(
    container.closest("[data-dock-frame]") ?? container.parentElement ?? container
  );

  container.addEventListener("pointermove", handlePointerMove);
  container.addEventListener("pointerleave", onPointerLeave);
  container.addEventListener("focusin", handleFocusIn);
  container.addEventListener("focusout", handleFocusOut);
  container.addEventListener("keydown", handleKeyDown);
  container.addEventListener("click", onPointerLeave);
  window.addEventListener("pointermove", handleWindowPointerMove, { passive: true });
  reducedMotionMedia.addEventListener("change", measureAndReset);
  finePointerMedia.addEventListener("change", measureAndReset);

  measureAndReset();
  animFrameId = requestAnimationFrame(tickPhysics);

  return () => {
    isDestroyed = true;
    container.style.width = "";
    cancelAnimationFrame(animFrameId);
    resizeObserver.disconnect();
    container.removeEventListener("pointermove", handlePointerMove);
    container.removeEventListener("pointerleave", onPointerLeave);
    container.removeEventListener("focusin", handleFocusIn);
    container.removeEventListener("focusout", handleFocusOut);
    container.removeEventListener("keydown", handleKeyDown);
    container.removeEventListener("click", onPointerLeave);
    window.removeEventListener("pointermove", handleWindowPointerMove);
    reducedMotionMedia.removeEventListener("change", measureAndReset);
    finePointerMedia.removeEventListener("change", measureAndReset);
  };
}
