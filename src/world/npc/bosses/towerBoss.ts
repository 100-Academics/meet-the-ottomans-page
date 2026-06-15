import { Boss } from "./boss";
import { Entity, Vec3, AppBase, StandardMaterial, Color, BLEND_ADDITIVE, CULLFACE_NONE } from "playcanvas";
import type { npc } from "../npc";

type TowerAttackType = "shockwave" | "pillar" | "gaze" | "resonance" | "meteor" | "beam" | "rift";

interface ShockwaveState {
    endTimeSeconds: number;
    waveEntities: Entity[];
    ringId: number;
}

interface PillarState {
    endTimeSeconds: number;
    pillarPositions: Vec3[];
    nextPillarAtSeconds: number;
    pillarsSpawned: number;
}

interface GazeBeam {
    beamEntity: Entity;
    direction: Vec3;
    lifetimeMs: number;
    startMs: number;
}

interface GazeState {
    endTimeSeconds: number;
    sweepStart: number;
    sweepDuration: number;
    beams: GazeBeam[];
    started: boolean;
    hasHit: boolean;
}

interface ResonanceState {
    endTimeSeconds: number;
    pulseInterval: number;
    nextPulseAtSeconds: number;
    pulseRadius: number;
    pulseDurationMs: number;
}

interface MeteorImpact {
    impactPosition: Vec3;
    telegraphEntity: Entity;
    meteorEntity: Entity | null;
    resolved: boolean;
}

interface MeteorState {
    endTimeSeconds: number;
    impacts: MeteorImpact[];
    nextImpactAtSeconds: number;
    impactsSpawned: number;
}

interface BeamState {
    endTimeSeconds: number;
    sweepStart: number;
    sweepDuration: number;
    startAngle: number;
    endAngle: number;
    beamRoot: Entity | null;
    hasHit: boolean;
}

interface RiftState {
    endTimeSeconds: number;
    nextPulseAtSeconds: number;
    pulsesRemaining: number;
    pulsePositions: Vec3[];
}

/**
 * Tower boss — an ancient monolith that speaks in an unknown tongue.
 * Phase 2 of the Northwood High School fight.
 * The tower is immovable, so all its attacks are ranged or arena-wide.
 */
export class TowerBoss extends Boss {

    // ── Shockwave ──
    private readonly shockwaveDamage = 24;
    private readonly shockwaveMaxRadius = 170;
    private readonly shockwaveDurationMs = 1300;
    private readonly shockwaveRingCount = 4;
    private readonly shockwaveRingIntervalMs = 320;
    private readonly shockwaveHeight = 0.6;
    private readonly shockwaveCooldownSeconds = 5.5;
    private nextShockwaveAtSeconds = 0;

    // ── Pillar Slam ──
    private readonly pillarDamage = 30;
    private readonly pillarCount = 5;
    private readonly pillarIntervalSeconds = 0.38;
    private readonly pillarRange = 130;
    private readonly pillarHitRadius = 8;
    private readonly pillarTelegraphMs = 520;
    private readonly pillarRiseMs = 520;
    private readonly pillarCooldownSeconds = 7.5;
    private nextPillarAtSeconds = 0;

    // ── Ancient Gaze ──
    private readonly gazeDamage = 20;
    private readonly gazeRange = 170;
    private readonly gazeSweepDuration = 2.2;
    private readonly gazeHitRadius = 10.0;
    private readonly gazeCooldownSeconds = 9.0;
    private nextGazeAtSeconds = 0;

    // ── Resonance ──
    private readonly resonanceDamage = 16;
    private readonly resonanceRange = 115;
    private readonly resonancePulseInterval = 2.35;
    private readonly resonancePulseRadius = 92;
    private readonly resonancePulseDurationMs = 900;
    private readonly resonanceDurationSeconds = 8.5;
    private readonly resonanceCooldownSeconds = 13.0;
    private nextResonanceAtSeconds = 0;

    // ── Meteor Shower ──
    private readonly meteorDamage = 28;
    private readonly meteorImpactRadius = 16;
    private readonly meteorCount = 5;
    private readonly meteorDropMs = 650;
    private readonly meteorCooldownSeconds = 11.0;
    private readonly meteorRange = 160;
    private nextMeteorAtSeconds = 0;

    // ── Tower Beam Sweep ──
    private readonly beamDamage = 32;
    private readonly beamRange = 180;
    private readonly beamDurationSeconds = 2.8;
    private readonly beamCooldownSeconds = 12.0;
    private nextBeamAtSeconds = 0;

    // ── Rift Bursts ──
    private readonly riftDamage = 18;
    private readonly riftPulseRadius = 110;
    private readonly riftPulses = 3;
    private readonly riftPulseInterval = 0.65;
    private readonly riftDurationSeconds = 3.0;
    private readonly riftCooldownSeconds = 10.5;
    private nextRiftAtSeconds = 0;

    // Runtime state
    private attackLockUntilSeconds = 0;

    private shockwaveState: ShockwaveState | null = null;
    private pillarState: PillarState | null = null;
    private gazeState: GazeState | null = null;
    private resonanceState: ResonanceState | null = null;
    private meteorState: MeteorState | null = null;
    private beamState: BeamState | null = null;
    private riftState: RiftState | null = null;


    private onPlayerAttack?: (attacker: npc, damage: number) => void;
    private currentPlayerEntity: Entity | null = null;

