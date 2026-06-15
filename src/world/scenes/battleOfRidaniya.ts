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
	FILLMODE_FILL_WINDOW,
	RESOLUTION_AUTO,
 KEY_1,
 KEY_2,
 KEY_NUMPAD_1,
 KEY_NUMPAD_2,
} from "playcanvas";

import { unloadAll } from '../../util/unloadall';
import { loadModel } from '../../util/loadModel'
import { waitForAmmoReady } from "../../util/spawnHelpers";
import { createBattleHUD, removeBattleHUD, updateBattleHUD } from '../../util/battleHUD';
import { isDeathScreenVisible } from './deathScreen';

// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { Grid } from 'playcanvas/scripts/esm/grid.mjs';
import { Player } from '../../player/player';
import type { Battle } from "../Battle";
import { bindNpcCombatLoop, spawnSceneNpcs } from "../npc/sceneNpcSystem";
import { DEFAULT_BATTLE_NPC_SPAWN_OPTIONS, DEFAULT_BAYBARS_BOSS_SPAWN_OPTIONS, RIDANIYA_BOSS_SPAWN_POINT, RIDANIYA_NPC_SPAWN_POINTS } from "../npc/sceneNpcPresets";
import { Boss } from "../npc/bosses/boss";
import { Secret, pickSecretPosition } from "../secrets";
import { triggerVictory } from "../../App";
import { getHighestGroundHitY, getRenderableBounds, type RenderableBounds } from "../../util/battleSceneHelpers";

const groundModelPath = '/world/battlefields/Ridaniya.glb';





