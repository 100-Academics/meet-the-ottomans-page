import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color, AppBase } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";
import { PolishHussar } from "../troops/polishHussar";
import { loadModel } from "../../../util/loadModel";

type WingedHussarAttackType = "hoardCharge" | "rayStorm" | "summonHoard";

interface HoardChargeState {
	endTimeSeconds: number;
	hasHit: boolean;
}

interface RayStormState {
	endTimeSeconds: number;
	nextRayAtSeconds: number;
	raysFired: number;
}

interface SummonHoardState {
	endTimeSeconds: number;
	nextSpawnAtSeconds: number;
	spawnsDone: number;
	targetCount: number;
}

export class WingedHussarBoss extends Boss {
	private readonly hoardChargeDamage = 25;
	private readonly hoardChargeDurationSeconds = 1.2;
	private readonly hoardChargeCooldownSeconds = 6.0;
	private nextHoardChargeAtSeconds = 0;

	private readonly rayStormDamage = 18;
	private readonly rayStormCount = 10;
	private readonly rayStormIntervalSeconds = 0.15;
	private readonly rayStormCooldownSeconds = 8.0;
	private readonly rayStormRange = 30;
	private nextRayStormAtSeconds = 0;

	// ── Summon Hoard ──
	private readonly summonHoardTargetCount = 4;
	private readonly summonHoardMaxAliveCap = 6;
	private readonly summonHoardSpawnIntervalSeconds = 0.35;
	private readonly summonHoardCooldownSeconds = 14.0;
	private readonly summonHoardRingRadius = 4.5;
	private readonly summonHoardTelegraphRadius = 5;
	private readonly summonHoardTelegraphDurationMs = 700;
	private nextSummonHoardAtSeconds = 5.0;
	private nextHussarId = 10000;

	private attackLockUntilSeconds = 0;
	private lastAttackType: WingedHussarAttackType | null = null;
	private lastAttackAtSeconds = -Infinity;
	private hoardChargeState: HoardChargeState | null = null;
	private rayStormState: RayStormState | null = null;
	private summonHoardState: SummonHoardState | null = null;
	private onPlayerAttack?: (attacker: npc, damage: number) => void;
	private activeAllNpcs: npc[] | null = null;

	private readonly hoardChargeMaterial = this.createEffectMaterial(
		new Color(0.9, 0.7, 0.2), new Color(1.0, 0.8, 0.3), 4.0, 0.85
	);
	private readonly rayStormMaterial = this.createEffectMaterial(
		new Color(0.2, 0.6, 1.0), new Color(0.3, 0.7, 1.0), 5.0, 0.9
	);
	private readonly summonTelegraphMaterial = this.createEffectMaterial(
		new Color(0.95, 0.75, 0.3), new Color(1.0, 0.85, 0.4), 5.0, 0.7
	);

	private readonly activeEffects = new Set<Entity>();
	private hoardMembers: PolishHussar[] = [];

	constructor(id: number, maxHealth: number, entity: Entity = new Entity("WingedHussarHoard")) {
		super(id, maxHealth, entity, "Winged Hussar Hoard");
		this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.2;
		this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.7;

		this.setIntroTaunt("Skrzydłasi atakują!", "Winged Hussars attack!");
		this.setIntroNameTranslation("Husarska Horda", "Winged Hussar Hoard");
		this.setTauntSet({
			highHealth: [
				"The wings of death surround you!",
				"Poland's elite shall crush you!",
				"Feel the thunder of our charge!"
			],
			bossLowPlayerHigh: [
				"A scratch! The Commonwealth is eternal!",
				"We bleed, but we do not break!"
			],
			playerLowBossHigh: [
				"The infidel falters before our might!",
				"Vienna shall not fall today!"
			],
			bothLow: [
				"One of us falls this day!",
				"Fortune favors the bold!"
			],
			death: [
				"For… Poland…",
				"The wings… fold…"
			],
			bossDeath: [
				"The Hussars… retreat…",
				"Vienna… holds…"
			]
		});
	}

