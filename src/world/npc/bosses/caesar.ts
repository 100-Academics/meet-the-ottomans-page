import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type CaesarAttackType = "fireDash" | "buildFromGround";

interface FireDashState {
	endTimeSeconds: number;
	direction: Vec3;
	hasHit: boolean;
}

interface BuildFromGroundState {
	endTimeSeconds: number;
	nextBlockAtSeconds: number;
	blocksSpawned: number;
	blockPositions: Vec3[];
}

export class Caesar extends Boss {
	private readonly fireDashSpeed = PLAYER_MOVE_SPEED * 2.8;
	private readonly fireDashDurationSeconds = 0.6;
	private readonly fireDashCooldownSeconds = 5.0;
	private readonly fireDashRange = 20;
	private readonly fireDashDamage = 18;
	private readonly fireDashHitRadius = 3.0;
	private nextFireDashAtSeconds = 0;

	private readonly buildBlockCount = 20;
	private readonly buildIntervalSeconds = 0.08;
	private readonly buildCooldownSeconds = 6.0;
	private readonly buildRange = 30;
	private readonly buildDamage = 25;
	private readonly buildHitRadius = 6.0;
	private nextBuildAtSeconds = 0;

	private attackLockUntilSeconds = 0;
	private lastAttackType: CaesarAttackType | null = null;
	private lastAttackAtSeconds = -Infinity;
	private fireDashState: FireDashState | null = null;
	private buildState: BuildFromGroundState | null = null;
	private onPlayerAttack?: (attacker: npc, damage: number) => void;

	private readonly fireDashMaterial = this.createEffectMaterial(
		new Color(1.0, 0.5, 0.1), new Color(1.0, 0.7, 0.2), 4.5, 0.85
	);
	private readonly buildingMaterial = this.createEffectMaterial(
		new Color(0.75, 0.7, 0.55), new Color(0.9, 0.85, 0.7), 2.0, 0.85
	);

	private readonly activeEffects = new Set<Entity>();

	constructor(id: number, maxHealth: number, entity: Entity = new Entity("Caesar")) {
		super(id, maxHealth, entity, "Julius Caesar");
		this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.5;
		this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.8;

		this.setIntroTaunt("Veni, vidi, vici!", "I came, I saw, I conquered!");
		this.setIntroNameTranslation("Gaius Iulius Caesar", "Julius Caesar");
		this.setTauntSet({
			highHealth: [
				"Rome's legions stand behind me.",
				"You face the dictator of the Roman Republic.",
				"The Senate has decreed your defeat."
			],
			bossLowPlayerHigh: [
				"Alea iacta est! The die is cast!",
				"Rome does not fall to barbarians!",
				"My legions will avenge every wound!"
			],
			playerLowBossHigh: [
				"Yield, and Rome may show mercy.",
				"You are outmatched, barbarian.",
				"Kneel before the eagle of Rome."
			],
			bothLow: [
				"Et tu? Then fall, challenger!",
				"Rome's fate hangs by a thread."
			],
			death: [
				"Et tu, Brute…",
				"The Republic… falls with me."
			],
			bossDeath: [
				"The eagles… fall.",
				"Rome… endures without me.",
				" Pizza Pizza."
			]
		});
	}

	public override updateCombatAI(
		deltaTime: number, currentTimeSeconds: number, allNpcs: npc[],
		onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
		playerEntity?: Entity | null,
		onPlayerAttack?: (attacker: npc, damage: number) => void
	): void {
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

		if (this.fireDashState) { this.updateFireDash(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.buildState) { this.updateBuildFromGround(dt, targetEntity, currentTimeSeconds, onAttack); return; }

		if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

		const distance = this.getFlatDistanceTo(targetEntity);
		const chosen = this.pickNextAttack(distance, currentTimeSeconds);
		if (chosen === "fireDash") { this.startFireDash(targetEntity, currentTimeSeconds); return; }
		if (chosen === "buildFromGround") { this.startBuildFromGround(targetEntity, currentTimeSeconds); return; }

		const myPos = this.getEntity().getPosition();
		const targetPos = targetEntity.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
	}

	public override kill(): boolean {
		const didKill = super.kill();
		if (didKill) this.cleanupEffects();
		return didKill;
	}

	protected override getCombatProfile() {
		const base = super.getCombatProfile();
		return { ...base, attackDamage: this.buildDamage, attackRange: this.buildRange, attackCooldown: Math.min(this.fireDashCooldownSeconds, this.buildCooldownSeconds), detectionRange: Number.MAX_VALUE };
	}

	private pickNextAttack(distance: number, now: number): CaesarAttackType | null {
		const choices: Array<{ type: CaesarAttackType; score: number }> = [];

		if (now >= this.nextFireDashAtSeconds && distance <= this.fireDashRange) {
			const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.fireDashRange));
			choices.push({ type: "fireDash", score: 1.0 + closeness });
		}

		if (now >= this.nextBuildAtSeconds && distance <= this.buildRange) {
			choices.push({ type: "buildFromGround", score: 1.3 });
		}

		if (choices.length === 0) return null;

