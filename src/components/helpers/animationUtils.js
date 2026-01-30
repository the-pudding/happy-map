// animationUtils.js

import { LinearInterpolator } from "@deck.gl/core";

export class OrthographicFlyToInterpolator extends LinearInterpolator {
  constructor() {
    super({
      transitionProps: ['target', 'zoom']
    });
  }

  interpolateProps(startProps, endProps, t) {
    // Ease in-out cubic for ultra smooth movement
    const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    // Ease out cubic - fast start, slow end (for panning)
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);

    // Ease in cubic - slow start, fast end (for zooming in)
    const easeIn = (x) => x * x * x;

    const easedT = ease(t);

    let target, zoom;

    if (startProps.zoom >= 5 && endProps.zoom >= 5) {
      // Zoomed in on both ends: arc up (zoom out) then back down
      target = [
        startProps.target[0] + (endProps.target[0] - startProps.target[0]) * easedT,
        startProps.target[1] + (endProps.target[1] - startProps.target[1]) * easedT,
        0
      ];
      const arcHeight = 1.5;
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
      // Otherwise: pan fast, zoom slow
      const panT = easeOut(t);
      const zoomT = easeIn(t);

      target = [
        startProps.target[0] + (endProps.target[0] - startProps.target[0]) * panT,
        startProps.target[1] + (endProps.target[1] - startProps.target[1]) * panT,
        0
      ];
      zoom = startProps.zoom + (endProps.zoom - startProps.zoom) * zoomT;
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
      const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
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
