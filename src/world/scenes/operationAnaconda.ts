import {
AppBase,
Entity,
Color,
Vec3,
Mouse,
Keyboard,
TouchDevice,
createGraphicsDevice,
AppOptions,
RenderComponentSystem,
CameraComponentSystem,
ScriptComponentSystem,
LightComponentSystem,
CollisionComponentSystem,
RigidBodyComponentSystem,
TextureHandler,
ContainerHandler,
Asset,
AssetListLoader,
TEXTURETYPE_RGBP,
Texture,
StandardMaterial,
MeshInstance,
FILLMODE_FILL_WINDOW,
RESOLUTION_AUTO,
KEY_1,
KEY_2,
Mesh,
SphereGeometry,
CULLFACE_FRONT,
} from "playcanvas";

import { unloadAll } from "../../util/unloadall";
import { loadModel } from "../../util/loadModel";
import { waitForAmmoReady } from "../../util/spawnHelpers";
import {
createBattleHUD,
removeBattleHUD,
updateBattleHUD,
} from "../../util/battleHUD";
import { isDeathScreenVisible } from "./deathScreen";
import { Player } from "../../player/player";
import type { Battle } from "../Battle";
import { bindNpcCombatLoop, spawnSceneNpcs } from "../npc/sceneNpcSystem";
import { Boss } from "../npc/bosses/boss";
import {
DEFAULT_BATTLE_NPC_SPAWN_OPTIONS,
DEFAULT_BIN_LADIN_BOSS_SPAWN_OPTIONS,
ANACONDA_BOSS_SPAWN_POINT,
ANACONDA_NPC_SPAWN_POINTS,
} from "../npc/sceneNpcPresets";
import { Mongol } from "../npc/troops/mongol";
import { npc } from "../npc/npc";
import { triggerVictory } from "../../App";
import { getHighestGroundHitY, getRenderableBounds } from "../../util/battleSceneHelpers";


const groundModelPath = "/world/battlefields/Shahikot.glb";

var isBossSpawned = false;
var isBossSpawning = false;

function resetAnacondaBattleState(): void {
  isBossSpawned = false;
  isBossSpawning = false;
  Mongol.resetBattleState();
}




function createNightSkyTexture(device: AppBase['graphicsDevice'], width = 1024, height = 512): Texture {
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext('2d');
if (!ctx) {
return new Texture(device!, { mipmaps: true, name: 'anaconda-night-sky-fallback' });
}

const baseGradient = ctx.createLinearGradient(0, 0, 0, height);
baseGradient.addColorStop(0, '#02030a');
baseGradient.addColorStop(0.45, '#070d1f');
baseGradient.addColorStop(1, '#090a12');
ctx.fillStyle = baseGradient;
ctx.fillRect(0, 0, width, height);

const haze = ctx.createLinearGradient(0, height * 0.45, 0, height);
haze.addColorStop(0, 'rgba(20, 34, 58, 0)');
haze.addColorStop(1, 'rgba(28, 24, 22, 0.52)');
ctx.fillStyle = haze;
ctx.fillRect(0, 0, width, height);

for (let i = 0; i < 1600; i += 1) {
const x = Math.random() * width;
const y = Math.random() * height * 0.92;
const size = Math.random() < 0.92 ? 1 : 2;
const alpha = 0.35 + Math.random() * 0.65;
const tint = Math.random();
const r = Math.floor(200 + tint * 55);
const g = Math.floor(210 + tint * 40);
const b = Math.floor(230 + tint * 25);
ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
ctx.fillRect(x, y, size, size);
}

const moonX = width * 0.79;
const moonY = height * 0.28;
const moonRadius = height * 0.07;
const moonAspect = 1.35;
const moonGlow = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.2, moonX, moonY, moonRadius * 2.4);
moonGlow.addColorStop(0, 'rgba(255, 245, 212, 0.52)');
moonGlow.addColorStop(0.4, 'rgba(203, 222, 255, 0.26)');
moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = moonGlow;
ctx.beginPath();
ctx.ellipse(moonX, moonY, moonRadius * 2.4 * moonAspect, moonRadius * 2.4, 0, 0, Math.PI * 2);
ctx.fill();