		if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 2.0) {
			for (const c of choices) { if (c.type === this.lastAttackType) c.score *= 0.3; }
		}

		let best = choices[0];
		for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
		const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
		if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
		return best.type;
	}

	private startFireDash(target: Entity, now: number): void {
		this.lastAttackType = "fireDash";
		this.lastAttackAtSeconds = now;
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

		this.fireDashState = {
			endTimeSeconds: now + this.fireDashDurationSeconds,
			direction: dir,
			hasHit: false
		};
		this.attackLockUntilSeconds = this.fireDashState.endTimeSeconds + 0.2;
		this.spawnFireDashVFX();
	}

	private updateFireDash(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.fireDashState;
		if (!state) return;

		this.moveToward(state.direction.x, state.direction.z, this.fireDashSpeed, dt);

		if (!state.hasHit && this.getFlatDistanceTo(target) <= this.fireDashHitRadius) {
			state.hasHit = true;
			this.applyDamage(this.fireDashDamage, onAttack);
		}

		if (now >= state.endTimeSeconds) {
			this.fireDashState = null;
			this.nextFireDashAtSeconds = now + this.fireDashCooldownSeconds;
		}
	}

	private spawnFireDashVFX(): void {
		const sceneApp = this.resolveSceneApp();
		if (!sceneApp?.root) return;

		const bossPos = this.getEntity().getPosition();
		const fireVFX = new Entity("caesar-fire-dash-vfx");
		fireVFX.addComponent("render", { type: "sphere", material: this.fireDashMaterial });
		fireVFX.setLocalScale(1.5, 1.5, 1.5);
		fireVFX.setPosition(bossPos);
		sceneApp.root.addChild(fireVFX);
		this.activeEffects.add(fireVFX);

		const startMs = Date.now();
		const durationMs = 600;
		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= durationMs || !fireVFX.parent) { this.destroyEffect(fireVFX); return; }
			const t = elapsed / durationMs;
			const scale = 1.5 + t * 1.5;
			fireVFX.setLocalScale(scale, scale * 0.3, scale);
			const mat = fireVFX.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (mat) { mat.opacity = 0.85 * (1 - t); mat.update(); }
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	private startBuildFromGround(target: Entity, now: number): void {
		this.lastAttackType = "buildFromGround";
		this.lastAttackAtSeconds = now;
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
		if (dir.lengthSq() <= 0.0001) return;
		dir.normalize();

		const blockPositions: Vec3[] = [];
		for (let i = 0; i < this.buildBlockCount; i++) {
			const forwardDist = i * 3.5 + 2;
			const lateralOffset = (i % 2 === 0 ? 1 : -1) * 2.5;
			blockPositions.push(new Vec3(
				myPos.x + dir.x * forwardDist + (-dir.z) * lateralOffset,
				myPos.y,
				myPos.z + dir.z * forwardDist + dir.x * lateralOffset
			));
		}

		this.buildState = {
			endTimeSeconds: now + this.buildBlockCount * this.buildIntervalSeconds + 0.8,
			nextBlockAtSeconds: now,
			blocksSpawned: 0,
			blockPositions
		};
		this.attackLockUntilSeconds = this.buildState.endTimeSeconds;
	}

	private updateBuildFromGround(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.buildState;
		if (!state) return;

		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed * 0.5, dt);

		if (state.blocksSpawned < this.buildBlockCount && now >= state.nextBlockAtSeconds) {
			const pos = state.blockPositions[state.blocksSpawned];
			state.blocksSpawned++;
			state.nextBlockAtSeconds = now + this.buildIntervalSeconds;

			const block = new Entity("caesar-building-block");
			block.addComponent("render", { type: "box", material: this.buildingMaterial });
			block.setLocalScale(2.0, 0.1, 2.0);
			block.setPosition(pos.x, pos.y, pos.z);
			this.getEntity().parent?.addChild(block) ?? this.getEntity().addChild(block);
			this.activeEffects.add(block);

			const startMs = Date.now();
			const riseMs = 50;
			const holdMs = 100;
			const totalMs = riseMs + holdMs;

			const tick = () => {
				const elapsed = Date.now() - startMs;
				if (elapsed >= totalMs || !block.parent) { this.destroyEffect(block); return; }
				if (elapsed < riseMs) {
					const t = elapsed / riseMs;
					block.setLocalScale(2.0, 5.0 * t, 2.0);
					block.setPosition(pos.x, pos.y + 2.5 * t, pos.z);
				}
				const mat = block.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
				if (mat && elapsed > riseMs) {
					mat.opacity = 0.85 * (1 - (elapsed - riseMs) / holdMs);
					mat.update();
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);

			const targetPos = target.getPosition();
			const dx = targetPos.x - pos.x;
			const dz = targetPos.z - pos.z;
			if (Math.sqrt(dx * dx + dz * dz) <= this.buildHitRadius) {
				this.applyDamage(this.buildDamage, onAttack);
			}
		}

		if (now >= state.endTimeSeconds) {
			this.buildState = null;
			this.nextBuildAtSeconds = now + this.buildCooldownSeconds;
		}
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
		this.fireDashState = null;
		this.buildState = null;
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