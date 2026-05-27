import { useRef } from "react";

const MIN_SWIPE_PX   = 55;   // minimum horizontal pixels to count as swipe
const ANGLE_GUARD    = 1.4;  // |dx| must be > |dy| × this (filters diagonal/scroll)
const EDGE_ZONE      = 40;   // px from screen edge to activate nav swipe

/**
 * Returns touch handlers that switch between tabs when the user swipes
 * horizontally across the content area.
 * - Swipe left  → next tab
 * - Swipe right → previous tab
 * No state is stored outside the ref, so there is zero re-render cost.
 */
export function useSwipeTabs(
  tabs: readonly string[],
  activeTab: string,
  setActiveTab: (tab: string) => void,
): {
  onTouchStartCapture: (e: React.TouchEvent) => void;
  onTouchEndCapture:   (e: React.TouchEvent) => void;
} {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  return {
    // Capture phase: fires before child elements (e.g. Recharts SVG) can absorb
    // the touch, so swipe works across the full page area including charts.
    onTouchStartCapture(e) {
      startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEndCapture(e) {
      const s = startRef.current;
      if (!s) return;
      startRef.current = null;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * ANGLE_GUARD) return;
      const idx = tabs.indexOf(activeTab);
      if (dx < 0 && idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
      else if (dx > 0 && idx > 0)          setActiveTab(tabs[idx - 1]);
    },
  };
}

/**
 * Returns touch handlers that navigate between top-level routes when the user
 * swipes horizontally from within EDGE_ZONE px of the screen edge.
 * Edge-zone restriction avoids conflict with in-page tab swipes.
 * - Swipe left  → next route
 * - Swipe right → previous route
 */
export function useNavSwipe(
  routes: readonly string[],
  currentPath: string,
  navigate: (path: string) => void,
): {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd:   (e: React.TouchEvent) => void;
} {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(e) {
      const x = e.touches[0].clientX;
      if (x < EDGE_ZONE || x > window.innerWidth - EDGE_ZONE) {
        startRef.current = { x, y: e.touches[0].clientY };
      } else {
        startRef.current = null;
      }
    },
    onTouchEnd(e) {
      const s = startRef.current;
      if (!s) return;
      startRef.current = null;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * ANGLE_GUARD) return;
      const idx = routes.indexOf(currentPath);
      if (idx === -1) return;
      if (dx < 0 && idx < routes.length - 1) navigate(routes[idx + 1]);
      else if (dx > 0 && idx > 0)            navigate(routes[idx - 1]);
    },
  };
}

/**
 * Returns touch handlers that call onClose when the user swipes RIGHT
 * (for right-side drawers: swipe toward the origin = dismiss).
 */
export function useSwipeClose(onClose: () => void): {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd:   (e: React.TouchEvent) => void;
} {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(e) {
      startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd(e) {
      const s = startRef.current;
      if (!s) return;
      startRef.current = null;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (dx > MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) * ANGLE_GUARD) onClose();
    },
  };
}
