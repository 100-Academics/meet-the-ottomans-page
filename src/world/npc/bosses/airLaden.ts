import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type AirLadinAttackType = "caveAmbush" | "iedBlast" | "akSpray" | "goInvisible" | "suicideBombers";

interface CaveAmbushState {
	endTimeSeconds: number;
	hasAmbushed: boolean;
}

interface IedBlastState {
	endTimeSeconds: number;
	nextCraterAtSeconds: number;
	cratersSpawned: number;
	craterPositions: Vec3[];
}

interface AkSprayState {
	endTimeSeconds: number;
	hasFired: boolean;
}

interface InvisibilityState {
	endTimeSeconds: number;
	hasFadedOut: boolean;
	hasReappeared: boolean;
}

interface SuicideBomber {
	entity: Entity;
	startPos: Vec3;
	startMs: number;
}

interface SuicideBombersState {
	endTimeSeconds: number;
	hasSpawned: boolean;
	bombers: SuicideBomber[];
}

export class AirLadin extends Boss {
	private readonly ambushCooldownSeconds = 10.0;
	private readonly ambushRange = 50;
	private readonly ambushDamage = 5;
	private nextAmbushAtSeconds = 0;

	private readonly iedCraterCount = 5;
	private readonly iedIntervalSeconds = 0.2;
	private readonly iedCooldownSeconds = 8.0;
	private readonly iedRange = 36;
	private readonly iedDamage = 14;
	private readonly iedHitRadius = 5;
	private nextIedAtSeconds = 0;

	private readonly akDamage = 10;
	private readonly akCooldownSeconds = 3.5;
	private readonly akRange = 70;
	private nextAkAtSeconds = 0;

  private readonly invisCooldownSeconds = 30.0;
  private readonly invisDurationSeconds = 3.0;
  private readonly invisRange = 60;
	private nextInvisAtSeconds = 0;

	private readonly bomberCount = 3;
	private readonly bomberTimerSeconds = 4.0;
	private readonly bomberSpeed = PLAYER_MOVE_SPEED * 2.0;
	private readonly bomberExplosionRadius = 3.5;
	private readonly bomberDamage = 20;
	private readonly bomberCooldownSeconds = 14.0;
	private readonly bomberRange = 60;
	private nextBomberAtSeconds = 0;

	private attackLockUntilSeconds = 0;
	private lastAttackType: AirLadinAttackType | null = null;
	private lastAttackAtSeconds = -Infinity;
	private caveAmbushState: CaveAmbushState | null = null;
	private iedBlastState: IedBlastState | null = null;
	private akSprayState: AkSprayState | null = null;
	private invisState: InvisibilityState | null = null;
	private bombersState: SuicideBombersState | null = null;
	private isCurrentlyInvisible = false;
	private onPlayerAttack?: (attacker: npc, damage: number) => void;

	private readonly iedMaterial = this.createEffectMaterial(
		new Color(0.8, 0.3, 0.0), new Color(1.0, 0.5, 0.1), 3.0, 0.9
	);
	private readonly bulletMaterial = this.createEffectMaterial(
		new Color(0.9, 0.8, 0.2), new Color(1.0, 0.95, 0.5), 4.0, 0.8
	);
	private readonly ambushRingMaterial = this.createEffectMaterial(
		new Color(0.2, 0.5, 0.2), new Color(0.4, 0.8, 0.3), 2.5, 0.7
	);
	private readonly invisSmokeMaterial = this.createEffectMaterial(
		new Color(0.4, 0.4, 0.5), new Color(0.6, 0.6, 0.7), 2.0, 0.6
	);
	private readonly bomberBodyMaterial = this.createEffectMaterial(
		new Color(0.5, 0.2, 0.0), new Color(0.7, 0.3, 0.0), 2.5, 0.85
	);
	private readonly bombGlowMaterial = this.createEffectMaterial(
		new Color(1.0, 0.2, 0.0), new Color(1.0, 0.4, 0.1), 5.0, 0.9
	);
	private readonly explosionMaterial = this.createEffectMaterial(
		new Color(1.0, 0.6, 0.0), new Color(1.0, 0.8, 0.2), 4.0, 1.0
	);