    // Materials
    private readonly shockwaveMaterial = this.createEffectMaterial(
        new Color(0.6, 0.5, 0.4), new Color(0.8, 0.7, 0.5), 3.5, 0.7
    );
    private readonly pillarMaterial = this.createEffectMaterial(
        new Color(0.4, 0.35, 0.3), new Color(0.6, 0.5, 0.4), 3.0, 0.85
    );
    private readonly pillarTelegraphMaterial = this.createEffectMaterial(
        new Color(0.5, 0.4, 0.3), new Color(0.7, 0.6, 0.4), 4.0, 0.4
    );
    private readonly gazeMaterial = this.createEffectMaterial(
        new Color(0.5, 0.45, 0.4), new Color(0.9, 0.8, 0.6), 6.0, 0.6
    );
    private readonly resonanceRingMaterial = this.createEffectMaterial(
        new Color(0.5, 0.4, 0.35), new Color(0.7, 0.55, 0.4), 4.5, 0.5
    );
    private readonly meteorWarningMaterial = this.createEffectMaterial(
        new Color(0.8, 0.45, 0.15), new Color(1, 0.75, 0.25), 4.0, 0.55
    );
    private readonly meteorMaterial = this.createEffectMaterial(
        new Color(0.95, 0.35, 0.08), new Color(1, 0.8, 0.35), 8.0, 0.92
    );
    private readonly beamMaterial = this.createEffectMaterial(
        new Color(0.65, 0.18, 0.1), new Color(1, 0.55, 0.2), 7.5, 0.6
    );
    private readonly riftMaterial = this.createEffectMaterial(
        new Color(0.22, 0.1, 0.28), new Color(0.7, 0.35, 0.95), 5.5, 0.75
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("TowerBoss")) {
            super(id, maxHealth, entity, "Mrs. Bond-Lamberty");

            // The tower's language is unrecognised — rendered as question marks.
            // NOTE: Intro taunt disabled to prevent health bar disappearance during battle.
           // The tower's language is unrecognised — rendered as question marks.
        this.setIntroTaunt("??????????", "You are a fool for coming here.");
        this.setIntroNameTranslation("??????????", "Mrs. Bond-Lamberty");

        this.setTauntSet({
            highHealth: [
                "I have seen your faults. I know you will fail.",
                "Back down now and you may pass the class",
                "You are not ready for this DBQ."
            ],
            bossLowPlayerHigh: [
                "You surprise me.",
                "I did not expect this, your knowledge is impressive."
            ],
            playerLowBossHigh: [
                "It is clear you have not studied enough.",
                "I was right about you. You will fall."
            ],
            bothLow: [
                "A battle of wits that neither may survive."
            ],
            death: [
                "You get an E."
            ],
            bossDeath: [
                "You have defeated me. You will recieve an A."
            ]
        });

        // The tower is immovable — it only watches.
        this.aiConfig.chaseMoveSpeed = 0;
        this.aiConfig.idleMoveSpeed = 0;
    }

