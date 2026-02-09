// animationUtils.js
import { LinearInterpolator } from "@deck.gl/core"; //

export class OrthographicFlyToInterpolator extends LinearInterpolator {
  constructor() {
    super({
      transitionProps: ['target', 'zoom']
    });
  }

  interpolateProps(startProps, endProps, t) {
    // UPDATED: Quintic Ease-In-Out
    // x^5 provides a much flatter start/end and steeper middle than x^3
    const ease = (x) => x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;

    const easedT = ease(t);

    // Calculate pan distance between start and end positions
    const dx = endProps.target[0] - startProps.target[0];
    const dy = endProps.target[1] - startProps.target[1];
    const panDistance = Math.sqrt(dx * dx + dy * dy);

    let target, zoom;

    if (startProps.zoom >= 5 && endProps.zoom >= 5) {
      // Zoomed in on both ends: arc up (zoom out) then back down
      target = [
        startProps.target[0] + (endProps.target[0] - startProps.target[0]) * easedT,
        startProps.target[1] + (endProps.target[1] - startProps.target[1]) * easedT,
        0
      ];

      // Scale arc height based on pan distance only
      const minDistance = 10;
      const maxDistance = 100;
      const maxArcHeight = 1.5;

      const normalizedDistance = Math.max(0, Math.min(1, (panDistance - minDistance) / (maxDistance - minDistance)));
      const arcHeight = normalizedDistance * maxArcHeight;

      // Arc always zooms OUT (lower zoom value) at the midpoint
      const smoothArc = Math.sin(easedT * Math.PI) * arcHeight;
      const baseZoom = startProps.zoom + (endProps.zoom - startProps.zoom) * easedT;
      zoom = baseZoom - smoothArc;

    } else if (endProps.zoom <= 2) {
      // Zooming out to 2 or less: pan and zoom at same rate
      target = [
        startProps.target[0] + (endProps.target[0] - startProps.target[0]) * easedT,
        startProps.target[1] + (endProps.target[1] - startProps.target[1]) * easedT,
        0
      ];
      zoom = startProps.zoom + (endProps.zoom - startProps.zoom) * easedT;

    } else {
      // UPDATED: General case
      // Previously used separate easeOut/easeIn which caused abrupt starts.
      // Now uses the strong Quintic ease for both to ensure smooth start/stop.
      target = [
        startProps.target[0] + (endProps.target[0] - startProps.target[0]) * easedT,
        startProps.target[1] + (endProps.target[1] - startProps.target[1]) * easedT,
        0
      ];
      zoom = startProps.zoom + (endProps.zoom - startProps.zoom) * easedT;
    }

    return { target, zoom };
  }
}

export function createOpacityAnimator(onUpdate) {
  let animationFrame = null;

  function animate(from, to, duration) {
    cancel();
    const startTime = performance.now();

    function tick(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Also updated to Quintic for consistency in UI feeling
      const eased = progress < 0.5 ? 16 * progress * progress * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 5) / 2;

      const value = from + (to - from) * eased;
      onUpdate(value);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    }

    animationFrame = requestAnimationFrame(tick);
  }

  function cancel() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  return { animate, cancel };
}

export function createWiggleAnimator(onUpdate) {
  let animationFrame = null;
  let startTime = null;
  const amplitude = 0.15;
  const rockDuration = 300;
  const pauseDuration = 800;
  const cycleDuration = rockDuration * 2 + pauseDuration;

  function start() {
    stop();
    startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const cyclePosition = elapsed % cycleDuration;
      let offset = 0;

      if (cyclePosition < rockDuration) {
        const t = cyclePosition / rockDuration;
        offset = Math.sin(t * Math.PI) * amplitude;
      } else if (cyclePosition < rockDuration * 2) {
        const t = (cyclePosition - rockDuration) / rockDuration;
        offset = Math.sin(t * Math.PI) * -amplitude;
      }

      onUpdate(offset);
      animationFrame = requestAnimationFrame(animate);
    }

    animationFrame = requestAnimationFrame(animate);
  }

  function stop() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    startTime = null;
    onUpdate(0);
  }

  return { start, stop };
}
