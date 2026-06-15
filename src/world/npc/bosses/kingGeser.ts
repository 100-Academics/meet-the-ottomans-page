import { AppBase, BLEND_ADDITIVE, Color, CULLFACE_NONE, Entity, StandardMaterial, Vec3 } from "playcanvas";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";
import { Boss } from "./boss";
import type { npc } from "../npc";

// Combat behavior and VFX for the King Geser boss.
type GeserAttackType = "dash" | "spear" | "lightning";

interface DashState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    trail?: Entity | null;
}

interface SpearState {
    windupStartSeconds: number;
    impactTimeSeconds: number;
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    charge?: Entity | null;
}

interface SpearWaveState {
    root: Entity;
    origin: Vec3;
    direction: Vec3;
    arcHalfAngleRad: number;
    segments: Entity[];
    haloSegments: Entity[];
    startTimeSeconds: number;
    durationSeconds: number;
    maxRadius: number;
    lastRadius: number;
    hasHit: boolean;
}

interface LightningStrike {
    strikeTimeSeconds: number;
    telegraphTimeSeconds: number;
    position?: Vec3;
    hasStruck: boolean;
    telegraphSpawned: boolean;
}

interface LightningState {
    strikes: LightningStrike[];
    endTimeSeconds: number;
}

export class KingGeser extends Boss {
    // Tunable attack parameters.
    private readonly dashSpeed = PLAYER_MOVE_SPEED * 2.45;
    private readonly dashDurationSeconds = 0.55;
    private readonly dashRecoverSeconds = 0.35;
    private readonly dashCooldownSeconds = 4.8;
    private readonly dashRangeMin = 7;
    private readonly dashRangeMax = 30;
    private readonly dashHitRadius = 3.4;
    private readonly dashDamage = 16;
    private readonly dashTrailLength = 5.2;
    private readonly dashTrailWidth = 0.7;
    private readonly dashTrailHeight = 0.32;

    private readonly spearRange = 120;
    private readonly spearOvershoot = 40;
    private readonly spearDamage = 22;
    private readonly spearHitRadius = 4.2;
    private readonly spearWindupSeconds = 0.8;
    private readonly spearRecoverSeconds = 0.5;
    private readonly spearCooldownSeconds = 6.6;
    private readonly spearBeamRadius = 0.75;
    private readonly spearBeamDurationMs = 260;
    private readonly spearChargeOffset = 2.1;
    private readonly spearChargeHeight = 3.4;
    private readonly spearChargeBaseScale = 0.7;
    private readonly spearChargeScaleBoost = 0.6;

    private readonly spearWaveSpeed = 58;
    private readonly spearWaveThickness = 2.4;
    private readonly spearWaveHeight = 0.28;
    private readonly spearWaveJumpClearance = 1.05;
    private readonly spearWaveMinDuration = 1.5;
    private readonly spearWaveMaxDuration = 5.2;
    private readonly spearWaveDefaultRadius = 150;
    private readonly spearWaveArcDegrees = 160;
    private readonly spearWaveSegments = 34;
    private readonly spearWaveSegmentScale = 0.95;
    private readonly spearWaveDamage = 18;

    private readonly lightningRange = 160;
    private readonly lightningDamage = 18;
    private readonly lightningCooldownSeconds = 8.5;
    private readonly lightningWindupSeconds = 0.7;
    private readonly lightningStrikeSpacingSeconds = 0.65;
    private readonly lightningStrikeCount = 3;
    private readonly lightningStrikeRadius = 4.4;
    private readonly lightningBoltHeight = 18;
    private readonly lightningBoltRadius = 0.55;
    private readonly lightningBoltDurationMs = 320;
    private readonly lightningScatterRadius = 3.5;
    private readonly lightningRecoverSeconds = 0.4;

    // Runtime state used to sequence attacks and cooldowns.
    private attackLockUntilSeconds = 0;
    private nextDashAtSeconds = 0;
    private nextSpearAtSeconds = 0;
    private nextLightningAtSeconds = 0;
    private lastAttackType: GeserAttackType | null = null;