    public override updateCombatAI(
        deltaTime: number,
        currentTimeSeconds: number,
        allNpcs: npc[],
        onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
        playerEntity?: Entity | null,
        onPlayerAttack?: (attacker: npc, damage: number) => void
    ): void {
        this.currentPlayerEntity = playerEntity ?? null;
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
        if (!this.isAlive()) return;
        const dt = Math.max(0, Math.min(deltaTime, 0.05));
        const faceEntity = targetEntity ?? this.currentPlayerEntity;

        // Update active attack states
        if (this.shockwaveState) { this.updateShockwave(targetEntity, currentTimeSeconds); }
        if (this.pillarState) { this.updatePillar(targetEntity, currentTimeSeconds, onAttack); }
        if (this.gazeState) { this.updateGaze(targetEntity, currentTimeSeconds, onAttack); }
        if (this.resonanceState) { this.updateResonance(targetEntity, currentTimeSeconds, onAttack); }
        if (this.meteorState) { this.updateMeteorShower(targetEntity, currentTimeSeconds, onAttack); }
        if (this.beamState) { this.updateBeamSweep(targetEntity, currentTimeSeconds, onAttack); }
        if (this.riftState) { this.updateRiftBursts(targetEntity, currentTimeSeconds, onAttack); }

        // If any state is still active, don't start a new one yet
        if (this.shockwaveState || this.pillarState || this.gazeState || this.resonanceState || this.meteorState || this.beamState || this.riftState) {
            this.faceTarget(faceEntity, dt);
            return;
        }

        if (!targetEntity) {
            super.updateAI(dt, targetEntity, currentTimeSeconds, onAttack, profileOverride);
            this.faceTarget(faceEntity, dt);
            return;
        }

        if (currentTimeSeconds < this.attackLockUntilSeconds) {
            this.faceTarget(faceEntity, dt);
            return;
        }

        const chosen = this.pickNextAttack(targetEntity, currentTimeSeconds);
        if (!chosen) {
            this.faceTarget(faceEntity, dt);
            return;
        }

        if (chosen === "shockwave") { this.startShockwave(targetEntity, currentTimeSeconds); return; }
        if (chosen === "pillar") { this.startPillar(targetEntity, currentTimeSeconds); return; }
        if (chosen === "gaze") { this.startGaze(targetEntity, currentTimeSeconds); return; }
        if (chosen === "resonance") { this.startResonance(currentTimeSeconds); return; }
        if (chosen === "meteor") { this.startMeteorShower(targetEntity, currentTimeSeconds); return; }
        if (chosen === "beam") { this.startBeamSweep(targetEntity, currentTimeSeconds); return; }
        if (chosen === "rift") { this.startRiftBursts(targetEntity, currentTimeSeconds); return; }
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
            attackDamage: this.beamDamage,
            attackRange: 200,
            attackCooldown: 3.2,
            detectionRange: Number.MAX_VALUE
        };
    }

    private pickNextAttack(targetEntity: Entity | null, now: number): TowerAttackType | null {
        const distance = this.computeFlatDistance(targetEntity);
        const builtinOptions: TowerAttackType[] = [];

        if (now >= this.nextShockwaveAtSeconds) {
            builtinOptions.push("shockwave");
        }
        if (now >= this.nextPillarAtSeconds && distance <= this.pillarRange) {
            builtinOptions.push("pillar");
        }
        if (now >= this.nextGazeAtSeconds && distance <= this.gazeRange) {
            builtinOptions.push("gaze");
        }
        if (now >= this.nextResonanceAtSeconds && distance <= this.resonanceRange) {
            builtinOptions.push("resonance");
        }
        if (now >= this.nextMeteorAtSeconds && distance <= this.meteorRange) {
            builtinOptions.push("meteor");
        }
        if (now >= this.nextBeamAtSeconds && distance <= this.beamRange) {
            builtinOptions.push("beam");
        }
        if (now >= this.nextRiftAtSeconds && distance <= this.riftPulseRadius) {
            builtinOptions.push("rift");
        }

        if (builtinOptions.length === 0) return null;
        const weightedOptions = builtinOptions.map((attack) => {
            if (attack === "meteor") return { attack, weight: 1.35 };
            if (attack === "beam") return { attack, weight: 1.15 };
            if (attack === "rift") return { attack, weight: 1.1 };
            if (attack === "shockwave") return { attack, weight: 1.2 };
            if (attack === "pillar") return { attack, weight: 1.4 };
            if (attack === "gaze") return { attack, weight: 1.25 };
            return { attack, weight: 1.0 };
        });
        const totalWeight = weightedOptions.reduce((sum, option) => sum + option.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const option of weightedOptions) {
            roll -= option.weight;
            if (roll <= 0) return option.attack;
        }
        return weightedOptions[0].attack;
    }



    // ── Shockwave ──

    private startShockwave(_targetEntity: Entity | null, now: number): void {
        this.shockwaveState = {
            endTimeSeconds: now + (this.shockwaveRingCount * this.shockwaveRingIntervalMs / 1000),
            waveEntities: [],
            ringId: 0
        };
        this.attackLockUntilSeconds = this.shockwaveState.endTimeSeconds;

        // Spawn ring waves at intervals
        for (let i = 0; i < this.shockwaveRingCount; i++) {
            const delayMs = i * this.shockwaveRingIntervalMs;
            const ringId = i;
            window.setTimeout(() => {
                if (!this.shockwaveState || !this.isAlive()) return;
                this.spawnShockwaveRing(ringId);
            }, delayMs);
        }
    }

    private spawnShockwaveRing(ringId: number): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;

        const myPos = this.getEntity().getPosition();
        const ringRoot = new Entity(`tower-shockwave-${ringId}`);
        const ring = new Entity(`${ringId}-mesh`);
        ring.addComponent("render", { type: "cylinder" } as any);
        ring.setLocalScale(0.1, this.shockwaveHeight, 0.1);
        if (ring.render?.meshInstances?.length) {
            ring.render.meshInstances[0].material = this.shockwaveMaterial;
        }
        ringRoot.addChild(ring);
        ringRoot.setPosition(myPos.x, myPos.y + 0.1, myPos.z);
        sceneApp.root.addChild(ringRoot);
        this.activeEffects.add(ringRoot);

        if (this.shockwaveState) {
            this.shockwaveState.waveEntities.push(ringRoot);
        }

        const startMs = performance.now();
        const animate = () => {
            if (!this.isAlive() || !ringRoot.parent) {
                this.destroyEffect(ringRoot);
                return;
            }
            const elapsed = performance.now() - startMs;
            const t = Math.min(1, elapsed / this.shockwaveDurationMs);
            const radius = 0.2 + (this.shockwaveMaxRadius - 0.2) * t;
            ring.setLocalScale(radius, this.shockwaveHeight, radius);

            // Fade out near the end
            if (ring.render?.meshInstances?.length) {
                const mat = ring.render.meshInstances[0].material as StandardMaterial | undefined;
                if (mat && t > 0.6) {
                    mat.opacity *= 0.92;
                    mat.update();
                }
            }

            if (t >= 1 || elapsed > this.shockwaveDurationMs + 200) {
                this.destroyEffect(ringRoot);
                return;
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);

        // Determine if player is hit — check if in range
        // Damage is applied once per shockwave wave
        const hitRadius = this.shockwaveMaxRadius;
        const myPosVec = this.getEntity().getPosition();
        const playerEntity = this.findPlayerEntity();
        if (playerEntity) {
            const playerPos = playerEntity.getPosition();
            const dx = playerPos.x - myPosVec.x;
            const dz = playerPos.z - myPosVec.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance <= this.getScaledRadius(hitRadius)) {
                // Apply damage during the ring's expansion
                window.setTimeout(() => {
                    if (this.isAlive()) {
                        this.applyDamage(this.getScaledDamage(this.shockwaveDamage));
                    }
                }, 400);
            }
        }
    }

    private updateShockwave(_target: Entity | null, now: number): void {
        const state = this.shockwaveState;
        if (!state) return;
        if (now >= state.endTimeSeconds) {
            // Clean up any remaining wave entities
            for (const e of state.waveEntities) {
                this.destroyEffect(e);
            }
            this.shockwaveState = null;
            this.nextShockwaveAtSeconds = now + this.getScaledCooldown(this.shockwaveCooldownSeconds);
        }
    }

    // ── Pillar Slam ──

    private startPillar(targetEntity: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        const dirLen = dir.length();
        if (dirLen <= 0.0001) return;
        dir.normalize();

        // Place pillars in an arc near the player
        const pillarPositions: Vec3[] = [];
        for (let i = 0; i < this.pillarCount; i++) {
            const angleOffset = ((i - (this.pillarCount - 1) / 2) * 0.3);
            const cosA = Math.cos(angleOffset);
            const sinA = Math.sin(angleOffset);
            const strikeDir = new Vec3(
                dir.x * cosA - dir.z * sinA,
                0,
                dir.x * sinA + dir.z * cosA
            ).normalize();

            const dist = 5 + i * 3;
            const pos = new Vec3(
                myPos.x + strikeDir.x * dist,
                myPos.y,
                myPos.z + strikeDir.z * dist
            );
            pillarPositions.push(pos);
        }

        this.pillarState = {
            endTimeSeconds: now + this.pillarCount * this.pillarIntervalSeconds + this.pillarRiseMs / 1000 + 1.0,
            pillarPositions,
            nextPillarAtSeconds: now,
            pillarsSpawned: 0
        };
        this.attackLockUntilSeconds = now + (this.pillarCount * this.pillarIntervalSeconds) + 0.5;
    }

    private updatePillar(targetEntity: Entity | null, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.pillarState;
        if (!state) return;

        if (state.pillarsSpawned < this.pillarCount && now >= state.nextPillarAtSeconds) {
            const pos = state.pillarPositions[state.pillarsSpawned];
            state.pillarsSpawned++;
            state.nextPillarAtSeconds = now + this.pillarIntervalSeconds;

            // Telegraph ring
            const sceneApp = this.resolveSceneApp();
            if (sceneApp?.root) {
                const telegraph = new Entity("tower-pillar-telegraph");
                telegraph.addComponent("render", { type: "cylinder" } as any);
                telegraph.setLocalScale(4, 0.1, 4);
                if (telegraph.render?.meshInstances?.length) {
                    telegraph.render.meshInstances[0].material = this.pillarTelegraphMaterial;
                }
                telegraph.setPosition(pos.x, pos.y + 0.02, pos.z);
                sceneApp.root.addChild(telegraph);
                this.activeEffects.add(telegraph);

                // Telegraph pulse animation
                const startMs = Date.now();
                const pulseTick = () => {
                    if (!telegraph.parent) return;
                    const elapsed = Date.now() - startMs;
                    if (elapsed >= this.pillarTelegraphMs) {
                        this.destroyEffect(telegraph);
                        return;
                    }
                    const pulse = 1 + 0.3 * Math.sin(elapsed * 0.02);
                    telegraph.setLocalScale(4 * pulse, 0.1, 4 * pulse);
                    if (telegraph.render?.meshInstances?.length) {
                        const mat = telegraph.render.meshInstances[0].material as StandardMaterial | undefined;
                        if (mat) {
                            mat.opacity = 0.4 + 0.3 * Math.sin(elapsed * 0.015);
                            mat.update();
                        }
                    }
                    requestAnimationFrame(pulseTick);
                };
                requestAnimationFrame(pulseTick);
            }

            // Pillar rises after telegraph
            window.setTimeout(() => {
                if (!this.isAlive()) return;
                const pillar = new Entity("tower-pillar");
                pillar.addComponent("render", { type: "box" } as any);
                pillar.setLocalScale(1.5, 0.1, 1.5);
                if (pillar.render?.meshInstances?.length) {
                    pillar.render.meshInstances[0].material = this.pillarMaterial;
                }
                pillar.setPosition(pos.x, pos.y, pos.z);
                if (sceneApp?.root) {
                    sceneApp.root.addChild(pillar);
                    this.activeEffects.add(pillar);
                }

                const riseStart = Date.now();
                const riseTick = () => {
                    if (!this.isAlive() || !pillar.parent) {
                        this.destroyEffect(pillar);
                        return;
                    }
                    const elapsed = Date.now() - riseStart;
                    if (elapsed >= this.pillarRiseMs) {
                        pillar.setLocalScale(1.5, 8, 1.5);
                        return;
                    }
                    const t = elapsed / this.pillarRiseMs;
                    const height = 8 * t;
                    pillar.setLocalScale(1.5, height, 1.5);
                    requestAnimationFrame(riseTick);
                };
                requestAnimationFrame(riseTick);

                // Check hit against player
                if (targetEntity) {
                    const targetPos = targetEntity.getPosition();
                    const dx = targetPos.x - pos.x;
                    const dz = targetPos.z - pos.z;
                    if (Math.sqrt(dx * dx + dz * dz) <= this.getScaledRadius(this.pillarHitRadius)) {
                        this.applyDamage(this.getScaledDamage(this.pillarDamage), onAttack);
                    }
                }
            }, this.pillarTelegraphMs);
        }

        if (now >= state.endTimeSeconds) {
            this.pillarState = null;
            this.nextPillarAtSeconds = now + this.getScaledCooldown(this.pillarCooldownSeconds);
        }
    }

    // ── Ancient Gaze ──

    private startGaze(_target: Entity, now: number): void {
        this.gazeState = {
            endTimeSeconds: now + this.gazeSweepDuration + 1.0,
            sweepStart: now + 0.3,
            sweepDuration: this.gazeSweepDuration,
            beams: [],
            started: false,
            hasHit: false
        };
        this.attackLockUntilSeconds = this.gazeState.endTimeSeconds;
    }

    private updateGaze(targetEntity: Entity | null, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.gazeState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();
        const sceneApp = this.resolveSceneApp();

        // Start gaze beam
        if (!state.started && now >= state.sweepStart) {
            state.started = true;

            // Spawn a sweeping beam entity
            const beamRoot = new Entity("tower-gaze-beam");
            const beam = new Entity("tower-gaze-beam-mesh");
            beam.addComponent("render", { type: "box" } as any);
            beam.setLocalScale(1, 1, 1);
            if (beam.render?.meshInstances?.length) {
                beam.render.meshInstances[0].material = this.gazeMaterial;
            }
            beamRoot.addChild(beam);
            if (sceneApp?.root) {
                beamRoot.setPosition(myPos.x, myPos.y + 5, myPos.z);
                sceneApp.root.addChild(beamRoot);
                this.activeEffects.add(beamRoot);
            }

            // Animate the beam sweeping
            const sweepStartMs = Date.now();
            const sweepDurationMs = this.gazeSweepDuration * 1000;
            const hitPlayer = { hasHit: false };

            const animateBeam = () => {
                if (!this.isAlive() || !beamRoot.parent) {
                    this.destroyEffect(beamRoot);
                    return;
                }
                const elapsed = Date.now() - sweepStartMs;
                const t = Math.min(1, elapsed / sweepDurationMs);

                // Sweep angle based on time
                const angle = -Math.PI / 4 + t * (Math.PI / 2);
                const beamDir = new Vec3(Math.sin(angle), 0, Math.cos(angle));
                const beamEnd = new Vec3(
                    myPos.x + beamDir.x * this.gazeRange,
                    myPos.y,
                    myPos.z + beamDir.z * this.gazeRange
                );

                // Update beam visual — a long thin box between tower and end point
                const midX = (myPos.x + beamEnd.x) / 2;
                const midZ = (myPos.z + beamEnd.z) / 2;
                const length = myPos.distance(beamEnd);
                beamRoot.setPosition(midX, myPos.y + 2, midZ);
                beamRoot.setLocalScale(this.gazeHitRadius, 3, length);
                beamRoot.lookAt(beamEnd.x, myPos.y + 2, beamEnd.z);

                // Check if player is hit by the sweeping beam
                if (targetEntity && !hitPlayer.hasHit) {
                    const playerPos = targetEntity.getPosition();
                    const dx = playerPos.x - myPos.x;
                    const dz = playerPos.z - myPos.z;
                    const playerDist = Math.sqrt(dx * dx + dz * dz);
                    if (playerDist <= this.gazeRange && playerDist > 1) {
                        const playerAngle = Math.atan2(dx, dz);
                        // Normalize angle to same range as beam sweep
                        let beamAngle = Math.atan2(beamDir.x, beamDir.z);
                        const angleDiff = Math.abs(playerAngle - beamAngle);
                        // Wrap around
                        const wrapped = Math.min(angleDiff, Math.abs(angleDiff - 2 * Math.PI));
                        if (wrapped < 0.2 && !hitPlayer.hasHit) {
                            hitPlayer.hasHit = true;
                            this.applyDamage(this.getScaledDamage(this.gazeDamage), onAttack);
                        }
                    }
                }

                if (t >= 1 || elapsed > sweepDurationMs + 500) {
                    this.destroyEffect(beamRoot);
                    return;
                }
                requestAnimationFrame(animateBeam);
            };
            requestAnimationFrame(animateBeam);
        }

        if (now >= state.endTimeSeconds) {
            this.gazeState = null;
            this.nextGazeAtSeconds = now + this.getScaledCooldown(this.gazeCooldownSeconds);
        }
    }

    // ── Resonance ──

    private startResonance(now: number): void {
        this.resonanceState = {
            endTimeSeconds: now + this.resonanceDurationSeconds,
            pulseInterval: this.resonancePulseInterval,
            nextPulseAtSeconds: now,
            pulseRadius: this.resonancePulseRadius,
            pulseDurationMs: this.resonancePulseDurationMs
        };
        this.attackLockUntilSeconds = this.resonanceState.endTimeSeconds;
    }

    private updateResonance(targetEntity: Entity | null, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.resonanceState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();

        if (now >= state.nextPulseAtSeconds) {
            state.nextPulseAtSeconds = now + state.pulseInterval;

            const sceneApp = this.resolveSceneApp();
            if (sceneApp?.root) {
                const ringRoot = new Entity("tower-resonance-ring");
                const ring = new Entity(`${Date.now()}-mesh`);
                ring.addComponent("render", { type: "cylinder" } as any);
                ring.setLocalScale(0.1, 0.3, 0.1);

                if (ring.render?.meshInstances?.length) {
                    ring.render.meshInstances[0].material = this.resonanceRingMaterial;
                }

                ringRoot.addChild(ring);
                ringRoot.setPosition(myPos.x, myPos.y + 0.05, myPos.z);
                sceneApp.root.addChild(ringRoot);
                this.activeEffects.add(ringRoot);

                const startMs = performance.now();
                const animateRing = () => {
                    if (!this.isAlive() || !ringRoot.parent) {
                        this.destroyEffect(ringRoot);
                        return;
                    }

                    const elapsed = performance.now() - startMs;
                    const t = Math.min(1, elapsed / state.pulseDurationMs);
                    const radius = 0.5 + (state.pulseRadius - 0.5) * t;
                    ring.setLocalScale(radius, 0.3, radius);

                    if (ring.render?.meshInstances?.length) {
                        const mat = ring.render.meshInstances[0].material as StandardMaterial | undefined;
                        if (mat) {
                            mat.opacity = 0.6 * (1 - t * 0.8);
                            mat.update();
                        }
                    }

                    if (t >= 1) {
                        this.destroyEffect(ringRoot);
                        return;
                    }

                    requestAnimationFrame(animateRing);
                };
                requestAnimationFrame(animateRing);
            }

            if (targetEntity) {
                const targetPos = targetEntity.getPosition();
                const dx = targetPos.x - myPos.x;
                const dz = targetPos.z - myPos.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance <= state.pulseRadius) {
                    this.applyDamage(this.getScaledDamage(this.resonanceDamage), onAttack);
                }
            }
        }

        if (now >= state.endTimeSeconds) {
            this.resonanceState = null;
            this.nextResonanceAtSeconds = now + this.getScaledCooldown(this.resonanceCooldownSeconds);
        }
    }

    // ── Meteor Shower ──

    private startMeteorShower(targetEntity: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const impacts: MeteorImpact[] = [];
        const sceneApp = this.resolveSceneApp();

        for (let index = 0; index < this.meteorCount; index += 1) {
            const angle = (index / Math.max(1, this.meteorCount)) * Math.PI * 2;
            const radius = 10 + (index % 2) * 18;
            const impactPosition = new Vec3(
                targetPos.x + Math.cos(angle) * radius,
                myPos.y,
                targetPos.z + Math.sin(angle) * radius
            );

            const telegraphEntity = new Entity(`tower-meteor-warning-${index}`);
            telegraphEntity.addComponent("render", { type: "cylinder" } as any);
            telegraphEntity.setLocalScale(0.2, 0.2, 0.2);
            if (telegraphEntity.render?.meshInstances?.length) {
                telegraphEntity.render.meshInstances[0].material = this.meteorWarningMaterial;
            }
            telegraphEntity.setPosition(impactPosition.x, impactPosition.y + 0.2, impactPosition.z);
            if (sceneApp?.root) {
                sceneApp.root.addChild(telegraphEntity);
            }
            this.activeEffects.add(telegraphEntity);

            impacts.push({
                impactPosition,
                telegraphEntity,
                meteorEntity: null,
                resolved: false,
            });
        }

        this.meteorState = {
            endTimeSeconds: now + ((this.meteorCount * this.meteorDropMs) / 1000) + 1.5,
            impacts,
            nextImpactAtSeconds: now + 0.15,
            impactsSpawned: 0,
        };
        this.attackLockUntilSeconds = this.meteorState.endTimeSeconds;
    }

    private updateMeteorShower(targetEntity: Entity | null, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.meteorState;
        if (!state) return;

        const sceneApp = this.resolveSceneApp();
        if (state.impactsSpawned < state.impacts.length && now >= state.nextImpactAtSeconds) {
            const impact = state.impacts[state.impactsSpawned];
            state.impactsSpawned += 1;
            state.nextImpactAtSeconds = now + (this.meteorDropMs / 1000);

            window.setTimeout(() => {
                if (!this.isAlive() || impact.resolved) return;
                this.resolveMeteorImpact(impact, targetEntity, onAttack);

                if (sceneApp?.root) {
                    const meteor = new Entity(`tower-meteor-${Date.now()}`);
                    meteor.addComponent("render", { type: "sphere" } as any);
                    meteor.setLocalScale(0.9, 0.9, 0.9);
                    if (meteor.render?.meshInstances?.length) {
                        meteor.render.meshInstances[0].material = this.meteorMaterial;
                    }
                    meteor.setPosition(impact.impactPosition.x, impact.impactPosition.y + 28, impact.impactPosition.z);
                    sceneApp.root.addChild(meteor);
                    this.activeEffects.add(meteor);

                    const dropStart = performance.now();
                    const dropTick = () => {
                        if (!this.isAlive() || !meteor.parent) {
                            this.destroyEffect(meteor);
                            return;
                        }

                        const elapsed = performance.now() - dropStart;
                        const t = Math.min(1, elapsed / this.meteorDropMs);
                        meteor.setPosition(
                            impact.impactPosition.x,
                            impact.impactPosition.y + 28 - (28 * t),
                            impact.impactPosition.z
                        );

                        if (meteor.render?.meshInstances?.length) {
                            const mat = meteor.render.meshInstances[0].material as StandardMaterial | undefined;
                            if (mat) {
                                mat.opacity = 0.95 - (t * 0.25);
                                mat.update();
                            }
                        }

                        if (t >= 1) {
                            this.destroyEffect(meteor);
                            return;
                        }
                        requestAnimationFrame(dropTick);
                    };
                    requestAnimationFrame(dropTick);
                }
            }, 60);
        }

        if (now >= state.endTimeSeconds) {
            for (const impact of state.impacts) {
                this.destroyEffect(impact.telegraphEntity);
                if (impact.meteorEntity) {
                    this.destroyEffect(impact.meteorEntity);
                }
            }
            this.meteorState = null;
            this.nextMeteorAtSeconds = now + this.meteorCooldownSeconds;
        }
    }

    private resolveMeteorImpact(impact: MeteorImpact, targetEntity: Entity | null, onAttack?: (attacker: npc) => void): void {
        if (impact.resolved) return;
        impact.resolved = true;
        this.destroyEffect(impact.telegraphEntity);

        const sceneApp = this.resolveSceneApp();
        if (sceneApp?.root) {
            const impactRing = new Entity(`tower-meteor-impact-${Date.now()}`);
            impactRing.addComponent("render", { type: "cylinder" } as any);
            impactRing.setLocalScale(0.2, 0.18, 0.2);
            if (impactRing.render?.meshInstances?.length) {
                impactRing.render.meshInstances[0].material = this.meteorMaterial;
            }
            impactRing.setPosition(impact.impactPosition.x, impact.impactPosition.y + 0.05, impact.impactPosition.z);
            sceneApp.root.addChild(impactRing);
            this.activeEffects.add(impactRing);

            const startMs = performance.now();
            const pulse = () => {
                if (!this.isAlive() || !impactRing.parent) {
                    this.destroyEffect(impactRing);
                    return;
                }
                const elapsed = performance.now() - startMs;
                const t = Math.min(1, elapsed / 700);
                const radius = 0.2 + (this.meteorImpactRadius * 1.4) * t;
                impactRing.setLocalScale(radius, 0.18, radius);
                if (impactRing.render?.meshInstances?.length) {
                    const mat = impactRing.render.meshInstances[0].material as StandardMaterial | undefined;
                    if (mat) {
                        mat.opacity = 0.55 * (1 - t);
                        mat.update();
                    }
                }
                if (t >= 1) {
                    this.destroyEffect(impactRing);
                    return;
                }
                requestAnimationFrame(pulse);
            };
            requestAnimationFrame(pulse);
        }

        if (targetEntity) {
            const playerPos = targetEntity.getPosition();
            const dx = playerPos.x - impact.impactPosition.x;
            const dz = playerPos.z - impact.impactPosition.z;
            if (Math.sqrt(dx * dx + dz * dz) <= this.meteorImpactRadius) {
                this.applyDamage(this.getScaledDamage(this.meteorDamage), onAttack);
            }
        }
    }

    // ── Beam Sweep ──
    private startBeamSweep(targetEntity: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const beamRoot = new Entity("tower-beam-sweep");
        const beam = new Entity("tower-beam-sweep-mesh");
        beam.addComponent("render", { type: "box" } as any);
        beam.setLocalScale(2, 2, 2);
        if (beam.render?.meshInstances?.length) {
            beam.render.meshInstances[0].material = this.beamMaterial;
        }
        beamRoot.addChild(beam);
        beamRoot.setPosition(myPos.x, myPos.y + 3, myPos.z);

        const sceneApp = this.resolveSceneApp();
        if (sceneApp?.root) {
            sceneApp.root.addChild(beamRoot);
            this.activeEffects.add(beamRoot);
        }

        this.beamState = {
            endTimeSeconds: now + this.beamDurationSeconds + 0.5,
            sweepStart: now + 0.2,
            sweepDuration: this.beamDurationSeconds,
            startAngle: -Math.PI / 2.2,
            endAngle: Math.PI / 2.2,
            beamRoot,
            hasHit: false,
        };
        this.attackLockUntilSeconds = this.beamState.endTimeSeconds;
        beamRoot.lookAt(targetEntity.getPosition().x, myPos.y + 3, targetEntity.getPosition().z);
    }

    private updateBeamSweep(targetEntity: Entity | null, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.beamState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();
        const beamRoot = state.beamRoot;
        if (beamRoot && beamRoot.parent) {
            const elapsed = Math.max(0, now - state.sweepStart);
            const t = Math.min(1, elapsed / state.sweepDuration);
            const angle = state.startAngle + ((state.endAngle - state.startAngle) * t);
            const dir = new Vec3(Math.sin(angle), 0, Math.cos(angle));
            const endPoint = new Vec3(
                myPos.x + dir.x * this.beamRange,
                myPos.y,
                myPos.z + dir.z * this.beamRange
            );

            beamRoot.setPosition(myPos.x, myPos.y + 3, myPos.z);
            beamRoot.lookAt(endPoint.x, myPos.y + 3, endPoint.z);
            beamRoot.setLocalScale(this.beamRange, 2.5, 4.5);

            const beamMesh = beamRoot.children[0] as Entity | undefined;
            if (beamMesh?.render?.meshInstances?.length) {
                const mat = beamMesh.render.meshInstances[0].material as StandardMaterial | undefined;
                if (mat) {
                    mat.opacity = 0.55 + (0.2 * Math.sin(now * 8));
                    mat.update();
                }
            }

            if (targetEntity && !state.hasHit) {
                const playerPos = targetEntity.getPosition();
                const dx = playerPos.x - myPos.x;
                const dz = playerPos.z - myPos.z;
                const playerDistance = Math.sqrt(dx * dx + dz * dz);
                if (playerDistance <= this.beamRange) {
                    const angleToPlayer = Math.atan2(dx, dz);
                    const wrapped = Math.min(Math.abs(angleToPlayer - angle), Math.abs(angleToPlayer - angle + Math.PI * 2));
                    if (wrapped < 0.18) {
                        state.hasHit = true;
                        this.applyDamage(this.getScaledDamage(this.beamDamage), onAttack);
                    }
                }
            }
        }

        if (now >= state.endTimeSeconds) {
            if (beamRoot) {
                this.destroyEffect(beamRoot);
            }
            this.beamState = null;
            this.nextBeamAtSeconds = now + this.getScaledCooldown(this.beamCooldownSeconds);
        }
    }

    // ── Rift Bursts ──

    private startRiftBursts(targetEntity: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const pulsePositions: Vec3[] = [];

        for (let index = 0; index < this.riftPulses; index += 1) {
            const angle = (Math.PI * 2 * index) / this.riftPulses;
            pulsePositions.push(new Vec3(
                targetPos.x + Math.cos(angle) * (12 + index * 8),
                myPos.y,
                targetPos.z + Math.sin(angle) * (12 + index * 8)
            ));
        }

        this.riftState = {
            endTimeSeconds: now + this.riftDurationSeconds,
            nextPulseAtSeconds: now,
            pulsesRemaining: this.riftPulses,
            pulsePositions,
        };
        this.attackLockUntilSeconds = now + this.riftDurationSeconds;
    }

    private updateRiftBursts(targetEntity: Entity | null, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.riftState;
        if (!state) return;

        const sceneApp = this.resolveSceneApp();
        if (state.pulsesRemaining > 0 && now >= state.nextPulseAtSeconds) {
            state.pulsesRemaining -= 1;
            state.nextPulseAtSeconds = now + this.riftPulseInterval;

            const burstIndex = this.riftPulses - state.pulsesRemaining - 1;
            const burstPos = state.pulsePositions[Math.min(burstIndex, state.pulsePositions.length - 1)];

            if (sceneApp?.root) {
                const riftRoot = new Entity(`tower-rift-${Date.now()}`);
                const riftRing = new Entity("tower-rift-ring");
                riftRing.addComponent("render", { type: "cylinder" } as any);
                riftRing.setLocalScale(0.1, 0.2, 0.1);
                if (riftRing.render?.meshInstances?.length) {
                    riftRing.render.meshInstances[0].material = this.riftMaterial;
                }
                riftRoot.addChild(riftRing);
                riftRoot.setPosition(burstPos.x, burstPos.y + 0.05, burstPos.z);
                sceneApp.root.addChild(riftRoot);
                this.activeEffects.add(riftRoot);

                const startMs = performance.now();
                const animate = () => {
                    if (!this.isAlive() || !riftRoot.parent) {
                        this.destroyEffect(riftRoot);
                        return;
                    }
                    const elapsed = performance.now() - startMs;
                    const t = Math.min(1, elapsed / 900);
                    const radius = 0.2 + (this.riftPulseRadius - 0.2) * t;
                    riftRing.setLocalScale(radius, 0.2, radius);
                    if (riftRing.render?.meshInstances?.length) {
                        const mat = riftRing.render.meshInstances[0].material as StandardMaterial | undefined;
                        if (mat) {
                            mat.opacity = 0.7 * (1 - t * 0.8);
                            mat.update();
                        }
                    }
                    if (t >= 1) {
                        this.destroyEffect(riftRoot);
                        return;
                    }
                    requestAnimationFrame(animate);
                };
                requestAnimationFrame(animate);
            }

            if (targetEntity) {
                const playerPos = targetEntity.getPosition();
                const dx = playerPos.x - burstPos.x;
                const dz = playerPos.z - burstPos.z;
                if (Math.sqrt(dx * dx + dz * dz) <= this.riftPulseRadius) {
                    this.applyDamage(this.getScaledDamage(this.riftDamage), onAttack);
                }
            }
        }

        if (now >= state.endTimeSeconds) {
            this.riftState = null;
            this.nextRiftAtSeconds = now + this.getScaledCooldown(this.riftCooldownSeconds);
        }
    }

    // ── Helpers (patterned after King Geser etc.) ──

    protected applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
        if (this.onPlayerAttack) {
            this.onPlayerAttack(this, damage);
            return;
        }
        if (onAttack) {
            onAttack(this);
        }
    }

    private findPlayerEntity(_target?: Entity | null): Entity | null {
        return this.currentPlayerEntity;
    }

    private getHealthRatio(): number {
        const maxHealth = this.getMaxHealth();
        if (maxHealth <= 0) {
            return 1;
        }
        return Math.max(0, Math.min(1, this.getHealth() / maxHealth));
    }

    private getThreatScale(): number {
        return 1 + ((1 - this.getHealthRatio()) * 0.9);
    }

    private getScaledDamage(baseDamage: number): number {
        return Math.max(1, Math.round(baseDamage * this.getThreatScale()));
    }

    private getScaledRadius(baseRadius: number): number {
        return baseRadius * (1 + ((this.getThreatScale() - 1) * 0.45));
    }

    private getScaledCooldown(baseCooldown: number): number {
        return Math.max(0.55, baseCooldown / this.getThreatScale());
    }

    protected computeFlatDistance(targetEntity: Entity | null): number {
        if (!targetEntity) return Infinity;
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    protected faceTarget(targetEntity: Entity | null, dt: number): void {
        if (!targetEntity) return;
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        if (Math.sqrt(dx * dx + dz * dz) <= 0.1) return;
        const yaw = (Math.atan2(dx, dz) * 180 / Math.PI) + 180;
        const current = this.getEntity().getLocalEulerAngles();
        // Smooth rotate
        const smoothYaw = this.lerpAngle(current.y, yaw, Math.min(1, dt * 2.5));
        this.getEntity().setLocalEulerAngles(current.x, smoothYaw, current.z);
    }

    private lerpAngle(from: number, to: number, t: number): number {
        let diff = to - from;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return from + diff * t;
    }

    protected createEffectMaterial(
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

    protected resolveSceneApp(): AppBase | undefined {
        const selfEntity = this.getEntity() as any;
        const selfApp = (selfEntity?.app ?? selfEntity?._app) as AppBase | undefined;
        if (selfApp?.root) return selfApp;
        const globalApp = (globalThis as any)?.app as AppBase | undefined;
        if (globalApp?.root) return globalApp;
        return undefined;
    }

    protected destroyEffect(effect?: Entity | null): void {
        if (!effect) return;
        this.activeEffects.delete(effect);
        try {
            effect.destroy();
        } catch (e) {
            // ignore
        }
    }

    protected cleanupEffects(): void {
        for (const effect of this.activeEffects) {
            try {
                effect.destroy();
            } catch (e) {
                // ignore
            }
        }
        this.activeEffects.clear();
        this.shockwaveState = null;
        this.pillarState = null;
        this.gazeState = null;
        this.resonanceState = null;
        this.meteorState = null;
        this.beamState = null;
        this.riftState = null;
    }
}