const moonBody = ctx.createRadialGradient(moonX - moonRadius * 0.18, moonY - moonRadius * 0.22, moonRadius * 0.2, moonX, moonY, moonRadius);
moonBody.addColorStop(0, 'rgba(255, 252, 236, 0.96)');
moonBody.addColorStop(1, 'rgba(208, 214, 226, 0.96)');
ctx.fillStyle = moonBody;
ctx.beginPath();
ctx.ellipse(moonX, moonY, moonRadius * moonAspect, moonRadius, 0, 0, Math.PI * 2);
ctx.fill();

ctx.fillStyle = 'rgba(175, 183, 198, 0.38)';
for (let craterIndex = 0; craterIndex < 14; craterIndex += 1) {
const craterAngle = Math.random() * Math.PI * 2;
const craterDistance = Math.random() * moonRadius * 0.74;
const craterX = moonX + Math.cos(craterAngle) * craterDistance;
const craterY = moonY + Math.sin(craterAngle) * craterDistance;
const craterRadius = moonRadius * (0.04 + Math.random() * 0.08);
ctx.beginPath();
ctx.ellipse(craterX, craterY, craterRadius * moonAspect, craterRadius, 0, 0, Math.PI * 2);
ctx.fill();
}

const texture = new Texture(device!, { mipmaps: true, name: 'anaconda-night-sky' });
texture.setSource(canvas);
return texture;
}

function addNightSkyDome(app: AppBase, cameraEntity: Entity): void {
const skyMaterial = new StandardMaterial();
skyMaterial.useLighting = false;
skyMaterial.emissive.set(1, 1, 1);
skyMaterial.emissiveMap = createNightSkyTexture(app.graphicsDevice);
skyMaterial.cull = CULLFACE_FRONT;
skyMaterial.update();

const skyDome = new Entity('anaconda-night-sky-dome');
const skyMesh = Mesh.fromGeometry(app.graphicsDevice, new SphereGeometry({
radius: 260,
latitudeBands: 64,
longitudeBands: 64
}));
skyDome.addComponent('render', {
meshInstances: [new MeshInstance(skyMesh, skyMaterial)]
});
skyDome.setPosition(cameraEntity.getPosition());
app.root.addChild(skyDome);

const keyedApp = app as AppBase & Record<string, unknown>;
const skyFollowKey = '__anacondaSkyFollowUpdate';
const existingSkyFollow = keyedApp[skyFollowKey];
if (typeof existingSkyFollow === 'function') {
app.off('update', existingSkyFollow as (deltaTime: number) => void);
}

const followSky = () => {
const cameraPos = cameraEntity.getPosition();
skyDome.setPosition(cameraPos.x, cameraPos.y, cameraPos.z);
};

keyedApp[skyFollowKey] = followSky;
app.on('update', followSky);
}