    private dashState: DashState | null = null;
    private spearState: SpearState | null = null;
    private spearWaveState: SpearWaveState | null = null;
    private lightningState: LightningState | null = null;

    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // Materials are created once and reused by VFX helpers.
    private readonly dashTrailMaterial = this.createEffectMaterial(
        new Color(0.2, 0.65, 1),
        new Color(0.4, 0.85, 1),
        4.6,
        0.85
    );
    private readonly spearChargeMaterial = this.createEffectMaterial(
        new Color(0.95, 0.85, 0.4),
        new Color(1, 0.9, 0.5),
        4.2,
        0.9
    );
    private readonly spearBeamMaterial = this.createEffectMaterial(
        new Color(0.8, 0.9, 1),
        new Color(0.75, 0.92, 1),
        6.2,
        0.9
    );
    private readonly spearWaveMaterial = this.createEffectMaterial(
        new Color(0.55, 0.8, 1),
        new Color(0.7, 0.92, 1),
        4.8,
        0.8
    );
    private readonly spearWaveHaloMaterial = this.createEffectMaterial(
        new Color(0.8, 0.95, 1),
        new Color(0.9, 1, 1),
        5.4,
        0.7
    );
    private readonly lightningBoltMaterial = this.createEffectMaterial(
        new Color(0.85, 0.95, 1),
        new Color(0.95, 1, 1),
        8.0,
        0.95
    );
    private readonly lightningTelegraphMaterial = this.createEffectMaterial(
        new Color(0.4, 0.7, 1),
        new Color(0.55, 0.85, 1),
        4.4,
        0.6
    );
    private readonly lightningImpactMaterial = this.createEffectMaterial(
        new Color(0.9, 0.98, 1),
        new Color(1, 1, 1),
        6.5,
        0.85
    );

