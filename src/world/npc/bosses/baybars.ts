import { AppBase, BLEND_ADDITIVE, Color, CULLFACE_NONE, Entity, StandardMaterial, Vec3 } from "playcanvas";
import { Boss } from "./boss";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type BaybarsAttackType = "dash" | "arrows" | "dustStorm" | "groundSpikes";

interface DashState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    trail?: Entity | null;
    lastSpikePosition: Vec3 | null;
}

interface ArrowsState {
    endTimeSeconds: number;
    nextShotAtSeconds: number;
    shotsFired: number;
}

interface DustStormState {
    endTimeSeconds: number;
    hasBlinded: boolean;
    clouds: Entity[];
    ringEntities: Entity[];
}

interface GroundSpikesState {
    endTimeSeconds: number;
    nextSpikeAtSeconds: number;
    spikesSpawned: number;
    spikePositions: Vec3[];
    telegraphs: Entity[];
}

export class Baybars extends Boss {
    private readonly dashSpeed = PLAYER_MOVE_SPEED * 2.8;
    private readonly dashDurationSeconds = 0.55;
    private readonly dashRecoverSeconds = 0.35;
    private readonly dashCooldownSeconds = 5.0;
    private readonly dashRangeMin = 8;
    private readonly dashRangeMax = 40;
    private readonly dashHitRadius = 3.2;
    private readonly dashDamage = 16;
    private readonly dashTrailSpikeInterval = 1.2;
    private nextDashAtSeconds = 0;

    private readonly arrowDamage = 8;
    private readonly arrowCount = 5;
    private readonly arrowIntervalSeconds = 0.25;
    private readonly arrowCooldownSeconds = 4.0;
    private readonly arrowRange = 30;
    private readonly arrowSpreadDegrees = 12;
    private nextArrowsAtSeconds = 0;

    private readonly dustStormDurationSeconds = 2.5;
    private readonly dustStormCooldownSeconds = 12.0;
    private readonly dustStormRange = 15;
    private readonly dustStormDamage = 5;
    private readonly dustStormBlindDurationSeconds = 2.0;
    private nextDustStormAtSeconds = 0;

    private readonly spikeDamage = 12;
    private readonly spikeCount = 6;
    private readonly spikeIntervalSeconds = 0.18;
    private readonly spikeCooldownSeconds = 7.0;
    private readonly spikeRange = 40;
    private readonly spikeHitRadius = 2.0;
    private nextSpikesAtSeconds = 0;