function addBattleSmokePlumes(
app: AppBase,
groundEntity: Entity | undefined,
bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } | undefined,
groundY: number
): void {
const smokeAnchors: Vec3[] = [];
if (groundEntity) {
const candidates: Array<{ x: number; y: number; z: number; width: number; depth: number; score: number }> = [];
const visit = (node: Entity) => {
const meshInstances = node.render?.meshInstances;
if (meshInstances && meshInstances.length > 0) {
for (const meshInstance of meshInstances) {
const aabb = meshInstance.aabb;
if (!aabb) {
continue;
}

const min = aabb.getMin();
const max = aabb.getMax();
if (
!Number.isFinite(min.x) ||
!Number.isFinite(min.y) ||
!Number.isFinite(min.z) ||
!Number.isFinite(max.x) ||
!Number.isFinite(max.y) ||
!Number.isFinite(max.z)
) {
continue;
}

const width = max.x - min.x;
const depth = max.z - min.z;
const height = max.y - min.y;
const footprint = width * depth;

if (height < 6 || footprint < 20 || max.y < groundY + 4) {
continue;
}

const centerX = (min.x + max.x) * 0.5;
const centerZ = (min.z + max.z) * 0.5;
candidates.push({
x: centerX,
y: max.y + 0.8,
z: centerZ,
width,
depth,
score: height + Math.min(35, footprint * 0.15)
});
}
}

for (const child of node.children) {
visit(child as Entity);
}
};

visit(groundEntity);
candidates.sort((a, b) => b.score - a.score);

const minSpacing = 10;
const maxAnchors = 24;
for (const candidate of candidates) {
const tooClose = smokeAnchors.some((anchor) => {
const dx = anchor.x - candidate.x;
const dz = anchor.z - candidate.z;
return Math.sqrt((dx * dx) + (dz * dz)) < minSpacing;
});
if (tooClose) {
continue;
}

smokeAnchors.push(new Vec3(candidate.x, candidate.y, candidate.z));
if (smokeAnchors.length >= maxAnchors) {
break;
}

const rooftopOffsets = [
[-0.22, -0.18],
[0.24, -0.12],
[-0.18, 0.2],
[0.18, 0.16]
];

for (const [offsetXFactor, offsetZFactor] of rooftopOffsets) {
if (smokeAnchors.length >= maxAnchors) {
break;
}

const offsetCandidate = new Vec3(
candidate.x + (candidate.width * offsetXFactor),
candidate.y,
candidate.z + (candidate.depth * offsetZFactor)
);
const offsetTooClose = smokeAnchors.some((anchor) => {
const dx = anchor.x - offsetCandidate.x;
const dz = anchor.z - offsetCandidate.z;
return Math.sqrt((dx * dx) + (dz * dz)) < minSpacing;
});
if (!offsetTooClose) {
smokeAnchors.push(offsetCandidate);
}
}
}
}

if (smokeAnchors.length === 0) {
const centerX = bounds ? (bounds.minX + bounds.maxX) * 0.5 : 0;
const centerZ = bounds ? (bounds.minZ + bounds.maxZ) * 0.5 : 0;
const spanX = bounds ? Math.max(40, bounds.maxX - bounds.minX) : 120;
const spanZ = bounds ? Math.max(40, bounds.maxZ - bounds.minZ) : 120;
smokeAnchors.push(
new Vec3(centerX - spanX * 0.25, groundY + 6, centerZ - spanZ * 0.12),
new Vec3(centerX + spanX * 0.22, groundY + 6.5, centerZ + spanZ * 0.15),
new Vec3(centerX, groundY + 7.2, centerZ)
);
}

const smokeMaterial = new StandardMaterial();
smokeMaterial.useLighting = false;
smokeMaterial.emissive = new Color(0.2, 0.2, 0.2);
smokeMaterial.diffuse = new Color(0.24, 0.24, 0.24);
smokeMaterial.opacity = 0.22;
smokeMaterial.depthWrite = false;
smokeMaterial.update();

const smokeRoot = new Entity('anaconda-smoke-root');
const smokePuffs: Array<{
entity: Entity;
baseX: number;
baseY: number;
baseZ: number;
riseSpeed: number;
driftX: number;
driftZ: number;
maxRise: number;
}> = [];
for (const anchor of smokeAnchors) {
for (let puffIndex = 0; puffIndex < 10; puffIndex += 1) {
const puff = new Entity(`smoke-puff-${puffIndex}`);
puff.addComponent('render', {
type: 'sphere',
material: smokeMaterial,
castShadows: false,
receiveShadows: false
});

const rise = puffIndex * 1.85;
const offsetX = (Math.random() - 0.5) * (2.8 + puffIndex * 0.65);
const offsetZ = (Math.random() - 0.5) * (2.8 + puffIndex * 0.65);
const scale = 3.2 + puffIndex * 1.18;
const startX = anchor.x + offsetX;
const startY = anchor.y + rise;
const startZ = anchor.z + offsetZ;

puff.setPosition(startX, startY, startZ);
puff.setLocalScale(scale, scale * 1.1, scale);
smokeRoot.addChild(puff);
smokePuffs.push({
entity: puff,
baseX: startX,
baseY: anchor.y,
baseZ: startZ,
riseSpeed: 0.65 + Math.random() * 0.45,
driftX: (Math.random() - 0.5) * 0.22,
driftZ: (Math.random() - 0.5) * 0.22,
maxRise: 14 + Math.random() * 8
});
}
}

app.root.addChild(smokeRoot);

const keyedApp = app as AppBase & Record<string, unknown>;
const smokeUpdateKey = '__anacondaSmokeUpdate';
const existingSmokeUpdate = keyedApp[smokeUpdateKey];
if (typeof existingSmokeUpdate === 'function') {
app.off('update', existingSmokeUpdate as (deltaTime: number) => void);
}

const smokeUpdate = (deltaTime: number) => {
const dt = Math.max(0, Math.min(deltaTime, 0.05));
for (const puff of smokePuffs) {
const pos = puff.entity.getPosition();
let nextY = pos.y + (puff.riseSpeed * dt);
let nextX = pos.x + (puff.driftX * dt);
let nextZ = pos.z + (puff.driftZ * dt);

if ((nextY - puff.baseY) > puff.maxRise) {
nextY = puff.baseY + Math.random() * 1.2;
nextX = puff.baseX + (Math.random() - 0.5) * 1.4;
nextZ = puff.baseZ + (Math.random() - 0.5) * 1.4;
}

puff.entity.setPosition(nextX, nextY, nextZ);
}
};

keyedApp[smokeUpdateKey] = smokeUpdate;
app.on('update', smokeUpdate);
}

