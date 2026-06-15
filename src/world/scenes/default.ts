import {
  createGraphicsDevice,
  AppBase,
  AppOptions,
  RenderComponentSystem,
  CameraComponentSystem,
  ScriptComponentSystem,
  LightComponentSystem,
  CollisionComponentSystem,
  RigidBodyComponentSystem,
  TextureHandler,
  ContainerHandler,
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
  Entity,
  Color,
  Vec3,
  Picker,
  EVENT_MOUSEMOVE,
  EVENT_MOUSEUP,
  TouchDevice,
  Mouse,
  MeshInstance,
  Texture,
  StandardMaterial,
  Asset,
  AssetListLoader,
  TEXTURETYPE_RGBP,
  Mesh,
  SphereGeometry,
  EVENT_MOUSEDOWN,
  BLEND_ADDITIVE,
  CULLFACE_FRONT,
} from "playcanvas";
// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { Grid } from 'playcanvas/scripts/esm/grid.mjs';

import { throttle } from '../../utils';
import textureUrl from '../../assets/world/earth_texture.jpg'
import { Battle } from '../Battle';
import { Question } from '../../util/question';
import { battleSummaries } from './battleSummaries';

// @ts-expect-error - local JS utility has no .d.ts declarations
import { applySphereHeightmap } from '../../../scripts/world/sphereHeightmap.js';
// @ts-expect-error - local JS utility has no .d.ts declarations
import { applySphereTexture } from '../../../scripts/world/sphereTexture.js';
import { unloadAll } from '../../util/unloadall';
import { getSecretsFound, TOTAL_SECRETS_AVAILABLE } from '../secrets';

//battles
import { battleOfLegnicaScene } from "./battleOfLegnica";
import { battleOfAinJalutScene } from "./battleOfAinJalut";
import { siegeOfConstantinopleScene } from "./siegeOfConstantinople";
import { battleOfAgincourtScene } from "./battleOfAgincourt.js";
import { siegeOfOrleansScene } from "./siegeOfOrleans.js";
import { battleOfRidaniyaScene } from "./battleOfRidaniya.js";
import { battleOfPaviaScene } from "./battleOfPavia.js";
import { siegeOfViennaScene } from "./siegeOfVienna.js";
import { battleOfYorktownScene } from "./battleOfYorktown.js";
import { battleOfThreeEmperorsScene } from "./battleOfThreeEmperors.js";
import { battleOfGettysburgScene } from "./battleOfGettysburg.js";
import { battleOfVerdunScene } from "./battleOfVerdun.js";
import { battleOfGallipoliScene } from "./battleOfGallipoli.js";
import { battleOfStalingradScene } from "./battleOfStalingrad.js";
import { battleOfChosinReservoirScene } from "./battleOfChosinReservoir.js";
import { fallOfSaigonScene } from "./fallOfSaigon.js";
import { operationAbireyHalevScene } from "./operationAbireyHalev.js";
import { operationAnacondaScene } from "./operationAnaconda.js";
import { battleOfKyivScene } from "./battleOfKyiv.js";
import { operationArnonScene } from "./operationArnon.js";
import { battleOfNorthwoodHighScene } from "./battleOfNorthwoodHigh.js";
// battles

const DEFAULT_COLOR = new Color(1, 1, 1);
const BEAM_COLOR = new Color(0.2, 0.68, 1);
const BEAM_HOVER_COLOR = new Color(0.62, 0.9, 1);
const BEAM_DIFFUSE = new Color(0.02, 0.08, 0.14);
const SPHERE_SEGMENTS = 256;

// Assets to load
const assets = {
  envAtlas: new Asset('env-atlas', 'texture', { url: '/environment-map.png' }, {
    type: TEXTURETYPE_RGBP,
    mipmaps: false
  })
};