    private attackLockUntilSeconds = 0;
    private lastAttackType: BaybarsAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private dashState: DashState | null = null;
    private arrowsState: ArrowsState | null = null;
    private dustStormState: DustStormState | null = null;
    private groundSpikesState: GroundSpikesState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    private readonly dashTrailMaterial = this.createEffectMaterial(
        new Color(0.8, 0.65, 0.25), new Color(1, 0.8, 0.3), 3.5, 0.7
    );
    private readonly dustStormMaterial = this.createEffectMaterial(
        new Color(0.7, 0.6, 0.4), new Color(0.85, 0.75, 0.5), 2.0, 0.5
    );
    private readonly spikeMaterial = this.createEffectMaterial(
        new Color(0.6, 0.35, 0.15), new Color(0.8, 0.5, 0.2), 4.0, 0.85
    );
    private readonly spikeTelegraphMaterial = this.createEffectMaterial(
        new Color(0.85, 0.4, 0.1), new Color(1, 0.55, 0.2), 5.2, 0.95
    );
    private readonly arrowGlowMaterial = this.createEffectMaterial(
        new Color(0.9, 0.7, 0.2), new Color(1, 0.85, 0.3), 3.0, 0.6
    );
    private readonly dustOverlayMaterial = this.createEffectMaterial(
        new Color(0.65, 0.55, 0.35), new Color(0.75, 0.65, 0.45), 1.5, 0.45
    );
    private readonly dashSpikeTrailMaterial = this.createEffectMaterial(
        new Color(0.75, 0.5, 0.15), new Color(0.95, 0.65, 0.2), 4.5, 0.9
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Baybars")) {
        super(id, maxHealth, entity, "Sultan Baybars");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.2;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.6;

        this.setIntroTaunt(
            "وأنا الملك الظاهر ركن الدين بيبرس البندقداري (بيبرس) سلطان مصر والشام!»!",
            "I am Al-Malik al-Zahir Rukn al-Din Baybars al-Bunduqdari (Baybars), Sultan of Egypt and Syria!"
        );
        this.setIntroNameTranslation("السلطان الملك الظاهر ركن الدين بيبرس البندقداري", "Sultan Al-Malik al-Zahir Rukn al-Din Baybars al-Bunduqdari");
        this.setTauntSet({
            highHealth: [
                "The Mamluk sultanate bows to no one.",
                "Your crusade ends here, in the sands of Ridaniya.",
                "I have broken greater armies than yours."
            ],
            bossLowPlayerHigh: [
                "A sultan does not kneel!",
                "The desert feeds my fury!",
                "You cannot conquer what God has protected."
            ],
            playerLowBossHigh: [
                "Yield, and I may spare your life.",
                "The sands will swallow your remains.",
                "Your strength fades like a mirage."
            ],
            bothLow: [
                "Only one of us leaves this desert alive.",
                "To the last breath, I fight."
            ],
            death: [
                "The desert claims another fool.",
                "You were brave, but foolish."
            ],
            bossDeath: [
                "The Mamluks will avenge me.",
                "I have a long ass name."
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
        if (this.arrowsState) { this.updateArrows(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.dustStormState) { this.updateDustStorm(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.groundSpikesState) { this.updateGroundSpikes(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "dash") { this.startDash(targetEntity, currentTimeSeconds); return; }
        if (chosen === "arrows") { this.startArrows(currentTimeSeconds); return; }
        if (chosen === "dustStorm") { this.startDustStorm(currentTimeSeconds); return; }
        if (chosen === "groundSpikes") { this.startGroundSpikes(targetEntity, currentTimeSeconds); return; }

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
        return { ...base, attackDamage: this.dashDamage, attackRange: this.dashRangeMax, attackCooldown: Math.min(this.dashCooldownSeconds, this.arrowCooldownSeconds), detectionRange: Number.MAX_VALUE };
    }

    // ── Attack selection ──
    private pickNextAttack(distance: number, now: number): BaybarsAttackType | null {
        const choices: Array<{ type: BaybarsAttackType; score: number }> = [];
        if (now >= this.nextDashAtSeconds && distance >= this.dashRangeMin && distance <= this.dashRangeMax) {
            const mid = (this.dashRangeMin + this.dashRangeMax) * 0.5;
            const halfSpan = Math.max(0.001, (this.dashRangeMax - this.dashRangeMin) * 0.5);
            choices.push({ type: "dash", score: 1.2 + (1 - Math.min(1, Math.abs(distance - mid) / halfSpan)) });
        }
        if (now >= this.nextArrowsAtSeconds && distance <= this.arrowRange) {
            choices.push({ type: "arrows", score: 1.0 + (distance / Math.max(0.001, this.arrowRange)) });
        }
        if (now >= this.nextDustStormAtSeconds && distance <= this.dustStormRange) {
            choices.push({ type: "dustStorm", score: 0.9 + (1 - Math.min(1, distance / Math.max(0.001, this.dustStormRange))) });
        }
        if (now >= this.nextSpikesAtSeconds && distance <= this.spikeRange) {
            choices.push({ type: "groundSpikes", score: 1.1 });
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

    // ── Dash attack with spike trail ──
    private startDash(target: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return;
        dir.normalize();
        this.lastAttackType = "dash"; this.lastAttackAtSeconds = now;
        this.dashState = {
            endTimeSeconds: now + this.dashDurationSeconds,
            direction: dir,
            hasHit: false,
            trail: this.createDashTrail(),
            lastSpikePosition: myPos.clone()
        };
        this.attackLockUntilSeconds = this.dashState.endTimeSeconds + this.dashRecoverSeconds;
        this.spawnSpikeDrop(myPos.clone(), now);
    }

    private updateDash(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.dashState; if (!state) return;
        this.moveToward(state.direction.x, state.direction.z, this.dashSpeed, dt);

        if (state.trail) { this.updateDashTrail(state.trail, state.direction); }

        const currentPos = this.getEntity().getPosition();
        if (state.lastSpikePosition) {
            const dx = currentPos.x - state.lastSpikePosition.x;
            const dz = currentPos.z - state.lastSpikePosition.z;
            const distFromLast = Math.sqrt(dx * dx + dz * dz);
            if (distFromLast >= this.dashTrailSpikeInterval) {
                this.spawnDashSpike(currentPos.clone(), state.direction);
                state.lastSpikePosition = currentPos.clone();
            }
        }

        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.dashHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.dashDamage, onAttack);
        }
        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.trail);
            this.dashState = null;
            this.nextDashAtSeconds = now + this.dashCooldownSeconds;
        }
    }

    private createDashTrail(): Entity | null {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return null;
        const trail = new Entity("baybars-dash-trail");
        trail.addComponent("render", { type: "box" } as any);
        trail.setLocalScale(0.6, 0.3, 2.5);
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
        if (flatDir.lengthSq() <= 0.0001) return;
        flatDir.normalize();
        const offset = flatDir.clone().mulScalar(2.5 * 0.5);
        const trailPos = bossPos.clone().sub(offset);
        const yawDegrees = Math.atan2(flatDir.x, flatDir.z) * 180 / Math.PI;
        trail.setPosition(trailPos);
        trail.setLocalEulerAngles(0, yawDegrees, 0);
    }

    private spawnDashSpike(position: Vec3, dashDirection: Vec3): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;

        const perpX = -dashDirection.z;
        const perpZ = dashDirection.x;

        const spikeCount = 4;
        for (let i = 0; i < spikeCount; i++) {
            const lateralOffset = (i - (spikeCount - 1) / 2) * 1.2;
            const randomOffset = (Math.random() - 0.5) * 0.3;
            const spike = new Entity("baybars-dash-spike-trail");
            spike.addComponent("render", { type: "cone" } as any);

            const sx = 0.35 + Math.random() * 0.2;
            const fullHeight = 2.8 + Math.random() * 1.5;
            spike.setLocalScale(sx, 0.01, sx);
            spike.setPosition(
                position.x + perpX * (lateralOffset + randomOffset),
                position.y,
                position.z + perpZ * (lateralOffset + randomOffset)
            );

            if (spike.render?.meshInstances?.length) {
                spike.render.meshInstances[0].material = this.dashSpikeTrailMaterial;
            }
            sceneApp.root.addChild(spike);
            this.registerEffect(spike);

            const startMs = Date.now();
            const riseMs = 180;
            const holdMs = 600;
            const shrinkMs = 350;
            const totalMs = riseMs + holdMs + shrinkMs;

            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= totalMs || !spike.parent) { this.destroyEffect(spike); return; }

                if (elapsed < riseMs) {
                    const t = elapsed / riseMs;
                    const eased = 1 - Math.pow(1 - t, 3);
                    spike.setLocalScale(sx, fullHeight * eased, sx);
                    spike.setPosition(
                        position.x + perpX * (lateralOffset + randomOffset),
                        position.y + (fullHeight * 0.5) * eased,
                        position.z + perpZ * (lateralOffset + randomOffset)
                    );
                } else if (elapsed < riseMs + holdMs) {
                    spike.setLocalScale(sx, fullHeight, sx);
                } else {
                    const shrinkT = (elapsed - riseMs - holdMs) / shrinkMs;
                    const scale = 1 - shrinkT;
                    spike.setLocalScale(sx * scale, fullHeight * scale, sx * scale);
                    const mat = spike.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                    if (mat) { mat.opacity = 0.9 * (1 - shrinkT); mat.update(); }
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
    }

    private spawnSpikeDrop(origin: Vec3, _currentTimeSeconds: number): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;

        const spikeDropCount = 8;
        const spreadRadius = 6;
        const delayBetweenSpikes = 0.08;

        for (let i = 0; i < spikeDropCount; i++) {
            const angle = (i / spikeDropCount) * Math.PI * 2;
            const randomAngleOffset = (Math.random() - 0.5) * 0.4;
            const finalAngle = angle + randomAngleOffset;
            const radius = spreadRadius * (0.6 + Math.random() * 0.4);

            const spikePos = new Vec3(
                origin.x + Math.cos(finalAngle) * radius,
                origin.y,
                origin.z + Math.sin(finalAngle) * radius
            );

            const telegraph = new Entity(`baybars-spike-drop-telegraph-${i}`);
            telegraph.addComponent("render", { type: "cylinder" } as any);
            telegraph.setLocalScale(1.8, 0.05, 1.8);
            telegraph.setPosition(spikePos.x, spikePos.y + 0.05, spikePos.z);
            if (telegraph.render?.meshInstances?.length) {
                telegraph.render.meshInstances[0].material = this.spikeTelegraphMaterial;
            }
            sceneApp.root.addChild(telegraph);
            this.registerEffect(telegraph);

            const telegraphDelay = i * delayBetweenSpikes * 1000;
            const telegraphDuration = 350;

            setTimeout(() => {
                if (!telegraph.parent) return;

                const telStart = Date.now();
                const telTick = () => {
                    const telElapsed = Date.now() - telStart;
                    if (telElapsed >= telegraphDuration || !telegraph.parent) {
                        this.destroyEffect(telegraph);
                        return;
                    }
                    const pulse = 0.7 + Math.sin(telElapsed * 0.015) * 0.3;
                    telegraph.setLocalScale(1.8 * pulse, 0.05, 1.8 * pulse);
                    const mat = telegraph.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                    if (mat) {
                        mat.opacity = 0.95 * (1 - telElapsed / telegraphDuration);
                        mat.update();
                    }
                    requestAnimationFrame(telTick);
                };
                requestAnimationFrame(telTick);
            }, telegraphDelay);

            const spikeDelay = telegraphDelay + telegraphDuration;

            setTimeout(() => {
                const spike = new Entity("baybars-spike-drop");
                spike.addComponent("render", { type: "cone" } as any);
                spike.setLocalScale(0.5, 0.01, 0.5);
                spike.setPosition(spikePos.x, spikePos.y + 8, spikePos.z);
                if (spike.render?.meshInstances?.length) {
                    spike.render.meshInstances[0].material = this.spikeMaterial;
                }
                sceneApp.root.addChild(spike);
                this.registerEffect(spike);

                const halo = new Entity("baybars-spike-drop-halo");
                halo.addComponent("render", { type: "sphere" } as any);
                halo.setLocalScale(1.2, 0.3, 1.2);
                halo.setPosition(spikePos.x, spikePos.y + 0.15, spikePos.z);
                if (halo.render?.meshInstances?.length) {
                    halo.render.meshInstances[0].material = this.spikeTelegraphMaterial;
                }
                sceneApp.root.addChild(halo);
                this.registerEffect(halo);

                const startPosY = spikePos.y + 8;
                const startMs = Date.now();
                const fallMs = 400;
                const holdMs = 500;
                const shrinkMs = 350;
                const totalMs = fallMs + holdMs + shrinkMs;
                const fullHeight = 3.5;

                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    if (elapsed >= totalMs || !spike.parent) {
                        this.destroyEffect(spike);
                        this.destroyEffect(halo);
                        return;
                    }

                    if (elapsed < fallMs) {
                        const t = elapsed / fallMs;
                        const easedT = t * t;
                        const currentY = startPosY - (startPosY - spikePos.y - fullHeight * 0.5) * easedT;
                        spike.setLocalScale(0.5, 0.01, 0.5);
                        spike.setPosition(spikePos.x, currentY, spikePos.z);
                        halo.setPosition(spikePos.x, spikePos.y + 0.15, spikePos.z);
                        const haloScale = 1.2 - t * 0.4;
                        halo.setLocalScale(haloScale, 0.3, haloScale);
                    } else if (elapsed < fallMs + holdMs) {
                        spike.setLocalScale(0.5, fullHeight, 0.5);
                        spike.setPosition(spikePos.x, spikePos.y + fullHeight * 0.5, spikePos.z);
                        const holdT = (elapsed - fallMs) / holdMs;
                        const haloScale = 0.8 + holdT * 0.4;
                        halo.setLocalScale(haloScale, 0.25, haloScale);
                        const haloMat = halo.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                        if (haloMat) {
                            haloMat.opacity = 0.7 * (1 - holdT * 0.6);
                            haloMat.update();
                        }
                    } else {
                        const shrinkT = (elapsed - fallMs - holdMs) / shrinkMs;
                        const easedShrink = shrinkT * shrinkT;
                        const currentHeight = fullHeight * (1 - easedShrink);
                        spike.setLocalScale(0.5 * (1 - shrinkT), currentHeight, 0.5 * (1 - shrinkT));
                        spike.setPosition(spikePos.x, spikePos.y + currentHeight * 0.5, spikePos.z);
                        const mat = spike.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                        if (mat) {
                            mat.opacity = 0.85 * (1 - shrinkT);
                            mat.update();
                        }
                        const haloScale = 1.2 * (1 - shrinkT);
                        halo.setLocalScale(haloScale, 0.15, haloScale);
                        const haloMat = halo.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                        if (haloMat) {
                            haloMat.opacity = 0.4 * (1 - shrinkT);
                            haloMat.update();
                        }
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }, spikeDelay);
        }
    }

    // ── Arrow shower with spread ──
    private startArrows(now: number): void {
        this.lastAttackType = "arrows"; this.lastAttackAtSeconds = now;
        this.arrowsState = { endTimeSeconds: now + this.arrowCount * this.arrowIntervalSeconds + 0.3, nextShotAtSeconds: now, shotsFired: 0 };
        this.attackLockUntilSeconds = this.arrowsState.endTimeSeconds;
    }

    private updateArrows(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.arrowsState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (state.shotsFired < this.arrowCount && now >= state.nextShotAtSeconds) {
            state.shotsFired++; state.nextShotAtSeconds = now + this.arrowIntervalSeconds;
            const spreadDeg = (state.shotsFired - (this.arrowCount + 1) / 2) * (this.arrowSpreadDegrees / this.arrowCount);
            this.spawnArrowProjectile(target, spreadDeg);
            if (this.getFlatDistanceTo(target) <= this.arrowRange) this.applyDamage(this.arrowDamage, onAttack);
        }
        if (now >= state.endTimeSeconds) { this.arrowsState = null; this.nextArrowsAtSeconds = now + this.arrowCooldownSeconds; }
    }

    private spawnArrowProjectile(target: Entity, spreadDeg: number): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const baseDir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

        const spreadRad = spreadDeg * Math.PI / 180;
        const cosS = Math.cos(spreadRad);
        const sinS = Math.sin(spreadRad);
        const dir = new Vec3(
            baseDir.x * cosS - baseDir.z * sinS,
            0,
            baseDir.x * sinS + baseDir.z * cosS
        );

        const arrow = new Entity("baybars-arrow");
        arrow.addComponent("render", { type: "cone" } as any);
        arrow.setLocalScale(0.15, 0.15, 1.6);
        if (arrow.render?.meshInstances?.length) {
            arrow.render.meshInstances[0].material = this.arrowGlowMaterial;
        }
        const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI;
        arrow.setLocalEulerAngles(-90, yaw, 0);
        arrow.setPosition(myPos.x + dir.x * 2, myPos.y + 1.5, myPos.z + dir.z * 2);
        sceneApp.root.addChild(arrow);
        this.registerEffect(arrow);

        const glow = new Entity("baybars-arrow-glow");
        glow.addComponent("render", { type: "sphere" } as any);
        glow.setLocalScale(0.35, 0.35, 0.35);
        if (glow.render?.meshInstances?.length) {
            glow.render.meshInstances[0].material = this.arrowGlowMaterial;
        }
        arrow.addChild(glow);

        const startPos = arrow.getPosition().clone();
        const speed = 40; const startMs = Date.now(); const maxMs = 1500;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= maxMs || !arrow.parent) { this.destroyEffect(arrow); return; }
            const t = elapsed / 1000;
            const arc = Math.sin(t * Math.PI * 2) * 0.3;
            arrow.setPosition(startPos.x + dir.x * speed * t, startPos.y + arc, startPos.z + dir.z * speed * t);
            const fadeT = elapsed / maxMs;
            const mat = arrow.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.6 * (1 - fadeT); mat.update(); }
            const glowMat = glow.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (glowMat) { glowMat.opacity = 0.5 * (1 - fadeT); glowMat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── Dust storm with screen overlay ──
    private startDustStorm(now: number): void {
        this.lastAttackType = "dustStorm"; this.lastAttackAtSeconds = now;
        const clouds = this.createDustClouds();
        this.dustStormState = { endTimeSeconds: now + this.dustStormDurationSeconds, hasBlinded: false, clouds, ringEntities: [] };
        this.attackLockUntilSeconds = this.dustStormState.endTimeSeconds + 0.3;
    }

    private updateDustStorm(_dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.dustStormState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, _dt);
    	}
    	const bossPos = this.getEntity().getPosition();
        const elapsed = now - (this.lastAttackAtSeconds);
        const durationProgress = Math.min(1, elapsed / this.dustStormDurationSeconds);

        for (let i = 0; i < state.clouds.length; i++) {
            const cloud = state.clouds[i];
            if (!cloud.parent) continue;
            const phase = performance.now() * 0.001 + i * 1.5;
            const wobbleX = Math.sin(phase * 0.8) * 0.5;
            const wobbleZ = Math.cos(phase * 0.6) * 0.5;
            cloud.setPosition(bossPos.x + wobbleX, bossPos.y + 1 + Math.sin(phase * 0.4) * 0.3, bossPos.z + wobbleZ);
            const scale = 4 + Math.sin(phase * 0.5) * 1.5 + durationProgress * 3;
            cloud.setLocalScale(scale, scale * 0.5, scale);
            const mat = cloud.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) {
                const fadeIn = Math.min(1, elapsed * 2);
                const fadeOut = durationProgress > 0.7 ? (1 - (durationProgress - 0.7) / 0.3) : 1;
                mat.opacity = 0.45 * fadeIn * fadeOut;
                mat.update();
            }
        }

        if (!state.hasBlinded && this.getFlatDistanceTo(target) <= this.dustStormRange) {
            state.hasBlinded = true;
            this.applyDamage(this.dustStormDamage, onAttack);
            this.spawnRingEffect(bossPos, this.dustStormRange, this.dustStormDurationSeconds * 1000, this.dustStormMaterial, "baybars-dust-ring", 0.15);
            this.applyDustBlindEffect(target);
        }

        if (now >= state.endTimeSeconds) {
            for (const cloud of state.clouds) { this.destroyEffect(cloud); }
            for (const ring of state.ringEntities) { this.destroyEffect(ring); }
            this.dustStormState = null;
            this.nextDustStormAtSeconds = now + this.dustStormCooldownSeconds;
        }
    }

