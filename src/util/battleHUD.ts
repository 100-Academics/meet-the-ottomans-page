import { Player } from '../player/player';

type DebugState = ReturnType<Player['getDebugState']> & {
  remainingNpcs?: number;
};

let debugOverlayInitialized = false;
let debugOverlayVisible = false;

function ensureDebugOverlay(): HTMLElement {
  let overlay = document.getElementById('debug-overlay') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'debug-overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div id="debug-overlay-content"></div>
    `;
    document.body.appendChild(overlay);
  }

  return overlay;
}

function setDebugOverlayVisible(visible: boolean): void {
  debugOverlayVisible = visible;
  const overlay = ensureDebugOverlay();
  overlay.style.display = visible ? 'block' : 'none';
}

function toggleDebugOverlay(): void {
  setDebugOverlayVisible(!debugOverlayVisible);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function formatVector(label: string, vector: { x: number; y: number; z: number }): string {
  return `${label}: ${formatNumber(vector.x)}, ${formatNumber(vector.y)}, ${formatNumber(vector.z)}`;
}

function updateDebugOverlayContent(state: DebugState): void {
  const content = document.getElementById('debug-overlay-content');
  if (!content) {
    return;
  }

  content.innerHTML = `
    <div class="debug-title">Debug Overlay</div>
    <div class="debug-row">${formatVector('Position', state.position)}</div>
    <div class="debug-row">${formatVector('Rotation', state.rotation)}</div>
    <div class="debug-row">${formatVector('Forward', state.forward)}</div>
    <div class="debug-row">${formatVector('Velocity', state.velocity)}</div>
    <div class="debug-row">Ground height: ${formatNumber(state.groundHeight)}</div>
    <div class="debug-row">Player height: ${formatNumber(state.playerHeight)}</div>
    <div class="debug-row">Health: ${state.health}/${state.maxHealth}</div>
    <div class="debug-row">Weapon: ${state.weapon}</div>
    <div class="debug-row">NPCs left: ${typeof state.remainingNpcs === 'number' ? Math.max(0, Math.floor(state.remainingNpcs)) : '--'}</div>
    <div class="debug-hint">Press ~ to hide/show</div>
  `;
}

function ensureDebugToggleListener(): void {
  if (debugOverlayInitialized) {
    return;
  }

  debugOverlayInitialized = true;
  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      return;
    }

    const key = event.key;
    if (event.code === 'Backquote' || key === '`' || key === '~') {
      toggleDebugOverlay();
    }
  });
}

export function createBattleHUD() {
  if (document.getElementById('battle-hud')) {
    ensureDebugToggleListener();
    ensureDebugOverlay();
    return; // HUD already exists
  }

  const hud = document.createElement('div');
  hud.id = 'battle-hud';
  hud.innerHTML = `
    <div id="battle-hud-content">
      <div class="hud-row">
        <span class="hud-label">Weapon:</span>
        <span class="hud-value" id="hud-weapon">Sword</span>
      </div>
      <div class="hud-row">
        <span class="hud-label">Health:</span>
        <span class="hud-value" id="hud-health">100/100</span>
      </div>
      <div class="hud-row">
        <span class="hud-label">NPCs left:</span>
        <span class="hud-value" id="hud-npcs">--</span>
      </div>
    </div>
  `;
  document.body.appendChild(hud);
  ensureDebugToggleListener();
  ensureDebugOverlay();

  if (!document.getElementById('battle-crosshair')) {
    const crosshair = document.createElement('div');
    crosshair.id = 'battle-crosshair';
    document.body.appendChild(crosshair);
  }
}

export function removeBattleHUD() {
  const hud = document.getElementById('battle-hud');
  if (hud) {
    hud.remove();
  }

  const crosshair = document.getElementById('battle-crosshair');
  if (crosshair) {
    crosshair.remove();
  }

  setDebugOverlayVisible(false);
}

export function updateBattleHUD(player: Player, remainingNpcs?: number) {
  const weaponEl = document.getElementById('hud-weapon');
  const healthEl = document.getElementById('hud-health');
  const npcCountEl = document.getElementById('hud-npcs');

  if (weaponEl) {
    weaponEl.textContent = player.getEquippedWeaponName();
  }

  if (healthEl) {
    const health = player.getHealth();
    const maxHealth = 100;

    // Remove all status classes
    healthEl.classList.remove('critical', 'warning');

    // Add status class based on health
    if (health <= 25) {
      healthEl.classList.add('critical');
    } else if (health <= 50) {
      healthEl.classList.add('warning');
    }
    
    healthEl.textContent = `${health}/${maxHealth}`;
  }

  if (npcCountEl && typeof remainingNpcs === 'number' && Number.isFinite(remainingNpcs)) {
    npcCountEl.textContent = `${Math.max(0, Math.floor(remainingNpcs))}`;
  }

  updateDebugOverlayContent({
    ...player.getDebugState(),
    remainingNpcs,
  });
}
