import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type UncleSamAttackType = "dash" | "fireball" | "groundSlam";

interface DashState {
	endTimeSeconds: number;
	direction: Vec3;
	hasHit: boolean;
}

interface FireballState {
	endTimeSeconds: number;
	fireballEntity: Entity | null;
	hasHit: boolean;
}

interface GroundSlamState {
	glowStartTimeSeconds: number;
	glowDurationSeconds: number;
	damageTimeSeconds: number;
	glowRadius: number;
	glowPosition: Vec3;
	glowEntity: Entity | null;
	hasDealtDamage: boolean;
}

export class UncleSam extends Boss {
	private readonly dashSpeed = PLAYER_MOVE_SPEED * 2.5;
	private readonly dashDurationSeconds = 0.5;
	private readonly dashCooldownSeconds = 1.0;
	private readonly dashRange = 35;
	private readonly dashDamage = 20;
	private readonly dashHitRadius = 10.0;

	private readonly fireballSpeed = 35;
	private readonly fireballCooldownSeconds = 3.0;
	private readonly fireballRange = 100;
	private readonly fireballDamage = 15;
	private readonly fireballRadius = 20.0;

	private readonly groundSlamCooldownSeconds = 2.0;
	private readonly groundSlamGlowDurationSeconds = 10.0;
	private readonly groundSlamDamageDelaySeconds = 2.5;
	private readonly groundSlamRadius = 25.0;
	private readonly groundSlamDamage = 30;

	private attackLockUntilSeconds = 0;
	private lastAttackType: UncleSamAttackType | null = null;
	private lastAttackAtSeconds = -Infinity;
	private nextDashAtSeconds = 0;
	private nextFireballAtSeconds = 0;
	private nextGroundSlamAtSeconds = 0;

	private dashState: DashState | null = null;
	private fireballState: FireballState | null = null;
	private groundSlamState: GroundSlamState | null = null;
	private onPlayerAttack?: (attacker: npc, damage: number) => void;

	private readonly fireballMaterial = this.createEffectMaterial(
		new Color(1.0, 0.4, 0.1), new Color(1.0, 0.6, 0.2), 4.5, 0.9
	);
	private readonly groundSlamGlowMaterial = this.createEffectMaterial(
		new Color(1.0, 0.3, 0.1), new Color(1.0, 0.5, 0.2), 5.0, 0.7
	);