    private createDustClouds(): Entity[] {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return [];
        const clouds: Entity[] = [];
        const myPos = this.getEntity().getPosition();
        for (let i = 0; i < 5; i++) {
            const cloud = new Entity(`baybars-dust-cloud-${i}`);
            cloud.addComponent("render", { type: "sphere" } as any);
            const startScale = 3 + Math.random() * 2;
            cloud.setLocalScale(startScale, startScale * 0.5, startScale);
            if (cloud.render?.meshInstances?.length) {
                cloud.render.meshInstances[0].material = this.dustStormMaterial;
            }
            const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
            const radius = 1 + Math.random() * 2;
            cloud.setPosition(
                myPos.x + Math.cos(angle) * radius,
                myPos.y + 1 + Math.random() * 0.5,
                myPos.z + Math.sin(angle) * radius
            );
            sceneApp.root.addChild(cloud);
            this.registerEffect(cloud);
            clouds.push(cloud);
        }
        return clouds;
    }

    private applyDustBlindEffect(targetEntity: Entity): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;

        const camera = sceneApp.root.findByName("camera") as Entity | null;
        if (!camera) return;

        const overlay = new Entity("baybars-dust-overlay");
        overlay.addComponent("render", { type: "plane" } as any);
        overlay.setLocalScale(8, 8, 1);
        if (overlay.render?.meshInstances?.length) {
            overlay.render.meshInstances[0].material = this.dustOverlayMaterial;
        }

        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;

