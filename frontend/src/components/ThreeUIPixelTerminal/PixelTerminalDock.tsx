/**
 * ThreeUI Animated Top Dock - Pixel Terminal (Retro Variant)
 * Full React + WebGL Component adapted for AI Quality Evaluation Platform.
 *
 * Preserves the exact WebGL ordered dither shader, 8-stop dusk palette,
 * spring physics, and pointer proximity from ThreeUI Community.
 *
 * MIT License
 * Copyright (c) 2026 Meng To
 * Reference: https://threeui.com/css/animated-top-dock/retro
 * Package: @designcodeio/threeui
 */

import React, { useRef, useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { createRetroPixelField, type RetroPixelFieldInstance } from "./retroPixelField";
import { createTopDockController } from "./topDockController";
import { checkHealth } from "../../api";
import "./retroDock.css";

// 7x7 Crisp Pixel Glyphs for Retro Dock
const PIXEL_ICONS = {
  // Brand Logo: 7x7 cross glyph
  brand: (
    <svg viewBox="0 0 7 7" aria-hidden="true">
      <rect x="0" y="2" width="7" height="3" />
      <rect x="2" y="0" width="3" height="7" />
    </svg>
  ),
  // 1. Overview: 4 quadrants matrix
  overview: (
    <svg viewBox="0 0 7 7" aria-hidden="true">
      <rect x="1" y="1" width="2" height="2" />
      <rect x="4" y="1" width="2" height="2" />
      <rect x="1" y="4" width="2" height="2" />
      <rect x="4" y="4" width="2" height="2" />
    </svg>
  ),
  // 2. Playground: terminal prompt >_
  playground: (
    <svg viewBox="0 0 7 7" aria-hidden="true">
      <rect x="0" y="1" width="1" height="1" />
      <rect x="1" y="2" width="1" height="1" />
      <rect x="2" y="3" width="1" height="1" />
      <rect x="1" y="4" width="1" height="1" />
      <rect x="0" y="5" width="1" height="1" />
      <rect x="4" y="5" width="3" height="1" />
    </svg>
  ),
  // 3. Evaluation: gauge / checkmark
  evaluation: (
    <svg viewBox="0 0 7 7" aria-hidden="true">
      <rect x="5" y="1" width="1" height="1" />
      <rect x="4" y="2" width="1" height="1" />
      <rect x="3" y="3" width="1" height="1" />
      <rect x="1" y="4" width="1" height="1" />
      <rect x="2" y="4" width="1" height="1" />
      <rect x="0" y="3" width="1" height="1" />
    </svg>
  ),
  // 4. Regression: delta / diff comparison
  regression: (
    <svg viewBox="0 0 7 7" aria-hidden="true">
      <rect x="3" y="0" width="1" height="2" />
      <rect x="2" y="2" width="3" height="1" />
      <rect x="1" y="3" width="5" height="1" />
      <rect x="0" y="4" width="7" height="1" />
      <rect x="0" y="6" width="7" height="1" />
    </svg>
  ),
  // 5. Reports: audit document / dossier
  reports: (
    <svg viewBox="0 0 7 7" aria-hidden="true">
      <rect x="1" y="0" width="4" height="1" />
      <rect x="1" y="1" width="1" height="5" />
      <rect x="5" y="1" width="1" height="5" />
      <rect x="1" y="6" width="5" height="1" />
      <rect x="2" y="2" width="3" height="1" />
      <rect x="2" y="4" width="3" height="1" />
    </svg>
  ),
};

export interface PixelTerminalDockProps {
  pixelSize?: number;
  levels?: number;
  noise?: number;
  scanlines?: number;
  speed?: number;
  proximity?: number;
  widthGrowth?: number;
  className?: string;
}

export const PixelTerminalDock: React.FC<PixelTerminalDockProps> = ({
  pixelSize = 4,
  levels = 7,
  noise = 1.0,
  scanlines = 0.32,
  speed = 1.0,
  proximity = 132,
  widthGrowth = 54,
  className = "",
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<RetroPixelFieldInstance | null>(null);

  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [activeModel, setActiveModel] = useState<string>("auto");

  // Main 5 Navigation Items required
  const navItems = [
    { id: "overview", label: "OVERVIEW", path: "/", icon: PIXEL_ICONS.overview },
    { id: "playground", label: "PLAYGROUND", path: "/playground", icon: PIXEL_ICONS.playground },
    { id: "evaluation", label: "EVALUATION", path: "/evaluations", alias: "/evaluation", icon: PIXEL_ICONS.evaluation },
    { id: "regression", label: "REGRESSION", path: "/regression", icon: PIXEL_ICONS.regression },
    { id: "reports", label: "REPORTS", path: "/reports", icon: PIXEL_ICONS.reports },
  ];

  // Secondary Modules
  const secondaryModules = [
    { label: "DATASETS", path: "/datasets" },
    { label: "SAFETY & RED TEAM", path: "/safety" },
    { label: "MODEL ARENA", path: "/compare" },
    { label: "SETTINGS", path: "/settings" },
  ];

  // Check backend health periodically
  useEffect(() => {
    let isMounted = true;
    const fetchHealth = async () => {
      try {
        const res = await checkHealth();
        if (isMounted) {
          setApiOnline(res.data?.status === "healthy" || res.status === 200);
          if (res.data?.configured_model) setActiveModel(res.data.configured_model);
        }
      } catch {
        if (isMounted) setApiOnline(false);
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // WebGL Retro Pixel Field Initialization
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const field = createRetroPixelField(canvas, () => ({
      pixelSize,
      noise,
      levels,
      speed,
    }));
    fieldRef.current = field;

    let animId = 0;
    let isVisible = true;
    let bounds = host.getBoundingClientRect();

    const onResize = () => {
      bounds = host.getBoundingClientRect();
      field.resize(bounds.width, bounds.height);
    };

    const renderLoop = (time: number) => {
      field.resize(bounds.width, bounds.height);
      field.render(time);
      if (isVisible && !document.hidden) {
        animId = requestAnimationFrame(renderLoop);
      } else {
        animId = 0;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      field.setPointer?.(
        ((e.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
        -(((e.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1)
      );
    };

    const resizeObserver = new ResizeObserver(onResize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true;
      if (isVisible && !animId) {
        animId = requestAnimationFrame(renderLoop);
      } else if (!isVisible && animId) {
        cancelAnimationFrame(animId);
        animId = 0;
      }
    });

    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    host.addEventListener("pointermove", onPointerMove, { passive: true });

    onResize();
    animId = requestAnimationFrame(renderLoop);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      field.dispose();
      fieldRef.current = null;
    };
  }, [pixelSize, levels, noise, speed]);

  // Spring Physics Controller
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const cleanupController = createTopDockController(nav, () => ({
      proximity,
      spring: 0.19,
      damping: 0.7,
      widthGrowth,
      heightGrowth: 16,
      drop: 3.5,
      axis: "x",
      distribute: true,
      lockTrack: false,
    }));

    return cleanupController;
  }, [proximity, widthGrowth]);

  const currentPath = location.pathname;

  const isCurrentActive = (item: (typeof navItems)[0]) => {
    if (item.path === "/" && currentPath === "/") return true;
    if (item.path !== "/" && currentPath.startsWith(item.path)) return true;
    if (item.alias && currentPath.startsWith(item.alias)) return true;
    return false;
  };

  return (
    <>
      <div
        ref={hostRef}
        className={`pixel-terminal-top-dock ${className}`}
        style={{ "--atd-retro-scan": scanlines } as React.CSSProperties}
        data-dock-frame="true"
      >
        {/* WebGL Canvas with Ordered Bayer 8x8 Dithering */}
        <canvas ref={canvasRef} className="atd-retro__field" aria-hidden="true" />

        {/* Ambient Dusk Vignette */}
        <div className="atd-retro__vignette" aria-hidden="true" />

        {/* Fitted Dock Strip Header */}
        <header className="atd-retro__bar">
          {/* Brand */}
          <Link to="/" className="atd-retro__brand" title="AI Quality Evaluation Platform">
            <span className="atd-retro__badge" aria-hidden="true">
              {PIXEL_ICONS.brand}
            </span>
            <span>AI QUALITY ENGINE</span>
          </Link>

          {/* 5 Primary Animated Menu Cells */}
          <nav
            ref={navRef}
            className="atd-retro__dock"
            aria-label="Primary Navigation"
            data-dock-state="idle"
            data-dock-max="0.00"
          >
            {navItems.map((item) => {
              const active = isCurrentActive(item);
              return (
                <button
                  key={item.id}
                  className={`atd-retro__item ${active ? "is-active" : ""}`}
                  data-dock-item="true"
                  type="button"
                  aria-pressed={active}
                  onClick={() => navigate(item.path)}
                  title={`Navigate to ${item.label}`}
                >
                  <span className="atd-retro__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Dock CTA: RUN EVAL */}
          <button
            className="atd-retro__cta"
            type="button"
            onClick={() => navigate("/evaluations")}
            title="Launch active evaluation suite"
          >
            <span aria-hidden="true">▶</span>
            <span>RUN EVAL</span>
          </button>
        </header>

        {/* HUD Readout */}
        <p className="atd-retro__readout">
          <span>MEM 640K</span>
          <span>DITHER 8×8</span>
          <span>PAL 8</span>
          <span>SYS 2.1.0</span>
        </p>

        {/* Authentic Caption */}
        <p className="animated-top-dock-component__caption">
          FITTED STRIP · ORDERED DITHER
        </p>
      </div>

      {/* Secondary Quick Navigation Strip & System Telemetry */}
      <div className="pixel-secondary-bar">
        <div className="pixel-secondary-links">
          <span style={{ color: "#7b6ab0", marginRight: "4px" }}>MODULES:</span>
          {secondaryModules.map((m) => {
            const active = location.pathname.startsWith(m.path);
            return (
              <Link
                key={m.path}
                to={m.path}
                className={`pixel-sec-link ${active ? "is-active" : ""}`}
              >
                {m.label}
              </Link>
            );
          })}
        </div>

        <div className="pixel-status-strip">
          <div className="pixel-status-pill">
            <span
              className={`pixel-status-dot ${apiOnline === false ? "offline" : ""}`}
            />
            <span>
              {apiOnline === null
                ? "API CHECK..."
                : apiOnline
                ? "API ONLINE"
                : "API OFFLINE"}
            </span>
          </div>
          <div className="pixel-status-pill">
            <span style={{ color: "#f9c74f" }}>MODEL:</span> {activeModel.toUpperCase()}
          </div>
          <div className="pixel-status-pill">
            <span style={{ color: "#4ade80" }}>JUDGE:</span> STRUCTURED PYDANTIC
          </div>
        </div>
      </div>
    </>
  );
};

export default PixelTerminalDock;