    // Track spawned entities so cleanup is reliable.
    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("King Geser")) {
        super(id, maxHealth, entity, "King Geser");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.2;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.65;
        this.setTauntSet({
            highHealth: [
                "The sky still favors me.",
                "You stand before a king, not a man."
            ],
            bossLowPlayerHigh: [
                "This wound will not decide me.",
                "You press hard. Good."
            ],
            playerLowBossHigh: [
                "Your strength fades before mine.",
                "The throne remains mine."
            ],
            bothLow: [
                "Now the battle becomes honest.",
                "Only resolve remains."
            ],
            death: [
                "You were a fool for trying",
                "Be gone."
            ],
            bossDeath: [
                "A king has fallen.",
                "The throne is empty for now.",
                "The throne will remember your hand.",
                "So be it. I yield this round."
            ]
        });
        this.setIntroTaunt("ᠪᠢ ᠭᠡᠰᠡᠷ ᠬᠠᠭᠠᠨ ᠪᠤᠢ᠃", "I am King Geser.");
        this.setIntroNameTranslation("ᠭᠡᠰᠡᠷ ᠬᠠᠭᠠᠨ", "King Geser");
    }

    public override updateCombatAI(
        deltaTime: number,
        currentTimeSeconds: number,
        allNpcs: npc[],
        onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
        playerEntity?: Entity | null,
        onPlayerAttack?: (attacker: npc, damage: number) => void
    ): void {
        // Cache the player damage hook for boss-specific attacks.
        this.onPlayerAttack = onPlayerAttack;
        super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
    }

    // Main per-frame AI loop for the boss.
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

        if (this.spearWaveState) {
            this.updateSpearWave(targetEntity, currentTimeSeconds);
        }

        if (this.lightningState) {
        	this.updateLightning(targetEntity, currentTimeSeconds, onAttack);
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

        if (this.dashState) {
            this.updateDash(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
            return;
        }

        if (this.spearState) {
            this.updateSpear(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
            return;
        }

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
        if (nextAttack === "dash") {
            this.startDash(targetEntity, currentTimeSeconds);
            return;
        }
        if (nextAttack === "spear") {
            this.startSpear(targetEntity, currentTimeSeconds);
            return;
        }
        if (nextAttack === "lightning") {
            this.startLightning(targetEntity, currentTimeSeconds);
            return;
        }

        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
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
            attackDamage: this.spearDamage,
            attackRange: Math.max(this.spearRange, this.lightningRange),
            attackCooldown: Math.min(this.dashCooldownSeconds, this.spearCooldownSeconds, this.lightningCooldownSeconds),
            detectionRange: Number.MAX_VALUE
        };
    }

    // Choose the next attack based on range, cooldowns, and recent history.
    private pickNextAttack(distance: number, nowSeconds: number): GeserAttackType | null {
        const options: Array<{ type: GeserAttackType; weight: number }> = [];
        const dashReady = nowSeconds >= this.nextDashAtSeconds
            && distance >= this.dashRangeMin
            && distance <= this.dashRangeMax;
        const spearReady = nowSeconds >= this.nextSpearAtSeconds && distance <= this.spearRange;
        const lightningReady = nowSeconds >= this.nextLightningAtSeconds && distance <= this.lightningRange;

        if (dashReady) {
            const weight = distance > 16 ? 1.15 : 0.7;
            options.push({ type: "dash", weight });
        }
        if (spearReady) {
            const weight = distance < 10 ? 1.15 : 0.95;
            options.push({ type: "spear", weight });
        }
        if (lightningReady) {
            const weight = distance > 14 ? 1.1 : 0.85;
            options.push({ type: "lightning", weight });
        }

        if (options.length === 0) {
            return null;
        }

        if (options.length > 1 && this.lastAttackType) {
            const match = options.find(option => option.type === this.lastAttackType);
            if (match) {
                match.weight *= 0.5;
            }
        }

        const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const option of options) {
            roll -= option.weight;
            if (roll <= 0) {
                return option.type;
            }
        }

        return options[0].type;
    }

    private startDash(targetEntity: Entity, nowSeconds: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) {
            return;
        }

        dir.normalize();
        this.dashState = {
            endTimeSeconds: nowSeconds + this.dashDurationSeconds,
            direction: dir,
            hasHit: false,
            trail: this.createDashTrail()
        };
        this.attackLockUntilSeconds = this.dashState.endTimeSeconds + this.dashRecoverSeconds;
        this.lastAttackType = "dash";
    }

    private updateDash(
        deltaTime: number,
        targetEntity: Entity,
        nowSeconds: number,
        onAttack?: (attacker: npc) => void
    ): void {
        const state = this.dashState;
        if (!state) {
            return;
        }

        this.moveToward(state.direction.x, state.direction.z, this.dashSpeed, deltaTime);
        if (state.trail) {
            this.updateDashTrail(state.trail, state.direction);
        }

        if (!state.hasHit && this.getFlatDistanceTo(targetEntity) <= this.dashHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.dashDamage, onAttack);
        }

        if (nowSeconds >= state.endTimeSeconds) {
            this.destroyEffect(state.trail);
            this.dashState = null;
            this.nextDashAtSeconds = nowSeconds + this.dashCooldownSeconds;
        }
    }

    private startSpear(targetEntity: Entity, nowSeconds: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) {
            return;
        }

        dir.normalize();
        this.spearState = {
            windupStartSeconds: nowSeconds,
            impactTimeSeconds: nowSeconds + this.spearWindupSeconds,
            endTimeSeconds: nowSeconds + this.spearWindupSeconds + this.spearRecoverSeconds,
            direction: dir,
            hasHit: false,
            charge: this.createSpearCharge()
        };
        this.attackLockUntilSeconds = this.spearState.endTimeSeconds;
        this.lastAttackType = "spear";
    }

    private updateSpear(
    	deltaTime: number,
    	targetEntity: Entity,
    	nowSeconds: number,
    	onAttack?: (attacker: npc) => void
    ): void {
    	const state = this.spearState;
    	if (!state) {
    		return;
    	}

    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = targetEntity.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, deltaTime);
    	}
        if (state.charge) {
            const windupProgress = Math.min(1, Math.max(0, (nowSeconds - state.windupStartSeconds) / this.spearWindupSeconds));
            this.updateSpearCharge(state.charge, windupProgress);
        }

        if (!state.hasHit && nowSeconds >= state.impactTimeSeconds) {
            state.hasHit = true;
            if (state.charge) {
                this.destroyEffect(state.charge);
                state.charge = null;
            }
            this.fireSpearThrust(targetEntity, state.direction, onAttack);
            this.startSpearWave(targetEntity, state.direction, nowSeconds);
        }

        if (nowSeconds >= state.endTimeSeconds) {
            if (state.charge) {
                this.destroyEffect(state.charge);
            }
            this.spearState = null;
            this.nextSpearAtSeconds = nowSeconds + this.spearCooldownSeconds;
        }
    }

    private startLightning(targetEntity: Entity, nowSeconds: number): void {
        const strikes: LightningStrike[] = [];
        const firstStrikeAt = nowSeconds + this.lightningWindupSeconds;
        for (let i = 0; i < this.lightningStrikeCount; i += 1) {
            const strikeTimeSeconds = firstStrikeAt + (i * this.lightningStrikeSpacingSeconds);
            strikes.push({
                strikeTimeSeconds,
                telegraphTimeSeconds: strikeTimeSeconds - this.lightningWindupSeconds,
                hasStruck: false,
                telegraphSpawned: false
            });
        }

        const endTimeSeconds = strikes[strikes.length - 1].strikeTimeSeconds + this.lightningRecoverSeconds;
        this.lightningState = { strikes, endTimeSeconds };
        this.attackLockUntilSeconds = endTimeSeconds;
        this.lastAttackType = "lightning";

        this.faceTarget(targetEntity, 0);
    }

    private updateLightning(
        targetEntity: Entity | null,
        nowSeconds: number,
        onAttack?: (attacker: npc) => void
    ): void {
        const state = this.lightningState;
        if (!state) {
            return;
        }

        for (const strike of state.strikes) {
            if (!strike.telegraphSpawned && nowSeconds >= strike.telegraphTimeSeconds) {
                strike.telegraphSpawned = true;
                if (targetEntity) {
                    strike.position = this.getLightningStrikePosition(targetEntity);
                }
                const pos = strike.position ?? this.getEntity().getPosition().clone();
                this.spawnRingEffect(
                    pos,
                    this.lightningStrikeRadius,
                    this.lightningWindupSeconds * 1000,
                    this.lightningTelegraphMaterial,
                    "geser lightning telegraph",
                    0.18
                );
            }

            if (!strike.hasStruck && nowSeconds >= strike.strikeTimeSeconds) {
                strike.hasStruck = true;
                if (!strike.position && targetEntity) {
                    strike.position = this.getLightningStrikePosition(targetEntity);
                }
                const pos = strike.position ?? this.getEntity().getPosition().clone();
                this.spawnLightningBolt(pos);
                this.spawnRingEffect(
                    pos,
                    this.lightningStrikeRadius * 1.2,
                    220,
                    this.lightningImpactMaterial,
                    "geser lightning impact",
                    0.22
                );

                if (targetEntity && this.getFlatDistanceToPosition(targetEntity, pos) <= this.lightningStrikeRadius) {
                    this.applyDamage(this.lightningDamage, onAttack);
                }
            }
        }

        if (nowSeconds >= state.endTimeSeconds) {
            this.lightningState = null;
            this.nextLightningAtSeconds = nowSeconds + this.lightningCooldownSeconds;
        }
    }

    private fireSpearThrust(targetEntity: Entity, direction: Vec3, onAttack?: (attacker: npc) => void): void {
        const origin = this.getEntity().getPosition().clone();
        const dir = direction.clone();
        if (dir.lengthSq() <= 0.0001) {
            return;
        }

        dir.normalize();
        const rayEnd = origin.clone().add(dir.clone().mulScalar(this.spearRange + this.spearOvershoot));
        this.spawnSpearBeam(origin, rayEnd);

        if (this.isHitByRay(targetEntity, origin, rayEnd, this.spearHitRadius)) {
            this.applyDamage(this.spearDamage, onAttack);
        }
    }

    private startSpearWave(targetEntity: Entity, direction: Vec3, nowSeconds: number): void {
        const origin = this.getEntity().getPosition().clone();
        const maxRadius = this.getSpearWaveMaxRadius(origin, targetEntity);
        const durationSeconds = this.getSpearWaveDuration(maxRadius);
        const wave = this.createSpearWaveEffect(origin, this.spearWaveSegments);
        if (!wave) {
            return;
        }

        const arcHalfAngleRad = (this.spearWaveArcDegrees * 0.5) * (Math.PI / 180);
        this.spearWaveState = {
            root: wave.root,
            origin,
            direction: direction.clone().normalize(),
            arcHalfAngleRad,
            segments: wave.segments,
            haloSegments: wave.haloSegments,
            startTimeSeconds: nowSeconds,
            durationSeconds,
            maxRadius,
            lastRadius: 0,
            hasHit: false
        };

        this.attackLockUntilSeconds = Math.max(this.attackLockUntilSeconds, nowSeconds + durationSeconds);
    }

    private updateSpearWave(targetEntity: Entity | null, nowSeconds: number): void {
        const state = this.spearWaveState;
        if (!state) {
            return;
        }

        const elapsed = nowSeconds - state.startTimeSeconds;
        const t = Math.min(1, Math.max(0, elapsed / state.durationSeconds));
        const currentRadius = state.maxRadius * t;

        this.updateSpearWaveVisual(state, currentRadius);
        if (targetEntity) {
            this.checkSpearWaveHit(state, targetEntity, currentRadius);
        }
        state.lastRadius = currentRadius;

        if (t >= 1) {
            this.destroyEffect(state.root);
            this.spearWaveState = null;
        }
    }

    private updateSpearWaveVisual(state: SpearWaveState, radius: number): void {
        if (!state.root?.parent) {
            return;
        }

        const yawDegrees = Math.atan2(state.direction.x, state.direction.z) * (180 / Math.PI);
        state.root.setLocalEulerAngles(0, yawDegrees, 0);

        const segmentCount = state.segments.length;
        if (segmentCount === 0) {
            return;
        }

        const halfAngle = state.arcHalfAngleRad;
        const baseScale = Math.max(0.35, this.spearWaveSegmentScale);
        const haloRadius = radius + (this.spearWaveThickness * 0.6);

        for (let i = 0; i < segmentCount; i += 1) {
            const t = segmentCount === 1 ? 0.5 : i / (segmentCount - 1);
            const angle = -halfAngle + (t * halfAngle * 2);
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;
            const segment = state.segments[i];
            segment.setLocalPosition(x, this.spearWaveHeight * 0.5, z);
            segment.setLocalScale(baseScale, baseScale, baseScale);

            const haloSegment = state.haloSegments[i];
            if (haloSegment) {
                const hx = Math.sin(angle) * haloRadius;
                const hz = Math.cos(angle) * haloRadius;
                const haloScale = Math.max(0.25, baseScale * 0.7);
                haloSegment.setLocalPosition(hx, this.spearWaveHeight * 0.35, hz);
                haloSegment.setLocalScale(haloScale, haloScale, haloScale);
            }
        }
    }

    private checkSpearWaveHit(state: SpearWaveState, targetEntity: Entity, radius: number): void {
        if (state.hasHit) {
            return;
        }

        const playerPos = targetEntity.getPosition();
        const dx = playerPos.x - state.origin.x;
        const dz = playerPos.z - state.origin.z;
        const distance = Math.sqrt((dx * dx) + (dz * dz));
        if (distance <= 0.001) {
            return;
        }

        const toPlayer = new Vec3(dx, 0, dz).normalize();
        const dot = Math.max(-1, Math.min(1, state.direction.dot(toPlayer)));
        const angle = Math.acos(dot);
        if (angle > state.arcHalfAngleRad) {
            return;
        }

        const band = this.spearWaveThickness;
        const minR = Math.max(0, Math.min(state.lastRadius, radius) - band);
        const maxR = Math.max(state.lastRadius, radius) + band;

        if (distance < minR || distance > maxR) {
            return;
        }

        const heightAboveGround = this.getPlayerHeightAboveGround(targetEntity);
        if (heightAboveGround <= this.spearWaveJumpClearance) {
            this.applyDamage(this.spearWaveDamage);
            state.hasHit = true;
        }
    }

    private getPlayerHeightAboveGround(targetEntity: Entity): number {
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
        const groundHeight = Number.isFinite(controller?.groundHeight)
            ? controller.groundHeight
            : (targetEntity.getPosition().y - playerHeight);
        return targetEntity.getPosition().y - (groundHeight + playerHeight);
    }

    private getSpearWaveDuration(maxRadius: number): number {
        const duration = maxRadius / Math.max(1, this.spearWaveSpeed);
        return Math.min(this.spearWaveMaxDuration, Math.max(this.spearWaveMinDuration, duration));
    }

    private getSpearWaveMaxRadius(origin: Vec3, targetEntity: Entity): number {
        const bounds = this.getWorldBoundsFromTarget(targetEntity);
        if (!bounds) {
            return Math.max(this.spearWaveDefaultRadius, this.spearWaveThickness * 2);
        }

        const corners = [
            new Vec3(bounds.minX, origin.y, bounds.minZ),
            new Vec3(bounds.minX, origin.y, bounds.maxZ),
            new Vec3(bounds.maxX, origin.y, bounds.minZ),
            new Vec3(bounds.maxX, origin.y, bounds.maxZ)
        ];

        let maxDistance = 0;
        for (const corner of corners) {
            const dx = corner.x - origin.x;
            const dz = corner.z - origin.z;
            const dist = Math.sqrt((dx * dx) + (dz * dz));
            if (dist > maxDistance) {
                maxDistance = dist;
            }
        }

        return Math.max(this.spearWaveDefaultRadius, maxDistance + 2);
    }

    private getWorldBoundsFromTarget(targetEntity: Entity): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const minX = controller?.movementBoundsMinX;
        const maxX = controller?.movementBoundsMaxX;
        const minZ = controller?.movementBoundsMinZ;
        const maxZ = controller?.movementBoundsMaxZ;

        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
            return null;
        }

        if (minX > maxX || minZ > maxZ) {
            return null;
        }

        return { minX, maxX, minZ, maxZ };
    }

    private createSpearWaveEffect(origin: Vec3, segmentCount: number): { root: Entity; segments: Entity[]; haloSegments: Entity[] } | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const waveRoot = new Entity("geser spear wave");
        const segments: Entity[] = [];
        const haloSegments: Entity[] = [];
        const count = Math.max(6, segmentCount);

        for (let i = 0; i < count; i += 1) {
            const segment = new Entity(`geser spear wave segment ${i}`);
            segment.addComponent("render", { type: "sphere" } as any);
            segment.setLocalScale(this.spearWaveSegmentScale, this.spearWaveSegmentScale, this.spearWaveSegmentScale);
            if (segment.render?.meshInstances?.length) {
                segment.render.meshInstances[0].material = this.spearWaveMaterial;
            }
            waveRoot.addChild(segment);
            segments.push(segment);

            const haloSegment = new Entity(`geser spear wave halo ${i}`);
            haloSegment.addComponent("render", { type: "sphere" } as any);
            const haloScale = Math.max(0.35, this.spearWaveSegmentScale * 0.7);
            haloSegment.setLocalScale(haloScale, haloScale, haloScale);
            if (haloSegment.render?.meshInstances?.length) {
                haloSegment.render.meshInstances[0].material = this.spearWaveHaloMaterial;
            }
            waveRoot.addChild(haloSegment);
            haloSegments.push(haloSegment);
        }

        waveRoot.setPosition(origin.x, origin.y + 0.08, origin.z);
        sceneApp.root.addChild(waveRoot);
        this.registerEffect(waveRoot);
        return { root: waveRoot, segments, haloSegments };
    }

    private createSpearCharge(): Entity | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const chargeRoot = new Entity("geser spear charge");
        const orb = new Entity("geser spear charge orb");
        orb.addComponent("render", { type: "sphere" } as any);
        orb.setLocalScale(this.spearChargeBaseScale, this.spearChargeBaseScale, this.spearChargeBaseScale);
        if (orb.render?.meshInstances?.length) {
            orb.render.meshInstances[0].material = this.spearChargeMaterial;
        }
        chargeRoot.addChild(orb);
        sceneApp.root.addChild(chargeRoot);
        this.registerEffect(chargeRoot);
        return chargeRoot;
    }

    private updateSpearCharge(charge: Entity, progress: number): void {
        const bossPos = this.getEntity().getPosition();
        const forward = this.getEntity().forward.clone();
        forward.y = 0;
        if (forward.lengthSq() <= 0.001) {
            forward.set(0, 0, 1);
        } else {
            forward.normalize();
        }
        const offset = forward.mulScalar(this.spearChargeOffset);
        charge.setPosition(bossPos.x + offset.x, bossPos.y + this.spearChargeHeight, bossPos.z + offset.z);

        const pulse = 0.85 + (Math.sin(performance.now() * 0.02) * 0.15);
        const scale = this.spearChargeBaseScale + (progress * this.spearChargeScaleBoost);
        charge.setLocalScale(scale * pulse, scale * pulse, scale * pulse);
    }

    private spawnSpearBeam(origin: Vec3, end: Vec3): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return;
        }

        const direction = end.clone().sub(origin);
        const length = direction.length();
        if (length <= 0.5) {
            return;
        }

        const beamRoot = new Entity("geser spear beam");
        const beam = new Entity("geser spear beam mesh");
        beam.addComponent("render", { type: "cylinder" } as any);
        beam.setLocalScale(this.spearBeamRadius, length, this.spearBeamRadius);
        beam.setLocalPosition(0, length * 0.5, 0);
        if (beam.render?.meshInstances?.length) {
            beam.render.meshInstances[0].material = this.spearBeamMaterial;
        }
        beamRoot.addChild(beam);
        beamRoot.setPosition(origin.x, origin.y, origin.z);
        const quat = this.directionToQuaternionFromUp(direction);
        beamRoot.setLocalRotation(quat.x, quat.y, quat.z, quat.w);

        sceneApp.root.addChild(beamRoot);
        this.registerEffect(beamRoot);

        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !beamRoot.parent || !this.activeEffects.has(beamRoot)) {
                this.destroyEffect(beamRoot);
                return;
            }

            const t = Math.min(1, (performance.now() - start) / this.spearBeamDurationMs);
            const eased = t * t * (3 - 2 * t);
            const currentLength = Math.max(0.2, length * eased);
            beam.setLocalScale(this.spearBeamRadius, currentLength, this.spearBeamRadius);
            beam.setLocalPosition(0, currentLength * 0.5, 0);

            if (t >= 1) {
                this.destroyEffect(beamRoot);
                return;
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    private spawnLightningBolt(position: Vec3): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return;
        }

        const boltRoot = new Entity("geser lightning bolt");
        const bolt = new Entity("geser lightning bolt mesh");
        bolt.addComponent("render", { type: "cylinder" } as any);
        bolt.setLocalScale(this.lightningBoltRadius, this.lightningBoltHeight, this.lightningBoltRadius);
        bolt.setLocalPosition(0, this.lightningBoltHeight * 0.5, 0);
        if (bolt.render?.meshInstances?.length) {
            bolt.render.meshInstances[0].material = this.lightningBoltMaterial;
        }

        boltRoot.addChild(bolt);
        boltRoot.setPosition(position.x, position.y, position.z);
        sceneApp.root.addChild(boltRoot);
        this.registerEffect(boltRoot);

        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !boltRoot.parent || !this.activeEffects.has(boltRoot)) {
                this.destroyEffect(boltRoot);
                return;
            }

            const elapsed = performance.now() - start;
            const t = Math.min(1, elapsed / this.lightningBoltDurationMs);
            const flicker = 0.7 + (Math.sin(elapsed * 0.08) * 0.3);
            const scale = Math.max(0.2, this.lightningBoltRadius * flicker);
            bolt.setLocalScale(scale, this.lightningBoltHeight, scale);

            if (t >= 1) {
                this.destroyEffect(boltRoot);
                return;
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    private getLightningStrikePosition(targetEntity: Entity): Vec3 {
        const base = targetEntity.getPosition().clone();
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
        const groundHeight = Number.isFinite(controller?.groundHeight)
            ? controller.groundHeight
            : (base.y - playerHeight);

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * this.lightningScatterRadius;
        base.x += Math.cos(angle) * radius;
        base.z += Math.sin(angle) * radius;
        base.y = groundHeight + 0.05;
        return base;
    }

    private getFlatDistanceToPosition(targetEntity: Entity, position: Vec3): number {
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - position.x;
        const dz = targetPos.z - position.z;
        return Math.sqrt((dx * dx) + (dz * dz));
    }

    private createDashTrail(): Entity | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const trail = new Entity("geser dash trail");
        trail.addComponent("render", { type: "box" } as any);
        trail.setLocalScale(this.dashTrailWidth, this.dashTrailHeight, this.dashTrailLength);
        if (trail.render?.meshInstances?.length) {
            trail.render.meshInstances[0].material = this.dashTrailMaterial;
        }
        sceneApp.root.addChild(trail);
        this.registerEffect(trail);
        return trail;
    }

    private updateDashTrail(trail: Entity, direction: Vec3): void {
        const bossPos = this.getEntity().getPosition();
        const flatDir = new Vec3(direction.x, 0, direction.z);
        if (flatDir.lengthSq() <= 0.0001) {
            return;
        }

        flatDir.normalize();
        const offset = flatDir.clone().mulScalar(this.dashTrailLength * 0.5);
        const trailPos = bossPos.clone().sub(offset);
        const yawDegrees = (Math.atan2(flatDir.x, flatDir.z) * 180 / Math.PI);
        trail.setPosition(trailPos);
        trail.setLocalEulerAngles(0, yawDegrees, 0);
        trail.setLocalScale(this.dashTrailWidth, this.dashTrailHeight, this.dashTrailLength);
    }

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
        return Math.sqrt((dx * dx) + (dz * dz));
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

    private directionToQuaternionFromUp(dir: Vec3): { x: number; y: number; z: number; w: number } {
        const up = dir.clone().normalize();
        const forwardSeed = Math.abs(up.y) > 0.99 ? new Vec3(1, 0, 0) : new Vec3(0, 0, 1);

        const right = new Vec3();
        forwardSeed.clone().cross(up, right).normalize();

        const forward = new Vec3();
        up.clone().cross(right, forward).normalize();

        return this.matrixToQuat(right, up, forward);
    }

    private matrixToQuat(right: Vec3, up: Vec3, forward: Vec3): { x: number; y: number; z: number; w: number } {
        const m00 = right.x, m01 = up.x, m02 = forward.x;
        const m10 = right.y, m11 = up.y, m12 = forward.y;
        const m20 = right.z, m21 = up.z, m22 = forward.z;

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
            z = (m12 + m21) / s;
        } else {
            const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
            w = (m10 - m01) / s;
            x = (m02 + m20) / s;
            y = (m12 + m21) / s;
            z = 0.25 * s;
        }

        return { x, y, z, w };
    }

    private createEffectMaterial(diffuse: Color, emissive: Color, emissiveIntensity: number, opacity: number): StandardMaterial {
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
            // ignore
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
        this.dashState = null;
        this.spearState = null;
        this.spearWaveState = null;
        this.lightningState = null;
    }
}