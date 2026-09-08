export interface PortraitMotionState {
  signature: string | null;
  nextBlinkAt: number;
  blinkUntil: number;
  nextGlanceAt: number;
  glanceUntil: number;
  nextFlavorAt: number;
  flavorUntil: number;
}

export interface PortraitMotion {
  frame(root: ParentNode, now: number, active: boolean): void;
  inspect(): Readonly<PortraitMotionState>;
}

const NEVER = Number.POSITIVE_INFINITY;

function blankState(): PortraitMotionState {
  return {
    signature: null,
    nextBlinkAt: NEVER,
    blinkUntil: NEVER,
    nextGlanceAt: NEVER,
    glanceUntil: NEVER,
    nextFlavorAt: NEVER,
    flavorUntil: NEVER,
  };
}

function defaultReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearTransient(portrait: HTMLElement | null): void {
  if (!portrait) return;
  for (const layer of portrait.querySelectorAll<HTMLElement>("[data-portrait-frame]")) {
    layer.style.removeProperty("opacity");
    layer.style.removeProperty("transform");
  }
  portrait.classList.remove("is-blinking", "is-glancing", "is-flavor");
}

/** Real-time, UI-only motion. It never uses or changes the simulation RNG. */
export function createPortraitMotion(
  random: () => number = Math.random,
  reducedMotion: () => boolean = defaultReducedMotion,
): PortraitMotion {
  let state = blankState();
  let running = false;

  function schedule(portrait: HTMLElement, now: number): void {
    state.nextBlinkAt = now + 1000 + random() * 4000;
    state.nextGlanceAt = now + 8000 + random() * 12000;
    state.nextFlavorAt = portrait.classList.contains("is-focused") ? NEVER : now + 10000 + random() * 14000;
    state.blinkUntil = NEVER;
    state.glanceUntil = NEVER;
    state.flavorUntil = NEVER;
  }

  function reset(portrait: HTMLElement | null): void {
    clearTransient(portrait);
    const signature = state.signature;
    state = blankState();
    state.signature = signature;
  }

  return {
    frame(root, now, active) {
      const portrait = root.querySelector<HTMLElement>(".portrait[data-portrait-signature]");
      const signature = portrait?.dataset.portraitSignature ?? null;
      const canMove = Boolean(portrait && active && !reducedMotion() && !portrait.classList.contains("motion-none"));

      if (!canMove || !portrait) {
        reset(portrait);
        state.signature = signature;
        running = false;
        return;
      }

      if (!running || signature !== state.signature) {
        clearTransient(portrait);
        state = blankState();
        state.signature = signature;
        schedule(portrait, now);
        running = true;
        return;
      }

      const blink = portrait.querySelector<HTMLElement>('[data-portrait-frame="blink"]');
      if (state.blinkUntil !== NEVER && now >= state.blinkUntil) {
        if (blink) blink.style.removeProperty("opacity");
        portrait.classList.remove("is-blinking");
        state.blinkUntil = NEVER;
        state.nextBlinkAt = now + 1000 + random() * 4000;
      } else if (state.blinkUntil === NEVER && now >= state.nextBlinkAt) {
        state.blinkUntil = now + 100 + random() * 80;
        state.nextBlinkAt = NEVER;
        if (blink) blink.style.opacity = "1";
        portrait.classList.add("is-blinking");
      }

      const layers = portrait.querySelectorAll<HTMLElement>("[data-portrait-frame]");
      if (state.glanceUntil !== NEVER && now >= state.glanceUntil) {
        for (const layer of layers) layer.style.removeProperty("transform");
        portrait.classList.remove("is-glancing");
        state.glanceUntil = NEVER;
        state.nextGlanceAt = now + 8000 + random() * 12000;
      } else if (state.glanceUntil === NEVER && now >= state.nextGlanceAt) {
        state.glanceUntil = now + 500 + random() * 600;
        state.nextGlanceAt = NEVER;
        const shift = random() < 0.5 ? -1 : 1;
        for (const layer of layers) layer.style.transform = `translateX(${shift}px)`;
        portrait.classList.add("is-glancing");
      }

      const flavor = portrait.querySelector<HTMLElement>('[data-portrait-frame="flavor"]');
      if (state.flavorUntil !== NEVER && now >= state.flavorUntil) {
        if (flavor) flavor.style.removeProperty("opacity");
        portrait.classList.remove("is-flavor");
        state.flavorUntil = NEVER;
        state.nextFlavorAt = portrait.classList.contains("is-focused") ? NEVER : now + 10000 + random() * 14000;
      } else if (state.flavorUntil === NEVER && now >= state.nextFlavorAt) {
        state.flavorUntil = now + 400 + random() * 700;
        state.nextFlavorAt = NEVER;
        if (flavor) flavor.style.opacity = "1";
        portrait.classList.add("is-flavor");
      }
    },
    inspect() {
      return { ...state };
    },
  };
}