function pointOnSphere(radius: number, phi: number, theta: number): Vec3 {
  return new Vec3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function normalOnSphere(point: Vec3): Vec3 {
  return point.clone().normalize();
}

function latLonToSpherical(lat: number, lon: number): { phi: number; theta: number } {
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  return {
    phi: Math.PI / 2 - latRad,
    theta: Math.PI / 2 - lonRad
  };
}

function createStarfieldTexture(device: AppBase['graphicsDevice'], width = 1024, height = 512): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Texture(device!, { mipmaps: true, name: 'starfield-fallback' });
  }

  const baseGradient = ctx.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, '#05040d');
  baseGradient.addColorStop(0.45, '#0b1229');
  baseGradient.addColorStop(1, '#020209');
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width * 0.5, height * 0.5);
  ctx.rotate(-0.35);
  const bandGradient = ctx.createRadialGradient(0, 0, height * 0.05, 0, 0, height * 0.8);
  bandGradient.addColorStop(0, 'rgba(130, 190, 255, 0.35)');
  bandGradient.addColorStop(0.35, 'rgba(72, 120, 210, 0.18)');
  bandGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bandGradient;
  ctx.fillRect(-width, -height * 0.32, width * 2, height * 0.64);
  ctx.restore();

  const nebulae = [
    { x: width * 0.18, y: height * 0.28, r: width * 0.18, color: 'rgba(112, 140, 255, 0.22)' },
    { x: width * 0.72, y: height * 0.22, r: width * 0.14, color: 'rgba(220, 130, 255, 0.16)' },
    { x: width * 0.76, y: height * 0.7, r: width * 0.2, color: 'rgba(70, 200, 255, 0.18)' },
  ];

  nebulae.forEach((nebula) => {
    const glow = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.r);
    glow.addColorStop(0, nebula.color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(nebula.x, nebula.y, nebula.r, 0, Math.PI * 2);
    ctx.fill();
  });

  const starCount = 1400;
  for (let i = 0; i < starCount; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() < 0.92 ? 1 : 2;
    const alpha = 0.4 + Math.random() * 0.6;
    const tint = Math.random();
    const r = Math.floor(200 + tint * 55);
    const g = Math.floor(210 + tint * 45);
    const b = Math.floor(235 + tint * 20);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  for (let i = 0; i < 80; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
    glow.addColorStop(0, 'rgba(230, 245, 255, 0.8)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new Texture(device!, { mipmaps: true, name: 'starfield' });
  texture.setSource(canvas);
  return texture;
}

function configureBeamMaterial(material: StandardMaterial) {
  material.diffuse.copy(BEAM_DIFFUSE);
  material.emissive.copy(BEAM_COLOR);
  material.emissiveIntensity = 2.2;
  material.opacity = 0.95;
  material.blendType = BLEND_ADDITIVE;
  material.update();
}

function setBeamHighlight(material: StandardMaterial, isActive: boolean) {
  material.emissive.copy(isActive ? BEAM_HOVER_COLOR : BEAM_COLOR);
  material.emissiveIntensity = isActive ? 2.8 : 2.2;
  material.opacity = isActive ? 1 : 0.95;
  material.update();
}

async function defaultScene(
  canvas: HTMLCanvasElement,
  app: AppBase,
  onClick: (battle: Battle) => void,
  _getSelectedTimePeriod: () => number,
  sceneNum: number
) {

  unloadAll(app);

  // Remove stale hover label from a previous defaultScene invocation
  const staleLabel = document.getElementById('battle-hover-label');
  if (staleLabel) staleLabel.remove();
  // precision on location here is very arbitrary. 3-4 decimals should be enough.
  const battles = [
                   new Battle(1, [51.145278, 16.222778], "Battle of Legnica", new Entity()),
                   new Battle(1, [32.5486, 35.4161], "Battle of Ain Jalut", new Entity()),
                   new Battle(1, [41.0151, 28.9793], "Siege of Constantinople", new Entity()),
                   new Battle(2, [50.4637, 2.1389], "Battle of Agincourt", new Entity()),
                   new Battle(2, [47.9025, 1.9090], "Siege of Orléans", new Entity()),
                   new Battle(2, [41.0151, 28.9793], "Fall of Constantinople", new Entity()),
                   new Battle(3, [30.0667, 31.2167], "Battle of Ridaniya", new Entity()),
                   new Battle(3, [45.183, 9.150], "Battle of Pavia (Italian Wars)", new Entity()),
                   new Battle(3, [48.2017, 16.3350], "Siege of Vienna", new Entity()), // winged hussars my goat <- even though they decimated the Ottomans they're cool as fuck
                   new Battle(4, [37.2388, -76.5098], "Battle of Yorktown", new Entity()),
                   new Battle(4, [49.128, 16.763], "Battle of Three Emperors", new Entity()),
                   new Battle(4, [39.8309, -77.2333], "Battle of Gettysburg", new Entity()),
                   new Battle(5, [49.20806, 5.42194], "Battle of Verdun", new Entity()),
                   new Battle(5, [40.23923, 26.27684], "Battle of Gallipoli", new Entity()),
                   new Battle(5, [48.8024, 44.6053], "Battle of Stalingrad", new Entity()),
                   new Battle(6, [40.4833, 127.2000], "Battle of Chosin Reservoir", new Entity()),
                   new Battle(6, [10.82310, 106.62966], "Fall of Saigon", new Entity()), // I hate this battle with all my heart, getting the buildings is a pain in the ass
                   new Battle(6, [30.56, 32.32], "Operation Abirey-Halev", new Entity()),
                   new Battle(7, [33.6667, 69.1833], "Operation Anaconda", new Entity()),
                   new Battle(7, [50.450001, 30.523333], "Battle of Kyiv", new Entity()),
                   new Battle(7, [31.4486, 34.3925], "Operation Arnon", new Entity()),
                   new Battle(8, [39.0356, -77.0228], "Northwood High School", new Entity())
                  ];
  if (!canvas) {
    throw new Error('Canvas not found');
  }

  let device = app.graphicsDevice;
  if (!device) {
    // Create graphics device
    device = await createGraphicsDevice(canvas);

    // Create app options
    const createOptions = new AppOptions();
    createOptions.graphicsDevice = device;
    createOptions.mouse = new Mouse(document.body);
    createOptions.touch = new TouchDevice(document.body);
    createOptions.componentSystems = [
      RenderComponentSystem,
      CameraComponentSystem,
      ScriptComponentSystem,
      LightComponentSystem,
      CollisionComponentSystem,
      RigidBodyComponentSystem
    ];
    createOptions.resourceHandlers = [TextureHandler, ContainerHandler];

    app.init(createOptions);
  }

  // Set the canvas to fill the window
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);

  // Ensure canvas is resized when window changes size
  const resize = () => app.resizeCanvas();
  window.addEventListener('resize', resize);

const cleanupResize = () => {
window.removeEventListener('resize', resize);
};
app.once('destroy', cleanupResize);
const keyedAppForCleanup = app as AppBase & Record<string, unknown>;
const cleanupKey = '__sceneCleanupHandlers';
if (!Array.isArray(keyedAppForCleanup[cleanupKey])) {
keyedAppForCleanup[cleanupKey] = [];
}
(keyedAppForCleanup[cleanupKey] as (() => void)[]).push(cleanupResize);

  // Load assets
  await new Promise<void>((resolve) => {
    new AssetListLoader(Object.values(assets), app.assets).load(() => resolve());
  });

  const startKey = '__appStarted';
  const keyedApp = app as AppBase & Record<string, unknown>;
  if (!keyedApp[startKey]) {
    app.start();
    keyedApp[startKey] = true;
  }

  // Create overlay UI
  const overlay = document.querySelector('.absolute.overlay') as HTMLElement;
  let selectedTimePeriod = -1;
  // the empty div id="time-period" is required or shit breaks idk
const overlayHTML = `
<div class="default-scene-ui">
<div class="grow" style="min-height: 0;">
<header>
</header>
</div>
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; align-items: center; position: relative;">
        <div class="pill" id="question-wrap" style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2; padding: 10px 12px; gap: 8px; font-size: 0.82rem; line-height: 1.25; max-width: 320px; text-align: center;">
          <div id="question-text" style="font-size: 0.9rem;">(no question loaded)</div>
          <div class="btn-row" style="gap: 6px; justify-content: center;">
            <button id="yes-btn" class="btn" style="padding: 6px 10px; font-size: 0.78rem;">Load question (test)</button>
          </div>
          <div class="btn-row" id="answers-row-1" style="display: none; gap: 6px; justify-content: center;">
            <button id="answer-btn-1" class="btn" style="padding: 6px 10px; font-size: 0.78rem;">Answer 1</button>
            <button id="answer-btn-2" class="btn" style="padding: 6px 10px; font-size: 0.78rem;">Answer 2</button>
          </div>
          <div class="btn-row" id="answers-row-2" style="display: none; gap: 6px; justify-content: center;">
            <button id="answer-btn-3" class="btn" style="padding: 6px 10px; font-size: 0.78rem;">Answer 3</button>
            <button id="answer-btn-4" class="btn" style="padding: 6px 10px; font-size: 0.78rem;">Answer 4</button>
          </div>
          <div id="answer-result" style="font-size: 0.78rem;">Pick a time period, then load a question.</div>
        </div>
        <div class="pill" id="time-periods" style="position: absolute; bottom: 12px; left: 12px; z-index: 2; padding: 10px 12px; gap: 6px; font-size: 0.82rem; line-height: 1.25; max-width: 420px;">
          <div id="Selection" style="font-size: 0.78rem;">(Select the time period you want!)</div>
          <div id="time-period" style="font-size: 0.78rem;"></div>
          <div class="btn-row" style="gap: 6px; flex-wrap: wrap;">
            <button id="period1-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">1200-1300</button>
            <button id="period2-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">1400-1500</button>
            <button id="period3-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">1500-1700</button>
            <button id="period4-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">1700-1900</button>
            <button id="period5-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">1900-1945</button>
            <button id="period6-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">1945-2000</button>
            <button id="period7-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem;">2000-2026</button>
            <button id="period8-btn" class="btn" style="padding: 6px 10px; font-size: 0.72rem; background: rgba(40,0,0,0.5); color: #ff4444; border: 1px solid rgba(255,68,68,0.3); font-family: 'Courier New', monospace; letter-spacing: 0.1em;">∞</button>
          </div>
        </div>
      </div>
    </div>
  `;

// Insert overlay into overlay element (clear any stale content first)
overlay.replaceChildren();
const overlayContainer = document.createElement('div');
overlayContainer.innerHTML = overlayHTML;
overlay.appendChild(overlayContainer.firstElementChild as HTMLElement);

  // Set up overlay event listeners
  const yesBtn = document.getElementById('yes-btn') as HTMLButtonElement | null;
  const questionTextEl = document.getElementById('question-text') as HTMLElement | null;
  const answerResultEl = document.getElementById('answer-result') as HTMLElement | null;
  const answerRow1 = document.getElementById('answers-row-1') as HTMLElement | null;
  const answerRow2 = document.getElementById('answers-row-2') as HTMLElement | null;
  const answerButtons = [
    document.getElementById('answer-btn-1') as HTMLButtonElement | null,
    document.getElementById('answer-btn-2') as HTMLButtonElement | null,
    document.getElementById('answer-btn-3') as HTMLButtonElement | null,
    document.getElementById('answer-btn-4') as HTMLButtonElement | null,
  ];
  const timePeriodButtons = [
    document.getElementById('period1-btn') as HTMLButtonElement | null,
    document.getElementById('period2-btn') as HTMLButtonElement | null,
    document.getElementById('period3-btn') as HTMLButtonElement | null,
    document.getElementById('period4-btn') as HTMLButtonElement | null,
    document.getElementById('period5-btn') as HTMLButtonElement | null,
    document.getElementById('period6-btn') as HTMLButtonElement | null,
    document.getElementById('period7-btn') as HTMLButtonElement | null,
    document.getElementById('period8-btn') as HTMLButtonElement | null,
  ];
  const timePeriodText = document.getElementById('time-period') as HTMLElement | null;
  let activeCorrectAnswer = '';

  const setAnswerControlsVisible = (visible: boolean) => {
    if (answerRow1) {
      answerRow1.style.display = visible ? 'flex' : 'none';
    }
    if (answerRow2) {
      answerRow2.style.display = visible ? 'flex' : 'none';
    }
  };

  setAnswerControlsVisible(false);

  if (answerButtons.every(btn => btn !== null)) {
    // Option buttons stay disabled until a question is loaded.
    answerButtons.forEach((btn) => {
      btn!.disabled = true;
      btn!.addEventListener('click', () => {
        if (!activeCorrectAnswer || !answerResultEl) return;
        const selectedAnswer = btn!.textContent ?? '';
        if (selectedAnswer === activeCorrectAnswer) {
          answerResultEl.textContent = 'Correct answer!';
        } else {
          answerResultEl.textContent = `Incorrect. Correct answer: ${activeCorrectAnswer}`;
        }
      });
    });
  }

  if (yesBtn && questionTextEl && answerResultEl && answerButtons.every(btn => btn !== null)) {
    yesBtn.addEventListener('click', () => {
      const loadedQuestion = Question.getRandomQuestionWithChoices(selectedTimePeriod);
      if (!loadedQuestion) {
        questionTextEl.textContent = '(no question loaded)';
        answerResultEl.textContent = 'No question data available for this period.';
        answerButtons.forEach((btn) => {
          btn!.disabled = true;
          btn!.textContent = 'N/A';
        });
        setAnswerControlsVisible(false);
        activeCorrectAnswer = '';
        return;
      }

      questionTextEl.textContent = loadedQuestion.question;
      activeCorrectAnswer = loadedQuestion.correctAnswer;
      answerResultEl.textContent = 'Choose one answer.';
      setAnswerControlsVisible(true);

      // Each load randomizes option order, then maps them onto the 4 answer buttons.
      answerButtons.forEach((btn, index) => {
        btn!.textContent = loadedQuestion.choices[index] ?? 'N/A';
        btn!.disabled = false;
      });
    });
  }

  // Period 8 (∞) is gated behind collecting every secret in the game. Hide the
  // button until the player has them all — re-showing it on their next visit
  // to this scene once `getSecretsFound()` catches up to `TOTAL_SECRETS_AVAILABLE`.
  const period8Btn = timePeriodButtons[7];
  if (period8Btn && getSecretsFound() < TOTAL_SECRETS_AVAILABLE) {
    period8Btn.style.display = 'none';
  }

  if (timePeriodButtons.every(btn => btn !== null) && timePeriodText) {
    timePeriodButtons.forEach((btn, index) => {
      btn!.addEventListener('click', () => {
        const period = index + 1;
        // Defense-in-depth: even if a future code path programmatically clicks
        // or focuses the period-8 button, don't unlock it without all secrets.
        if (period === 8 && getSecretsFound() < TOTAL_SECRETS_AVAILABLE) {
          return;
        }
        selectedTimePeriod = period;
        renderBattlesForPeriod(period);
      });
    });
  }

  const onClickWithCounter = (battle: Battle) => onClick(battle);

// Set up environment lighting (no skybox, just IBL)
app.scene.envAtlas = assets.envAtlas.resource as Texture;
app.scene.skyboxIntensity = 1;
app.scene.ambientLight = new Color(0, 0, 0);
const skyboxLayer = app.scene.layers.getLayerByName('Skybox');
  if (skyboxLayer) {
    skyboxLayer.enabled = true;
  }

  // Create a new material
  const material = new StandardMaterial();
  material.diffuse.copy(DEFAULT_COLOR);
  (material as any).vertexColors = true;
  material.update();

  // Create starfield backdrop
  const starMaterial = new StandardMaterial();
  starMaterial.diffuse.set(0, 0, 0);
  starMaterial.emissive.set(1, 1, 1);
  starMaterial.emissiveMap = createStarfieldTexture(device);
  starMaterial.cull = CULLFACE_FRONT;
  starMaterial.update();

  // Create sphere entity (heightmap-ready sphere)
  const sphere = new Entity('heightmap-sphere');
  sphere.setPosition(new Vec3(0, 0.5, 0));
  const sphereMesh = Mesh.fromGeometry(app.graphicsDevice, new SphereGeometry({
    radius: 1,
    latitudeBands: SPHERE_SEGMENTS,
    longitudeBands: SPHERE_SEGMENTS
  }));
  sphere.addComponent('render', {
    meshInstances: [new MeshInstance(sphereMesh, material)]
  });
  app.root.addChild(sphere);

  const starDome = new Entity('star-dome');
  const starMesh = Mesh.fromGeometry(app.graphicsDevice, new SphereGeometry({
    radius: 18,
    latitudeBands: 64,
    longitudeBands: 64
  }));
  starDome.addComponent('render', {
    meshInstances: [new MeshInstance(starMesh, starMaterial)]
  });
  if (skyboxLayer && starDome.render) {
    starDome.render.layers = [skyboxLayer.id];
  }
  app.root.addChild(starDome);

  // Create camera entity
  const camera = new Entity('camera');
  camera.addComponent('camera', {
    clearColor: new Color(0.02, 0.02, 0.05)
  });
  camera.setPosition(new Vec3(4, 1, 4));
  app.root.addChild(camera);
  camera.lookAt(sphere.getPosition());


  // Create a picker for mouse interaction
  const picker = new Picker(app, 1, 1);
  const worldLayer = app.scene.layers.getLayerByName('World');

  // Create hover label for battle names
  const hoverLabel = document.createElement('div');
  hoverLabel.id = 'battle-hover-label';
  hoverLabel.style.position = 'absolute';
  hoverLabel.style.display = 'none';
  hoverLabel.style.pointerEvents = 'none';
  document.body.appendChild(hoverLabel);
  const cleanupHoverLabel = () => {
    try { hoverLabel.remove(); } catch(e) { /* ignore */ }
  };
app.once('destroy', cleanupHoverLabel);
(keyedAppForCleanup[cleanupKey] as (() => void)[]).push(cleanupHoverLabel);
(keyedAppForCleanup[cleanupKey] as (() => void)[]).push(() => { overlay.replaceChildren(); });

  // Create briefing screen overlay
  const briefingOverlay = document.createElement('div');
  briefingOverlay.id = 'briefing-overlay';
  briefingOverlay.style.position = 'fixed';
  briefingOverlay.style.top = '0';
  briefingOverlay.style.left = '0';
  briefingOverlay.style.width = '100%';
  briefingOverlay.style.height = '100%';
  briefingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  briefingOverlay.style.display = 'none';
  briefingOverlay.style.zIndex = '1000';
  briefingOverlay.style.pointerEvents = 'auto';
  document.body.appendChild(briefingOverlay);
  const cleanupBriefingOverlay = () => {
    try { briefingOverlay.remove(); } catch(e) { /* ignore */ }
  };
app.once('destroy', cleanupBriefingOverlay);
(keyedAppForCleanup[cleanupKey] as (() => void)[]).push(cleanupBriefingOverlay);

  let isDragging = false;
  let currentBattle: Battle | null = null;

  app.mouse?.on(EVENT_MOUSEDOWN, (event) => {
    isDragging = event.button === 0;
  });

  app.mouse?.on(EVENT_MOUSEUP, () => {
    isDragging = false;
  });

  app.mouse?.on(EVENT_MOUSEMOVE, (event) => {
    if (isDragging) {
      sphere.rotateLocal(0, event.dx * 0.2, 0);
    }
  });

  // Track battle entities for cleanup
  let battleEntities: Entity[] = [];
  let battleMaterials: Map<Entity, StandardMaterial> = new Map();
  let entityToBattle: Map<Entity, Battle> = new Map();
  let hoveredBattle: Entity | null = null;

  // Function to show briefing screen when a battle is clicked
  const showBriefing = (battle: Battle, onConfirm: () => void) => {
    const summary = battleSummaries[battle.getName()];
    
    if (!summary) {
      console.warn('No briefing found for battle:', battle.getName());
      // If no briefing, just call the scene directly
      onConfirm();
      return;
    }
    
    // Build the briefing HTML
    briefingOverlay.innerHTML = `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        max-width: 900px;
        max-height: 85vh;
        overflow-y: auto;
        background: linear-gradient(145deg, rgba(30, 20, 10, 0.95), rgba(15, 10, 5, 0.98));
        border: 2px solid rgba(255, 200, 100, 0.4);
        border-radius: 12px;
        padding: 32px 40px;
        color: #f0e0c0;
        font-family: 'Georgia', serif;
        box-shadow: 0 0 60px rgba(255, 200, 100, 0.2), inset 0 0 100px rgba(0, 0, 0, 0.7);
      ">
        <div style="
          font-size: 2.5em;
          font-weight: bold;
          text-align: center;
          margin-bottom: 8px;
          color: #ffd700;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
          border-bottom: 2px solid rgba(255, 200, 100, 0.3);
          padding-bottom: 16px;
        ">
          ${summary.name}
        </div>
        
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin: 24px 0;
          font-size: 0.95em;
          line-height: 1.6;
        ">
          <div style="
            background: rgba(255, 200, 100, 0.05);
            border: 1px solid rgba(255, 200, 100, 0.2);
            border-radius: 8px;
            padding: 16px;
          ">
            <div style="
              font-size: 0.85em;
              color: #cca352;
              font-weight: bold;
              margin-bottom: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            ">Date</div>
            <div style="color: #f0e0c0;">${summary.date}</div>
          </div>
          
          <div style="
            background: rgba(255, 200, 100, 0.05);
            border: 1px solid rgba(255, 200, 100, 0.2);
            border-radius: 8px;
            padding: 16px;
          ">
            <div style="
              font-size: 0.85em;
              color: #cca352;
              font-weight: bold;
              margin-bottom: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            ">Location</div>
            <div style="color: #f0e0c0;">${summary.location}</div>
          </div>
        </div>
        
        <div style="margin: 24px 0;">
          <div style="
            font-size: 0.85em;
            color: #cca352;
            font-weight: bold;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid rgba(255, 200, 100, 0.2);
            padding-bottom: 8px;
          ">Historical Context</div>
          <div style="
            line-height: 1.8;
            text-align: justify;
            font-size: 1em;
          ">${summary.historicalContext}</div>
        </div>
        
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 24px;
          margin: 24px 0;
          padding: 24px;
          background: rgba(255, 200, 100, 0.03);
          border: 2px solid rgba(255, 200, 100, 0.15);
          border-radius: 10px;
        ">
          <div style="text-align: center;">
            <div style="
              font-size: 0.85em;
              color: #ff6b6b;
              font-weight: bold;
              margin-bottom: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            ">Side A</div>
            <div style="font-size: 1.1em; margin-bottom: 6px; color: #f0e0c0;">${summary.combatants.sideA.name}</div>
            <div style="font-size: 1.4em; font-weight: bold; color: #ff9999;">${summary.combatants.sideA.strength.toLocaleString()}</div>
            <div style="font-size: 0.85em; color: #b8860b;">troops</div>
          </div>
          
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2em;
            color: #b8860b;
            font-weight: bold;
          ">VS</div>
          
          <div style="text-align: center;">
            <div style="
              font-size: 0.85em;
              color: #6b9fff;
              font-weight: bold;
              margin-bottom: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            ">Side B</div>
            <div style="font-size: 1.1em; margin-bottom: 6px; color: #f0e0c0;">${summary.combatants.sideB.name}</div>
            <div style="font-size: 1.4em; font-weight: bold; color: #99bbff;">${summary.combatants.sideB.strength.toLocaleString()}</div>
            <div style="font-size: 0.85em; color: #b8860b;">troops</div>
          </div>
        </div>
        
        <div style="
          margin: 24px 0;
          padding: 24px;
          background: linear-gradient(135deg, rgba(255, 200, 100, 0.08), rgba(255, 200, 100, 0.02));
          border-left: 4px solid #ffd700;
          border-radius: 8px;
          font-style: italic;
          font-size: 1.1em;
          line-height: 1.7;
          color: #ffe4a0;
        ">
          <div style="font-size: 0.75em; color: #b8860b; margin-bottom: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Commander's Briefing</div>
          ${summary.briefingMessage && summary.briefingMessage !== '[Your briefing message here - to be written]' ? summary.briefingMessage : '<em style="color: #b8860b;">[Awaiting commander\'s briefing - to be written]</em>'}
        </div>
        
        <div style="
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 2px solid rgba(255, 200, 100, 0.3);
        ">
          <button id="briefing-cancel-btn" style="
            padding: 14px 40px;
            font-size: 1.1em;
            background: rgba(100, 50, 30, 0.6);
            color: #f0e0c0;
            border: 2px solid rgba(200, 100, 80, 0.5);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          ">Return to Map</button>
          
          <button id="briefing-confirm-btn" style="
            padding: 14px 40px;
            font-size: 1.1em;
            background: linear-gradient(135deg, rgba(255, 200, 100, 0.3), rgba(255, 150, 50, 0.4));
            color: #fff8e0;
            border: 2px solid rgba(255, 200, 100, 0.6);
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.2s;
            box-shadow: 0 0 20px rgba(255, 200, 100, 0.3);
          ">Engage Battle</button>
        </div>
      </div>
    `;
    
    // Add hover effects to buttons
    const cancelBtn = document.getElementById('briefing-cancel-btn');
    const confirmBtn = document.getElementById('briefing-confirm-btn');
    
    if (cancelBtn) {
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'rgba(150, 80, 50, 0.8)';
        cancelBtn.style.borderColor = 'rgba(255, 150, 100, 0.7)';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'rgba(100, 50, 30, 0.6)';
        cancelBtn.style.borderColor = 'rgba(200, 100, 80, 0.5)';
      });
      cancelBtn.addEventListener('click', () => {
        briefingOverlay.style.display = 'none';
      });
    }
    
    if (confirmBtn) {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = 'linear-gradient(135deg, rgba(255, 220, 120, 0.5), rgba(255, 180, 80, 0.6))';
        confirmBtn.style.boxShadow = '0 0 40px rgba(255, 200, 100, 0.6)';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = 'linear-gradient(135deg, rgba(255, 200, 100, 0.3), rgba(255, 150, 50, 0.4))';
        confirmBtn.style.boxShadow = '0 0 20px rgba(255, 200, 100, 0.3)';
      });
      confirmBtn.addEventListener('click', () => {
        briefingOverlay.style.display = 'none';
        onConfirm();
      });
    }
    
    // Show the briefing overlay
    briefingOverlay.style.display = 'block';
  };

  // Helper function to check if mouse intersects a battle entity
  const checkBattleIntersection = async (x: number, y: number): Promise<Entity | null> => {
    if (!worldLayer || !camera.camera) return null;

    const pickerScale = 0.5;
    picker.resize(canvas.clientWidth * pickerScale, canvas.clientHeight * pickerScale);
    picker.prepare(camera.camera, app.scene, [worldLayer]);

    const meshInstances = await picker.getSelectionAsync(x * pickerScale, y * pickerScale, 1, 1);
    const selectedMesh = meshInstances.find((instance): instance is MeshInstance => instance instanceof MeshInstance);
    
    if (!selectedMesh) return null;

    // Find which battle entity was clicked
    for (const entity of battleEntities) {
      const renderComponent = entity.render;
      if (renderComponent?.meshInstances[0] === selectedMesh) {
        return entity;
      }
    }
    
    return null;
  };

  // On mouse move, check hovering over any battle and update colors
  app.mouse?.on(EVENT_MOUSEMOVE, throttle((event) => {
    if (isDragging) {
      hoverLabel.style.display = 'none';
      return;
    }
    
    checkBattleIntersection(event.x, event.y).then((intersectedEntity) => {
      // Reset previously hovered entity color
      if (hoveredBattle && hoveredBattle !== intersectedEntity) {
        const material = battleMaterials.get(hoveredBattle);
        if (material) {
          setBeamHighlight(material, false);
        }
      }

      // Update hovered entity
      if (intersectedEntity) {
        hoveredBattle = intersectedEntity;
        const material = battleMaterials.get(intersectedEntity);
        if (material) {
          setBeamHighlight(material, true);
        }
        document.body.style.cursor = 'pointer';
        const battle = entityToBattle.get(intersectedEntity);
        if (battle) {
          hoverLabel.textContent = battle.getName();
          hoverLabel.style.left = (event.x + 12) + 'px';
          hoverLabel.style.top = (event.y + 12) + 'px';
          hoverLabel.style.display = 'block';
        }
      } else {
        hoveredBattle = null;
        document.body.style.cursor = 'default';
        hoverLabel.style.display = 'none';
      }
    });
  }, 100));

  // On mouse up, check if clicked on battle and call onClick
  app.mouse?.on(EVENT_MOUSEUP, (event) => {
    if (isDragging || !onClickWithCounter) return;
    
    checkBattleIntersection(event.x, event.y).then((intersectedEntity) => {
      if (!intersectedEntity) return;

      const battle = entityToBattle.get(intersectedEntity);
      if (!battle) return;

      // Show briefing screen before loading the scene
      console.log('Clicked on battle:', battle.getName());
      
      // Create a wrapper function to load the scene
      const loadScene = () => {
        if (battle.getName() === 'Battle of Legnica') {
          battleOfLegnicaScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
          // ^^^ scene functions should always be defined as HTMLCanvasElement, AppBase, onClick callback, sceneNum
        }
        else if (battle.getName() === 'Battle of Ain Jalut') {
          battleOfAinJalutScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());  
        }
        else if (battle.getName() === 'Siege of Constantinople') {
          siegeOfConstantinopleScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Agincourt') {
          battleOfAgincourtScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Siege of Orléans') {
          siegeOfOrleansScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Fall of Constantinople') {
          siegeOfConstantinopleScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Ridaniya') {
          battleOfRidaniyaScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Pavia (Italian Wars)') {
          battleOfPaviaScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Siege of Vienna') {
          siegeOfViennaScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Yorktown') {
          battleOfYorktownScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Three Emperors') {
          battleOfThreeEmperorsScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Gettysburg') {
          battleOfGettysburgScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Verdun') {
          battleOfVerdunScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Gallipoli') {
          battleOfGallipoliScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Stalingrad') {
          battleOfStalingradScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Chosin Reservoir') {
          battleOfChosinReservoirScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Fall of Saigon') {
          fallOfSaigonScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Operation Abirey-Halev') {
          operationAbireyHalevScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Operation Anaconda') {
          operationAnacondaScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Battle of Kyiv') {
          battleOfKyivScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Operation Arnon') {
          operationArnonScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        else if (battle.getName() === 'Northwood High School') {
          battleOfNorthwoodHighScene(canvas, app, onClickWithCounter, sceneNum, battle.getSpawnPoint());
        }
        onClickWithCounter(battle);
      };
      
      // Show the briefing screen
      showBriefing(battle, loadScene);
    });
  });
  await applySphereTexture(sphere, textureUrl, device);

  // Function to render battles for selected time period
  const renderBattlesForPeriod = (timePeriod: number) => {
    // Clear previous battle entities
    battleEntities.forEach(entity => entity.destroy());
    battleEntities = [];
    battleMaterials.clear();
    entityToBattle.clear();
    hoveredBattle = null;
    currentBattle = null;
  
    // Create battle markers for the selected period
    battles.forEach((battle) => {
      if (battle.getTimePeriod() === timePeriod) {
        const [lat, lon] = battle.getLocation();
        const { phi, theta } = latLonToSpherical(lat, lon);

        const battlePoint = pointOnSphere(1, phi, theta);
        const battleNormal = normalOnSphere(battlePoint);

        // Create a unique material for this battle
        const battleMaterial = new StandardMaterial();
        configureBeamMaterial(battleMaterial);

        const battleEntity = new Entity(battle.getName());
        battleEntity.addComponent('render', {
          type: 'cylinder',
          material: battleMaterial
        });

        const beamOffset = 0.075;
        const beamPosition = battlePoint.clone().add(battleNormal.clone().mulScalar(beamOffset));
        battleEntity.setLocalPosition(beamPosition);
        battleEntity.setLocalScale(0.03, 0.24, 0.03);

        // Align the entity's up-axis (Y) with the normal vector
        const upAxis = new Vec3(0, 1, 0);
        const axis = new Vec3().cross(upAxis, battleNormal).normalize();
        const angle = Math.acos(Math.max(-1, Math.min(1, upAxis.dot(battleNormal))));
        if (axis.length() > 0.001) {
          const halfSin = Math.sin(angle * 0.5);
          battleEntity.setLocalRotation(axis.x * halfSin, axis.y * halfSin, axis.z * halfSin, Math.cos(angle * 0.5));
        }

        sphere.addChild(battleEntity);
        battleEntities.push(battleEntity);
        battleMaterials.set(battleEntity, battleMaterial);
        entityToBattle.set(battleEntity, battle);

        // Set the first battle as current
        if (!currentBattle) {
          currentBattle = battle;
        }
      }
    });

    console.log(`Rendered ${battleEntities.length} battles for period ${timePeriod}`);
  };

  // Initial render with selected time period
  let lastTimePeriod = selectedTimePeriod;
  if (selectedTimePeriod > 0) {
    renderBattlesForPeriod(selectedTimePeriod);
  }

  // Monitor for time period changes and re-render
  const timePeriodCheckInterval = setInterval(() => {
    if (selectedTimePeriod !== lastTimePeriod && selectedTimePeriod > 0) {
      lastTimePeriod = selectedTimePeriod;
      renderBattlesForPeriod(selectedTimePeriod);
    }
  }, 100);

  app.once('destroy', () => {
    clearInterval(timePeriodCheckInterval);
  });

  return renderBattlesForPeriod;
}

export { defaultScene };