	public addHoardMember(member: PolishHussar): void {
		this.hoardMembers.push(member);
	}

	public override updateCombatAI(
		deltaTime: number, currentTimeSeconds: number, allNpcs: npc[],
		onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
		playerEntity?: Entity | null,
		onPlayerAttack?: (attacker: npc, damage: number) => void
	): void {
		this.activeAllNpcs = allNpcs;
		this.onPlayerAttack = onPlayerAttack;
		super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
	}

	public override updateAI(
		deltaTime: number, targetEntity: Entity | null, currentTimeSeconds: number,
		onAttack?: (attacker: npc) => void,
		profileOverride?: { attackDamage: number; attackRange: number; attackCooldown: number; detectionRange: number; }
	): void {
		if (!this.isAlive()) return;
		const dt = Math.max(0, Math.min(deltaTime, 0.05));
		if (!targetEntity) { super.updateAI(dt, targetEntity, currentTimeSeconds, onAttack, profileOverride); return; }

		if (this.hoardChargeState) { this.updateHoardCharge(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.rayStormState) { this.updateRayStorm(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.summonHoardState) { this.updateSummonHoard(dt, targetEntity, currentTimeSeconds); return; }

		if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

		const distance = this.getFlatDistanceTo(targetEntity);
		const chosen = this.pickNextAttack(distance, currentTimeSeconds);
		if (chosen === "hoardCharge") { this.startHoardCharge(targetEntity, currentTimeSeconds); return; }
		if (chosen === "rayStorm") { this.startRayStorm(targetEntity, currentTimeSeconds); return; }
		if (chosen === "summonHoard") { this.startSummonHoard(currentTimeSeconds); return; }

		const myPos = this.getEntity().getPosition();
		const targetPos = targetEntity.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
	}

	public override kill(): boolean {
		const didKill = super.kill();
		if (didKill) {
			this.cleanupEffects();
			for (const member of this.hoardMembers) {
				try { member.kill(); } catch (e) { /* ignore */ }
			}
			this.hoardMembers = [];
		}
		return didKill;
	}

	protected override getCombatProfile() {
		const base = super.getCombatProfile();
		return { ...base, attackDamage: this.hoardChargeDamage, attackRange: this.rayStormRange, attackCooldown: Math.min(this.hoardChargeCooldownSeconds, this.rayStormCooldownSeconds), detectionRange: Number.MAX_VALUE };
	}

	private pickNextAttack(distance: number, now: number): WingedHussarAttackType | null {
		const choices: Array<{ type: WingedHussarAttackType; score: number }> = [];

		if (now >= this.nextHoardChargeAtSeconds && distance <= 30) {
			choices.push({ type: "hoardCharge", score: 1.3 });
		}

		if (now >= this.nextRayStormAtSeconds && distance <= this.rayStormRange) {
			choices.push({ type: "rayStorm", score: 1.4 });
		}

		if (now >= this.nextSummonHoardAtSeconds && this.activeAllNpcs) {
			const aliveHoard = this.countAliveHoardMembers();
			if (aliveHoard < this.summonHoardMaxAliveCap) {
				// Prefer summoning slightly less if a fresh hoard already exists.
				const summonScore = aliveHoard >= 2 ? 0.6 : 1.5;
				choices.push({ type: "summonHoard", score: summonScore });
			}
		}

		if (choices.length === 0) return null;

		if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 2.5) {
			for (const c of choices) { if (c.type === this.lastAttackType) c.score *= 0.3; }
		}

		let best = choices[0];
		for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
		const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
		if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
		return best.type;
	}

	private startHoardCharge(target: Entity, now: number): void {
		this.lastAttackType = "hoardCharge";
		this.lastAttackAtSeconds = now;
		
		this.hoardChargeState = {
			endTimeSeconds: now + this.hoardChargeDurationSeconds,
			hasHit: false
		};
		this.attackLockUntilSeconds = this.hoardChargeState.endTimeSeconds + 0.5;
		
		this.spawnHoardChargeVFX(target);
		
		for (const member of this.hoardMembers) {
			if (member.isAlive()) {
				const myPos = member.getEntity().getPosition();
				const targetPos = target.getPosition();
				const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();
				(member as any).isCharging = true;
				(member as any).chargeDirection = dir;
				(member as any).chargeEndTime = now + this.hoardChargeDurationSeconds;
			}
		}
	}

	private updateHoardCharge(_dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.hoardChargeState;
		if (!state) return;

		if (!state.hasHit && this.getFlatDistanceTo(target) <= 8) {
			state.hasHit = true;
			this.applyDamage(this.hoardChargeDamage, onAttack);
		}

		if (now >= state.endTimeSeconds) {
			this.hoardChargeState = null;
			this.nextHoardChargeAtSeconds = now + this.hoardChargeCooldownSeconds;
		}
	}

	private spawnHoardChargeVFX(_target: Entity): void {
		const sceneApp = this.resolveSceneApp();
		if (!sceneApp?.root) return;

		const bossPos = this.getEntity().getPosition();
		const chargeVFX = new Entity("hoard-charge-vfx");
		chargeVFX.addComponent("render", { type: "box", material: this.hoardChargeMaterial });
		chargeVFX.setLocalScale(3.0, 2.0, 5.0);
		chargeVFX.setPosition(bossPos);
		sceneApp.root.addChild(chargeVFX);
		this.activeEffects.add(chargeVFX);

		const startMs = Date.now();
		const durationMs = 1200;
		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= durationMs || !chargeVFX.parent) { this.destroyEffect(chargeVFX); return; }
			const t = elapsed / durationMs;
			const mat = chargeVFX.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (mat) { mat.opacity = 0.85 * (1 - t); mat.update(); }
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	private startRayStorm(_target: Entity, now: number): void {
		this.lastAttackType = "rayStorm";
		this.lastAttackAtSeconds = now;
		
		this.rayStormState = {
			endTimeSeconds: now + this.rayStormCount * this.rayStormIntervalSeconds + 0.3,
			nextRayAtSeconds: now,
			raysFired: 0
		};
		this.attackLockUntilSeconds = this.rayStormState.endTimeSeconds;
	}

	private updateRayStorm(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.rayStormState;
		if (!state) return;

		this.faceTarget(target, dt);

		if (state.raysFired < this.rayStormCount && now >= state.nextRayAtSeconds) {
			state.raysFired++;
			state.nextRayAtSeconds = now + this.rayStormIntervalSeconds;
			this.spawnRayBeam(target, onAttack);
		}

		if (now >= state.endTimeSeconds) {
			this.rayStormState = null;
			this.nextRayStormAtSeconds = now + this.rayStormCooldownSeconds;
		}
	}

	private spawnRayBeam(target: Entity, onAttack?: (attacker: npc) => void): void {
		const sceneApp = this.resolveSceneApp();
		if (!sceneApp?.root) return;

		const bossPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		
		const randomOffset = new Vec3(
			(Math.random() - 0.5) * 10,
			0,
			(Math.random() - 0.5) * 10
		);
		
		const rayPos = new Vec3(
			bossPos.x + randomOffset.x,
			bossPos.y,
			bossPos.z + randomOffset.z
		);

		const rayBeam = new Entity("hoard-ray-beam");
		rayBeam.addComponent("render", { type: "cylinder", material: this.rayStormMaterial });
		rayBeam.setLocalScale(0.5, 8.0, 0.5);
		rayBeam.setPosition(rayPos.x, rayPos.y + 4, rayPos.z);
		sceneApp.root.addChild(rayBeam);
		this.activeEffects.add(rayBeam);

		const startMs = Date.now();
		const durationMs = 600;
		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= durationMs || !rayBeam.parent) {
				this.destroyEffect(rayBeam);
				return;
			}
			const t = elapsed / durationMs;
			const mat = rayBeam.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (mat) {
				mat.opacity = 0.9 * (1 - t);
				mat.update();
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);

		const dx = targetPos.x - rayPos.x;
		const dz = targetPos.z - rayPos.z;
		const distance = Math.sqrt(dx * dx + dz * dz);
		if (distance <= 3.0) {
			this.applyDamage(this.rayStormDamage, onAttack);
		}
	}

