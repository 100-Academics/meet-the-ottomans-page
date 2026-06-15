import { AppBase, BLEND_ADDITIVE, Color, CULLFACE_NONE, Entity, StandardMaterial, Vec3 } from "playcanvas";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";
import { Boss } from "./boss";
import type { npc } from "../npc";

// Combat behavior and VFX for the Genghis Khan boss.
type KhanAttackState = "idle" | "charging" | "pounding" | "bowing" | "meleeWindup";
type KhanAttackType = "charge" | "pound" | "bow";

interface ChargeState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    trail?: Entity | null;
}

interface PoundState {
    impactTimeSeconds: number;
    endTimeSeconds: number;
    hasHit: boolean;
}

interface BowState {
    releaseTimeSeconds: number;
    target: Entity;
    glow?: Entity | null;
}

interface GroundWaveState {
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

export class GenghisKhan extends Boss {
    // Tunable attack parameters.
    private readonly chargeSpeed = PLAYER_MOVE_SPEED * 2.2;
    private readonly chargeDurationSeconds = 0.6;
    private readonly chargeCooldownSeconds = 5.5;
    private readonly chargeRecoverSeconds = 0.35;
    private readonly chargeRangeMin = 6;
    private readonly chargeRangeMax = 26;
    private readonly chargeHitRadius = 3.2;
    private readonly chargeDamage = 18;
    private readonly chargeTrailLength = 4.5;
    private readonly chargeTrailWidth = 0.6;
    private readonly chargeTrailHeight = 0.3;

    private readonly groundPoundRange = 6.5;
    private readonly groundPoundRadius = 7.5;
    private readonly groundPoundDamage = 20;
    private readonly groundPoundWindupSeconds = 0.65;
    private readonly groundPoundRecoverSeconds = 0.45;
    private readonly groundPoundCooldownSeconds = 6.5;
    private readonly groundPoundWaveSpeed = 52;
    private readonly groundPoundWaveThickness = 2.1;
    private readonly groundPoundWaveHeight = 0.26;
    private readonly groundPoundWaveJumpClearance = 1.05;
    private readonly groundPoundWaveMinDuration = 1.4;
    private readonly groundPoundWaveMaxDuration = 4.8;
    private readonly groundPoundDefaultWaveRadius = 140;
    private readonly groundPoundWaveArcDegrees = 220;
    private readonly groundPoundWaveSegments = 36;
    private readonly groundPoundWaveSegmentScale = 0.9;

    private readonly bowRange = 100;
    private readonly bowMinRange = 40;
    private readonly bowCooldownSeconds = 4.0;
    private readonly bowWindupSeconds = 0.55;
    private readonly bowRecoverSeconds = 0.35;
    private readonly bowDamage = 15;
    private readonly bowPullStopDistance = 3.2;
    private readonly bowPullSpeed = 48;
    private readonly pullTetherRadius = 0.22;
    private readonly pullTetherPulse = 0.08;
    private readonly pullTetherStartHeight = 3.4;
    private readonly pullTetherEndHeight = 0.4;
    private readonly pullMaxDurationSeconds = 2.4;

    private readonly meleeDamage = 24;
    private readonly meleeRange = 3.8;
    private readonly meleeArcDurationSeconds = 0.7;
    private readonly meleeDelayMinSeconds = 0.5;
    private readonly meleeDelayMaxSeconds = 1.0;
    private readonly pullReleaseMeleeDelaySeconds = 0.6;
    private readonly pullReleaseDamageDelaySeconds = 0.35;
    private readonly pullReleaseDamageRange = 4.2;

    // Runtime state used to sequence attacks and cooldowns.
    private _attackState: KhanAttackState = "idle";
    /** Current attack state (read-only externally). */
    public get attackState(): KhanAttackState { return this._attackState; }
    private set attackState(v: KhanAttackState) { this._attackState = v; }
    private attackLockUntilSeconds = 0;
    private nextChargeAtSeconds = 0;
    private nextPoundAtSeconds = 0;
    private nextBowAtSeconds = 0;
    private pendingMeleeAtSeconds: number | null = null;
    private pendingPullDamage: number | null = null;
    private pullDamageToken = 0;
    private lastAttackType: KhanAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private isPullingPlayer = false;