export async function battleOfRidaniyaScene(
	canvas: HTMLCanvasElement,
	app: AppBase,
	_onClick: (battle: Battle) => void,
	_sceneNum: number,
	spawnPoint?: [number, number, number]
) {
	// Clean up any previous scene assets and input listeners
	unloadAll(app);
	app.mouse?.off();
	app.keyboard?.off();

	if (!canvas) {
		throw new Error('Canvas not found');
	}

	// Hide the page overlay (UI text/info pills) while we're in the 3D scene
	const overlay = document.querySelector('.overlay') as HTMLElement | null;
	const hiddenMap = new Map<HTMLElement, string | null>();
	if (overlay) {
		const children = Array.from(overlay.children) as HTMLElement[];
		for (const child of children) {
			hiddenMap.set(child, child.style.display || null);
			child.style.display = 'none';
		}
	}

	// Hide the hover label that appears when you mouse over battlefields on the default globe
	const hoverLabel = document.getElementById('battle-hover-label');
	if (hoverLabel) {
		hoverLabel.style.display = 'none';
	}

	// Initialize the graphics device and app if this is the first time
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
			RigidBodyComponentSystem
		];
		createOptions.resourceHandlers = [TextureHandler, ContainerHandler];

		app.init(createOptions);

		if (!app.keyboard) {
				app.keyboard = new Keyboard(window);
		}

		app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
		app.setCanvasResolution(RESOLUTION_AUTO);

		const resize = () => app.resizeCanvas();
		window.addEventListener('resize', resize);
		app.once('destroy', () => {
			window.removeEventListener('resize', resize);
			for (const [el, prev] of hiddenMap.entries()) {
				if (prev === null) el.style.removeProperty('display');
				else el.style.display = prev;
			}
		});

		app.start();
	}

	if (!app.keyboard) {
		app.keyboard = new Keyboard(window);
	}

	const envAtlasAsset = app.assets.find('battle-env-atlas') ?? new Asset(
		'battle-env-atlas',
		'texture',
		{ url: '/environment-map.png' },
		{
			type: TEXTURETYPE_RGBP,
			mipmaps: false
		}
	);

	if (!app.assets.find('battle-env-atlas')) {
		app.assets.add(envAtlasAsset);
	}

	await new Promise<void>((resolve) => {
		if (envAtlasAsset.loaded) {
			resolve();
			return;
		}
		new AssetListLoader([envAtlasAsset], app.assets).load(() => resolve());
	});

	app.scene.envAtlas = envAtlasAsset.resource as Texture;
	app.scene.skyboxIntensity = 0.2;

	const skyboxLayer = app.scene.layers.getLayerByName('Skybox');
	if (skyboxLayer) {
		skyboxLayer.enabled = false;
	}

	// Create the player with camera and first-person controls
	const playerSpawn = new Vec3(...(spawnPoint ?? [0, 8, 8]));
	const player = new Player(app, playerSpawn);
	let respawnPosition = playerSpawn.clone();
	let respawnGroundY = 0;
	// Bounds of the rendered ground mesh — hoisted here so it's still in scope
	// when the secret spawns well after the ground's load() promise resolves.
	let bounds: RenderableBounds | undefined;
	player.setDeathQuizContext(3, () => {
		player.revive(respawnPosition);
		if (cameraController) {
			cameraController.groundHeight = respawnGroundY;
		}
		createBattleHUD();
		updateBattleHUD(player);
	});
	// Show the battle HUD immediately so it is visible even if NPC loading is delayed.
	createBattleHUD();
	updateBattleHUD(player);
	const cameraController = player.getCameraController();
	const cameraEntity = player.getCameraEntity();
	if (cameraEntity.camera) {
		cameraEntity.camera.clearColor = new Color(0.44, 0.72, 0.98);
		cameraEntity.camera.clearColorBuffer = true;
	}

	// Load and set up the battlefield ground model
	try {

		const ground = await loadModel(groundModelPath, app, {
			rigidbodyType: 'static',
			includeDescendants: true,
			position: new Vec3(0, 0, 0),
			rotation: new Vec3(0, 0, 0),
			scale: new Vec3(1, 1, 1)
		});

		ground.modelEntity.name = 'ground';
		ground.modelEntity.tags.add('ground')
// Give Ammo.js a frame to register collision meshes before raycasting.
await waitForAmmoReady(app, "ground");

		const groundRb = ground.modelEntity.rigidbody;
		const groundCol = ground.modelEntity.collision;
		const childColliders = (ground.modelEntity.children as Entity[]).filter(
			(c) => c.collision
		);
		console.log('[Ground] loaded', {
			path: groundModelPath,
			name: ground.modelName,
			hasRigidbody: !!groundRb,
			rigidbodyType: groundRb?.type,
			hasCollision: !!groundCol,
			collisionType: groundCol?.type,
			childColliderCount: childColliders.length,
			childColliderTypes: childColliders.map((c) => c.collision?.type),
			ammoRuntime: (globalThis as any).__ammoRuntime
		});

		if (!groundRb && !groundCol && childColliders.length === 0) {
			console.error('[Ground] NO collision/rigidbody detected — raycasting will fail!');
		}

		let spawnResolved = false;
		const spawnSurfaceOffset = (cameraController?.playerHeight ?? 2) + 0.05;
		bounds = getRenderableBounds(ground.modelEntity);

		if (bounds) {
			cameraController?.setMovementBounds(bounds, 2.5);
			const spawnX = (bounds.minX + bounds.maxX) * 0.5;
			const spawnZ = (bounds.minZ + bounds.maxZ) * 0.5;
			const seededGroundY = getHighestGroundHitY(app, spawnX, spawnZ, 'ground');
			let surfaceY: number;
			if (seededGroundY !== undefined) {
				surfaceY = seededGroundY;
			} else if (bounds) {
				const terrainHeightRange = bounds.maxY - bounds.minY;
				surfaceY = bounds.minY + terrainHeightRange * 0.75;
				console.warn(
					`[Spawn] Ground raycast failed at center (${spawnX.toFixed(2)}, ${spawnZ.toFixed(2)}); using terrain estimate surfaceY=${surfaceY.toFixed(2)} (bounds minY=${bounds.minY.toFixed(2)}, maxY=${bounds.maxY.toFixed(2)})`,
				);
			} else {
				surfaceY = 0;
			}
			const spawnY = surfaceY + spawnSurfaceOffset;
			player.setPosition(new Vec3(spawnX, spawnY, spawnZ));
			respawnPosition = player.getPosition().clone();
			respawnGroundY = surfaceY;
			if (cameraController) {
				cameraController.groundHeight = surfaceY;
			}
			spawnResolved = true;
			console.log(`[Spawn] camera placed on terrain surface at (${spawnX.toFixed(2)}, ${spawnY.toFixed(2)}, ${spawnZ.toFixed(2)}), surfaceY ${surfaceY.toFixed(2)}, seededRayY ${seededGroundY?.toFixed(2) ?? "n/a"}`);
		}

		if (!spawnResolved) {
			const spawnCandidates: Vec3[] = [];
			const spawnSearchRadius = 24;
			const spawnSearchStep = 8;
			for (let x = -spawnSearchRadius; x <= spawnSearchRadius; x += spawnSearchStep) {
				for (let z = -spawnSearchRadius; z <= spawnSearchRadius; z += spawnSearchStep) {
					spawnCandidates.push(new Vec3(x, 0, z));
				}
			}

			let bestSpawnCandidate: Vec3 | undefined;
			let bestSpawnGroundY: number | undefined;

			for (const candidate of spawnCandidates) {
				const hitY = getHighestGroundHitY(app, candidate.x, candidate.z, 'ground');
				if (hitY === undefined) continue;
				if (bestSpawnGroundY === undefined || hitY > bestSpawnGroundY) {
					bestSpawnGroundY = hitY;
					bestSpawnCandidate = candidate;
				}
			}

			if (bestSpawnCandidate && bestSpawnGroundY !== undefined) {
				const spawnY = bestSpawnGroundY + spawnSurfaceOffset;
				player.setPosition(new Vec3(bestSpawnCandidate.x, spawnY, bestSpawnCandidate.z));
				respawnPosition = player.getPosition().clone();
				respawnGroundY = bestSpawnGroundY;
				if (cameraController) cameraController.groundHeight = bestSpawnGroundY;
				spawnResolved = true;
				console.log(`[Spawn] camera placed at (${bestSpawnCandidate.x.toFixed(2)}, ${spawnY.toFixed(2)}, ${bestSpawnCandidate.z.toFixed(2)}) from ground Y ${bestSpawnGroundY.toFixed(2)}`);
			}
		}

		if (!spawnResolved) {
			console.warn('[Spawn] No valid ground-tagged spawn hit found; keeping default camera position');
		}
	} catch (error) {
		console.error('[Ground] model load failed', error);
	}

	const rigidbodySystem = (app.systems as any).rigidbody;
	if (rigidbodySystem && typeof rigidbodySystem.on === 'function') {
		rigidbodySystem.on('contact', (contactResult: any) => {
			const posA = contactResult?.entityA?.getPosition?.();
			const posB = contactResult?.entityB?.getPosition?.();
			const nameA = contactResult?.entityA?.name ?? '?';
			const nameB = contactResult?.entityB?.name ?? '?';
			const contactPos = posA ?? posB;
			console.log(`[Collision Contact] "${nameA}" <-> "${nameB}" at (${contactPos?.x?.toFixed(2) ?? '?'}, ${contactPos?.y?.toFixed(2) ?? '?'}, ${contactPos?.z?.toFixed(2) ?? '?'})`);
		});
	} else {
		console.warn('[Collision] rigidbody system not available — contact logging disabled');
	}

	app.scene.fog.type = 'linear';
	app.scene.fog.color = new Color(0.72, 0.84, 0.98);
	app.scene.fog.start = 120;
	app.scene.fog.end = 520;

   app.scene.ambientLight = new Color(0.38, 0.46, 0.58);
   if (app.systems.light) {
     const light = new Entity('sun-light');
     light.addComponent('light', { type: 'directional', color: new Color(1, 0.96, 0.82), intensity: 1.45, castShadows: true });
     light.setLocalEulerAngles(52, 35, 0);
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

	const npcSpawnOptions = { ...DEFAULT_BATTLE_NPC_SPAWN_OPTIONS, groundYFallback: respawnGroundY };
	let npcs = await spawnSceneNpcs(app, rigidbodySystem, RIDANIYA_NPC_SPAWN_POINTS, npcSpawnOptions);
	if (npcs.length === 0) {
		console.warn('[NPC] Ridaniya spawn returned no soldiers on the first pass, retrying once');
		npcs = await spawnSceneNpcs(app, rigidbodySystem, RIDANIYA_NPC_SPAWN_POINTS, npcSpawnOptions);
	}

	let baybarsSpawned = false;
	let baybarsSpawnFrame = -1; // track when Baybars was spawned to prevent instant victory

	app.keyboard?.on('keydown', (event: { key: number | string | null; event?: globalThis.KeyboardEvent | null }) => {
		if (isDeathScreenVisible()) {
			return;
		}

		const keyCode = typeof event.key === 'number' ? event.key : null;
		const rawEvent = event.event ?? null;
		const keyValue = rawEvent?.key ?? (typeof event.key === 'string' ? event.key : null);
		const keyCodeValue = rawEvent?.code ?? null;

		const isKey1 = keyCode === KEY_1 || keyCode === KEY_NUMPAD_1 || keyValue === '1' || keyCodeValue === 'Digit1' || keyCodeValue === 'Numpad1';
		const isKey2 = keyCode === KEY_2 || keyCode === KEY_NUMPAD_2 || keyValue === '2' || keyCodeValue === 'Digit2' || keyCodeValue === 'Numpad2';
 if (isKey1) {
    player.equipWeapon(1);
    updateBattleHUD(player);
 } else if (isKey2) {
    player.equipWeapon(4);
    updateBattleHUD(player);
 }
	});

	app.mouse?.on('mousedown', (event: { x: number; y: number; button: number }) => {
		if (isDeathScreenVisible()) {
			return;
		}

		if (event.button !== 0) {
			return;
		}

		const isRangedEquipped = player.getEquippedWeaponName() === 'Gun' || player.getEquippedWeaponName() === 'Bow';
		const targetX = isRangedEquipped ? app.graphicsDevice.width * 0.5 : event.x;
		const targetY = isRangedEquipped ? app.graphicsDevice.height * 0.5 : event.y;
		const hitNpc = cameraController?.getClickedNpcInRange(targetX, targetY, npcs, player.getAttackRange());
		player.attack(hitNpc ?? null);
		updateBattleHUD(player);
		if (hitNpc) {
			console.log(`Hit NPC`);
			if (hitNpc instanceof Boss) {
				(hitNpc as unknown as Boss).updateHealthBar();
			}
		}
	});

	bindNpcCombatLoop(app, npcs, () => player.getCameraEntity(), {
		updateKey: '__ainJalutNpcUpdate',
		battleStatus: {
			getCameraEntity: () => player.getCameraEntity(),
			initialTotal: RIDANIYA_NPC_SPAWN_POINTS.length,
			alwaysOutline: true,
			outlineTargets: 'foe' as const,
			outlineColor: new Color(1, 0.9, 0.2),
			onRemainingCountChange: (remaining) => updateBattleHUD(player, remaining)
		},
		onNpcAttack: (attacker, target, damage) => {
			target.takeDamage(damage);
			console.log(`NPC ${attacker.getId()} (${attacker.getTeam()}) hit NPC ${target.getId()} for ${damage}.`);
		},
		onPlayerAttack: (attacker, damage) => {
			player.takeDamage(damage);
			updateBattleHUD(player);
			console.log(`Player hit by NPC ${attacker.getId()} for ${damage}, health now ${player.getHealth()}`);
		}
	});

	let victoryHandled = false;
	const victoryCheck = async () => {
		if (isDeathScreenVisible()) {
			return;
		}

		if (victoryHandled) {
			return;
		}

		const remainingFoes = npcs.filter((currentNpc) => currentNpc.getTeam() === 'foe' && currentNpc.isAlive());

		// All Mamluks down — Baybars arrives as reinforcement.
		if (!baybarsSpawned && !remainingFoes.some((f) => !(f instanceof Boss))) {
			baybarsSpawned = true;
			const bossSpawnOptions = { ...DEFAULT_BAYBARS_BOSS_SPAWN_OPTIONS, groundYFallback: respawnGroundY };
			const bossNpcs = await spawnSceneNpcs(app, rigidbodySystem, RIDANIYA_BOSS_SPAWN_POINT, bossSpawnOptions);
			for (const boss of bossNpcs) {
				npcs.push(boss);
				if (boss instanceof Boss) {
					boss.drawHealthBar();
					Boss.setActiveBoss(boss);
				}
			}
			baybarsSpawnFrame = 0; // require grace period before victory can trigger
			console.log('[NPC] Baybars has entered the battle!');
			return;
		}

		// Victory only after a short grace period following Baybars' spawn.
		// The async spawn can resolve on the same frame the last Mamluk dies,
		// so we need to skip victory for a few frames to let Baybars actually
		// enter the fight.
		if (baybarsSpawnFrame >= 0) {
			baybarsSpawnFrame += 1;
		}

		if (remainingFoes.length === 0 && baybarsSpawned && (baybarsSpawnFrame ?? 0) > 2) {
			removeBattleHUD();
			victoryHandled = true;
			triggerVictory('Battle of Ridaniya', canvas, app);
		}
	};

	app.on('update', victoryCheck);
}
