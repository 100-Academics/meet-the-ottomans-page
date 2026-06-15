import { AppBase, BLEND_ADDITIVE, Color, CULLFACE_NONE, Entity, StandardMaterial, Vec3 } from "playcanvas";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";
import { Boss } from "./boss";
import type { npc } from "../npc";

// Combat behavior and VFX for the Joan of Arc boss.
type JoanAttackType = "fireDash" | "fireStrike" | "fireRain";

// ── Fire Dash ──
interface FireDashState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    trail?: Entity | null;
}

// A single fire patch left on the ground by the dash.
interface FirePatch {
    entity: Entity;
    spawnTimeSeconds: number;
    hasDamaged: boolean;
}

// ── Fire Strike ──
interface FireStrikeState {
    windupStartSeconds: number;
    impactTimeSeconds: number;
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    charge?: Entity | null;
}

// ── Fire Rain ──
interface FireRainDrop {
    strikeTimeSeconds: number;
    telegraphTimeSeconds: number;
    position?: Vec3;
    hasStruck: boolean;
    telegraphSpawned: boolean;
}

interface FireRainState {
    drops: FireRainDrop[];
    endTimeSeconds: number;
}

export class JoanOfArc extends Boss {
    // ── Fire Dash parameters ──
    private readonly fireDashSpeed = PLAYER_MOVE_SPEED * 2.5;
    private readonly fireDashDurationSeconds = 0.55;
    private readonly fireDashRecoverSeconds = 0.35;
    private readonly fireDashCooldownSeconds = 4.5;
    private readonly fireDashRangeMin = 6;
    private readonly fireDashRangeMax = 28;
    private readonly fireDashHitRadius = 3.2;
    private readonly fireDashDamage = 16;
    private readonly fireDashTrailLength = 4.8;
    private readonly fireDashTrailWidth = 0.7;
    private readonly fireDashTrailHeight = 0.32;
    private readonly firePatchIntervalSeconds = 0.08;
    private readonly firePatchDamage = 8;
    private readonly firePatchHitRadius = 2.0;
    private readonly firePatchDurationSeconds = 4.0;
    private readonly firePatchDamageIntervalSeconds = 0.5;
    private readonly firePatchScale = 1.8;

    // ── Fire Strike parameters ──
    private readonly fireStrikeRange = 120;
    private readonly fireStrikeOvershoot = 40;
    private readonly fireStrikeDamage = 22;
    private readonly fireStrikeHitRadius = 4.2;
    private readonly fireStrikeWindupSeconds = 0.8;
    private readonly fireStrikeRecoverSeconds = 0.5;
    private readonly fireStrikeCooldownSeconds = 6.0;
    private readonly fireStrikeBeamRadius = 0.75;
    private readonly fireStrikeBeamDurationMs = 280;
    private readonly fireStrikeChargeOffset = 2.1;
    private readonly fireStrikeChargeHeight = 3.4;
    private readonly fireStrikeChargeBaseScale = 0.7;
    private readonly fireStrikeChargeScaleBoost = 0.6;

    // ── Fire Rain parameters ──
    private readonly fireRainRange = 160;
    private readonly fireRainDamage = 18;
    private readonly fireRainCooldownSeconds = 8.0;
    private readonly fireRainWindupSeconds = 0.7;
    private readonly fireRainStrikeSpacingSeconds = 0.6;
    private readonly fireRainStrikeCount = 4;
    private readonly fireRainStrikeRadius = 4.4;
    private readonly fireRainBoltHeight = 18;
    private readonly fireRainBoltRadius = 0.55;
    private readonly fireRainBoltDurationMs = 320;
    private readonly fireRainScatterRadius = 4.0;
    private readonly fireRainRecoverSeconds = 0.4;

    // ── Runtime state ──
    private attackLockUntilSeconds = 0;
    private nextFireDashAtSeconds = 0;
    private nextFireStrikeAtSeconds = 0;
    private nextFireRainAtSeconds = 0;
    private lastAttackType: JoanAttackType | null = null;
    private fireDashState: FireDashState | null = null;
    private fireStrikeState: FireStrikeState | null = null;
    private fireRainState: FireRainState | null = null;