	private readonly activeEffects = new Set<Entity>();

constructor(id: number, maxHealth: number, entity: Entity = new Entity("Uncle Sam")) {
		super(id, maxHealth, entity, "Uncle Sam");
		this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.1;
		this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.6;

		this.setIntroTaunt("I WANT YOU!", "I WANT YOU!");
		this.setIntroNameTranslation("Uncle Sam", "Uncle Sam");
		this.setIntroSkipTranslation(true);
		this.setTauntSet({
			highHealth: [
				"I want YOU… to surrender!",
				"Freedom isn't free, and neither is your defeat.",
				"Pay up, or pay the price!"
			],
			bossLowPlayerHigh: [
				"The land of the free fights back!",
				"Don't tread on me!",
				"Liberty or death!"
			],
			playerLowBossHigh: [
				"Your debt to freedom is past due.",
				"You can't afford to fight me.",
				"The price of defeat is steep."
			],
			bothLow: [
				"For liberty, I give my all!",
				"One nation, under fire!"
			],
			death: [
				"Freedom… carries a heavy cost.",
				"The dream… lives on."
			],
			bossDeath: [
				"I gave… my all for liberty.",
				"Old Glory… still waves."
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

		if (this.dashState) { this.updateDash(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.fireballState) { this.updateFireball(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.groundSlamState) { this.updateGroundSlam(dt, targetEntity, currentTimeSeconds, onAttack); return; }

		if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

		const distance = this.getFlatDistanceTo(targetEntity);
		const chosen = this.pickNextAttack(distance, currentTimeSeconds);
		if (chosen === "dash") { this.startDash(targetEntity, currentTimeSeconds); return; }
		if (chosen === "fireball") { this.startFireball(targetEntity, currentTimeSeconds); return; }
		if (chosen === "groundSlam") { this.startGroundSlam(targetEntity, currentTimeSeconds); return; }

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
		return { ...base, attackDamage: this.groundSlamDamage, attackRange: this.fireballRange, attackCooldown: this.dashCooldownSeconds, detectionRange: Number.MAX_VALUE };
	}

// ── Attack selection ──
	private pickNextAttack(distance: number, now: number): UncleSamAttackType | null {
		const choices: Array<{ type: UncleSamAttackType; score: number }> = [];

		if (now >= this.nextDashAtSeconds && distance <= this.dashRange) {
			const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.dashRange));
			choices.push({ type: "dash", score: 0.9 + closeness });
		}

		if (now >= this.nextFireballAtSeconds && distance <= this.fireballRange) {
			choices.push({ type: "fireball", score: 1.0 });
		}

		if (now >= this.nextGroundSlamAtSeconds) {
			choices.push({ type: "groundSlam", score: 1.5 });
		}

		if (choices.length === 0) return null;

		if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 1.8) {
			for (const c of choices) { if (c.type === this.lastAttackType) c.score *= 0.55; }
		}

		let best = choices[0];
		for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
		const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
		if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
		return best.type;
	}

	// ── Dash attack ──
	private startDash(target: Entity, now: number): void {
		this.lastAttackType = "dash";
		this.lastAttackAtSeconds = now;
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();
		this.dashState = {
			endTimeSeconds: now + this.dashDurationSeconds,
			direction: dir,
			hasHit: false
		};
		this.attackLockUntilSeconds = this.dashState.endTimeSeconds + 0.3;
	}

	private updateDash(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.dashState;
		if (!state) return;

		this.moveToward(state.direction.x, state.direction.z, this.dashSpeed, dt);

		if (!state.hasHit && this.getFlatDistanceTo(target) <= this.dashHitRadius) {
			state.hasHit = true;
			this.applyDamage(this.dashDamage, onAttack);
		}

		if (now >= state.endTimeSeconds) {
			this.dashState = null;
			this.nextDashAtSeconds = now + this.dashCooldownSeconds;
		}
	}

	// ── Fireball attack ──
	private startFireball(target: Entity, now: number): void {
		this.lastAttackType = "fireball";
		this.lastAttackAtSeconds = now;
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

		const fireball = new Entity("uncle-sam-fireball");
		fireball.addComponent("render", { type: "sphere", material: this.fireballMaterial });
		fireball.setLocalScale(this.fireballRadius, this.fireballRadius, this.fireballRadius);
		fireball.setPosition(myPos.x + dir.x * 1.5, myPos.y + 1.5, myPos.z + dir.z * 1.5);
		this.getEntity().parent?.addChild(fireball) ?? this.getEntity().addChild(fireball);
		this.activeEffects.add(fireball);

		const startPos = fireball.getPosition().clone();
		const startMs = Date.now();
		const maxMs = 1500;

		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= maxMs || !fireball.parent) { this.destroyEffect(fireball); return; }
			const t = elapsed / 1000;
			fireball.setPosition(startPos.x + dir.x * this.fireballSpeed * t, startPos.y, startPos.z + dir.z * this.fireballSpeed * t);
			const mat = fireball.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (mat) { mat.opacity = 0.9 * (1 - elapsed / maxMs); mat.update(); }
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);

		this.fireballState = {
			endTimeSeconds: now + 1.5,
			fireballEntity: fireball,
			hasHit: false
		};
		this.attackLockUntilSeconds = this.fireballState.endTimeSeconds + 0.3;
	}

	private updateFireball(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.fireballState;
		if (!state) return;

		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);

		if (!state.hasHit && this.checkFireballHit(target)) {
			state.hasHit = true;
			this.applyDamage(this.fireballDamage, onAttack);
		}

