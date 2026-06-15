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
// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { Grid } from "playcanvas/scripts/esm/grid.mjs";
import { Player } from "../../player/player";
import type { Battle } from "../Battle";
import { bindNpcCombatLoop, spawnSceneNpcs } from "../npc/sceneNpcSystem";
import { Boss } from "../npc/bosses/boss";
import { Secret, pickSecretPosition } from "../secrets";
import {
  DEFAULT_BATTLE_NPC_SPAWN_OPTIONS,
  DEFAULT_NINE_TAILED_FOX_BOSS_SPAWN_OPTIONS,
  CHOSIN_RESERVOIR_BOSS_SPAWN_POINT,
  CHOSIN_RESERVOIR_NPC_SPAWN_POINTS,
} from "../npc/sceneNpcPresets";
import { Mongol } from "../npc/troops/mongol";
import { npc } from "../npc/npc";
import { triggerVictory } from "../../App";
import { getHighestGroundHitY, getRenderableBounds, createStarfieldTexture, type RenderableBounds } from "../../util/battleSceneHelpers";

const groundModelPath = "/world/battlefields/ChosinResevoir.glb";

var isBossSpawned = false;
var isBossSpawning = false;

function resetChosinBattleState(): void {
  isBossSpawned = false;
  isBossSpawning = false;
  Mongol.resetBattleState();
}





export async function battleOfChosinReservoirScene(
  canvas: HTMLCanvasElement,
  app: AppBase,
  _onClick: (battle: Battle) => void,
  _sceneNum: number,
  spawnPoint?: [number, number, number],
) {
  resetChosinBattleState();
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
  // Bounds of the rendered ground mesh — hoisted here so it's still in scope
  // when the secret spawns well after the ground's load() promise resolves.
  let bounds: RenderableBounds | undefined;
  player.setDeathQuizContext(6, () => {
    player.revive(respawnPosition);
    if (cameraController) cameraController.groundHeight = respawnGroundY;
    createBattleHUD();
    updateBattleHUD(player);
  });
  const cameraController = player.getCameraController();
  const cameraEntity = player.getCameraEntity();
  if (cameraEntity.camera) cameraEntity.camera.clearColor = new Color(0, 0, 0);
  const starMaterial = new StandardMaterial();
  starMaterial.useLighting = false;
  starMaterial.emissive.set(1, 1, 1);
  starMaterial.emissiveMap = createStarfieldTexture(app.graphicsDevice);
  starMaterial.cull = CULLFACE_FRONT;
  starMaterial.update();
  const starDome = new Entity("chosin-star-dome");
  const starMesh = Mesh.fromGeometry(app.graphicsDevice, new SphereGeometry({
    radius: 220,
    latitudeBands: 64,
    longitudeBands: 64,
  }));
  starDome.addComponent("render", {
    meshInstances: [new MeshInstance(starMesh, starMaterial)],
  });
  starDome.setPosition(cameraEntity.getPosition());
  app.root.addChild(starDome);
  app.on("update", () => starDome.setPosition(cameraEntity.getPosition()));
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
    bounds = getRenderableBounds(ground.modelEntity);
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
      // Raycast failed everywhere — use terrain center estimate instead of the peak.
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
  } catch (error) {
    console.error("[Ground] model load failed", error);
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
   app.scene.ambientLight = new Color(0.2, 0.2, 0.2);
   if (app.systems.light) {
     const light = new Entity("directional-light");
     light.addComponent("light", {
       type: "directional",
       color: new Color(1, 1, 1),
       intensity: 1,
       castShadows: true,
     });
     light.setLocalEulerAngles(45, 30, 0);
     app.root.addChild(light);
   }

   // Pick the secret's position INSIDE the map's bounds (not the same spot
   // every battle) and ground-snap it 0.5 units above the surface so it
   // doesn't z-fight with the terrain mesh.
   const secretPosition = pickSecretPosition(app, bounds, respawnGroundY);
   // The loader applies a default rotation of (0, 90, 90) when none is given
   // (see src/util/loadModel.ts), which tips jar.glb on its side. Setting
   // (0, 0, 0) tells the loader to use the model's raw .glb orientation so it
   // stands upright. Tweak these three angles if the model still looks wrong.
   const secretRotation = new Vec3(0, 0, 0);
   const secret = new Secret({
     app,
     cameraEntity: player.getCameraEntity(),
     modelPath: "models/jar.glb",
     position: secretPosition,
     scale: new Vec3(0.5, 0.5, 0.5),
     rotation: secretRotation
   });
   await secret.spawn();
  const npcSpawnOptions = {
    ...DEFAULT_BATTLE_NPC_SPAWN_OPTIONS,
    groundYFallback: respawnGroundY,
  };
  const npcs = await spawnSceneNpcs(
    app,
    rigidbodySystem,
    CHOSIN_RESERVOIR_NPC_SPAWN_POINTS,
    npcSpawnOptions,
  );
  createBattleHUD();
  updateBattleHUD(player);
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
      updateBattleHUD(player);
      if (hitNpc) {
        console.log(`Hit NPC`);
        try {
          if ((hitNpc as any) instanceof Boss) {
            (hitNpc as unknown as Boss).updateHealthBar();
          }
        } catch (e) {}
      }
    },
  );
bindNpcCombatLoop(app, npcs, () => player.getCameraEntity(), {
  updateKey: "__chosinNpcUpdate",
  getPlayerHealth: () => ({
      current: player.getHealth(),
      max: player.getDebugState().maxHealth,
    }),
    battleStatus: {
      getCameraEntity: () => player.getCameraEntity(),
      initialTotal:
        CHOSIN_RESERVOIR_NPC_SPAWN_POINTS.length +
        CHOSIN_RESERVOIR_BOSS_SPAWN_POINT.length,
      onRemainingCountChange: (remaining) => updateBattleHUD(player, remaining),
    },
    onNpcAttack: (attacker, target, damage) => {
      target.takeDamage(damage);
      try {
        if ((target as any) instanceof Boss) {
          (target as unknown as Boss).updateHealthBar();
        }
      } catch (e) {}
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
      triggerVictory('Battle of Chosin Reservoir', canvas, app);
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
      ...DEFAULT_NINE_TAILED_FOX_BOSS_SPAWN_OPTIONS,
      groundYFallback,
    };
    const spawned = await spawnSceneNpcs(
      app,
      rigidbodySystem,
      CHOSIN_RESERVOIR_BOSS_SPAWN_POINT,
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