export async function operationAnacondaScene(
canvas: HTMLCanvasElement,
app: AppBase,
_onClick: (battle: Battle) => void,
_sceneNum: number,
spawnPoint?: [number, number, number],
) {
resetAnacondaBattleState();
unloadAll(app);
app.mouse?.off();
app.keyboard?.off();
if (!canvas) throw new Error("Canvas not found");
const overlay = document.querySelector(".overlay") as HTMLElement | null;
const hiddenMap = new Map<HTMLElement, string | null>();
if (overlay) {
const children = Array.from(overlay.children) as HTMLElement[];
for (const child of children) {
hiddenMap.set(child, child.style.display || null);
child.style.display = "none";
}
}
const hoverLabel = document.getElementById("battle-hover-label");
if (hoverLabel) hoverLabel.style.display = "none";
if (!app.graphicsDevice) {
const device = await createGraphicsDevice(canvas);
const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.mouse = new Mouse(document.body);
createOptions.keyboard = new Keyboard(window);
createOptions.touch = new TouchDevice(document.body);
createOptions.componentSystems = [
RenderComponentSystem,
CameraComponentSystem,
ScriptComponentSystem,
LightComponentSystem,
CollisionComponentSystem,
RigidBodyComponentSystem,
];
createOptions.resourceHandlers = [TextureHandler, ContainerHandler];
app.init(createOptions);
if (!app.keyboard) app.keyboard = new Keyboard(window);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
const resize = () => app.resizeCanvas();
window.addEventListener("resize", resize);
app.once("destroy", () => {
window.removeEventListener("resize", resize);
for (const [el, prev] of hiddenMap.entries()) {
if (prev === null) el.style.removeProperty("display");
else el.style.display = prev;
}
});
app.start();
}
if (!app.keyboard) app.keyboard = new Keyboard(window);
const envAtlasAsset =
app.assets.find("battle-env-atlas") ??
new Asset(
"battle-env-atlas",
"texture",
{ url: "/environment-map.png" },
{ type: TEXTURETYPE_RGBP, mipmaps: false },
);
if (!app.assets.find("battle-env-atlas")) app.assets.add(envAtlasAsset);
await new Promise<void>((resolve) => {
if (envAtlasAsset.loaded) {
resolve();
return;
}
new AssetListLoader([envAtlasAsset], app.assets).load(() => resolve());
});
app.scene.envAtlas = envAtlasAsset.resource as Texture;
const playerSpawn = new Vec3(...(spawnPoint ?? [0, 8, 8]));
const player = new Player(app, playerSpawn);
let respawnPosition = playerSpawn.clone();
let respawnGroundY = 0;
let battlefieldBounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } | undefined;
player.setDeathQuizContext(7, () => {
player.revive(respawnPosition);
if (cameraController) cameraController.groundHeight = respawnGroundY;
createBattleHUD();
updateBattleHUD(player);
});
createBattleHUD();
updateBattleHUD(player);
const cameraController = player.getCameraController();
const cameraEntity = player.getCameraEntity();
app.scene.skyboxIntensity = 0.08;
const skyboxLayer = app.scene.layers.getLayerByName('Skybox');
if (skyboxLayer) {
skyboxLayer.enabled = false;
}
addNightSkyDome(app, cameraEntity);
if (cameraEntity.camera) {
cameraEntity.camera.clearColor = new Color(0.01, 0.015, 0.03);
cameraEntity.camera.clearColorBuffer = true;
}
try {
const ground = await loadModel(groundModelPath, app, {
rigidbodyType: "static",
includeDescendants: true,
position: new Vec3(0, 0, 0),
rotation: new Vec3(0, 0, 0),
scale: new Vec3(1, 1, 1),
});
ground.modelEntity.name = "ground";
ground.modelEntity.tags.add("ground");
const groundRb = ground.modelEntity.rigidbody;
const groundCol = ground.modelEntity.collision;
const childColliders = (ground.modelEntity.children as Entity[]).filter(
(c) => c.collision,
);
console.log("[Ground] loaded", {
path: groundModelPath,
name: ground.modelName,
hasRigidbody: !!groundRb,
rigidbodyType: groundRb?.type,
hasCollision: !!groundCol,
collisionType: groundCol?.type,
childColliderCount: childColliders.length,
childColliderTypes: childColliders.map((c) => c.collision?.type),
ammoRuntime: (globalThis as any).__ammoRuntime,
});
if (!groundRb && !groundCol && childColliders.length === 0) {
console.error(
"[Ground] NO collision/rigidbody detected — raycasting will fail!",
);
}

// Give Ammo.js time to register collision bodies. PlayCanvas adds rigidbody/collision
// components synchronously, but the underlying Ammo.js physics engine needs a render cycle
// to process them into its internal world. We poll for up to ~2 seconds.
await waitForAmmoReady(app, "ground");

let spawnResolved = false;
const spawnSurfaceOffset = (cameraController?.playerHeight ?? 2) + 0.05;
const bounds = getRenderableBounds(ground.modelEntity);
battlefieldBounds = bounds;
if (bounds) {
cameraController?.setMovementBounds(bounds, 2.5);
const spawnX = (bounds.minX + bounds.maxX) * 0.5;
const spawnZ = (bounds.minZ + bounds.maxZ) * 0.5;

// Search multiple nearby points for the highest valid ground hit
let seededGroundY: number | undefined;
const searchRadius = 16;
const searchStep = 8;
for (
  let ox = -searchRadius;
  ox <= searchRadius;
  ox += searchStep
) {
  for (
    let oz = -searchRadius;
    oz <= searchRadius;
    oz += searchStep
  ) {
    const hitY = getHighestGroundHitY(
      app,
      spawnX + ox,
      spawnZ + oz,
      "ground",
      bounds ? { terrainBounds: { minY: bounds.minY, maxY: bounds.maxY } } : undefined,
    );
    if (hitY !== undefined && (seededGroundY === undefined || hitY > seededGroundY)) {
      seededGroundY = hitY;
    }
  }
}

let surfaceY: number;
if (seededGroundY !== undefined) {
surfaceY = seededGroundY;
} else if (bounds) {
// Raycast failed everywhere — use terrain center as a reasonable estimate instead of the peak.
// bounds.maxY can be a mountain peak far above playable ground.
const terrainHeightRange = bounds.maxY - bounds.minY;
surfaceY = bounds.minY + terrainHeightRange * 0.75;
console.warn(
`[Spawn] Ground raycast failed everywhere; using terrain estimate surfaceY=${surfaceY.toFixed(2)} (bounds minY=${bounds.minY.toFixed(2)}, maxY=${bounds.maxY.toFixed(2)})`,
);
} else {
surfaceY = 0;
}
const spawnY = surfaceY + spawnSurfaceOffset;
player.setPosition(new Vec3(spawnX, spawnY, spawnZ));
respawnPosition = player.getPosition().clone();
respawnGroundY = surfaceY;
if (cameraController) cameraController.groundHeight = surfaceY;
spawnResolved = true;
console.log(
`[Spawn] camera placed on terrain surface at (${spawnX.toFixed(2)}, ${spawnY.toFixed(2)}, ${spawnZ.toFixed(2)}), surfaceY ${surfaceY.toFixed(2)}, seededRayY ${seededGroundY?.toFixed(2) ?? "n/a"}`,
);
}
if (!spawnResolved) {
const spawnCandidates: Vec3[] = [];
const spawnSearchRadius = 24;
const spawnSearchStep = 8;
for (
let x = -spawnSearchRadius;
x <= spawnSearchRadius;
x += spawnSearchStep
) {
for (
let z = -spawnSearchRadius;
z <= spawnSearchRadius;
z += spawnSearchStep
) {
spawnCandidates.push(new Vec3(x, 0, z));
}
}
let bestSpawnCandidate: Vec3 | undefined;
let bestSpawnGroundY: number | undefined;
for (const candidate of spawnCandidates) {
const hitY = getHighestGroundHitY(
app,
candidate.x,
candidate.z,
"ground",
);
if (hitY === undefined) continue;
if (bestSpawnGroundY === undefined || hitY > bestSpawnGroundY) {
bestSpawnGroundY = hitY;
bestSpawnCandidate = candidate;
}
}
if (bestSpawnCandidate && bestSpawnGroundY !== undefined) {
const spawnY = bestSpawnGroundY + spawnSurfaceOffset;
player.setPosition(
new Vec3(bestSpawnCandidate.x, spawnY, bestSpawnCandidate.z),
);
respawnPosition = player.getPosition().clone();
respawnGroundY = bestSpawnGroundY;
if (cameraController) cameraController.groundHeight = bestSpawnGroundY;
spawnResolved = true;
console.log(
`[Spawn] camera placed at (${bestSpawnCandidate.x.toFixed(2)}, ${spawnY.toFixed(2)}, ${bestSpawnCandidate.z.toFixed(2)}) from ground Y ${bestSpawnGroundY.toFixed(2)}`,
);
}
}
if (!spawnResolved) {
console.warn(
"[Spawn] No valid ground-tagged spawn hit found; keeping default camera position",
);
}

addBattleSmokePlumes(app, ground.modelEntity, battlefieldBounds, respawnGroundY);
} catch (error) {
console.error("[Ground] model load failed", error);
addBattleSmokePlumes(app, undefined, battlefieldBounds, respawnGroundY);
}
const rigidbodySystem = (app.systems as any).rigidbody;
if (rigidbodySystem && typeof rigidbodySystem.on === "function") {
rigidbodySystem.on("contact", (contactResult: any) => {
const posA = contactResult?.entityA?.getPosition?.();
const posB = contactResult?.entityB?.getPosition?.();
const nameA = contactResult?.entityA?.name ?? "?";
const nameB = contactResult?.entityB?.name ?? "?";
const contactPos = posA ?? posB;
console.log(
`[Collision Contact] "${nameA}" <-> "${nameB}" at (${contactPos?.x?.toFixed(2) ?? "?"}, ${contactPos?.y?.toFixed(2) ?? "?"}, ${contactPos?.z?.toFixed(2) ?? "?"})`,
);
});
} else {
console.warn(
"[Collision] rigidbody system not available — contact logging disabled",
);
}

