import { AppBase } from "playcanvas";
import { Battle } from './world/Battle';
import { defaultScene } from './world/scenes/default';
import { titleScreen } from "./world/scenes/titleSceen.ts";
import { loadAmmo } from "./ammo.js";
import { hideDeathScreen, showDeathScreen } from "./world/scenes/deathScreen.ts";
import { hideVictoryScreen, showVictoryScreen } from "./world/scenes/victoryScreen.ts";
import { hideEndGameScreen, showEndGameScreen } from "./world/scenes/endGameScreen.ts";
import { Boss } from "./world/npc/bosses/boss.ts";
import { unloadAll } from "./util/unloadall.ts";
import { removeBattleHUD } from "./util/battleHUD";
import { DevConsole } from "./util/devConsole";
import { markBattleComplete, isAllNonSecretComplete } from "./util/battleProgress";

// Suppress unhandled promise rejections that can arise from async events in the game loop.
// This prevents noisy "A listener indicated an asynchronous response..." errors in the console.
window.addEventListener('unhandledrejection', (event) => {
  // Log the error for debugging, but do not let it propagate to the console as a warning.
  console.warn('Suppressed unhandled promise rejection:', event.reason);
});

const SCENE_CLEANUP_HANDLERS_KEY = "__sceneCleanupHandlers";

function runSceneCleanupHandlers(app: AppBase): void {
  const keyedApp = app as AppBase & Record<string, unknown>;
  const handlers = keyedApp[SCENE_CLEANUP_HANDLERS_KEY];
  if (!Array.isArray(handlers)) {
    return;
  }

  while (handlers.length > 0) {
    const handler = handlers.pop();
    if (typeof handler === 'function') {
      try {
        handler();
      } catch (error) {
        console.warn('[Scene] cleanup handler failed', error);
      }
    }
  }
}


/**
 * Setup the PlayCanvas app
 * @param canvas - The canvas element
 * @param onClick - The function to call when the user clicks on the sphere
 */

// App.ts
var sceneNum = -2;
function ensureOverlayRoot(): HTMLElement {
  let overlay = document.querySelector('.absolute.overlay') as HTMLElement | null;
  if (!overlay) {
    const host = document.querySelector('#root > div') as HTMLElement | null ?? document.body;
    overlay = document.createElement('div');
    overlay.className = 'absolute overlay';
    host.appendChild(overlay);
  }

  overlay.style.display = '';
  return overlay;
}

async function setupApp(
  canvas: HTMLCanvasElement,
  onClick: (battle: Battle) => void,
  getSelectedTimePeriod: () => number //yucky
) {
  

  const AmmoLib = await loadAmmo();
  console.log("Ammo initialized", {
    runtime: (globalThis as { __ammoRuntime?: unknown }).__ammoRuntime ?? "unknown",
    api: AmmoLib
  });
  
  
  

  const app = new AppBase(canvas);
  DevConsole.init();
  DevConsole.setApp(app);
  getSelectedTimePeriod(); // call this once to initialize the time period
  
  // If we're starting on the title screen, show it and wait for the user to start
  if (sceneNum === -2) {
    const renderFn = await titleScreen(canvas, app, onClick, getSelectedTimePeriod, sceneNum); 
    // ^^^ scene functions should always be defined as HTMLCanvasElement, AppBase, onClick callback, getSelectedTimePeriod callback (if necessary), sceneNum
    return renderFn;
  }

  if (sceneNum === 0) {
    const renderFn = await defaultScene(canvas, app, onClick, getSelectedTimePeriod, sceneNum);
    return renderFn;
  }
  return undefined;
}

export { setupApp };

export async function changeScene(
 canvas: HTMLCanvasElement,
 app: AppBase,
 sceneNum: number,): Promise<unknown> {
 // Clear transient UI and runtime listeners so a scene switch starts clean.
  hideDeathScreen();
  hideVictoryScreen();
  hideEndGameScreen();
  removeBattleHUD();
 Boss.setActiveBoss(null);
 DevConsole.setPlayer(null);
 DevConsole.setNpcs([]);
 DevConsole.setApp(app);
 (globalThis as any).__devConsolePlayer = null;
 runSceneCleanupHandlers(app);
  const overlay = ensureOverlayRoot();
  overlay.replaceChildren();
  app.mouse?.off();
  app.keyboard?.off();
  app.touch?.off();
  app.off('update');
  unloadAll(app);
  if (sceneNum === -2) {
    return await titleScreen(canvas, app, () => {}, () => 0, sceneNum);
  } else if (sceneNum === 0) {
    return await defaultScene(canvas, app, () => {}, () => 0, sceneNum);
  } else if (sceneNum === 666) {
    return await showDeathScreen({
      app,
      onMainMenu: () => changeScene(canvas, app, 0),
      message: "You have failed to bring glory to the Ottoman Empire. Game Over."
    });
  } else if (sceneNum === 777) {
    const victoryMessage = Boss.consumeLastBossDeathTaunt() ?? "Victory! All enemies defeated.";
    return await showVictoryScreen({
      app,
      onMainMenu: () => changeScene(canvas, app, 0),
      message: victoryMessage
    });
  } else if (sceneNum === 888) {
    return await showEndGameScreen({
      app,
      onProceed: () => changeScene(canvas, app, 0),
      onReturnToMap: () => changeScene(canvas, app, 0),
      onMainMenu: () => changeScene(canvas, app, -2),
    });
  }

  return undefined;
}

export function triggerVictory(battleName: string, canvas: HTMLCanvasElement, app: AppBase): void {
  markBattleComplete(battleName);
  if (battleName !== 'Northwood High School' && isAllNonSecretComplete()) {
    changeScene(canvas, app, 888);
  } else {
    changeScene(canvas, app, 777);
  }
}
