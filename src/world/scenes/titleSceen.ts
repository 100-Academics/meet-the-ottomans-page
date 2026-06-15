import { AppBase } from "playcanvas";
import { Battle } from '../Battle';
import { defaultScene } from './default';
import { showTitleCard } from "./titleCard";

type IntroSlide = {
  title: string;
  lines: string[];
};

/*
  How to add more intro slides:
  1) Add a new object to the introSlides array.
  2) Each slide needs a title and a lines array (each item is one line).
  3) The progress dots and navigation update automatically.
*/
let now = new Date();
let year = now.getFullYear();
let month = now.getMonth() + 1;
let day = now.getDate() + 1;

if (month === 2 && day > 28) {
  day = 1;
  month = 3;
} else if ([4, 6, 9, 11].includes(month) && day > 30) {
  day = 1;
  month += 1;
} else if (day > 31) {
  day = 1;
  month = 1;
  year += 1;
}

const introSlides: IntroSlide[] = [
  {
    title: 'Meet the Ottomans',
    lines: [
      'You are Bob Jefferson, the last descendant of Sultan Suleiman the Magnificent.',
      `For this reason, in the far future of ${month}/${day}/${year}, you are recruited by pro-Ottoman nationalists who want to return the Ottoman Empire (now Turkey) to its former glory.`,
    ]
  },
  {
    title: 'Change the Past',
    lines: [
      'The nationalists have developed a time machine.',
      'They intend to send you back in time in order to change the course of battles fought across history.',
      'Equipped with nothing more than weapons, body modifications, and a translator unit, you are expected to change the future.'
    ]
  },
  {
    title: 'Change the Future',
    lines: [
      'If all goes well, you will ensure the Ottoman Empire is stronger than ever before.',
      'You must return glory to your forgotten empire.',
      'But be advised: there may be unseen forces at play. You may have to fight undead foes.'
    ]
  },
  {
    title: 'Forge Your Legacy',
    lines: [
      'Fight your battles. Defeat your enemies. Make your mark on history.',
      'Your decisions decide which stories of the Ottoman era are remembered.',
      'So get to work, Bob Jefferson.'
    ]
  }
];

