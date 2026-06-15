/**
 * Title card splash screen displayed before the intro slides.
 * Shows "A 100% Academic Game", small text "totallyacademic.dpns.org",
 * and a blank placeholder for a logo. Click or press any key to continue.
 */

const TITLE_CARD_DURATION_MS = 4000; // auto-advance after this long
const FADE_OUT_MS = 500;

export async function showTitleCard(): Promise<void> {
  const overlay = document.querySelector('.overlay') as HTMLElement | null;
  if (!overlay) return;

  // Create the title card element
  const card = document.createElement('div');
  card.id = 'title-card';
  card.innerHTML = `
    <div class="title-card-inner">
      <div class="title-card-logo" id="title-card-logo">
        <img src="koreandude.png" alt="Logo" class="logo-image" />
      </div>
      <h1 class="title-card-heading">A 100% Academic Game</h1>
      <p class="title-card-subtitle">totallyacademic.dpns.org</p>
      <p class="title-card-hint">Click or press any key to continue</p>
    </div>
  `;

  // Prepend to overlay so it sits behind any other intro UI
  overlay.prepend(card);

  // Hide other overlay children while the title card is visible
  const hiddenMap = new Map<HTMLElement, string | null>();
  const children = Array.from(overlay.children) as HTMLElement[];
  for (const child of children) {
    if (child === card) continue;
    hiddenMap.set(child, child.style.display || null);
    child.style.display = 'none';
  }

  // Wait for user interaction or timeout
  await new Promise<void>((resolve) => {
    let resolved = false;

    const advance = () => {
      if (resolved) return;
      resolved = true;

      // Fade out
      card.classList.add('title-card-fade-out');

      const cleanup = () => {
        card.remove();
        // Restore hidden overlay children
        for (const [el, prev] of hiddenMap.entries()) {
          if (prev === null) el.style.removeProperty('display');
          else el.style.display = prev;
        }
        resolve();
      };

      card.addEventListener('animationend', cleanup, { once: true });
      // Fallback in case animationend doesn't fire
      setTimeout(cleanup, FADE_OUT_MS + 100);
    };

    // Click anywhere on the card
    card.addEventListener('click', advance, { once: true });

    // Press any key
    const keyHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      advance();
      document.removeEventListener('keydown', keyHandler);
    };
    document.addEventListener('keydown', keyHandler);

    // Auto-advance after timeout
    setTimeout(advance, TITLE_CARD_DURATION_MS);
  });
}