	// ── Summon Hoard ──

	private startSummonHoard(now: number): void {
		this.lastAttackType = "summonHoard";
		this.lastAttackAtSeconds = now;

		this.summonHoardState = {
			endTimeSeconds: now + this.summonHoardTargetCount * this.summonHoardSpawnIntervalSeconds + 1.0,
			nextSpawnAtSeconds: now,
			spawnsDone: 0,
			targetCount: this.summonHoardTargetCount
		};
		this.attackLockUntilSeconds = this.summonHoardState.endTimeSeconds;

		// Telegraph all spawn positions up-front so the player has time to react.
		const myPos = this.getEntity().getPosition();
		for (let i = 0; i < this.summonHoardTargetCount; i++) {
			const angle = (i / this.summonHoardTargetCount) * Math.PI * 2;
			const x = myPos.x + Math.cos(angle) * this.summonHoardRingRadius;
			const z = myPos.z + Math.sin(angle) * this.summonHoardRingRadius;
			this.spawnSummonTelegraph(x, myPos.y, z);
		}
	}

	private updateSummonHoard(dt: number, target: Entity | null, now: number): void {
		const state = this.summonHoardState;
		if (!state) return;

		if (state.spawnsDone < state.targetCount && now >= state.nextSpawnAtSeconds) {
			state.spawnsDone++;
			state.nextSpawnAtSeconds = now + this.summonHoardSpawnIntervalSeconds;
			const angle = ((state.spawnsDone - 1) / state.targetCount) * Math.PI * 2;
			this.spawnSingleHussar(angle, target);
		}

		if (now >= state.endTimeSeconds) {
			this.summonHoardState = null;
			this.nextSummonHoardAtSeconds = now + this.summonHoardCooldownSeconds;
			return;
		}

		// Keep facing the player while summoning.
		if (target) {
			this.faceTarget(target, dt);
		}
	}

