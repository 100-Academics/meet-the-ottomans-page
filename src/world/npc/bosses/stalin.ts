import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type StalinAttackType = "redArmySurge" | "ironCurtain" | "causeWinter";

interface RedArmySurgeState {
    endTimeSeconds: number;
    currentWave: number;
    nextWaveAtSeconds: number;
    totalWaves: number;
}

interface IronCurtainState {
    endTimeSeconds: number;
    hasSpawned: boolean;
}

interface CauseWinterState {
    endTimeSeconds: number;
    hasApplied: boolean;
}

export class Stalin extends Boss {
    // Red army surge (waves of soldiers)
    private readonly surgeDamage = 10;
    private readonly surgeWaves = 3;
    private readonly surgeSoldiersPerWave = 3;
    private readonly surgeCooldownSeconds = 9.0;
    private readonly surgeRange = 25;
    private nextSurgeAtSeconds = 0;

    // Iron curtain wall defense
    private readonly curtainDamage = 8;
    private readonly curtainCooldownSeconds = 7.0;
    private readonly curtainRange = 18;
    private readonly curtainDurationSeconds = 3.0;
    private nextCurtainAtSeconds = 0;

    // Cause winter (player slower, boss faster)
    private readonly winterDurationSeconds = 6.0;
    private readonly winterCooldownSeconds = 12.0;
    private readonly winterRange = 30;
    private readonly winterBossSpeedMultiplier = 1.5;
    private nextWinterAtSeconds = 0;
    private winterActive = false;
    private winterEndTimeSeconds = 0;

