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
import { getHighestGroundHitY, getRenderableBounds } from "../../util/battleSceneHelpers";
	import { createBattleHUD, removeBattleHUD, updateBattleHUD } from '../../util/battleHUD';
	import { isDeathScreenVisible } from './deathScreen';

	// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
	import { Grid } from 'playcanvas/scripts/esm/grid.mjs';
	import { Player } from '../../player/player';
	import type { Battle } from "../Battle";
	import { Boss } from "../npc/bosses/boss";
	import { bindNpcCombatLoop, spawnSceneNpcs, type NpcSpawnPoint } from "../npc/sceneNpcSystem";
	import { ORLEANS_NPC_SPAWN_POINTS, DEFAULT_BATTLE_NPC_SPAWN_OPTIONS } from "../npc/sceneNpcPresets";
	import { triggerVictory } from "../../App";

	const groundModelPath = '/world/battlefields/Orleans.glb';





	function resolveOrleansSpawnPoints(anchor: Vec3): NpcSpawnPoint[] {
		const basePoints = ORLEANS_NPC_SPAWN_POINTS;
		if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) {
			return basePoints;
		}

		if (basePoints.length > 0) {
			const first = basePoints[0];
			const allSame = basePoints.every((spawn) =>
				Math.abs(spawn.x - first.x) < 0.01 && Math.abs(spawn.z - first.z) < 0.01
			);
			if (!allSame) {
				return basePoints;
			}
		}

		const fallbackOffsets = [
			{ x: 12, z: 6 },
			{ x: -14, z: 4 },
			{ x: 8, z: -10 },
			{ x: -10, z: -8 },
			{ x: 16, z: -2 },
			{ x: -6, z: 12 }
		];

		const spawnCount = Math.max(3, basePoints.length || 0);
		return fallbackOffsets.slice(0, spawnCount).map((offset, index) => ({
			id: 100 + index,
			team: "foe",
			x: anchor.x + offset.x,
			z: anchor.z + offset.z,
			type: "french"
		}));
	}

	export async function siegeOfOrleansScene(
		canvas: HTMLCanvasElement,
		app: AppBase,
		_onClick: (battle: Battle) => void,
		_sceneNum: number,
		spawnPoint?: [number, number, number]
	) {
		unloadAll(app);
		app.mouse?.off();
		app.keyboard?.off();

		if (!canvas) {
			throw new Error('Canvas not found');
		}

		const overlay = document.querySelector('.overlay') as HTMLElement | null;
		const hiddenMap = new Map<HTMLElement, string | null>();
		if (overlay) {
			const children = Array.from(overlay.children) as HTMLElement[];
			for (const child of children) {
				hiddenMap.set(child, child.style.display || null);
				child.style.display = 'none';
			}
		}

		const hoverLabel = document.getElementById('battle-hover-label');
		if (hoverLabel) {
			hoverLabel.style.display = 'none';
		}

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

		const playerSpawn = new Vec3(...(spawnPoint ?? [0, 8, 8]));
		const player = new Player(app, playerSpawn);
		let respawnPosition = playerSpawn.clone();
		let respawnGroundY = 0;
		player.setDeathQuizContext(2, () => {
			player.revive(respawnPosition);
			if (cameraController) {
				cameraController.groundHeight = respawnGroundY;
			}
			createBattleHUD();
			updateBattleHUD(player);
		});
		createBattleHUD();
		updateBattleHUD(player);
		const cameraController = player.getCameraController();
		const cameraEntity = player.getCameraEntity();
		if (cameraEntity.camera) {
			cameraEntity.camera.clearColor = new Color(0.44, 0.72, 0.98);
			cameraEntity.camera.clearColorBuffer = true;
		}

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
			const childColliders = (ground.modelEntity.children as Entity[]).filter((c) => c.collision);
			console.log('[Ground] loaded', { path: groundModelPath, name: ground.modelName, hasRigidbody: !!groundRb, rigidbodyType: groundRb?.type, hasCollision: !!groundCol, collisionType: groundCol?.type, childColliderCount: childColliders.length, childColliderTypes: childColliders.map((c) => c.collision?.type), ammoRuntime: (globalThis as any).__ammoRuntime });

			if (!groundRb && !groundCol && childColliders.length === 0) {
				console.error('[Ground] NO collision/rigidbody detected — raycasting will fail!');
			}

			let spawnResolved = false;
			const spawnSurfaceOffset = (cameraController?.playerHeight ?? 2) + 0.05;
			const bounds = getRenderableBounds(ground.modelEntity);
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

		const orleansSpawnPoints = resolveOrleansSpawnPoints(respawnPosition);
		const npcSpawnOptions = { ...DEFAULT_BATTLE_NPC_SPAWN_OPTIONS, groundYFallback: respawnGroundY };
		let npcs = await spawnSceneNpcs(app, rigidbodySystem, orleansSpawnPoints, npcSpawnOptions);
		if (npcs.length === 0) {
			console.warn('[NPC] Orleans spawn returned no soldiers on the first pass, retrying once');
			npcs = await spawnSceneNpcs(app, rigidbodySystem, orleansSpawnPoints, npcSpawnOptions);
		}

		let joanSpawned = false;
		let joanSpawning = false;
		const spawnJoanOfArc = async (): Promise<void> => {
			if (joanSpawned || joanSpawning) {
				return;
			}

			joanSpawning = true;
			try {
				const playerPosition = player.getPosition();
				const spawnOffset = new Vec3(6, 0, -8);
				const joanSpawnPoints: NpcSpawnPoint[] = [
					{
						id: 901,
						team: 'foe',
						x: playerPosition.x + spawnOffset.x,
						z: playerPosition.z + spawnOffset.z,
						maxHealth: 240,
						type: 'joanofarc'
					}
				];

      const spawnedJoan = await spawnSceneNpcs(app, rigidbodySystem, joanSpawnPoints, npcSpawnOptions);
      npcs.push(...spawnedJoan);
      joanSpawned = true;
      if (spawnedJoan.length === 0) {
        console.warn('[NPC] Joan of Arc spawn returned no NPCs.');
      }
      for (const spawned of spawnedJoan) {
        if (spawned instanceof Boss) {
          spawned.drawHealthBar();
          Boss.setActiveBoss(spawned);
        }
      }
			} catch (error) {
				console.error('[NPC] Failed to spawn Joan of Arc', error);
				joanSpawned = true;
			} finally {
				joanSpawning = false;
			}
		};

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
			if (hitNpc instanceof Boss) {
				hitNpc.updateHealthBar();
			}
			updateBattleHUD(player);
			if (hitNpc) {
				console.log(`Hit NPC`);
			}
		});

		bindNpcCombatLoop(app, npcs, () => player.getCameraEntity(), {
			updateKey: '__orleansNpcUpdate',
			getPlayerHealth: () => ({ current: player.getHealth(), max: player.getDebugState().maxHealth }),
			battleStatus: {
				getCameraEntity: () => player.getCameraEntity(),
				initialTotal: orleansSpawnPoints.length,
				alwaysOutline: true,
				outlineTargets: 'all',
				outlineColor: new Color(1, 0.9, 0.2),
				onRemainingCountChange: (remaining) => updateBattleHUD(player, remaining)
			},
			onNpcAttack: (attacker, target, damage) => {
				target.takeDamage(damage);
				if (target instanceof Boss) {
					target.updateHealthBar();
				}
				console.log(`NPC ${attacker.getId()} (${attacker.getTeam()}) hit NPC ${target.getId()} for ${damage}.`);
			},
			onPlayerAttack: (attacker, damage) => {
				player.takeDamage(damage);
				updateBattleHUD(player);
				console.log(`Player hit by NPC ${attacker.getId()} for ${damage}, health now ${player.getHealth()}`);
			}
		});

		let victoryHandled = false;
		const victoryCheck = () => {
			if (isDeathScreenVisible()) {
				return;
			}

			if (victoryHandled) {
				return;
			}

			const remainingFoes = npcs.filter((currentNpc) => currentNpc.getTeam() === 'foe' && currentNpc.isAlive());
			if (remainingFoes.length === 0) {
				if (!joanSpawned) {
					spawnJoanOfArc().catch((error) => console.error(error));
					return;
				}
				removeBattleHUD();
				victoryHandled = true;
				triggerVictory('Siege of Orléans', canvas, app);
			}
		};

		app.on('update', victoryCheck);
	}