    private chargeState: ChargeState | null = null;
    private poundState: PoundState | null = null;
    private bowState: BowState | null = null;
    private waveState: GroundWaveState | null = null;

    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // Materials are created once and reused by VFX helpers.
    private readonly chargeTrailMaterial = this.createEffectMaterial(
        new Color(0.95, 0.65, 0.2),
        new Color(1, 0.6, 0.1),
        2.2,
        0.85
    );
    private readonly shockwaveMaterial = this.createEffectMaterial(
        new Color(0.85, 0.35, 0.1),
        new Color(1, 0.4, 0.12),
        4.0,
        0.85
    );
    private readonly groundWaveMaterial = this.createEffectMaterial(
        new Color(0.9, 0.45, 0.18),
        new Color(1, 0.5, 0.2),
        4.6,
        0.7
    );
    private readonly groundTelegraphMaterial = this.createEffectMaterial(
        new Color(0.95, 0.5, 0.2),
        new Color(1, 0.55, 0.2),
        5.2,
        0.95
    );
    private readonly bowGlowMaterial = this.createEffectMaterial(
        new Color(0.9, 0.8, 0.4),
        new Color(1, 0.9, 0.5),
        3.4,
        0.9
    );
    private readonly pullTetherMaterial = this.createEffectMaterial(
        new Color(0.95, 0.75, 0.3),
        new Color(1, 0.85, 0.4),
        6.2,
        0.95
    );

    // Track spawned entities so we can clean them up safely.
    private readonly activeEffects = new Set<Entity>();

    // Initialize boss tuning, taunts, and display strings.
    constructor(id: number, maxHealth: number, entity: Entity = new Entity("genghisKhan")) {
        super(id, maxHealth, entity, "Genghis Khan");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.1;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.7;
        this.setTauntSet({
            highHealth: [
                "You cannot defeat the great Genghis Khan!",
                "Stand down.",
                "Kneel before me."
            ],
            bossLowPlayerHigh: [
                "Foolishness, fighter, foolishness!",
                "You have me bleeding, but not beaten."
            ],
            playerLowBossHigh: [
                "You challenge the might of the Mongol Empire!?",
                "I will show you no mercy!"
            ],
            bothLow: [
                "Down!",
                "One of us falls here."
            ],
            death: [
                "Down with you, treacherous dog!",
                "Stand no longer."
            ],
            bossDeath: [
                "Genghis Khan falls, but the horde endures.",
                "You have slain a king of war."
            ]
        });
        this.setIntroTaunt("ᠪᠢ ᠪᠣᠯ ᠶᠡᠬᠡ ᠬᠠᠭᠠᠨ ᠪᠤᠢ", "I am the Great Khan.");
        this.setIntroNameTranslation("ᠴᠢᠩᠭᠢᠰ ᠬᠠᠭᠠᠨ", "Genghis Khan");
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

        if (!targetEntity) {
            super.updateAI(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack, profileOverride);
            return;
        }

        if (this.waveState) {
            this.updateGroundWave(targetEntity, currentTimeSeconds);
        }

        if (this.chargeState) {
            this.updateCharge(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
            return;
        }

        if (this.poundState) {
            this.updateGroundPound(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
            return;
        }

        if (this.bowState) {
            this.updateBow(targetEntity, currentTimeSeconds);
            return;
        }

        if (this.isPullingPlayer) {
        	{
        		const myPos = this.getEntity().getPosition();
        		const targetPos = targetEntity.getPosition();
        		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
        	}
        	return;
        }

        if (this.pendingMeleeAtSeconds !== null) {
            this.updateMeleeWindup(targetEntity, currentTimeSeconds, onAttack);
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
        const chosenAttack = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosenAttack === "pound") {
            this.startGroundPound(currentTimeSeconds);
            return;
        }
        if (chosenAttack === "bow") {
            this.startBow(targetEntity, currentTimeSeconds);
            return;
        }
        if (chosenAttack === "charge") {
            this.startCharge(targetEntity, currentTimeSeconds);
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
            attackDamage: this.chargeDamage,
            attackRange: this.bowRange,
            attackCooldown: Math.min(this.bowCooldownSeconds, this.chargeCooldownSeconds, this.groundPoundCooldownSeconds),
            detectionRange: Number.MAX_VALUE
        };
    }

    // Choose the next attack based on range, cooldowns, and recent history.
    private pickNextAttack(distance: number, nowSeconds: number): KhanAttackType | null {
        const choices: Array<{ type: KhanAttackType; score: number }> = [];

        const canPound = nowSeconds >= this.nextPoundAtSeconds && distance <= this.groundPoundRange;
        if (canPound) {
            const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.groundPoundRange));
            choices.push({ type: "pound", score: 1.2 + closeness });
        }

        const canCharge = nowSeconds >= this.nextChargeAtSeconds
            && distance >= this.chargeRangeMin
            && distance <= this.chargeRangeMax;
        if (canCharge) {
            const mid = (this.chargeRangeMin + this.chargeRangeMax) * 0.5;
            const halfSpan = Math.max(0.001, (this.chargeRangeMax - this.chargeRangeMin) * 0.5);
            const centered = 1 - Math.min(1, Math.abs(distance - mid) / halfSpan);
            choices.push({ type: "charge", score: 1 + centered });
        }

        const canBow = nowSeconds >= this.nextBowAtSeconds
            && distance >= this.bowMinRange
            && distance <= this.bowRange;
        if (canBow) {
            const span = Math.max(0.001, this.bowRange - this.bowMinRange);
            const farBias = Math.min(1, Math.max(0, (distance - this.bowMinRange) / span));
            choices.push({ type: "bow", score: 0.9 + farBias });
        }

        if (choices.length === 0) {
            return null;
        }

        const recentWindowSeconds = 1.8;
        if (this.lastAttackType && (nowSeconds - this.lastAttackAtSeconds) < recentWindowSeconds) {
            for (const choice of choices) {
                if (choice.type === this.lastAttackType) {
                    choice.score *= 0.55;
                }
            }
        }

        let best = choices[0];
        for (let i = 1; i < choices.length; i += 1) {
            if (choices[i].score > best.score) {
                best = choices[i];
            }
        }

        const tied = choices.filter((choice) => Math.abs(choice.score - best.score) < 0.05);
        if (tied.length > 1) {
            return tied[Math.floor(Math.random() * tied.length)].type;
        }

        return best.type;
    }

