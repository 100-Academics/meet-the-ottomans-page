import { AppBase, Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

export class PolishHussar extends npc {
	private chargeSpeed = PLAYER_MOVE_SPEED * 2.5;
	private chargeDurationSeconds = 0.6;
	private chargeCooldownSeconds = 3.0;
	private chargeRange = 15;
	private chargeDamage = 12;
	private chargeHitRadius = 2.5;
	
	private meleeDamage = 8;
	private meleeRange = 3.5;
	private meleeCooldownSeconds = 1.5;

	private isCharging = false;
	private chargeDirection: Vec3 | null = null;
	private chargeEndTime = 0;
	private nextChargeAtSeconds = 0;
	private nextMeleeAtSeconds = 0;

	private readonly rayBeamMaterial = this.createEffectMaterial(
		new Color(0.2, 0.6, 1.0), new Color(0.3, 0.7, 1.0), 4.0, 0.9
	);

	private readonly activeEffects = new Set<Entity>();

	constructor(id: number, modelEntity: Entity = new Entity("polishHussar")) {
		super(id, 'foe', 100, modelEntity);
		this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.1;
		this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.8;
		this.setFacingYawOffsetDegrees(0);
	}

	override updateCombatAI(
		deltaTime: number,
		currentTimeSeconds: number,
		allNpcs: npc[],
		onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
		playerEntity?: Entity | null,
		onPlayerAttack?: (attacker: npc, damage: number) => void
	): void {
		if (!this.isAlive() || !playerEntity) {
			super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
			return;
		}

		const dt = Math.max(0, Math.min(deltaTime, 0.05));
		const myPos = this.getEntity().getPosition();
		const targetPos = playerEntity.getPosition();
		const distance = this.getFlatDistanceTo(playerEntity);

		if (this.isCharging) {
			this.updateCharge(dt, currentTimeSeconds, onPlayerAttack);
			return;
		}

		if (currentTimeSeconds < this.nextChargeAtSeconds && currentTimeSeconds < this.nextMeleeAtSeconds) {
			this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
			return;
		}

		if (currentTimeSeconds >= this.nextChargeAtSeconds && distance <= this.chargeRange) {
			this.startCharge(playerEntity, currentTimeSeconds);
			return;
		}

		if (currentTimeSeconds >= this.nextMeleeAtSeconds && distance <= this.meleeRange) {
			this.performMelee(playerEntity, currentTimeSeconds, onPlayerAttack);
			return;
		}

		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
	}

	private startCharge(target: Entity, now: number): void {
		this.isCharging = true;
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		this.chargeDirection = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();
		this.chargeEndTime = now + this.chargeDurationSeconds;
		this.nextChargeAtSeconds = now + this.chargeCooldownSeconds;
		this.spawnRayBeam(target);
	}

	private updateCharge(dt: number, now: number, onPlayerAttack?: (attacker: npc, damage: number) => void): void {
		if (!this.chargeDirection) {
			this.isCharging = false;
			return;
		}

		this.moveToward(this.chargeDirection.x, this.chargeDirection.z, this.chargeSpeed, dt);

		const targetPos = (this.getEntity() as any).script?.FirstPersonCamera?.entity;
		if (targetPos && this.getFlatDistanceTo(targetPos) <= this.chargeHitRadius) {
			if (onPlayerAttack) {
				onPlayerAttack(this, this.chargeDamage);
			}
		}

		if (now >= this.chargeEndTime) {
			this.isCharging = false;
			this.chargeDirection = null;
		}
	}

	private performMelee(target: Entity, now: number, onPlayerAttack?: (attacker: npc, damage: number) => void): void {
		this.nextMeleeAtSeconds = now + this.meleeCooldownSeconds;
		
		if (this.getFlatDistanceTo(target) <= this.meleeRange) {
			if (onPlayerAttack) {
				onPlayerAttack(this, this.meleeDamage);
			}
		}
	}

	private spawnRayBeam(target: Entity): void {
		const sceneApp = this.resolveSceneApp(target);
		if (!sceneApp?.root) return;

		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

		const rayBeam = new Entity("polish-hussar-ray-beam");
		rayBeam.addComponent("render", { type: "box", material: this.rayBeamMaterial });
		
		const distance = Math.sqrt((targetPos.x - myPos.x) ** 2 + (targetPos.z - myPos.z) ** 2);
		rayBeam.setLocalScale(0.3, 0.3, distance);
		
		const midPoint = new Vec3(
			myPos.x + dir.x * (distance / 2),
			myPos.y + 1.5,
			myPos.z + dir.z * (distance / 2)
		);
		rayBeam.setPosition(midPoint);
		
		const yaw = Math.atan2(dir.x, dir.z) * (180 / Math.PI);
		rayBeam.setLocalEulerAngles(0, yaw, 0);
		
		sceneApp.root.addChild(rayBeam);
		this.activeEffects.add(rayBeam);

		const startMs = Date.now();
		const durationMs = 400;
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
	}

	private getFlatDistanceTo(target: Entity): number {
		const myPos = this.getEntity().getPosition();
		const targetPos = target.getPosition();
		const dx = targetPos.x - myPos.x;
		const dz = targetPos.z - myPos.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	private resolveSceneApp(targetEntity?: Entity): AppBase | undefined {
		const selfEntity = this.getEntity() as any;
		const selfApp = (selfEntity?.app ?? selfEntity?._app) as AppBase | undefined;
		if (selfApp?.root) return selfApp;
		const targetAny = targetEntity as any;
		const targetApp = (targetAny?.app ?? targetAny?._app) as AppBase | undefined;
		if (targetApp?.root) return targetApp;
		const globalApp = (globalThis as any)?.app as AppBase | undefined;
		if (globalApp?.root) return globalApp;
		return undefined;
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
}