		if (now >= state.endTimeSeconds) {
			this.destroyEffect(state.fireballEntity);
			this.fireballState = null;
			this.nextFireballAtSeconds = now + this.fireballCooldownSeconds;
		}
	}

	private checkFireballHit(target: Entity): boolean {
		const state = this.fireballState;
		if (!state || !state.fireballEntity) return false;
		const fireballPos = state.fireballEntity.getPosition();
		const targetPos = target.getPosition();
		const dx = targetPos.x - fireballPos.x;
		const dz = targetPos.z - fireballPos.z;
		const distance = Math.sqrt(dx * dx + dz * dz);
		return distance <= this.fireballRadius + 1.5;
	}

	// ── Ground slam attack ──
	private startGroundSlam(target: Entity, now: number): void {
		this.lastAttackType = "groundSlam";
		this.lastAttackAtSeconds = now;
		const targetPos = target.getPosition();
		const glowEntity = this.spawnGlowEffect(targetPos, this.groundSlamRadius, this.groundSlamGlowDurationSeconds * 1000);
		this.groundSlamState = {
			glowStartTimeSeconds: now,
			glowDurationSeconds: this.groundSlamGlowDurationSeconds,
			damageTimeSeconds: now + this.groundSlamDamageDelaySeconds,
			glowRadius: this.groundSlamRadius,
			glowPosition: new Vec3(targetPos.x, targetPos.y, targetPos.z),
			glowEntity: glowEntity,
			hasDealtDamage: false
		};
		this.attackLockUntilSeconds = now + this.groundSlamGlowDurationSeconds + 0.5;
	}

	private updateGroundSlam(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.groundSlamState;
		if (!state) return;

		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);

		if (!state.hasDealtDamage && now >= state.damageTimeSeconds) {
			state.hasDealtDamage = true;
			if (this.checkPlayerInGlowArea(target, state.glowPosition, state.glowRadius)) {
				this.applyDamage(this.groundSlamDamage, onAttack);
			}
		}

		if (now >= state.glowStartTimeSeconds + state.glowDurationSeconds) {
			this.destroyEffect(state.glowEntity);
			this.groundSlamState = null;
			this.nextGroundSlamAtSeconds = now + this.groundSlamCooldownSeconds;
		}
	}

	private checkPlayerInGlowArea(target: Entity, glowCenter: Vec3, radius: number): boolean {
		const targetPos = target.getPosition();
		const dx = targetPos.x - glowCenter.x;
		const dz = targetPos.z - glowCenter.z;
		const distance = Math.sqrt(dx * dx + dz * dz);
		return distance <= radius;
	}

	private spawnGlowEffect(center: Vec3, radius: number, durationMs: number): Entity | null {
		const sceneApp = this.resolveSceneApp();
		if (!sceneApp?.root) return null;

		const glowRoot = new Entity("uncle-sam-ground-glow");
		const glowMesh = new Entity("uncle-sam-ground-glow-mesh");
		glowMesh.addComponent("render", { type: "cylinder", material: this.groundSlamGlowMaterial });
		glowMesh.setLocalScale(radius, 0.15, radius);
		glowMesh.setPosition(0, 0.08, 0);
		glowRoot.addChild(glowMesh);
		glowRoot.setPosition(center.x, center.y, center.z);
		sceneApp.root.addChild(glowRoot);
		this.activeEffects.add(glowRoot);

		const startMs = Date.now();
		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= durationMs || !glowRoot.parent) { this.destroyEffect(glowRoot); return; }
			const mat = glowMesh.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (mat) {
				const pulse = 0.7 + Math.sin((elapsed / 1000) * Math.PI * 2) * 0.3;
				mat.opacity = pulse * 0.7;
				mat.update();
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);

		return glowRoot;
	}

// ── Helpers ──

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
		this.dashState = null;
		this.fireballState = null;
		this.groundSlamState = null;
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