const introTimings = {
  charDelayMs: 22,
  punctuationPauseMs: 140,
  linePauseMs: 220
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function titleScreen(
  canvas: HTMLCanvasElement,
  app: AppBase,
  onClick: (battle: Battle) => void,
  getSelectedTimePeriod: () => number,
  _sceneNum: number
) {
  // Show the title card splash first, then proceed to intro slides
  await showTitleCard();

  const overlay = document.querySelector('.overlay') as HTMLElement | null;
  const introWrap = document.createElement('div');
  introWrap.id = 'intro-screen';
  introWrap.innerHTML = `
    <div class="intro-card">
      <div class="intro-kicker"></div>
      <div class="intro-title" id="intro-title"></div>
      <div class="intro-body" id="intro-body" aria-live="polite"></div>
      <div class="intro-controls">
        <button id="intro-prev" class="btn ghost">Back</button>
        <button id="intro-next" class="btn">Next</button>
        <button id="intro-skip" class="btn ghost">Skip</button>
        <button id="start-btn" class="btn primary">Start Campaign</button>
      </div>
      <div class="intro-progress" id="intro-progress"></div>
    </div>
  `;

  const hiddenMap = new Map<HTMLElement, string | null>();
  if (overlay) {
    overlay.prepend(introWrap);
    const children = Array.from(overlay.children) as HTMLElement[];
    for (const child of children) {
      if (child === introWrap) continue;
      hiddenMap.set(child, child.style.display || null);
      child.style.display = 'none';
    }
  }

  const titleEl = introWrap.querySelector('#intro-title') as HTMLElement | null;
  const bodyEl = introWrap.querySelector('#intro-body') as HTMLElement | null;
  const progressEl = introWrap.querySelector('#intro-progress') as HTMLElement | null;
  const prevBtn = introWrap.querySelector('#intro-prev') as HTMLButtonElement | null;
  const nextBtn = introWrap.querySelector('#intro-next') as HTMLButtonElement | null;
  const skipBtn = introWrap.querySelector('#intro-skip') as HTMLButtonElement | null;
  const startBtn = introWrap.querySelector('#start-btn') as HTMLButtonElement | null;

  let currentSlide = 0;
  let typingToken: { canceled: boolean } | null = null;
  let isTyping = false;

  const cancelTyping = () => {
    if (typingToken) {
      typingToken.canceled = true;
    }
    typingToken = null;
    isTyping = false;
  };

  const getCharDelay = (char: string) => {
    if ('.!?'.includes(char)) return introTimings.punctuationPauseMs;
    if (',;:'.includes(char)) return introTimings.charDelayMs * 2;
    return introTimings.charDelayMs;
  };

  const setProgress = () => {
    if (!progressEl) return;
    progressEl.replaceChildren();
    introSlides.forEach((_, index) => {
      const dot = document.createElement('span');
      dot.className = `intro-dot${index === currentSlide ? ' active' : ''}`;
      progressEl.appendChild(dot);
    });
  };

  const setButtons = () => {
    const lastIndex = introSlides.length - 1;
    if (prevBtn) prevBtn.style.display = currentSlide === 0 ? 'none' : 'inline-flex';
    if (nextBtn) nextBtn.style.display = currentSlide === lastIndex ? 'none' : 'inline-flex';
    if (skipBtn) skipBtn.style.display = currentSlide === lastIndex ? 'none' : 'inline-flex';
    if (startBtn) startBtn.style.display = currentSlide === lastIndex ? 'inline-flex' : 'none';
  };

  const renderSlide = async (index: number, options?: { instant?: boolean }) => {
    if (!titleEl || !bodyEl) return;
    const lastIndex = introSlides.length - 1;
    currentSlide = Math.max(0, Math.min(index, lastIndex));
    const slide = introSlides[currentSlide];
    titleEl.textContent = slide.title;

    setButtons();
    setProgress();
    cancelTyping();
    bodyEl.replaceChildren();

    if (options?.instant) {
      slide.lines.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'intro-line';
        p.textContent = line;
        bodyEl.appendChild(p);
      });
      return;
    }

    const token = { canceled: false };
    typingToken = token;
    isTyping = true;

    for (let i = 0; i < slide.lines.length; i += 1) {
      if (token.canceled) return;
      const line = slide.lines[i];
      const p = document.createElement('p');
      p.className = 'intro-line intro-line--active';
      bodyEl.appendChild(p);

      for (const char of line) {
        if (token.canceled) return;
        p.textContent = `${p.textContent ?? ''}${char}`;
        await sleep(getCharDelay(char));
      }

      p.classList.remove('intro-line--active');
      p.classList.add('intro-line--done');
      if (i < slide.lines.length - 1) {
        await sleep(introTimings.linePauseMs);
      }
    }

    isTyping = false;
  };

  return await new Promise<any>((resolve) => {
    const restoreOverlay = () => {
      for (const [el, prev] of hiddenMap.entries()) {
        if (prev === null) el.style.removeProperty('display');
        else el.style.display = prev;
      }
    };

    const start = async () => {
      cancelTyping();
      introWrap.remove();
      restoreOverlay();
      const renderFn = await defaultScene(canvas, app, onClick, getSelectedTimePeriod, 0);
      resolve(renderFn);
    };

    prevBtn?.addEventListener('click', () => {
      if (isTyping) {
        void renderSlide(currentSlide, { instant: true });
        return;
      }
      void renderSlide(currentSlide - 1);
    });

    nextBtn?.addEventListener('click', () => {
      if (isTyping) {
        void renderSlide(currentSlide, { instant: true });
        return;
      }
      void renderSlide(currentSlide + 1);
    });

    skipBtn?.addEventListener('click', start, { once: true });
    startBtn?.addEventListener('click', start, { once: true });

    void renderSlide(0);
  });
}

export { titleScreen };