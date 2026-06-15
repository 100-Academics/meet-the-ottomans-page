import { AppBase } from 'playcanvas';
import { getCompletedCount, getTotalNonSecretCount } from '../../util/battleProgress';

export function showEndGameScreen(options?: {
  app?: AppBase;
  onProceed?: () => void;
  onMainMenu?: () => void;
  onReturnToMap?: () => void;
}) {
  if (typeof document === 'undefined') return;

  document.querySelectorAll('.overlay').forEach((el) => {
    if ((el as HTMLElement).id !== 'end-game-screen') {
      el.remove();
    }
  });
  const hoverLabel = document.getElementById('battle-hover-label');
  if (hoverLabel) {
    hoverLabel.remove();
  }
  if (document.getElementById('end-game-screen')) return;

  const { onProceed, onMainMenu, onReturnToMap } = options ?? {};

  const overlay = document.createElement('div');
  overlay.id = 'end-game-screen';

  const card = document.createElement('div');
  card.className = 'end-card';

  const title = document.createElement('h1');
  title.className = 'end-title';
  title.textContent = 'All Battles Won';

  const desc = document.createElement('p');
  desc.className = 'end-message';
  desc.textContent = 'You have fought through history itself. From the fields of Legnica to the streets of Kyiv, the Ottoman banner flies higher than ever before.';

  const divider = document.createElement('hr');
  divider.className = 'end-divider';

  const body = document.createElement('p');
  body.className = 'end-body';
  body.textContent = 'But one final challenge remains. The rumored secret battle — Northwood High School — awaits those brave enough to face it.';

  const progressInfo = document.createElement('p');
  progressInfo.className = 'end-progress';
  progressInfo.textContent = `Battles completed: ${getCompletedCount()}/${getTotalNonSecretCount()}`;

  const actionRow = document.createElement('div');
  actionRow.className = 'end-actions';

  const proceedButton = document.createElement('button');
  proceedButton.className = 'end-btn primary';
  proceedButton.textContent = 'Proceed to Secret Boss';
  proceedButton.addEventListener('click', () => {
    if (onProceed) return onProceed();
    if (onReturnToMap) return onReturnToMap();
    if (onMainMenu) return onMainMenu();
  });

  const mapButton = document.createElement('button');
  mapButton.className = 'end-btn ghost';
  mapButton.textContent = 'Return to Map';
  mapButton.addEventListener('click', () => {
    if (onReturnToMap) return onReturnToMap();
    if (onMainMenu) return onMainMenu();
    window.location.href = '/';
  });

  actionRow.appendChild(proceedButton);
  actionRow.appendChild(mapButton);

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(divider);
  card.appendChild(body);
  card.appendChild(progressInfo);
  card.appendChild(actionRow);

  overlay.appendChild(card);

  document.body.appendChild(overlay);
}

export function hideEndGameScreen() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('end-game-screen');
  if (el) el.remove();
  const canvas = document.querySelector('canvas');
  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.display = '';
  }
}

export function isEndGameScreenVisible(): boolean {
  if (typeof document === 'undefined') return false;
  return document.getElementById('end-game-screen') !== null;
}

export default { showEndGameScreen, hideEndGameScreen };