	private readonly activeEffects = new Set<Entity>();

	constructor(id: number, maxHealth: number, entity: Entity = new Entity("AirLadin")) {
		super(id, maxHealth, entity, "Air Ladin");
		this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.1;
		this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.6;

		this.setIntroTaunt("لن تجدني أبداً!", "You will never find me!");
		this.setIntroNameTranslation("إير لادن", "Air Ladin");
		
        this.setTauntSet({
			highHealth: [
				"The mountains are my fortress.",
				"You cannot destroy what you cannot find.",
				"I have outlasted empires before you."
			],
			bossLowPlayerHigh: [
				"Even in death, the cause endures.",
				"You have won nothing — only a body.",
				"Martyrdom is my final weapon."
			],
			playerLowBossHigh: [
				"Your crusade ends here.",
				"The mountain does not move for you.",
				"You came to my cave — now face the darkness."
			],
			bothLow: [
				"One of us will not leave this mountain.",
				"The end is written."
			],
			death: [
				"Allah akbar!",
			],
			bossDeath: [
				"The cave is silent once more.",
				"The mountain reclaims its own."
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

		if (this.caveAmbushState) { this.updateCaveAmbush(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.iedBlastState) { this.updateIedBlast(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.akSprayState) { this.updateAkSpray(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.invisState) { this.updateInvisibility(dt, targetEntity, currentTimeSeconds, onAttack); return; }
		if (this.bombersState) { this.updateSuicideBombers(dt, targetEntity, currentTimeSeconds, onAttack); return; }

		if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

		const distance = this.getFlatDistanceTo(targetEntity);
		const chosen = this.pickNextAttack(distance, currentTimeSeconds);
		if (chosen === "caveAmbush") { this.startCaveAmbush(currentTimeSeconds); return; }
		if (chosen === "iedBlast") { this.startIedBlast(targetEntity, currentTimeSeconds); return; }
		if (chosen === "akSpray") { this.startAkSpray(currentTimeSeconds); return; }
		if (chosen === "goInvisible") { this.startInvisibility(currentTimeSeconds); return; }
		if (chosen === "suicideBombers") { this.startSuicideBombers(targetEntity, currentTimeSeconds); return; }

		// No attack chosen: chase the target on foot
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
		return { ...base, attackDamage: this.akDamage, attackRange: this.akRange, attackCooldown: this.akCooldownSeconds, detectionRange: Number.MAX_VALUE };
	}

	private pickNextAttack(distance: number, now: number): AirLadinAttackType | null {
		const choices: Array<{ type: AirLadinAttackType; score: number }> = [];
		if (now >= this.nextAmbushAtSeconds && distance <= this.ambushRange) {
			choices.push({ type: "caveAmbush", score: 1.0 });
		}
		if (now >= this.nextIedAtSeconds && distance <= this.iedRange) {
			const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.iedRange));
			choices.push({ type: "iedBlast", score: 1.2 + closeness });
		}
		if (now >= this.nextAkAtSeconds && distance <= this.akRange) {
			choices.push({ type: "akSpray", score: 1.0 + (distance / Math.max(0.001, this.akRange)) });
		}
  if (now >= this.nextInvisAtSeconds && distance <= this.invisRange) {
    choices.push({ type: "goInvisible", score: 0.6 });
  }
		if (now >= this.nextBomberAtSeconds && distance <= this.bomberRange) {
			choices.push({ type: "suicideBombers", score: 1.8 });
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

	// ── Cave Ambush ──

	private startCaveAmbush(now: number): void {
		this.lastAttackType = "caveAmbush"; this.lastAttackAtSeconds = now;
		this.caveAmbushState = { endTimeSeconds: now + 1.0, hasAmbushed: false };
		this.attackLockUntilSeconds = this.caveAmbushState.endTimeSeconds;
	}

	private updateCaveAmbush(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.caveAmbushState; if (!state) return;
		this.faceTarget(target, dt);
		if (!state.hasAmbushed) {
			state.hasAmbushed = true;
			this.spawnRingEffect(this.getEntity().getPosition(), 4, 1200, this.ambushRingMaterial, "airladin-ambush-ring", 0.5);
			this.applyDamage(this.ambushDamage, onAttack);
		}
		if (now >= state.endTimeSeconds) {
			this.caveAmbushState = null;
			this.nextAmbushAtSeconds = now + this.ambushCooldownSeconds;
		}
	}

	// ── IED Blast ──

	private startIedBlast(target: Entity, now: number): void {
		this.lastAttackType = "iedBlast"; this.lastAttackAtSeconds = now;
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
		if (dir.lengthSq() <= 0.0001) return; dir.normalize();

		const craterPositions: Vec3[] = [];
		for (let i = 0; i < this.iedCraterCount; i++) {
			const forwardDist = i * 2.5 + 3;
			const lateralOffset = (i % 2 === 0 ? 1 : -1) * 1.5;
			craterPositions.push(new Vec3(
				myPos.x + dir.x * forwardDist + (-dir.z) * lateralOffset,
				myPos.y,
				myPos.z + dir.z * forwardDist + dir.x * lateralOffset
			));
		}

		this.iedBlastState = {
			endTimeSeconds: now + this.iedCraterCount * this.iedIntervalSeconds + 1.0,
			nextCraterAtSeconds: now,
			cratersSpawned: 0,
			craterPositions
		};
		this.attackLockUntilSeconds = this.iedBlastState.endTimeSeconds;
	}

	private updateIedBlast(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.iedBlastState; if (!state) return;
		this.faceTarget(target, dt);

		if (state.cratersSpawned < this.iedCraterCount && now >= state.nextCraterAtSeconds) {
			const pos = state.craterPositions[state.cratersSpawned];
			state.cratersSpawned++;
			state.nextCraterAtSeconds = now + this.iedIntervalSeconds;

			const crater = new Entity("airladin-ied-crater");
			crater.addComponent("render", { type: "box", material: this.iedMaterial });
			crater.setLocalScale(1.5, 0.1, 1.5);
			crater.setPosition(pos.x, pos.y, pos.z);
			this.getEntity().parent?.addChild(crater) ?? this.getEntity().addChild(crater);
			this.activeEffects.add(crater);

			const startMs = Date.now();
			const riseMs = 300;
			const holdMs = 700;
			const totalMs = riseMs + holdMs;
			const tick = () => {
				const elapsed = Date.now() - startMs;
				if (elapsed >= totalMs || !crater.parent) { this.destroyEffect(crater); return; }
				if (elapsed < riseMs) {
					const t = elapsed / riseMs;
					crater.setLocalScale(1.5 * (1 + 0.5 * t), 4.0 * t, 1.5 * (1 + 0.5 * t));
					crater.setPosition(pos.x, pos.y + 2.0 * t, pos.z);
				}
				const mat = crater.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
				if (mat && elapsed > riseMs) {
					mat.opacity = 0.9 * (1 - (elapsed - riseMs) / holdMs);
					mat.update();
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);

			const targetPos = target.getPosition();
			const dx = targetPos.x - pos.x;
			const dz = targetPos.z - pos.z;
			if (Math.sqrt(dx * dx + dz * dz) <= this.iedHitRadius) {
				this.applyDamage(this.iedDamage, onAttack);
			}
		}

		if (now >= state.endTimeSeconds) {
			this.iedBlastState = null;
			this.nextIedAtSeconds = now + this.iedCooldownSeconds;
		}
	}

	// ── AK-47 Spray ──

	private startAkSpray(now: number): void {
		this.lastAttackType = "akSpray"; this.lastAttackAtSeconds = now;
		this.akSprayState = { endTimeSeconds: now + 0.6, hasFired: false };
		this.attackLockUntilSeconds = this.akSprayState.endTimeSeconds;
	}

	private updateAkSpray(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.akSprayState; if (!state) return;
		this.faceTarget(target, dt);
		if (!state.hasFired && now >= state.endTimeSeconds - 0.15) {
			state.hasFired = true;
			this.spawnBulletBurst(target);
			if (this.getFlatDistanceTo(target) <= this.akRange) {
				this.applyDamage(this.akDamage, onAttack);
			}
		}
		if (now >= state.endTimeSeconds) {
			this.akSprayState = null;
			this.nextAkAtSeconds = now + this.akCooldownSeconds;
		}
	}

	private spawnBulletBurst(target: Entity): void {
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();
		const baseYaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI;

		for (let i = 0; i < 3; i++) {
			const spreadDeg = (i - 1) * 5;
			const bullet = new Entity("airladin-bullet");
			bullet.addComponent("render", { type: "cone", material: this.bulletMaterial });
			bullet.setLocalScale(0.1, 0.1, 1.2);
			const yaw = baseYaw + spreadDeg;
			const spreadRad = spreadDeg * Math.PI / 180;
			const bDir = new Vec3(
				dir.x * Math.cos(spreadRad) - dir.z * Math.sin(spreadRad),
				0,
				dir.x * Math.sin(spreadRad) + dir.z * Math.cos(spreadRad)
			).normalize();
			bullet.setLocalEulerAngles(-90, yaw, 0);
			bullet.setPosition(myPos.x + bDir.x * 2, myPos.y + 1.5, myPos.z + bDir.z * 2);
			this.getEntity().parent?.addChild(bullet) ?? this.getEntity().addChild(bullet);
			this.activeEffects.add(bullet);
			const startPos = bullet.getPosition().clone();
			const speed = 50; const startMs = Date.now(); const maxMs = 1000;
			const bDirCapture = bDir;
			const tick = () => {
				const elapsed = Date.now() - startMs;
				if (elapsed >= maxMs || !bullet.parent) { this.destroyEffect(bullet); return; }
				const t = elapsed / 1000;
				bullet.setPosition(startPos.x + bDirCapture.x * speed * t, startPos.y, startPos.z + bDirCapture.z * speed * t);
				const mat = bullet.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
				if (mat) { mat.opacity = 0.8 * (1 - elapsed / maxMs); mat.update(); }
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}
	}

	// ── Invisibility ──

	private startInvisibility(now: number): void {
		this.lastAttackType = "goInvisible"; this.lastAttackAtSeconds = now;
		this.invisState = { endTimeSeconds: now + this.invisDurationSeconds, hasFadedOut: false, hasReappeared: false };
		this.attackLockUntilSeconds = now + 0.5;
	}

  private updateInvisibility(dt: number, target: Entity, now: number, _onAttack?: (attacker: npc) => void): void {
		const state = this.invisState; if (!state) return;

		if (!state.hasFadedOut) {
			state.hasFadedOut = true;
			this.isCurrentlyInvisible = true;
			this.setBossModelVisible(false);
			this.spawnSmokeCloud(this.getEntity().getPosition());
			this.showStatusText("Air Ladin has vanished!", 2000);
		}

		if (now >= state.endTimeSeconds - 0.5 && !state.hasReappeared) {
			state.hasReappeared = true;
			this.isCurrentlyInvisible = false;
			this.setBossModelVisible(true);
			this.spawnSmokeCloud(this.getEntity().getPosition());
			this.showStatusText("Air Ladin reappears!", 1500);
		}

		if (now < state.endTimeSeconds - 0.5) {
			const myPos = this.getEntity().getPosition();
			const targetPos = target.getPosition();
			this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed * 1.3, dt);
		} else {
			this.faceTarget(target, dt);
		}

		if (now >= state.endTimeSeconds) {
			this.invisState = null;
			this.nextInvisAtSeconds = now + this.invisCooldownSeconds;
			if (this.isCurrentlyInvisible) {
				this.isCurrentlyInvisible = false;
				this.setBossModelVisible(true);
			}
		}
	}

  private savedMaterialOpacities: Map<any, number> = new Map();

  private setBossModelVisible(visible: boolean): void {
  const entity = this.getEntity();
  const model = entity.model;
  if (model) {
  model.castShadows = visible;
  model.receiveShadows = visible;
  const meshInstances = model.meshInstances;
  if (meshInstances) {
  for (const instance of meshInstances) {
  instance.visible = visible;
  const mat = instance.material as StandardMaterial | undefined;
  if (mat) {
  if (visible) {
  const saved = this.savedMaterialOpacities.get(mat);
  if (saved !== undefined) {
  mat.opacity = saved;
  this.savedMaterialOpacities.delete(mat);
  }
  mat.blendType = (saved !== undefined && saved < 1) ? mat.blendType : 0;
  } else {
  if (!this.savedMaterialOpacities.has(mat)) {
  this.savedMaterialOpacities.set(mat, mat.opacity);
  }
  mat.opacity = 0;
  mat.blendType = BLEND_ADDITIVE;
  }
  mat.update();
  }
  }
  }
  }
  const healthBar = document.getElementById("boss-health-bar");
  if (healthBar) {
  healthBar.style.opacity = visible ? "1" : "0.2";
  }
  }

	private spawnSmokeCloud(origin: Vec3): void {
		const particleCount = 6;
		for (let i = 0; i < particleCount; i++) {
			const offset = new Vec3(
				(Math.random() - 0.5) * 3,
				0,
				(Math.random() - 0.5) * 3
			);
			const pos = new Vec3(origin.x + offset.x, origin.y + 0.5, origin.z + offset.z);
			const puff = new Entity("airladin-smoke-puff");
			puff.addComponent("render", { type: "sphere", material: this.invisSmokeMaterial });
			puff.setLocalScale(0.5, 0.5, 0.5);
			puff.setPosition(pos.x, pos.y, pos.z);
			this.getEntity().parent?.addChild(puff) ?? this.getEntity().addChild(puff);
			this.activeEffects.add(puff);

			const startMs = Date.now();
			const durationMs = 800;
			const driftX = (Math.random() - 0.5) * 2;
			const driftZ = (Math.random() - 0.5) * 2;
			const tick = () => {
				const elapsed = Date.now() - startMs;
				if (elapsed >= durationMs || !puff.parent) { this.destroyEffect(puff); return; }
				const t = elapsed / durationMs;
				const scale = 0.5 + t * 2.5;
				puff.setLocalScale(scale, scale, scale);
				puff.setPosition(pos.x + driftX * t, pos.y + t * 2, pos.z + driftZ * t);
				const mat = puff.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
				if (mat) { mat.opacity = 0.6 * (1 - t); mat.update(); }
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}
	}

	// ── Suicide Bombers ──

	private startSuicideBombers(target: Entity, now: number): void {
		this.lastAttackType = "suicideBombers"; this.lastAttackAtSeconds = now;
		this.bombersState = { endTimeSeconds: now + this.bomberTimerSeconds + 1.0, hasSpawned: false, bombers: [] };
		this.attackLockUntilSeconds = now + 0.8;
		this.spawnBombers(target);
		this.bombersState.hasSpawned = true;
		this.showStatusText("Suicide bombers incoming!", 2000);
	}

  private spawnBombers(_target: Entity): void {
		const myPos = this.getEntity().getPosition();
		const parent = this.getEntity().parent ?? this.getEntity();

		for (let i = 0; i < this.bomberCount; i++) {
			const angle = (i / this.bomberCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
			const spawnDist = 3 + Math.random() * 2;
			const spawnX = myPos.x + Math.sin(angle) * spawnDist;
			const spawnZ = myPos.z + Math.cos(angle) * spawnDist;
			const startPos = new Vec3(spawnX, myPos.y, spawnZ);

			const bomber = new Entity("airladin-suicide-bomber");
			bomber.addComponent("render", { type: "capsule", material: this.bomberBodyMaterial });
			bomber.setLocalScale(0.8, 1.2, 0.8);
			bomber.setPosition(spawnX, startPos.y + 1, spawnZ);
			parent.addChild(bomber);
			this.activeEffects.add(bomber);

			const bomb = new Entity("airladin-bomb-glow");
			bomb.addComponent("render", { type: "sphere", material: this.bombGlowMaterial });
			bomb.setLocalScale(0.4, 0.4, 0.4);
			bomb.setPosition(0, 0.8, 0.3);
			bomber.addChild(bomb);
			this.activeEffects.add(bomb);

			this.bombersState!.bombers.push({ entity: bomber, startPos, startMs: Date.now() });
		}
	}

	private updateSuicideBombers(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
		const state = this.bombersState; if (!state) return;

		const targetPos = target.getPosition();
		const timerDurationMs = this.bomberTimerSeconds * 1000;

		for (const bomber of state.bombers) {
			if (!bomber.entity.parent) continue;

			const elapsed = Date.now() - bomber.startMs;
			if (elapsed >= timerDurationMs) {
				this.detonateBomber(bomber, targetPos, onAttack);
				continue;
			}

			const bomberPos = bomber.entity.getPosition();
			const dx = targetPos.x - bomberPos.x;
			const dz = targetPos.z - bomberPos.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			if (dist <= this.bomberExplosionRadius) {
				this.detonateBomber(bomber, targetPos, onAttack);
				continue;
			}

			const ndx = dx / dist;
			const ndz = dz / dist;
			const moveDist = this.bomberSpeed * dt;
			bomber.entity.setPosition(bomberPos.x + ndx * moveDist, bomberPos.y, bomberPos.z + ndz * moveDist);

			const yaw = Math.atan2(ndx, ndz) * 180 / Math.PI;
			bomber.entity.setLocalEulerAngles(0, yaw, 0);

        const bombChild = bomber.entity.children?.[0] as Entity | undefined;
			if (bombChild) {
				const pulse = 0.4 + 0.3 * Math.sin(elapsed / 100);
				bombChild.setLocalScale(pulse, pulse, pulse);
				const mat = bombChild.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
				if (mat) {
					const urgency = elapsed / timerDurationMs;
					mat.emissiveIntensity = 5.0 + urgency * 15.0;
					mat.update();
				}
			}
		}

		state.bombers = state.bombers.filter(b => b.entity.parent != null);

		if (now >= state.endTimeSeconds || state.bombers.length === 0) {
			for (const bomber of state.bombers) {
				this.detonateBomber(bomber, targetPos, onAttack);
			}
			this.bombersState = null;
			this.nextBomberAtSeconds = now + this.bomberCooldownSeconds;
		}
	}

	private detonateBomber(bomber: SuicideBomber, targetPos: Vec3, onAttack?: (attacker: npc) => void): void {
		if (!bomber.entity.parent) return;

		const bomberPos = bomber.entity.getPosition();
		const dx = targetPos.x - bomberPos.x;
		const dz = targetPos.z - bomberPos.z;
		const dist = Math.sqrt(dx * dx + dz * dz);

		if (dist <= this.bomberExplosionRadius) {
			this.applyDamage(this.bomberDamage, onAttack);
		}

		this.spawnExplosion(bomberPos);
		this.destroyEffect(bomber.entity);
	}

	private spawnExplosion(origin: Vec3): void {
		const parent = this.getEntity().parent ?? this.getEntity();

		const core = new Entity("airladin-explosion-core");
		core.addComponent("render", { type: "sphere", material: this.explosionMaterial });
		core.setLocalScale(0.5, 0.5, 0.5);
		core.setPosition(origin.x, origin.y + 1, origin.z);
		parent.addChild(core);
		this.activeEffects.add(core);

		const ring = new Entity("airladin-explosion-ring");
		ring.addComponent("render", { type: "torus", material: this.explosionMaterial });
		ring.setPosition(origin.x, origin.y + 0.2, origin.z);
		ring.setLocalScale(1, 0.15, 1);
		parent.addChild(ring);
		this.activeEffects.add(ring);

		const startMs = Date.now();
		const durationMs = 600;
		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= durationMs) {
				this.destroyEffect(core);
				this.destroyEffect(ring);
				return;
			}
			const t = elapsed / durationMs;
			const coreScale = 0.5 + t * this.bomberExplosionRadius * 2;
			core.setLocalScale(coreScale, coreScale, coreScale);
			const ringScale = 1 + t * this.bomberExplosionRadius * 2;
			ring.setLocalScale(ringScale, ringScale * 0.15, ringScale);
			const coreMat = core.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (coreMat) { coreMat.opacity = 1.0 * (1 - t); coreMat.update(); }
			const ringMat = ring.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (ringMat) { ringMat.opacity = 0.8 * (1 - t); ringMat.update(); }
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	// ── Helpers ──

	private faceTarget(target: Entity, dt: number): void {
		const myPos = this.getEntity().getPosition(); const targetPos = target.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, dt);
	}

	private getFlatDistanceTo(target: Entity): number {
		const myPos = this.getEntity().getPosition(); const targetPos = target.getPosition();
		const dx = targetPos.x - myPos.x; const dz = targetPos.z - myPos.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
		if (this.onPlayerAttack) this.onPlayerAttack(this, damage);
		if (onAttack) onAttack(this);
	}

	private createEffectMaterial(emissiveColor: Color, diffuseColor: Color, emissiveIntensity: number, opacity: number): StandardMaterial {
		const mat = new StandardMaterial();
		mat.emissive = emissiveColor; mat.emissiveIntensity = emissiveIntensity;
		mat.diffuse = diffuseColor; mat.opacity = opacity;
		mat.blendType = BLEND_ADDITIVE; mat.cull = CULLFACE_NONE; mat.depthWrite = false;
		mat.update(); return mat;
	}

	private spawnRingEffect(origin: Vec3, radius: number, durationMs: number, material: StandardMaterial, name: string, opacity: number): void {
		const ring = new Entity(name);
		ring.addComponent("render", { type: "torus", material });
		ring.setPosition(origin.x, origin.y + 0.1, origin.z);
		ring.setLocalScale(radius, radius * 0.15, radius);
		this.getEntity().parent?.addChild(ring) ?? this.getEntity().addChild(ring);
		this.activeEffects.add(ring);
		const startMs = Date.now();
		const tick = () => {
			const elapsed = Date.now() - startMs;
			if (elapsed >= durationMs) { this.destroyEffect(ring); return; }
			const mat = ring.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
			if (mat) { mat.opacity = opacity * (1 - elapsed / durationMs); mat.update(); }
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	private destroyEffect(entity: Entity | null | undefined): void {
		if (!entity) return; this.activeEffects.delete(entity);
		if (entity.parent) entity.parent.removeChild(entity); entity.destroy();
	}

  private cleanupEffects(): void {
    for (const effect of this.activeEffects) { try { if (effect.parent) effect.parent.removeChild(effect); effect.destroy(); } catch { /* */ } }
    this.activeEffects.clear(); this.caveAmbushState = null; this.iedBlastState = null; this.akSprayState = null;
    this.invisState = null; this.bombersState = null;
    if (this.isCurrentlyInvisible) {
      this.isCurrentlyInvisible = false;
      this.setBossModelVisible(true);
    }
    this.savedMaterialOpacities.clear();
  }
}