        camera.addChild(overlay);
        overlay.setLocalPosition(0, 0, -3);
        this.registerEffect(overlay);

        const blindDurationMs = this.dustStormBlindDurationSeconds * 1000;
        const startMs = Date.now();

        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= blindDurationMs || !overlay.parent) {
                this.destroyEffect(overlay);
                if (controller) {
                    const ctrl = controller as any;
                    if (typeof ctrl.setMovementLocked === "function") {
                        ctrl.setMovementLocked(false);
                    } else {
                        ctrl.movementLocked = false;
                    }
                }
                return;
            }
            const t = elapsed / blindDurationMs;
            const fadeIn = Math.min(1, elapsed / 300);
            const fadeOut = t > 0.6 ? (1 - (t - 0.6) / 0.4) : 1;
            const mat = overlay.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) {
                mat.opacity = 0.45 * fadeIn * fadeOut;
                mat.update();
            }

            if (elapsed < 800) {
                const intensity = fadeIn * fadeOut;
                const wobbleX = (Math.sin(elapsed * 0.01) * 2 + (Math.random() - 0.5) * 0.5) * intensity;
                const wobbleY = (Math.cos(elapsed * 0.008) * 1 + (Math.random() - 0.5) * 0.3) * intensity;
                overlay.setLocalPosition(wobbleX, wobbleY, -3 - Math.random() * 0.3 * intensity);
            } else {
                overlay.setLocalPosition(0, 0, -3);
            }

            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── Ground spikes with telegraph + rise/hold/shrink ──
    private startGroundSpikes(target: Entity, now: number): void {
        this.lastAttackType = "groundSpikes"; this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return; dir.normalize();

        const spikePositions: Vec3[] = [];
        const telegraphs: Entity[] = [];
        const sceneApp = this.resolveSceneApp();

        for (let i = 0; i < this.spikeCount; i++) {
            const offset = (i - (this.spikeCount - 1) / 2) * 2.5;
            const pos = new Vec3(
                myPos.x + dir.x * (i * 2 + 3) + (-dir.z) * offset,
                myPos.y,
                myPos.z + dir.z * (i * 2 + 3) + dir.x * offset
            );
            spikePositions.push(pos);

            if (sceneApp?.root) {
                const telegraph = new Entity(`baybars-spike-telegraph-${i}`);
                telegraph.addComponent("render", { type: "cylinder" } as any);
                telegraph.setLocalScale(this.spikeHitRadius * 2, 0.05, this.spikeHitRadius * 2);
                telegraph.setPosition(pos.x, pos.y + 0.05, pos.z);
                if (telegraph.render?.meshInstances?.length) {
                    telegraph.render.meshInstances[0].material = this.spikeTelegraphMaterial;
                }
                sceneApp.root.addChild(telegraph);
                this.registerEffect(telegraph);
                telegraphs.push(telegraph);

                const telStart = Date.now();
                const telMaxMs = (this.spikeCount * this.spikeIntervalSeconds + 0.4) * 1000;
                const telTick = () => {
                    const telElapsed = Date.now() - telStart;
                    if (telElapsed >= telMaxMs || !telegraph.parent) { this.destroyEffect(telegraph); return; }
                    const pulse = 0.7 + Math.sin(telElapsed * 0.012) * 0.3;
                    telegraph.setLocalScale(this.spikeHitRadius * 2 * pulse, 0.05, this.spikeHitRadius * 2 * pulse);
                    const mat = telegraph.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                    if (mat) { mat.opacity = 0.8 * (1 - telElapsed / telMaxMs); mat.update(); }
                    requestAnimationFrame(telTick);
                };
                requestAnimationFrame(telTick);
            }
        }

        this.groundSpikesState = {
            endTimeSeconds: now + this.spikeCount * this.spikeIntervalSeconds + 0.8,
            nextSpikeAtSeconds: now,
            spikesSpawned: 0,
            spikePositions,
            telegraphs
        };
        this.attackLockUntilSeconds = this.groundSpikesState.endTimeSeconds;
    }

    private updateGroundSpikes(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.groundSpikesState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (state.spikesSpawned < this.spikeCount && now >= state.nextSpikeAtSeconds) {
            const pos = state.spikePositions[state.spikesSpawned];
            state.spikesSpawned++; state.nextSpikeAtSeconds = now + this.spikeIntervalSeconds;
            this.spawnSingleSpike(pos, target, onAttack);
        }
        if (now >= state.endTimeSeconds) {
            this.groundSpikesState = null;
            this.nextSpikesAtSeconds = now + this.spikeCooldownSeconds;
        }
    }

    private spawnSingleSpike(pos: Vec3, target: Entity, onAttack?: (attacker: npc) => void): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;

        const spike = new Entity("baybars-spike");
        spike.addComponent("render", { type: "cone" } as any);
        spike.setLocalScale(0.5, 0.01, 0.5);
        spike.setPosition(pos.x, pos.y, pos.z);
        if (spike.render?.meshInstances?.length) {
            spike.render.meshInstances[0].material = this.spikeMaterial;
        }
        sceneApp.root.addChild(spike);
        this.registerEffect(spike);

        const halo = new Entity("baybars-spike-halo");
        halo.addComponent("render", { type: "sphere" } as any);
        halo.setLocalScale(0.8, 0.2, 0.8);
        halo.setPosition(pos.x, pos.y + 0.1, pos.z);
        if (halo.render?.meshInstances?.length) {
            halo.render.meshInstances[0].material = this.spikeTelegraphMaterial;
        }
        sceneApp.root.addChild(halo);
        this.registerEffect(halo);

        const startMs = Date.now();
        const riseMs = 300;
        const holdMs = 600;
        const shrinkMs = 400;
        const totalMs = riseMs + holdMs + shrinkMs;
        const fullHeight = 3.0;

        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= totalMs || !spike.parent) { this.destroyEffect(spike); this.destroyEffect(halo); return; }

            if (elapsed < riseMs) {
                const t = elapsed / riseMs;
                const eased = 1 - Math.pow(1 - t, 3);
                spike.setLocalScale(0.5, fullHeight * eased, 0.5);
                spike.setPosition(pos.x, pos.y + (fullHeight * 0.5) * eased, pos.z);
                halo.setLocalScale(0.8 + eased * 0.6, 0.2, 0.8 + eased * 0.6);
            } else if (elapsed < riseMs + holdMs) {
                spike.setLocalScale(0.5, fullHeight, 0.5);
                spike.setPosition(pos.x, pos.y + fullHeight * 0.5, pos.z);
                const holdT = (elapsed - riseMs) / holdMs;
                const haloScale = 1.4 - holdT * 0.4;
                halo.setLocalScale(haloScale, 0.15, haloScale);
                const haloMat = halo.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (haloMat) { haloMat.opacity = 0.6 * (1 - holdT * 0.5); haloMat.update(); }
            } else {
                const shrinkT = (elapsed - riseMs - holdMs) / shrinkMs;
                const easedShrink = shrinkT * shrinkT;
                const currentHeight = fullHeight * (1 - easedShrink);
                spike.setLocalScale(0.5 * (1 - shrinkT), currentHeight, 0.5 * (1 - shrinkT));
                spike.setPosition(pos.x, pos.y + currentHeight * 0.5, pos.z);
                const mat = spike.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.85 * (1 - shrinkT); mat.update(); }
                const haloScale = 1.0 * (1 - shrinkT);
                halo.setLocalScale(haloScale, 0.1, haloScale);
                const haloMat = halo.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (haloMat) { haloMat.opacity = 0.3 * (1 - shrinkT); haloMat.update(); }
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        const targetPos = target.getPosition();
        const dx = targetPos.x - pos.x;
        const dz = targetPos.z - pos.z;
        if (Math.sqrt(dx * dx + dz * dz) <= this.spikeHitRadius) this.applyDamage(this.spikeDamage, onAttack);
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
        mat.useLighting = false;
        mat.emissive = emissiveColor; mat.emissiveIntensity = emissiveIntensity;
        mat.diffuse = diffuseColor; mat.opacity = opacity;
        mat.blendType = BLEND_ADDITIVE; mat.cull = CULLFACE_NONE; mat.depthWrite = false;
        mat.update(); return mat;
    }

    private registerEffect(effect: Entity): void {
        this.activeEffects.add(effect);
    }

    private spawnRingEffect(origin: Vec3, radius: number, durationMs: number, material: StandardMaterial, name: string, height: number): void {
        const sceneApp = this.resolveSceneApp();
        if (!sceneApp?.root) return;
        const ring = new Entity(name);
        ring.addComponent("render", { type: "cylinder" } as any);
        ring.setLocalScale(0.1, height, 0.1);
        if (ring.render?.meshInstances?.length) {
            ring.render.meshInstances[0].material = material;
        }
        ring.setPosition(origin.x, origin.y + 0.05, origin.z);
        sceneApp.root.addChild(ring);
        this.registerEffect(ring);
        const start = performance.now();
        const animate = () => {
            if (!this.isAlive() || !ring.parent || !this.activeEffects.has(ring)) { this.destroyEffect(ring); return; }
            const t = Math.min(1, (performance.now() - start) / durationMs);
            const currentRadius = Math.max(0.2, radius * t);
            ring.setLocalScale(currentRadius, height, currentRadius);
            if (t >= 1) { this.destroyEffect(ring); return; }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    private destroyEffect(entity: Entity | null | undefined): void {
        if (!entity) return;
        this.activeEffects.delete(entity);
        try { if (entity.parent) entity.parent.removeChild(entity); entity.destroy(); } catch { /* */ }
    }

    private cleanupEffects(): void {
        for (const effect of this.activeEffects) {
            try { if (effect.parent) effect.parent.removeChild(effect); effect.destroy(); } catch { /* */ }
        }
        this.activeEffects.clear();
        this.dashState = null; this.arrowsState = null; this.dustStormState = null; this.groundSpikesState = null;
    }
}