app.scene.fog.type = 'none';

app.scene.ambientLight = new Color(0.055, 0.06, 0.085);
if (app.systems.light) {
const light = new Entity("directional-light");
light.addComponent("light", {
type: "directional",
color: new Color(0.57, 0.63, 0.8),
intensity: 0.36,
castShadows: true,
});
light.setLocalEulerAngles(26, -46, 0);
app.root.addChild(light);
}
const npcSpawnOptions = {
...DEFAULT_BATTLE_NPC_SPAWN_OPTIONS,
groundYFallback: respawnGroundY,
};
const npcs = await spawnSceneNpcs(
app,
rigidbodySystem,
ANACONDA_NPC_SPAWN_POINTS,
npcSpawnOptions,
);
app.keyboard?.on("keydown", (event: { key: number | null }) => {
if (isDeathScreenVisible()) return;
if (event.key === KEY_1) {
player.equipWeapon(1);
updateBattleHUD(player);
} else if (event.key === KEY_2) {
player.equipWeapon(2);
updateBattleHUD(player);
}
});
app.mouse?.on(
"mousedown",
(event: { x: number; y: number; button: number }) => {
if (isDeathScreenVisible()) return;
if (event.button !== 0) return;
const isGunEquipped =
player.getEquippedWeaponName() === "Gun" ||
player.getEquippedWeaponName() === "Bow";
const targetX = isGunEquipped ? app.graphicsDevice.width * 0.5 : event.x;
const targetY = isGunEquipped ? app.graphicsDevice.height * 0.5 : event.y;
const hitNpc = cameraController?.getClickedNpcInRange(
targetX,
targetY,
npcs,
player.getAttackRange(),
);
player.attack(hitNpc ?? null);
if (hitNpc instanceof Boss) {
hitNpc.updateHealthBar();
}
updateBattleHUD(player);
if (hitNpc) {
console.log(`Hit NPC`);
}
},
);
bindNpcCombatLoop(app, npcs, () => player.getCameraEntity(), {
updateKey: "__anacondaNpcUpdate",
getPlayerHealth: () => ({
current: player.getHealth(),
max: player.getDebugState().maxHealth,
}),
obstacleCollisionEnabled: false,
obstacleIgnoreTags: ['ground'],
groundProbeHeight: 5000,
groundProbeDepth: 5000,
disableMongolHordeSpawn: true,
battleStatus: {
getCameraEntity: () => player.getCameraEntity(),
initialTotal:
ANACONDA_NPC_SPAWN_POINTS.length + ANACONDA_BOSS_SPAWN_POINT.length,
alwaysOutline: true,
outlineTargets: 'all',
outlineColor: new Color(1, 0.9, 0.2),
onRemainingCountChange: (remaining) => updateBattleHUD(player, remaining),
},
onNpcAttack: (attacker, target, damage) => {
target.takeDamage(damage);
if (target instanceof Boss) {
target.updateHealthBar();
}
console.log(
`NPC ${attacker.getId()} (${attacker.getTeam()}) hit NPC ${target.getId()} for ${damage}.`,
);
},
onPlayerAttack: (attacker, damage) => {
player.takeDamage(damage);
updateBattleHUD(player);
console.log(
`Player hit by NPC ${attacker.getId()} for ${damage}, health now ${player.getHealth()}`,
);
},
});
let victoryHandled = false;
const victoryCheck = () => {
if (isDeathScreenVisible()) return;
if (victoryHandled) return;
const remainingFoes = npcs.filter(
(currentNpc) => currentNpc.getTeam() === "foe" && currentNpc.isAlive(),
);
if (remainingFoes.length === 0 && isBossSpawned) {
victoryHandled = true;
removeBattleHUD();
triggerVictory('Operation Anaconda', canvas, app);
} else if (remainingFoes.length === 0 && !isBossSpawned) {
spawnBoss(app, rigidbodySystem, npcs, respawnGroundY).catch((err) =>
console.error(err),
);
}
};
app.on("update", victoryCheck);
}

async function spawnBoss(
  app: AppBase,
  rigidbodySystem: any,
  npcs: npc[],
  groundYFallback: number,
): Promise<void> {
  if (isBossSpawned || isBossSpawning) return;
  isBossSpawning = true;
  try {
    const bossSpawnOptions = {
      ...DEFAULT_BIN_LADIN_BOSS_SPAWN_OPTIONS,
      groundYFallback,
      groundProbeHeight: 5000,
      groundProbeDepth: 5000
    };
    const spawned = await spawnSceneNpcs(
      app,
      rigidbodySystem,
      ANACONDA_BOSS_SPAWN_POINT,
      bossSpawnOptions,
    );
    for (const s of spawned) {
      npcs.push(s);
      if (s instanceof Boss) {
        s.drawHealthBar();
        Boss.setActiveBoss(s);
      }
    }
    isBossSpawned = true;
  } catch (err) {
    console.error("Failed to spawn boss:", err);
  } finally {
    isBossSpawning = false;
  }
}