    // Charge attack: short dash with a trailing hitbox.
    private startCharge(targetEntity: Entity, nowSeconds: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) {
            return;
        }

        dir.normalize();
        this.lastAttackType = "charge";
        this.lastAttackAtSeconds = nowSeconds;
        this.attackState = "charging";
        this.chargeState = {
            endTimeSeconds: nowSeconds + this.chargeDurationSeconds,
            direction: dir,
            hasHit: false,
            trail: this.createChargeTrail()
        };
        this.attackLockUntilSeconds = this.chargeState.endTimeSeconds + this.chargeRecoverSeconds;
    }

    private updateCharge(
        deltaTime: number,
        targetEntity: Entity,
        nowSeconds: number,
        onAttack?: (attacker: npc) => void
    ): void {
        const state = this.chargeState;
        if (!state) {
            return;
        }

        this.moveToward(state.direction.x, state.direction.z, this.chargeSpeed, deltaTime);
        if (state.trail) {
            this.updateChargeTrail(state.trail, state.direction);
        }

        if (!state.hasHit && this.getFlatDistanceTo(targetEntity) <= this.chargeHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.chargeDamage, onAttack);
        }

        if (nowSeconds >= state.endTimeSeconds) {
            this.destroyEffect(state.trail);
            this.chargeState = null;
            this.attackState = "idle";
            this.nextChargeAtSeconds = nowSeconds + this.chargeCooldownSeconds;
        }
    }

    // Ground pound: a close-range slam that spawns a wave.
    private startGroundPound(nowSeconds: number): void {
        this.lastAttackType = "pound";
        this.lastAttackAtSeconds = nowSeconds;
        this.attackState = "pounding";
        const impactTimeSeconds = nowSeconds + this.groundPoundWindupSeconds;
        this.poundState = {
            impactTimeSeconds,
            endTimeSeconds: impactTimeSeconds + this.groundPoundRecoverSeconds,
            hasHit: false
        };
        this.spawnRingEffect(
            this.getEntity().getPosition(),
            this.groundPoundRadius,
            this.groundPoundWindupSeconds * 1000,
            this.groundTelegraphMaterial,
            "khan ground telegraph",
            0.24
        );
        this.spawnRingEffect(
            this.getEntity().getPosition(),
            this.groundPoundRadius * 1.15,
            this.groundPoundWindupSeconds * 1000,
            this.groundTelegraphMaterial,
            "khan ground telegraph outer",
            0.08
        );
        this.attackLockUntilSeconds = this.poundState.endTimeSeconds;
    }

    private updateGroundPound(
        deltaTime: number,
        targetEntity: Entity,
        nowSeconds: number,
        _onAttack?: (attacker: npc) => void
    ): void {
    	const state = this.poundState;
    	if (!state) {
    		return;
    	}

    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = targetEntity.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, deltaTime);
    	}

        if (!state.hasHit && nowSeconds >= state.impactTimeSeconds) {
            state.hasHit = true;
            this.startGroundWave(targetEntity, nowSeconds);
            this.spawnRingEffect(
                this.getEntity().getPosition(),
                this.groundPoundRadius * 1.45,
                520,
                this.shockwaveMaterial,
                "khan ground shockwave",
                0.28
            );
            this.spawnRingEffect(
                this.getEntity().getPosition(),
                this.groundPoundRadius * 0.9,
                360,
                this.shockwaveMaterial,
                "khan ground shockwave inner",
                0.18
            );
        }

        if (nowSeconds >= state.endTimeSeconds) {
            this.poundState = null;
            this.attackState = "idle";
            this.nextPoundAtSeconds = nowSeconds + this.groundPoundCooldownSeconds;
        }
    }

    private startGroundWave(targetEntity: Entity, nowSeconds: number): void {
        const origin = this.getEntity().getPosition().clone();
        const direction = targetEntity.getPosition().clone().sub(origin);
        direction.y = 0;
        if (direction.lengthSq() <= 0.001) {
            const fallback = this.getEntity().forward.clone();
            fallback.y = 0;
            direction.copy(fallback.lengthSq() > 0.001 ? fallback : new Vec3(0, 0, 1));
        }
        direction.normalize();
        const maxRadius = this.getGroundWaveMaxRadius(origin, targetEntity);
        const durationSeconds = this.getGroundWaveDuration(maxRadius);
        const wave = this.createGroundWaveEffect(origin, this.groundPoundWaveSegments);
        if (!wave) {
            return;
        }

        const arcHalfAngleRad = (this.groundPoundWaveArcDegrees * 0.5) * (Math.PI / 180);

        this.waveState = {
            root: wave.root,
            origin,
            direction,
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

    private updateGroundWave(targetEntity: Entity, nowSeconds: number): void {
        const state = this.waveState;
        if (!state) {
            return;
        }

        const elapsed = nowSeconds - state.startTimeSeconds;
        const t = Math.min(1, Math.max(0, elapsed / state.durationSeconds));
        const currentRadius = state.maxRadius * t;

        this.updateGroundWaveVisual(state, currentRadius);
        this.checkGroundWaveHit(state, targetEntity, currentRadius);
        state.lastRadius = currentRadius;

        if (t >= 1) {
            this.destroyEffect(state.root);
            this.waveState = null;
        }
    }

    private updateGroundWaveVisual(state: GroundWaveState, radius: number): void {
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
        const baseScale = Math.max(0.35, this.groundPoundWaveSegmentScale);
        const haloRadius = radius + (this.groundPoundWaveThickness * 0.6);
        for (let i = 0; i < segmentCount; i += 1) {
            const t = segmentCount === 1 ? 0.5 : i / (segmentCount - 1);
            const angle = -halfAngle + (t * halfAngle * 2);
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;
            const segment = state.segments[i];
            segment.setLocalPosition(x, this.groundPoundWaveHeight * 0.5, z);
            segment.setLocalScale(baseScale, baseScale, baseScale);

            const haloSegment = state.haloSegments[i];
            if (haloSegment) {
                const hx = Math.sin(angle) * haloRadius;
                const hz = Math.cos(angle) * haloRadius;
                const haloScale = Math.max(0.25, baseScale * 0.7);
                haloSegment.setLocalPosition(hx, this.groundPoundWaveHeight * 0.35, hz);
                haloSegment.setLocalScale(haloScale, haloScale, haloScale);
            }
        }
    }

    private checkGroundWaveHit(state: GroundWaveState, targetEntity: Entity, radius: number): void {
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

        const band = this.groundPoundWaveThickness;
        const minR = Math.max(0, Math.min(state.lastRadius, radius) - band);
        const maxR = Math.max(state.lastRadius, radius) + band;

        if (distance < minR || distance > maxR) {
            return;
        }

        const heightAboveGround = this.getPlayerHeightAboveGround(targetEntity);
        if (heightAboveGround <= this.groundPoundWaveJumpClearance) {
            this.applyDamage(this.groundPoundDamage);
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

    private getGroundWaveDuration(maxRadius: number): number {
        const duration = maxRadius / Math.max(1, this.groundPoundWaveSpeed);
        return Math.min(this.groundPoundWaveMaxDuration, Math.max(this.groundPoundWaveMinDuration, duration));
    }

    private getGroundWaveMaxRadius(origin: Vec3, targetEntity: Entity): number {
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const minX = controller?.movementBoundsMinX;
        const maxX = controller?.movementBoundsMaxX;
        const minZ = controller?.movementBoundsMinZ;
        const maxZ = controller?.movementBoundsMaxZ;
        const boundsFinite = Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ);

        if (!boundsFinite) {
            return Math.max(this.groundPoundRadius * 2, this.groundPoundDefaultWaveRadius);
        }

        const corners = [
            new Vec3(minX, origin.y, minZ),
            new Vec3(minX, origin.y, maxZ),
            new Vec3(maxX, origin.y, minZ),
            new Vec3(maxX, origin.y, maxZ)
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

        return Math.max(this.groundPoundRadius * 2, maxDistance + 2);
    }

    private createGroundWaveEffect(origin: Vec3, segmentCount: number): { root: Entity; segments: Entity[]; haloSegments: Entity[] } | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const waveRoot = new Entity("khan ground wave");
        const segments: Entity[] = [];
        const haloSegments: Entity[] = [];
        const count = Math.max(6, segmentCount);

        for (let i = 0; i < count; i += 1) {
            const segment = new Entity(`khan wave segment ${i}`);
            segment.addComponent("render", { type: "sphere" } as any);
            segment.setLocalScale(this.groundPoundWaveSegmentScale, this.groundPoundWaveSegmentScale, this.groundPoundWaveSegmentScale);
            if (segment.render?.meshInstances?.length) {
                segment.render.meshInstances[0].material = this.groundWaveMaterial;
            }
            waveRoot.addChild(segment);
            segments.push(segment);

            const haloSegment = new Entity(`khan wave halo ${i}`);
            haloSegment.addComponent("render", { type: "sphere" } as any);
            const haloScale = Math.max(0.35, this.groundPoundWaveSegmentScale * 0.7);
            haloSegment.setLocalScale(haloScale, haloScale, haloScale);
            if (haloSegment.render?.meshInstances?.length) {
                haloSegment.render.meshInstances[0].material = this.shockwaveMaterial;
            }
            waveRoot.addChild(haloSegment);
            haloSegments.push(haloSegment);
        }

        waveRoot.setPosition(origin.x, origin.y + 0.08, origin.z);
        sceneApp.root.addChild(waveRoot);
        this.registerEffect(waveRoot);
        return { root: waveRoot, segments, haloSegments };
    }

    // Bow attack: ranged hit that pulls the player in for a follow-up.
    private startBow(targetEntity: Entity, nowSeconds: number): void {
        this.lastAttackType = "bow";
        this.lastAttackAtSeconds = nowSeconds;
        this.attackState = "bowing";
        this.bowState = {
            releaseTimeSeconds: nowSeconds + this.bowWindupSeconds,
            target: targetEntity,
            glow: this.createBowGlow()
        };
        this.attackLockUntilSeconds = Math.max(this.attackLockUntilSeconds, this.bowState.releaseTimeSeconds + this.bowRecoverSeconds);
    }

    private updateBow(targetEntity: Entity, nowSeconds: number): void {
    	const state = this.bowState;
    	if (!state) {
    		return;
    	}

    	if (nowSeconds < state.releaseTimeSeconds) {
    		{
    			const myPos = this.getEntity().getPosition();
    			const targetPos = targetEntity.getPosition();
    			this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, 0.016);
    		}
    		return;
    	}

        this.destroyEffect(state.glow);
        this.bowState = null;
        this.attackState = "idle";
        this.nextBowAtSeconds = nowSeconds + this.bowCooldownSeconds;
        this.fireHookHitscan(state.target);
    }

    private updateMeleeWindup(
    	targetEntity: Entity,
    	nowSeconds: number,
    	onAttack?: (attacker: npc) => void
    ): void {
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = targetEntity.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, 0.016);
    	}
        if (this.pendingMeleeAtSeconds === null || nowSeconds < this.pendingMeleeAtSeconds) {
            return;
        }

        this.pendingMeleeAtSeconds = null;
        this.attackState = "idle";
        this.performMeleeArcAttack(targetEntity, this.meleeDamage, this.meleeArcDurationSeconds, 2.2, onAttack);
    }

    private fireHookHitscan(targetEntity: Entity): void {
        this.pendingPullDamage = this.bowDamage;
        this.startPullToBoss(targetEntity);
        this.scheduleMeleeFollowup();
    }

    private startPullToBoss(targetEntity: Entity): void {
        // Pull the player toward the boss while the tether effect updates each frame.
        const bossPos = this.getEntity().getPosition().clone();
        const startPos = targetEntity.getPosition().clone();
        const toBoss = bossPos.clone().sub(startPos);
        toBoss.y = 0;
        if (toBoss.lengthSq() <= 0.001) {
            return;
        }

        this.isPullingPlayer = true;

        const stopDistance = Math.max(this.bowPullStopDistance, this.getHitboxRadius() + 1.2);

        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        if (controller?.velocity) {
            controller.velocity.set(0, 0, 0);
        }

        const controllerAny = controller as any;
        if (typeof controllerAny?.setMovementLocked === "function") {
            controllerAny.setMovementLocked(true);
        } else if (controllerAny) {
            controllerAny.movementLocked = true;
        }

        const tether = this.createPullTether();

        const start = performance.now();
        let lastTime = start;
        const pullStartSeconds = Date.now() / 1000;

        const finishPull = (releaseTimeSeconds: number, cancelMelee: boolean): void => {
            this.isPullingPlayer = false;
            if (cancelMelee) {
                this.pendingMeleeAtSeconds = null;
                this.pendingPullDamage = null;
            } else if (this.pendingMeleeAtSeconds !== null) {
                this.pendingMeleeAtSeconds = Math.max(
                    this.pendingMeleeAtSeconds,
                    releaseTimeSeconds + this.pullReleaseMeleeDelaySeconds
                );
            }
            this.attackLockUntilSeconds = Math.max(
                this.attackLockUntilSeconds,
                releaseTimeSeconds + this.pullReleaseMeleeDelaySeconds
            );
            if (typeof controllerAny?.setMovementLocked === "function") {
                controllerAny.setMovementLocked(false);
            } else if (controllerAny) {
                controllerAny.movementLocked = false;
            }
            if (!cancelMelee && this.pendingPullDamage !== null) {
                const damage = this.pendingPullDamage;
                this.pendingPullDamage = null;
                const token = ++this.pullDamageToken;
                const delayMs = Math.max(0, this.pullReleaseDamageDelaySeconds * 1000);
                setTimeout(() => {
                    if (!this.isAlive() || this.pullDamageToken !== token) {
                        return;
                    }
                    try {
                        if (this.getFlatDistanceTo(targetEntity) <= this.pullReleaseDamageRange) {
                            this.applyDamage(damage);
                        }
                    } catch (e) {
                        // ignore
                    }
                }, delayMs);
            }
            if (tether) {
                this.destroyEffect(tether.root);
            }
        };

        const animate = () => {
            if (!this.isAlive()) {
                finishPull(Date.now() / 1000, true);
                return;
            }

            const now = performance.now();
            const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
            lastTime = now;
            const nowSeconds = Date.now() / 1000;

            if ((nowSeconds - pullStartSeconds) >= this.pullMaxDurationSeconds) {
                finishPull(nowSeconds, false);
                return;
            }

            const bossNow = this.getEntity().getPosition().clone();
            const currentPos = targetEntity.getPosition().clone();
            const toBossNow = bossNow.clone().sub(currentPos);
            toBossNow.y = 0;
            const distance = toBossNow.length();

            if (!Number.isFinite(distance)) {
                finishPull(nowSeconds, false);
                return;
            }

            if (distance <= stopDistance) {
                finishPull(nowSeconds, false);
                return;
            }

            if (distance > 0.001) {
                toBossNow.normalize();
            }

            const step = Math.min(distance - stopDistance, this.bowPullSpeed * dt);
            const pulled = currentPos.clone().add(toBossNow.mulScalar(step));
            const groundHeight = Number.isFinite(controllerAny?.groundHeight)
                ? controllerAny.groundHeight
                : (pulled.y - (controllerAny?.playerHeight ?? 2));
            pulled.y = groundHeight + (controllerAny?.playerHeight ?? 2);
            if (!Number.isFinite(pulled.x) || !Number.isFinite(pulled.y) || !Number.isFinite(pulled.z)) {
                finishPull(nowSeconds, false);
                return;
            }
            targetEntity.setPosition(pulled);
            if (controller?.velocity) {
                controller.velocity.set(0, 0, 0);
            }
            if (controllerAny?.basePosition) {
                controllerAny.basePosition.copy(pulled);
                controllerAny.basePositionReady = true;
            }

            if (tether) {
                const tetherStart = bossNow.clone();
                tetherStart.y += this.pullTetherStartHeight;
                const tetherEnd = pulled.clone();
                tetherEnd.y += this.pullTetherEndHeight;
                this.updatePullTether(tether.root, tether.beam, tetherStart, tetherEnd);
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    private scheduleMeleeFollowup(): void {
        // Randomize the melee follow-up so the pattern feels less robotic.
        const delay = this.meleeDelayMinSeconds
            + Math.random() * Math.max(0, this.meleeDelayMaxSeconds - this.meleeDelayMinSeconds);
        this.pendingMeleeAtSeconds = (Date.now() / 1000) + delay;
        this.attackState = "meleeWindup";
    }

    // Melee arc is a short VFX sweep that checks damage at the end.
    private performMeleeArcAttack(
        targetEntity: Entity,
        damage: number,
        durationSeconds: number,
        arcHeight: number,
        onAttack?: (attacker: npc) => void
    ): void {
        const sceneApp = this.resolveSceneApp(targetEntity);
        if (!sceneApp?.root) {
            return;
        }

        const origin = this.getEntity().getPosition().clone();
        const targetStart = targetEntity.getPosition().clone();
        const dir = targetStart.clone().sub(origin);
        const flatDist = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
        if (flatDist <= 0.001) {
            return;
        }
        dir.normalize();

        const arcEntity = new Entity("khan melee arc");
        arcEntity.setPosition(origin);

        const visual = new Entity("khan melee visual");
        visual.addComponent("render", { type: "sphere" } as any);
        visual.setLocalScale(0.65, 0.65, 0.65);
        if (visual.render?.meshInstances?.length) {
            visual.render.meshInstances[0].material = this.chargeTrailMaterial;
        }
        arcEntity.addChild(visual);
        sceneApp.root.addChild(arcEntity);
        this.registerEffect(arcEntity);

        const startTime = performance.now();
        const animate = () => {
            if (!this.isAlive() || !arcEntity.parent) {
                this.destroyEffect(arcEntity);
                return;
            }

            const elapsed = (performance.now() - startTime) / 1000;
            const t = Math.min(1, elapsed / durationSeconds);
            const horiz = new Vec3().lerp(origin, targetStart, t);
            const y = origin.y + (Math.sin(Math.PI * t) * arcHeight);
            arcEntity.setPosition(horiz.x, y, horiz.z);

            if (t >= 1) {
                this.destroyEffect(arcEntity);
                if (this.getFlatDistanceTo(targetEntity) <= this.meleeRange) {
                    this.applyDamage(damage, onAttack);
                }
                return;
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    // VFX helpers for the bow pull tether.
    private createPullTether(): { root: Entity; beam: Entity } | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const tetherRoot = new Entity("khan pull tether");
        const tetherBeam = new Entity("khan pull tether beam");
        tetherBeam.addComponent("render", { type: "cylinder" } as any);
        tetherBeam.setLocalScale(this.pullTetherRadius, 0.1, this.pullTetherRadius);
        tetherBeam.setLocalPosition(0, 0.05, 0);
        if (tetherBeam.render?.meshInstances?.length) {
            tetherBeam.render.meshInstances[0].material = this.pullTetherMaterial;
        }
        tetherRoot.addChild(tetherBeam);
        sceneApp.root.addChild(tetherRoot);
        this.registerEffect(tetherRoot);
        return { root: tetherRoot, beam: tetherBeam };
    }

    private updatePullTether(root: Entity, beam: Entity, start: Vec3, end: Vec3): void {
        const dir = end.clone().sub(start);
        const length = dir.length();
        if (length <= 0.001) {
            return;
        }

        dir.normalize();
        const now = performance.now();
        const pulse = 1 + (Math.sin(now * 0.02) * this.pullTetherPulse);
        const radius = Math.max(0.08, this.pullTetherRadius * pulse);

        beam.setLocalScale(radius, length, radius);
        beam.setLocalPosition(0, length * 0.5, 0);
        root.setPosition(start);
        const quat = this.directionToQuaternionFromUp(dir);
        root.setLocalRotation(quat.x, quat.y, quat.z, quat.w);
    }

    private getFlatDistanceTo(targetEntity: Entity): number {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        return Math.sqrt((dx * dx) + (dz * dz));
    }

    private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
        // Prefer the player-specific damage callback when available.
        if (this.onPlayerAttack) {
            this.onPlayerAttack(this, damage);
            return;
        }
        if (onAttack) {
            onAttack(this);
        }
    }

    // Resolve a PlayCanvas app reference from the boss, target, or global.
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

    // Build a rotation quaternion that aligns the up axis with a direction vector.
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
        // Shared material setup for additive boss effects.
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
        // Expanding ring used as a telegraph or shockwave.
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

    private createChargeTrail(): Entity | null {
        // Trail box follows the boss during a charge.
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const trail = new Entity("khan charge trail");
        trail.addComponent("render", { type: "box" } as any);
        trail.setLocalScale(this.chargeTrailWidth, this.chargeTrailHeight, this.chargeTrailLength);
        if (trail.render?.meshInstances?.length) {
            trail.render.meshInstances[0].material = this.chargeTrailMaterial;
        }
        sceneApp.root.addChild(trail);
        this.registerEffect(trail);
        return trail;
    }

    private updateChargeTrail(trail: Entity, direction: Vec3): void {
        const bossPos = this.getEntity().getPosition();
        const flatDir = new Vec3(direction.x, 0, direction.z);
        if (flatDir.lengthSq() <= 0.0001) {
            return;
        }

        flatDir.normalize();
        const offset = flatDir.clone().mulScalar(this.chargeTrailLength * 0.5);
        const trailPos = bossPos.clone().sub(offset);
        const yawDegrees = (Math.atan2(flatDir.x, flatDir.z) * 180 / Math.PI);
        trail.setPosition(trailPos);
        trail.setLocalEulerAngles(0, yawDegrees, 0);
        trail.setLocalScale(this.chargeTrailWidth, this.chargeTrailHeight, this.chargeTrailLength);
    }

    private createBowGlow(): Entity | null {
        // Bow glow is positioned in front of the boss while winding up.
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) {
            return null;
        }

        const glow = new Entity("khan bow glow");
        glow.addComponent("render", { type: "sphere" } as any);
        glow.setLocalScale(0.7, 0.7, 0.7);
        if (glow.render?.meshInstances?.length) {
            glow.render.meshInstances[0].material = this.bowGlowMaterial;
        }
        sceneApp.root.addChild(glow);
        this.registerEffect(glow);

        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !glow.parent || !this.activeEffects.has(glow)) {
                this.destroyEffect(glow);
                return;
            }

            const now = performance.now();
            const pulse = 0.8 + (Math.sin((now - start) / 140) * 0.2);
            const scale = Math.max(0.45, 0.7 * pulse);
            glow.setLocalScale(scale, scale, scale);

            const bossPos = this.getEntity().getPosition();
            const forward = this.getEntity().forward.clone();
            forward.y = 0;
            if (forward.lengthSq() <= 0.001) {
                forward.set(0, 0, 1);
            } else {
                forward.normalize();
            }
            const offset = forward.mulScalar(1.4);
            glow.setPosition(bossPos.x + offset.x, bossPos.y + 3.2, bossPos.z + offset.z);

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
        return glow;
    }

    private registerEffect(effect: Entity): void {
        // Track spawned effects so cleanup is reliable.
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
        // Best-effort cleanup; effects may already be destroyed.
        for (const effect of this.activeEffects) {
            try {
                effect.destroy();
            } catch (e) {
                // ignore
            }
        }
        this.activeEffects.clear();
        this.waveState = null;
    }
}