    private lastFirePatchTimeSeconds = 0;
    private readonly activeFirePatches: FirePatch[] = [];

    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // ── VFX Materials ──
    private readonly fireDashTrailMaterial = this.createEffectMaterial(
        new Color(1, 0.5, 0.1),
        new Color(1, 0.6, 0.15),
        4.0, 0.85
    );
    private readonly firePatchMaterial = this.createEffectMaterial(
        new Color(1, 0.35, 0.05),
        new Color(1, 0.45, 0.1),
        5.0, 0.8
    );
    private readonly firePatchHaloMaterial = this.createEffectMaterial(
        new Color(1, 0.6, 0.2),
        new Color(1, 0.7, 0.3),
        3.5, 0.6
    );
    private readonly fireStrikeChargeMaterial = this.createEffectMaterial(
        new Color(1, 0.55, 0.1),
        new Color(1, 0.65, 0.2),
        4.5, 0.9
    );
    private readonly fireStrikeBeamMaterial = this.createEffectMaterial(
        new Color(1, 0.6, 0.15),
        new Color(1, 0.7, 0.25),
        6.5, 0.9
    );
    private readonly fireRainTelegraphMaterial = this.createEffectMaterial(
        new Color(1, 0.4, 0.1),
        new Color(1, 0.5, 0.15),
        4.4, 0.6
    );
    private readonly fireRainBoltMaterial = this.createEffectMaterial(
        new Color(1, 0.7, 0.2),
        new Color(1, 0.85, 0.35),
        8.0, 0.95
    );
    private readonly fireRainImpactMaterial = this.createEffectMaterial(
        new Color(1, 0.55, 0.15),
        new Color(1, 0.65, 0.25),
        6.5, 0.85
    );

    // Track spawned entities for cleanup.
    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Joan of Arc")) {
        super(id, maxHealth, entity, "Joan of Arc");

        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.2;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.65;

        this.setIntroTaunt(
            "Tropa! Ralliez-vous à moi, car je suis Jeanne d'Arc!",
            "Troops! Rally on me, for I am Joan Of Arc!"
        );
        this.setIntroNameTranslation("Jeanne d'Arc", "Joan of Arc");