	private spawnSummonTelegraph(x: number, y: number, z: number): void {
		const sceneApp = this.resolveSceneApp();
		if (!sceneApp?.root) return;

		const ring = new Entity("hoard-summon-telegraph");
		ring.addComponent("render", { type: "cylinder" });
		ring.setLocalScale(0.5, 0.1, 0.5);
		if (ring.render?.meshInstances?.length) {
			ring.render.meshInstances[0].material = this.summonTelegraphMaterial;
		}
		ring.setPosition(x, y + 0.05, z);
		sceneApp.root.addChild(ring);
		this.activeEffects.add(ring);

		const startMs = performance.now();
		const durationMs = this.summonHoardTelegraphDurationMs;
		const animate = () => {
			if (!ring.parent) {
				this.destroyEffect(ring);
				return;
			}
			const elapsed = performance.now() - startMs;
			const t = Math.min(1, elapsed / durationMs);
			const radius = 0.5 + (this.summonHoardTelegraphRadius - 0.5) * t;
			ring.setLocalScale(radius, 0.1, radius);
			if (ring.render?.meshInstances?.length) {
				const mat = ring.render.meshInstances[0].material as StandardMaterial | undefined;
				if (mat) {
					mat.opacity = 0.7 * (1 - t);
					mat.update();
				}
			}
			if (t >= 1) {
				this.destroyEffect(ring);
				return;
			}
			requestAnimationFrame(animate);
		};
		requestAnimationFrame(animate);
	}