    // Runtime state
    private attackLockUntilSeconds = 0;
    private lastAttackType: StalinAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private surgeState: RedArmySurgeState | null = null;
    private curtainState: IronCurtainState | null = null;
    private winterState: CauseWinterState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // VFX materials
    private readonly soldierMaterial = this.createEffectMaterial(
        new Color(0.8, 0.1, 0.05), new Color(1, 0.2, 0.1), 3.0, 0.85
    );
    private readonly curtainMaterial = this.createEffectMaterial(
        new Color(0.7, 0.05, 0.05), new Color(0.9, 0.15, 0.1), 4.0, 0.75
    );
    private readonly winterMaterial = this.createEffectMaterial(
        new Color(0.6, 0.8, 1), new Color(0.8, 0.9, 1), 3.0, 0.5
    );
    private readonly winterRingMaterial = this.createEffectMaterial(
        new Color(0.4, 0.6, 1), new Color(0.6, 0.8, 1), 2.5, 0.4
    );
    private readonly surgeRingMaterial = this.createEffectMaterial(
        new Color(0.6, 0.1, 0.05), new Color(0.8, 0.2, 0.1), 2.5, 0.5
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Stalin")) {
        super(id, maxHealth, entity, "Stalin");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.05;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.55;

        this.setIntroTaunt("За Родину! За Сталина!", "For the Motherland! For Stalin!");
        this.setIntroNameTranslation("Иосиф Виссарионович Сталин", "Joseph Vissarionovich Stalin");
        this.setTauntSet({
            highHealth: [
                "The Soviet Union is invincible.",
                "Quantity has a quality all its own.",
                "One death is a tragedy. A million is a statistic."
            ],
            bossLowPlayerHigh: [
                "The Red Army will crush you!",
                "Not one step back!",
                "The iron curtain descends!"
            ],
            playerLowBossHigh: [
                "You cannot escape the winter.",
                "The state is eternal. You are not.",
                "Death solves all problems."
            ],
            bothLow: [
                "The Motherland demands everything!",
                "For the Soviet Union!"
            ],
            death: [
                "The Soviet Union… outlives me…",
                "I trusted no one… and no one saved me."
            ],
            bossDeath: [
                "The Generalissimo… falls.",
                "The iron curtain… rusts away."
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

        // Update winter state
        if (this.winterActive && currentTimeSeconds >= this.winterEndTimeSeconds) {
            this.winterActive = false;
            this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.05;
        }

        if (!targetEntity) { super.updateAI(dt, targetEntity, currentTimeSeconds, onAttack, profileOverride); return; }

        if (this.surgeState) { this.updateSurge(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.curtainState) { this.updateCurtain(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.winterState) { this.updateWinter(dt, targetEntity, currentTimeSeconds); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "redArmySurge") { this.startSurge(targetEntity, currentTimeSeconds); return; }
        if (chosen === "ironCurtain") { this.startCurtain(targetEntity, currentTimeSeconds); return; }
        if (chosen === "causeWinter") { this.startWinter(currentTimeSeconds); return; }

        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const speed = this.winterActive ? this.aiConfig.chaseMoveSpeed : PLAYER_MOVE_SPEED * 1.05;
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, speed, dt);
    }

    public override kill(): boolean {
        const didKill = super.kill();
        if (didKill) this.cleanupEffects();
        return didKill;
    }

    protected override getCombatProfile() {
        const base = super.getCombatProfile();
        return { ...base, attackDamage: this.surgeDamage, attackRange: this.surgeRange, attackCooldown: this.surgeCooldownSeconds, detectionRange: Number.MAX_VALUE };
    }

    // ── Attack selection ──
    private pickNextAttack(distance: number, now: number): StalinAttackType | null {
        const choices: Array<{ type: StalinAttackType; score: number }> = [];
        if (now >= this.nextSurgeAtSeconds && distance <= this.surgeRange) {
            choices.push({ type: "redArmySurge", score: 1.2 });
        }
        if (now >= this.nextCurtainAtSeconds && distance <= this.curtainRange) {
            choices.push({ type: "ironCurtain", score: 1.0 });
        }
        if (now >= this.nextWinterAtSeconds && distance <= this.winterRange && !this.winterActive) {
            choices.push({ type: "causeWinter", score: 1.5 });
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

    // ── Red army surge ──
    private startSurge(_target: Entity, now: number): void {
        this.lastAttackType = "redArmySurge"; this.lastAttackAtSeconds = now;
        this.surgeState = {
            endTimeSeconds: now + this.surgeWaves * 0.8 + 0.5,
            currentWave: 0,
            nextWaveAtSeconds: now,
            totalWaves: this.surgeWaves
        };
        this.attackLockUntilSeconds = this.surgeState.endTimeSeconds;
    }

    private updateSurge(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.surgeState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}

        if (state.currentWave < state.totalWaves && now >= state.nextWaveAtSeconds) {
            state.currentWave++;
            state.nextWaveAtSeconds = now + 0.8;

            const myPos = this.getEntity().getPosition();

            // Telegraph ring
            this.spawnRingEffect(myPos, 8, 400, this.surgeRingMaterial, "stalin-surge-ring", 0.6);

            for (let i = 0; i < this.surgeSoldiersPerWave; i++) {
                const angle = (i / this.surgeSoldiersPerWave) * Math.PI * 2 + state.currentWave * 0.5;
                const dist = 3 + Math.random() * 2;
                const soldierStartPos = new Vec3(
                    myPos.x + Math.cos(angle) * dist,
                    myPos.y,
                    myPos.z + Math.sin(angle) * dist
                );

                const soldier = new Entity("stalin-red-soldier");
                soldier.addComponent("render", { type: "capsule", material: this.soldierMaterial });
                soldier.setLocalScale(0.7, 1.8, 0.7);
                soldier.setPosition(soldierStartPos.x, soldierStartPos.y + 0.9, soldierStartPos.z);
                this.getEntity().parent?.addChild(soldier) ?? this.getEntity().addChild(soldier);
                this.activeEffects.add(soldier);

                // Animate toward target
                const startMs = Date.now(); const durationMs = 1000;
                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    const t = Math.min(1, elapsed / durationMs);
                    const currentTargetPos = target.getPosition();
                    soldier.setPosition(
                        soldierStartPos.x + (currentTargetPos.x - soldierStartPos.x) * t,
                        soldierStartPos.y + 0.9,
                        soldierStartPos.z + (currentTargetPos.z - soldierStartPos.z) * t
                    );
                    if (elapsed >= durationMs) {
                        const sPos = soldier.getPosition();
                        const dx = currentTargetPos.x - sPos.x;
                        const dz = currentTargetPos.z - sPos.z;
                        if (Math.sqrt(dx * dx + dz * dz) <= 3) {
                            this.applyDamage(this.surgeDamage, onAttack);
                        }
                        this.destroyEffect(soldier);
                        return;
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.surgeState = null;
            this.nextSurgeAtSeconds = now + this.surgeCooldownSeconds;
        }
    }

    // ── Iron curtain ──
    private startCurtain(_target: Entity, now: number): void {
        this.lastAttackType = "ironCurtain"; this.lastAttackAtSeconds = now;
        this.curtainState = { endTimeSeconds: now + this.curtainDurationSeconds, hasSpawned: false };
        this.attackLockUntilSeconds = now + 0.5;
    }

    private updateCurtain(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.curtainState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}

        if (!state.hasSpawned) {
            state.hasSpawned = true;
            const myPos = this.getEntity().getPosition();
            const targetPos = target.getPosition();
            const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

            // Create wall of iron curtain panels
            const wallWidth = 5;
            for (let i = -wallWidth; i <= wallWidth; i++) {
                const panelPos = new Vec3(
                    myPos.x + dir.x * 6 + (-dir.z) * i * 1.5,
                    myPos.y,
                    myPos.z + dir.z * 6 + dir.x * i * 1.5
                );

                const panel = new Entity("stalin-curtain-panel");
                panel.addComponent("render", { type: "box", material: this.curtainMaterial });
                panel.setLocalScale(1.2, 5, 0.3);
                panel.setPosition(panelPos.x, panelPos.y + 2.5, panelPos.z);
                const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI;
                panel.setLocalEulerAngles(0, yaw, 0);
                this.getEntity().parent?.addChild(panel) ?? this.getEntity().addChild(panel);
                this.activeEffects.add(panel);

                // Rising animation
                panel.setPosition(panelPos.x, panelPos.y - 3, panelPos.z);
                const startMs = Date.now(); const riseMs = 400;
                const totalMs = this.curtainDurationSeconds * 1000;
                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    if (elapsed < riseMs) {
                        const t = elapsed / riseMs;
                        panel.setPosition(panelPos.x, panelPos.y - 3 + 5.5 * t, panelPos.z);
                    }
                    if (elapsed >= totalMs) { this.destroyEffect(panel); return; }
                    const mat = panel.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                    if (mat && elapsed > totalMs * 0.7) {
                        mat.opacity = 0.75 * (1 - (elapsed - totalMs * 0.7) / (totalMs * 0.3));
                        mat.update();
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }

            // Check if player is near the wall
            if (this.getFlatDistanceTo(target) <= this.curtainRange) {
                this.applyDamage(this.curtainDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.curtainState = null;
            this.nextCurtainAtSeconds = now + this.curtainCooldownSeconds;
        }
    }

    // ── Cause winter ──
    private startWinter(now: number): void {
        this.lastAttackType = "causeWinter"; this.lastAttackAtSeconds = now;
        this.winterState = { endTimeSeconds: now + 1.0, hasApplied: false };
        this.attackLockUntilSeconds = now + 0.5;
    }

    private updateWinter(dt: number, target: Entity, now: number): void {
    	const state = this.winterState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasApplied) {
            state.hasApplied = true;
            this.winterActive = true;
            this.winterEndTimeSeconds = now + this.winterDurationSeconds;
            this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.05 * this.winterBossSpeedMultiplier;

            // Winter VFX - expanding frost ring
            const myPos = this.getEntity().getPosition();
            this.spawnRingEffect(myPos, 18, 1000, this.winterRingMaterial, "stalin-winter-ring", 0.5);

            // Snow particles
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const snowflake = new Entity("stalin-snowflake");
                snowflake.addComponent("render", { type: "sphere", material: this.winterMaterial });
                snowflake.setLocalScale(0.6, 0.6, 0.6);
                snowflake.setPosition(
                    myPos.x + Math.cos(angle) * 4,
                    myPos.y + 2.5 + Math.random() * 2,
                    myPos.z + Math.sin(angle) * 4
                );
                this.getEntity().addChild(snowflake);
                this.activeEffects.add(snowflake);
                const startMs = Date.now(); const durationMs = 4000;
                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    if (elapsed >= durationMs) { this.destroyEffect(snowflake); return; }
                    snowflake.setPosition(
                        myPos.x + Math.cos(angle + elapsed * 0.0008) * 4,
                        myPos.y + 2.5 + Math.sin(elapsed * 0.0015) * 1.5,
                        myPos.z + Math.sin(angle + elapsed * 0.0008) * 4
                    );
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }
        }
        if (now >= state.endTimeSeconds) { this.winterState = null; this.nextWinterAtSeconds = now + this.winterCooldownSeconds; }
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
        this.activeEffects.clear(); this.surgeState = null; this.curtainState = null; this.winterState = null;
        this.winterActive = false; this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.05;
    }
}