        this.setTauntSet({
            highHealth: ["For France!", "I will not yield.", "My fire burns for God and country!"],
            bossLowPlayerHigh: ["My faith is unbroken.", "The tide can still turn.", "The flames are not yet spent!"],
            playerLowBossHigh: ["Stand down and live.", "Your resolve is fading.", "Burn or retreat!"],
            bothLow: ["Only the righteous remain.", "One of us falls here.", "The fire tests us both."],
            death: ["I return to the light.", "My flame... endures."],
            bossDeath: ["Joan falls, but her fire endures.", "The Maid is gone, but France remains."]
        });
    }

    // ── Combat AI hooks ──

    public override updateCombatAI(
        deltaTime: number,
        currentTimeSeconds: number,
        allNpcs: npc[],
        onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
        playerEntity?: Entity | null,
        onPlayerAttack?: (attacker: npc, damage: number) => void
    ): void {
        this.onPlayerAttack = onPlayerAttack;
        super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
    }

    public override updateAI(
        deltaTime: number,
        targetEntity: Entity | null,
        currentTimeSeconds: number,
        onAttack?: (attacker: npc) => void,
        profileOverride?: {
            attackDamage: number;
            attackRange: number;
            attackCooldown: number;
            detectionRange: number;
        }
    ): void {
        if (!this.isAlive()) {
            return;
        }

        const clampedDeltaTime = Math.max(0, Math.min(deltaTime, 0.05));

        // Update fire patches (persistent ground fire from dash).
        this.updateFirePatches(targetEntity, currentTimeSeconds, onAttack);

        // Fire rain runs its full sequence independently.
        if (this.fireRainState) {
        	this.updateFireRain(targetEntity, currentTimeSeconds, onAttack);
        	if (targetEntity) {
        		const myPos = this.getEntity().getPosition();
        		const targetPos = targetEntity.getPosition();
        		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
        	}
        	return;
        }

        if (!targetEntity) {
            super.updateAI(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack, profileOverride);
            return;
        }

        // Active attack states take priority.
        if (this.fireDashState) {
            this.updateFireDash(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
            return;
        }

        if (this.fireStrikeState) {
            this.updateFireStrike(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
            return;
        }

        // Wait for attack lock to expire before picking a new attack.
        if (currentTimeSeconds < this.attackLockUntilSeconds) {
        	{
        		const myPos = this.getEntity().getPosition();
        		const targetPos = targetEntity.getPosition();
        		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
        	}
        	return;
        }

        const distance = this.getFlatDistanceTo(targetEntity);
        const nextAttack = this.pickNextAttack(distance, currentTimeSeconds);

        if (nextAttack === "fireDash") {
            this.startFireDash(targetEntity, currentTimeSeconds);
            return;
        }
        if (nextAttack === "fireStrike") {
            this.startFireStrike(targetEntity, currentTimeSeconds);
            return;
        }
        if (nextAttack === "fireRain") {
            this.startFireRain(targetEntity, currentTimeSeconds);
            return;
        }

        // Default: chase the player.
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        this.moveToward(
            targetPos.x - myPos.x,
            targetPos.z - myPos.z,
            this.aiConfig.chaseMoveSpeed,
            clampedDeltaTime
        );
    }

    public override kill(): boolean {
        const didKill = super.kill();
        if (didKill) {
            this.cleanupEffects();
        }
        return didKill;
    }

    protected override getCombatProfile() {
        const base = super.getCombatProfile();
        return {
            ...base,
            attackDamage: this.fireStrikeDamage,
            attackRange: Math.max(this.fireStrikeRange, this.fireRainRange),
            attackCooldown: Math.min(
                this.fireDashCooldownSeconds,
                this.fireStrikeCooldownSeconds,
                this.fireRainCooldownSeconds
            ),
            detectionRange: Number.MAX_VALUE
        };
    }

    // ── Attack selection ──

    private pickNextAttack(distance: number, nowSeconds: number): JoanAttackType | null {
        const options: Array<{ type: JoanAttackType; weight: number }> = [];

        const dashReady =
            nowSeconds >= this.nextFireDashAtSeconds &&
            distance >= this.fireDashRangeMin &&
            distance <= this.fireDashRangeMax;
        const strikeReady =
            nowSeconds >= this.nextFireStrikeAtSeconds &&
            distance <= this.fireStrikeRange;
        const rainReady =
            nowSeconds >= this.nextFireRainAtSeconds &&
            distance <= this.fireRainRange;

        if (dashReady) {
            const weight = distance > 16 ? 1.15 : 0.7;
            options.push({ type: "fireDash", weight });
        }
        if (strikeReady) {
            const weight = distance < 10 ? 1.15 : 0.95;
            options.push({ type: "fireStrike", weight });
        }
        if (rainReady) {
            const weight = distance > 14 ? 1.1 : 0.85;
            options.push({ type: "fireRain", weight });
        }

        if (options.length === 0) {
            return null;
        }

        // Penalise repeating the same attack.
        if (options.length > 1 && this.lastAttackType) {
            const match = options.find((o) => o.type === this.lastAttackType);
            if (match) {
                match.weight *= 0.5;
            }
        }

        const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const option of options) {
            roll -= option.weight;
            if (roll <= 0) {
                return option.type;
            }
        }
        return options[0].type;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  FIRE DASH — Speed boost that leaves a fire trail on the ground.
    // ═══════════════════════════════════════════════════════════════════

    private startFireDash(targetEntity: Entity, nowSeconds: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) {
            return;
        }
        dir.normalize();

        this.lastAttackType = "fireDash";
        this.lastFirePatchTimeSeconds = nowSeconds;

        this.fireDashState = {
            endTimeSeconds: nowSeconds + this.fireDashDurationSeconds,
            direction: dir,
            hasHit: false,
            trail: this.createFireDashTrail()
        };
        this.attackLockUntilSeconds =
            this.fireDashState.endTimeSeconds + this.fireDashRecoverSeconds;
    }

    private updateFireDash(
        deltaTime: number,
        targetEntity: Entity,
        nowSeconds: number,
        onAttack?: (attacker: npc) => void
    ): void {
        const state = this.fireDashState;
        if (!state) {
            return;
        }

        this.moveToward(state.direction.x, state.direction.z, this.fireDashSpeed, deltaTime);

        // Update trail visual.
        if (state.trail) {
            this.updateFireDashTrail(state.trail, state.direction);
        }

        // Drop fire patches along the path.
        if (nowSeconds - this.lastFirePatchTimeSeconds >= this.firePatchIntervalSeconds) {
            this.lastFirePatchTimeSeconds = nowSeconds;
            this.spawnFirePatch();
        }

        // Direct hit check while dashing.
        if (!state.hasHit && this.getFlatDistanceTo(targetEntity) <= this.fireDashHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.fireDashDamage, onAttack);
        }

        if (nowSeconds >= state.endTimeSeconds) {
            this.destroyEffect(state.trail);
            this.fireDashState = null;
            this.nextFireDashAtSeconds = nowSeconds + this.fireDashCooldownSeconds;
        }
    }

    private createFireDashTrail(): Entity | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }
        const trail = new Entity("joan-fire-dash-trail");
        trail.addComponent("render", { type: "box" } as any);
        trail.setLocalScale(this.fireDashTrailWidth, this.fireDashTrailHeight, this.fireDashTrailLength);
        if (trail.render?.meshInstances?.length) {
            trail.render.meshInstances[0].material = this.fireDashTrailMaterial;
        }
        sceneApp.root.addChild(trail);
        this.registerEffect(trail);
        return trail;
    }

    private updateFireDashTrail(trail: Entity, direction: Vec3): void {
        const bossPos = this.getEntity().getPosition();
        const flatDir = new Vec3(direction.x, 0, direction.z);
        if (flatDir.lengthSq() <= 0.0001) {
            return;
        }
        flatDir.normalize();
        const offset = flatDir.clone().mulScalar(this.fireDashTrailLength * 0.5);
        const trailPos = bossPos.clone().sub(offset);
        const yawDegrees = Math.atan2(flatDir.x, flatDir.z) * (180 / Math.PI);
        trail.setPosition(trailPos);
        trail.setLocalEulerAngles(0, yawDegrees, 0);
        trail.setLocalScale(this.fireDashTrailWidth, this.fireDashTrailHeight, this.fireDashTrailLength);
    }

    // ── Fire Patches (persistent ground fire left by dash) ──

    private spawnFirePatch(): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return;
        }
        const bossPos = this.getEntity().getPosition();

        const patchRoot = new Entity("joan-fire-patch");
        const patch = new Entity("joan-fire-patch-mesh");
        patch.addComponent("render", { type: "cylinder" } as any);
        patch.setLocalScale(this.firePatchScale, 0.15, this.firePatchScale);
        patch.setLocalPosition(0, 0.08, 0);
        if (patch.render?.meshInstances?.length) {
            patch.render.meshInstances[0].material = this.firePatchMaterial;
        }
        patchRoot.addChild(patch);

        // Halo ring around the patch.
        const halo = new Entity("joan-fire-patch-halo");
        halo.addComponent("render", { type: "torus" } as any);
        halo.setLocalScale(this.firePatchScale * 1.2, this.firePatchScale * 0.12, this.firePatchScale * 1.2);
        halo.setLocalPosition(0, 0.05, 0);
        if (halo.render?.meshInstances?.length) {
            halo.render.meshInstances[0].material = this.firePatchHaloMaterial;
        }
        patchRoot.addChild(halo);

        patchRoot.setPosition(bossPos.x, bossPos.y, bossPos.z);
        sceneApp.root.addChild(patchRoot);
        this.registerEffect(patchRoot);

        this.activeFirePatches.push({
            entity: patchRoot,
            spawnTimeSeconds: Date.now() / 1000,
            hasDamaged: false
        });
    }

    private updateFirePatches(
        targetEntity: Entity | null,
        nowSeconds: number,
        onAttack?: (attacker: npc) => void
    ): void {
        for (let i = this.activeFirePatches.length - 1; i >= 0; i -= 1) {
            const patch = this.activeFirePatches[i];
            const age = nowSeconds - patch.spawnTimeSeconds;

            // Expire old patches.
            if (age >= this.firePatchDurationSeconds) {
                this.destroyEffect(patch.entity);
                this.activeFirePatches.splice(i, 1);
                continue;
            }

            // Fade opacity over lifetime.
            const t = age / this.firePatchDurationSeconds;
            const fadeOpacity = 1 - t;
            const mesh = patch.entity.children?.[0] as Entity | undefined;
            if ((mesh as any)?.render?.meshInstances?.length) {
                const mat = (mesh as any).render.meshInstances[0].material as StandardMaterial;
                if (mat) {
                    mat.opacity = 0.8 * fadeOpacity;
                    mat.update();
                }
            }
            const haloMesh = patch.entity.children?.[1] as Entity | undefined;
            if ((haloMesh as any)?.render?.meshInstances?.length) {
                const haloMat = (haloMesh as any).render.meshInstances[0].material as StandardMaterial;
                if (haloMat) {
                    haloMat.opacity = 0.6 * fadeOpacity;
                    haloMat.update();
                }
            }

            // Damage the player if they stand in the fire.
            if (targetEntity) {
                const patchPos = patch.entity.getPosition();
                const playerPos = targetEntity.getPosition();
                const dx = playerPos.x - patchPos.x;
                const dz = playerPos.z - patchPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist <= this.firePatchHitRadius) {
                    // Apply damage at intervals so the player isn't one-shot.
                    const damageInterval = this.firePatchDamageIntervalSeconds;
                    if (!patch.hasDamaged || (age >= damageInterval && age % damageInterval < 0.1)) {
                        patch.hasDamaged = true;
                        this.applyDamage(this.firePatchDamage, onAttack);
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  FIRE STRIKE — Summon a fire beam that travels toward the player.
    // ═══════════════════════════════════════════════════════════════════

    private startFireStrike(targetEntity: Entity, nowSeconds: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) {
            return;
        }
        dir.normalize();

        this.lastAttackType = "fireStrike";

        this.fireStrikeState = {
            windupStartSeconds: nowSeconds,
            impactTimeSeconds: nowSeconds + this.fireStrikeWindupSeconds,
            endTimeSeconds: nowSeconds + this.fireStrikeWindupSeconds + this.fireStrikeRecoverSeconds,
            direction: dir,
            hasHit: false,
            charge: this.createFireStrikeCharge()
        };
        this.attackLockUntilSeconds = this.fireStrikeState.endTimeSeconds;
    }

    private updateFireStrike(
    	deltaTime: number,
    	targetEntity: Entity,
    	nowSeconds: number,
    	onAttack?: (attacker: npc) => void
    ): void {
    	const state = this.fireStrikeState;
    	if (!state) {
    		return;
    	}

    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = targetEntity.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, deltaTime);
    	}

        // Animate the charge orb during windup.
        if (state.charge) {
            const windupProgress = Math.min(
                1,
                Math.max(0, (nowSeconds - state.windupStartSeconds) / this.fireStrikeWindupSeconds)
            );
            this.updateFireStrikeCharge(state.charge, windupProgress);
        }

        // Fire the beam at impact time.
        if (!state.hasHit && nowSeconds >= state.impactTimeSeconds) {
            state.hasHit = true;
            if (state.charge) {
                this.destroyEffect(state.charge);
                state.charge = null;
            }
            this.fireStrikeBeam(targetEntity, state.direction, onAttack);
        }

        if (nowSeconds >= state.endTimeSeconds) {
            if (state.charge) {
                this.destroyEffect(state.charge);
            }
            this.fireStrikeState = null;
            this.nextFireStrikeAtSeconds = nowSeconds + this.fireStrikeCooldownSeconds;
        }
    }

    private createFireStrikeCharge(): Entity | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }
        const chargeRoot = new Entity("joan-fire-strike-charge");
        const orb = new Entity("joan-fire-strike-charge-orb");
        orb.addComponent("render", { type: "sphere" } as any);
        orb.setLocalScale(
            this.fireStrikeChargeBaseScale,
            this.fireStrikeChargeBaseScale,
            this.fireStrikeChargeBaseScale
        );
        if (orb.render?.meshInstances?.length) {
            orb.render.meshInstances[0].material = this.fireStrikeChargeMaterial;
        }
        chargeRoot.addChild(orb);
        sceneApp.root.addChild(chargeRoot);
        this.registerEffect(chargeRoot);
        return chargeRoot;
    }

    private updateFireStrikeCharge(charge: Entity, progress: number): void {
        const bossPos = this.getEntity().getPosition();
        const forward = this.getEntity().forward.clone();
        forward.y = 0;
        if (forward.lengthSq() <= 0.001) {
            forward.set(0, 0, 1);
        } else {
            forward.normalize();
        }
        const offset = forward.mulScalar(this.fireStrikeChargeOffset);
        charge.setPosition(
            bossPos.x + offset.x,
            bossPos.y + this.fireStrikeChargeHeight,
            bossPos.z + offset.z
        );
        const pulse = 0.85 + Math.sin(performance.now() * 0.02) * 0.15;
        const scale = this.fireStrikeChargeBaseScale + progress * this.fireStrikeChargeScaleBoost;
        charge.setLocalScale(scale * pulse, scale * pulse, scale * pulse);
    }

    private fireStrikeBeam(
        targetEntity: Entity,
        direction: Vec3,
        onAttack?: (attacker: npc) => void
    ): void {
        const origin = this.getEntity().getPosition().clone();
        const dir = direction.clone();
        if (dir.lengthSq() <= 0.0001) {
            return;
        }
        dir.normalize();
        const rayEnd = origin.clone().add(
            dir.clone().mulScalar(this.fireStrikeRange + this.fireStrikeOvershoot)
        );

        this.spawnFireStrikeBeamVisual(origin, rayEnd);

        if (this.isHitByRay(targetEntity, origin, rayEnd, this.fireStrikeHitRadius)) {
            this.applyDamage(this.fireStrikeDamage, onAttack);
        }
    }

    private spawnFireStrikeBeamVisual(origin: Vec3, end: Vec3): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return;
        }
        const direction = end.clone().sub(origin);
        const length = direction.length();
        if (length <= 0.5) {
            return;
        }

        const beamRoot = new Entity("joan-fire-strike-beam");
        const beam = new Entity("joan-fire-strike-beam-mesh");
        beam.addComponent("render", { type: "cylinder" } as any);
        beam.setLocalScale(this.fireStrikeBeamRadius, length, this.fireStrikeBeamRadius);
        beam.setLocalPosition(0, length * 0.5, 0);
        if (beam.render?.meshInstances?.length) {
            beam.render.meshInstances[0].material = this.fireStrikeBeamMaterial;
        }
        beamRoot.addChild(beam);
        beamRoot.setPosition(origin.x, origin.y, origin.z);

        const quat = this.directionToQuaternionFromUp(direction);
        beamRoot.setLocalRotation(quat.x, quat.y, quat.z, quat.w);

        sceneApp.root.addChild(beamRoot);
        this.registerEffect(beamRoot);

        // Animate the beam expanding then fading.
        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !beamRoot.parent || !this.activeEffects.has(beamRoot)) {
                this.destroyEffect(beamRoot);
                return;
            }
            const t = Math.min(1, (performance.now() - start) / this.fireStrikeBeamDurationMs);
            const eased = t * t * (3 - 2 * t);
            const currentLength = Math.max(0.2, length * eased);
            beam.setLocalScale(this.fireStrikeBeamRadius, currentLength, this.fireStrikeBeamRadius);
            beam.setLocalPosition(0, currentLength * 0.5, 0);
            if (t >= 1) {
                this.destroyEffect(beamRoot);
                return;
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  FIRE RAIN — Rains fire from above at the player's position.
    // ═══════════════════════════════════════════════════════════════════

    private startFireRain(targetEntity: Entity, nowSeconds: number): void {
        const drops: FireRainDrop[] = [];
        const firstStrikeAt = nowSeconds + this.fireRainWindupSeconds;
        for (let i = 0; i < this.fireRainStrikeCount; i += 1) {
            const strikeTimeSeconds = firstStrikeAt + i * this.fireRainStrikeSpacingSeconds;
            drops.push({
                strikeTimeSeconds,
                telegraphTimeSeconds: strikeTimeSeconds - this.fireRainWindupSeconds,
                hasStruck: false,
                telegraphSpawned: false
            });
        }
        const endTimeSeconds =
            drops[drops.length - 1].strikeTimeSeconds + this.fireRainRecoverSeconds;

        this.fireRainState = { drops, endTimeSeconds };
        this.attackLockUntilSeconds = endTimeSeconds;
        this.lastAttackType = "fireRain";
        this.faceTarget(targetEntity, 0);
    }

    private updateFireRain(
        targetEntity: Entity | null,
        nowSeconds: number,
        onAttack?: (attacker: npc) => void
    ): void {
        const state = this.fireRainState;
        if (!state) {
            return;
        }

        for (const drop of state.drops) {
            // Spawn telegraph ring before each strike.
            if (!drop.telegraphSpawned && nowSeconds >= drop.telegraphTimeSeconds) {
                drop.telegraphSpawned = true;
                if (targetEntity) {
                    drop.position = this.getFireRainStrikePosition(targetEntity);
                }
                const pos = drop.position ?? this.getEntity().getPosition().clone();
                this.spawnRingEffect(
                    pos,
                    this.fireRainStrikeRadius,
                    this.fireRainWindupSeconds * 1000,
                    this.fireRainTelegraphMaterial,
                    "joan fire rain telegraph",
                    0.18
                );
            }

            // Strike: spawn bolt, apply damage.
            if (!drop.hasStruck && nowSeconds >= drop.strikeTimeSeconds) {
                drop.hasStruck = true;
                if (!drop.position && targetEntity) {
                    drop.position = this.getFireRainStrikePosition(targetEntity);
                }
                const pos = drop.position ?? this.getEntity().getPosition().clone();
                this.spawnFireRainBolt(pos);
                this.spawnRingEffect(
                    pos,
                    this.fireRainStrikeRadius * 1.2,
                    220,
                    this.fireRainImpactMaterial,
                    "joan fire rain impact",
                    0.22
                );
                if (
                    targetEntity &&
                    this.getFlatDistanceToPosition(targetEntity, pos) <= this.fireRainStrikeRadius
                ) {
                    this.applyDamage(this.fireRainDamage, onAttack);
                }
            }
        }

        if (nowSeconds >= state.endTimeSeconds) {
            this.fireRainState = null;
            this.nextFireRainAtSeconds = nowSeconds + this.fireRainCooldownSeconds;
        }
    }

    private getFireRainStrikePosition(targetEntity: Entity): Vec3 {
        const base = targetEntity.getPosition().clone();
        const controller =
            (targetEntity as any)?.script?.FirstPersonCamera ??
            (targetEntity as any)?.script?.firstPersonCamera;
        const playerHeight = Number.isFinite(controller?.playerHeight)
            ? controller.playerHeight
            : 2;
        const groundHeight = Number.isFinite(controller?.groundHeight)
            ? controller.groundHeight
            : base.y - playerHeight;

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * this.fireRainScatterRadius;
        base.x += Math.cos(angle) * radius;
        base.z += Math.sin(angle) * radius;
        base.y = groundHeight + 0.05;
        return base;
    }

    private spawnFireRainBolt(position: Vec3): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return;
        }
        const boltRoot = new Entity("joan-fire-rain-bolt");
        const bolt = new Entity("joan-fire-rain-bolt-mesh");
        bolt.addComponent("render", { type: "cylinder" } as any);
        bolt.setLocalScale(
            this.fireRainBoltRadius,
            this.fireRainBoltHeight,
            this.fireRainBoltRadius
        );
        bolt.setLocalPosition(0, this.fireRainBoltHeight * 0.5, 0);
        if (bolt.render?.meshInstances?.length) {
            bolt.render.meshInstances[0].material = this.fireRainBoltMaterial;
        }
        boltRoot.addChild(bolt);
        boltRoot.setPosition(position.x, position.y, position.z);
        sceneApp.root.addChild(boltRoot);
        this.registerEffect(boltRoot);

        // Animate the bolt with a flicker effect then fade.
        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !boltRoot.parent || !this.activeEffects.has(boltRoot)) {
                this.destroyEffect(boltRoot);
                return;
            }
            const elapsed = performance.now() - start;
            const t = Math.min(1, elapsed / this.fireRainBoltDurationMs);
            const flicker = 0.7 + Math.sin(elapsed * 0.08) * 0.3;
            const scale = Math.max(0.2, this.fireRainBoltRadius * flicker);
            bolt.setLocalScale(scale, this.fireRainBoltHeight, scale);
            if (t >= 1) {
                this.destroyEffect(boltRoot);
                return;
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  VFX helpers
    // ═══════════════════════════════════════════════════════════════════

    private createEffectMaterial(
        diffuse: Color,
        emissive: Color,
        emissiveIntensity: number,
        opacity: number
    ): StandardMaterial {
        const material = new StandardMaterial();
        material.useLighting = false;
        material.diffuse = diffuse;
        material.emissive = emissive;
        material.emissiveIntensity = emissiveIntensity;
        material.opacity = opacity;
        material.blendType = BLEND_ADDITIVE;
        material.depthWrite = false;
        material.cull = CULLFACE_NONE;
        material.update();
        return material;
    }

    private spawnRingEffect(
        origin: Vec3,
        maxRadius: number,
        durationMs: number,
        material: StandardMaterial,
        label: string,
        height: number
    ): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return;
        }
        const ringRoot = new Entity(label);
        const ring = new Entity(`${label} mesh`);
        ring.addComponent("render", { type: "cylinder" } as any);
        ring.setLocalScale(0.1, height, 0.1);
        if (ring.render?.meshInstances?.length) {
            ring.render.meshInstances[0].material = material;
        }
        ringRoot.addChild(ring);
        ringRoot.setPosition(origin.x, origin.y + 0.05, origin.z);
        sceneApp.root.addChild(ringRoot);
        this.registerEffect(ringRoot);

        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !ringRoot.parent || !this.activeEffects.has(ringRoot)) {
                this.destroyEffect(ringRoot);
                return;
            }
            const t = Math.min(1, (performance.now() - start) / durationMs);
            const radius = Math.max(0.2, maxRadius * t);
            ring.setLocalScale(radius, height, radius);
            if (t >= 1) {
                this.destroyEffect(ringRoot);
                return;
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    private registerEffect(effect: Entity): void {
        this.activeEffects.add(effect);
    }

    private destroyEffect(effect?: Entity | null): void {
        if (!effect) {
            return;
        }
        this.activeEffects.delete(effect);
        try {
            effect.destroy();
        } catch (e) {
            // ignore — scene teardown may have already destroyed the entity.
        }
    }

    private cleanupEffects(): void {
        for (const effect of this.activeEffects) {
            try {
                effect.destroy();
            } catch (e) {
                // ignore
            }
        }
        this.activeEffects.clear();
        this.fireDashState = null;
        this.fireStrikeState = null;
        this.fireRainState = null;
        // Clean up persistent fire patches.
        for (const patch of this.activeFirePatches) {
            try {
                patch.entity.destroy();
            } catch (e) {
                // ignore
            }
        }
        this.activeFirePatches.length = 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Utility methods
    // ═══════════════════════════════════════════════════════════════════

    private faceTarget(targetEntity: Entity, deltaTime: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, deltaTime);
    }

    private getFlatDistanceTo(targetEntity: Entity): number {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private getFlatDistanceToPosition(targetEntity: Entity, position: Vec3): number {
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - position.x;
        const dz = targetPos.z - position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
        if (this.onPlayerAttack) {
            this.onPlayerAttack(this, damage);
            return;
        }
        if (onAttack) {
            onAttack(this);
        }
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

    private isHitByRay(
        targetEntity: Entity,
        origin: Vec3,
        rayEnd: Vec3,
        hitRadius: number
    ): boolean {
        const targetPos = targetEntity.getPosition();
        const rayDir = rayEnd.clone().sub(origin);
        const rayLen = rayDir.length();
        if (rayLen <= 0.001) {
            return false;
        }
        const toTarget = targetPos.clone().sub(origin);
        const t = toTarget.dot(rayDir) / (rayLen * rayLen);
        if (t < 0 || t > 1) {
            return false;
        }
        const closest = origin.clone().add(rayDir.clone().mulScalar(t));
        const dist = targetPos.distance(closest);
        return dist <= hitRadius;
    }

    private directionToQuaternionFromUp(dir: Vec3): {
        x: number;
        y: number;
        z: number;
        w: number;
    } {
        const up = dir.clone().normalize();
        const forwardSeed =
            Math.abs(up.y) > 0.99 ? new Vec3(1, 0, 0) : new Vec3(0, 0, 1);
        const right = new Vec3();
        forwardSeed.clone().cross(up, right).normalize();
        const forward = new Vec3();
        up.clone().cross(right, forward).normalize();
        return this.matrixToQuat(right, up, forward);
    }

    private matrixToQuat(
        right: Vec3,
        up: Vec3,
        forward: Vec3
    ): { x: number; y: number; z: number; w: number } {
        const m00 = right.x,
            m01 = up.x,
            m02 = forward.x;
        const m10 = right.y,
            m11 = up.y,
            m12 = forward.y;
        const m20 = right.z,
            m21 = up.z,
            m22 = forward.z;
        const trace = m00 + m11 + m22;
        let w, x, y, z;
        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1);
            w = 0.25 / s;
            x = (m21 - m12) * s;
            y = (m02 - m20) * s;
            z = (m10 - m01) * s;
        } else if (m00 > m11 && m00 > m22) {
            const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
            w = (m21 - m12) / s;
            x = 0.25 * s;
            y = (m01 + m10) / s;
            z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
            w = (m02 - m20) / s;
            x = (m01 + m10) / s;
            y = 0.25 * s;
            z = (m12 + m21) * s;
        } else {
            const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
            w = (m10 - m01) / s;
            x = (m02 + m20) / s;
            y = (m12 + m21) / s;
            z = 0.25 * s;
        }
        return { x, y, z, w };
    }
}