	private spawnSingleHussar(angle: number, _target: Entity | null): void {
		const sceneApp = this.resolveSceneApp();
		if (!sceneApp?.root) return;

		const myPos = this.getEntity().getPosition();
		const spawnX = myPos.x + Math.cos(angle) * this.summonHoardRingRadius;
		const spawnZ = myPos.z + Math.sin(angle) * this.summonHoardRingRadius;

		void this.loadAndRegisterHussar(sceneApp, spawnX, myPos.y, spawnZ);
	}

	private async loadAndRegisterHussar(app: AppBase, spawnX: number, spawnY: number, spawnZ: number): Promise<void> {
		try {
			const model = await loadModel("polish_hussar", app, {
				rigidbodyType: "kinematic",
				includeDescendants: true,
				position: new Vec3(spawnX, spawnY + 2, spawnZ),
				rotation: new Vec3(-90, 0, 0),
				scale: new Vec3(2, 2, 2)
			});
			const modelEntity = model.modelEntity;
			if (!modelEntity) return;
			if (!this.isAlive()) {
				// Boss died while we were loading — clean up the orphan model.
				try {
					if (modelEntity.parent) modelEntity.parent.removeChild(modelEntity);
					modelEntity.destroy();
				} catch { /* ignore */ }
				return;
			}
			modelEntity.tags?.add("npc");

			const hussar = new PolishHussar(this.nextHussarId, modelEntity);
			this.nextHussarId++;
			hussar.setFacingYawOffsetDegrees(0);
			hussar.setHitboxRadius(1.2);
			hussar.getEntity().tags?.add("npc");

			this.addHoardMember(hussar);

			if (this.activeAllNpcs) {
				this.activeAllNpcs.push(hussar);
			}
		} catch (err) {
			console.warn("[WingedHussarBoss] Failed to spawn summoned hussar", err);
		}
	}

	private countAliveHoardMembers(): number {
		let count = 0;
		for (const member of this.hoardMembers) {
			if (member.isAlive()) count++;
		}
		return count;
	}

	private faceTarget(target: Entity, dt: number): void {
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, dt);
	}

	private getFlatDistanceTo(target: Entity): number {
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dx = targetPos.x - myPos.x;
		const dz = targetPos.z - myPos.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
		if (this.onPlayerAttack) this.onPlayerAttack(this, damage);
		if (onAttack) onAttack(this);
	}

	private createEffectMaterial(emissiveColor: Color, diffuseColor: Color, emissiveIntensity: number, opacity: number): StandardMaterial {
		const mat = new StandardMaterial();
		mat.emissive = emissiveColor;
		mat.emissiveIntensity = emissiveIntensity;
		mat.diffuse = diffuseColor;
		mat.opacity = opacity;
		mat.blendType = BLEND_ADDITIVE;
		mat.cull = CULLFACE_NONE;
		mat.depthWrite = false;
		mat.update();
		return mat;
	}

	private destroyEffect(entity: Entity | null | undefined): void {
		if (!entity) return;
		this.activeEffects.delete(entity);
		if (entity.parent) entity.parent.removeChild(entity);
		entity.destroy();
	}

	private cleanupEffects(): void {
		for (const effect of this.activeEffects) {
			try { if (effect.parent) effect.parent.removeChild(effect); effect.destroy(); } catch { /* */ }
		}
		this.activeEffects.clear();
		this.hoardChargeState = null;
		this.rayStormState = null;
		this.summonHoardState = null;
	}

	private resolveSceneApp(targetEntity?: Entity): import("playcanvas").AppBase | undefined {
		const selfEntity = this.getEntity() as any;
		const selfApp = (selfEntity?.app ?? selfEntity?._app) as import("playcanvas").AppBase | undefined;
		if (selfApp?.root) return selfApp;
		const targetAny = targetEntity as any;
		const targetApp = (targetAny?.app ?? targetAny?._app) as import("playcanvas").AppBase | undefined;
		if (targetApp?.root) return targetApp;
		const globalApp = (globalThis as any)?.app as import("playcanvas").AppBase | undefined;
		if (globalApp?.root) return globalApp;
		return undefined;
	}
}