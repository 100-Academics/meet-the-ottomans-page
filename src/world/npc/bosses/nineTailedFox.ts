import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type NineTailedFoxAttackType = "foxFire" | "tailSwipe" | "spiritDash" | "illusionClone";

interface FoxFireState {
    endTimeSeconds: number;
    hasHit: boolean;
    orb?: Entity | null;
}

interface TailSwipeState {
    endTimeSeconds: number;
    hasHit: boolean;
}

interface SpiritDashState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
}

interface IllusionCloneState {
    endTimeSeconds: number;
    clone?: Entity | null;
}

export class NineTailedFox extends Boss {
    private readonly foxFireDamage = 14;
    private readonly foxFireRange = 20;
    private readonly foxFireCooldownSeconds = 4.0;
    private readonly foxFireDurationSeconds = 2.5;
    private nextFoxFireAtSeconds = 0;

    private readonly tailSwipeDamage = 18;
    private readonly tailSwipeRange = 5.5;
    private readonly tailSwipeCooldownSeconds = 3.0;
    private nextTailSwipeAtSeconds = 0;

    private readonly spiritDashDamage = 12;
    private readonly spiritDashSpeed = PLAYER_MOVE_SPEED * 3.2;
    private readonly spiritDashDurationSeconds = 0.45;
    private readonly spiritDashCooldownSeconds = 5.0;
    private readonly spiritDashHitRadius = 2.5;
    private nextSpiritDashAtSeconds = 0;

    private readonly illusionDamage = 10;
    private readonly illusionCooldownSeconds = 7.0;
    private readonly illusionDurationSeconds = 4.0;
    private nextIllusionAtSeconds = 0;

    private attackLockUntilSeconds = 0;
    private lastAttackType: NineTailedFoxAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private foxFireState: FoxFireState | null = null;
    private tailSwipeState: TailSwipeState | null = null;
    private spiritDashState: SpiritDashState | null = null;
    private illusionCloneState: IllusionCloneState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    private readonly foxFireMaterial = this.createEffectMaterial(
        new Color(0.9, 0.3, 0.1), new Color(1, 0.5, 0.2), 4.0, 0.85
    );
    private readonly tailSwipeMaterial = this.createEffectMaterial(
        new Color(0.8, 0.4, 0.1), new Color(1, 0.6, 0.2), 3.5, 0.75
    );
    private readonly spiritDashMaterial = this.createEffectMaterial(
        new Color(0.6, 0.2, 0.9), new Color(0.8, 0.3, 1), 4.5, 0.8
    );
    private readonly illusionMaterial = this.createEffectMaterial(
        new Color(0.5, 0.8, 1), new Color(0.7, 0.9, 1), 3.0, 0.5
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Nine Tailed Fox")) {
        super(id, maxHealth, entity, "Nine Tailed Fox");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.3;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.7;

        this.setIntroTaunt("구미호", "Gumiho");
        this.setIntroNameTranslation("九尾狐", "Nine Tailed Fox");
        this.setTauntSet({
            highHealth: [
                "Nine tails, nine lives.",
                "The spirit fox dances under the moon.",
                "Ancient power awakens."
            ],
            bossLowPlayerHigh: [
                "The fox's cunning is endless!",
                "Nine tails shall strangle you!",
                "Spirit flames burn eternal!"
            ],
            playerLowBossHigh: [
                "Your soul shall feed my power.",
                "The mountain fox claims another prey.",
                "Begone, mortal."
            ],
            bothLow: [
                "One final dance of tails!",
                "The spirit realm trembles!"
            ],
            death: [
                "The fox… returns to the mountain…",
                "Nine tails… fade to mist…"
            ],
            bossDeath: [
                "The legend… ends…",
                "Spirit… free…"
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

        if (this.foxFireState) { this.updateFoxFire(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.tailSwipeState) { this.updateTailSwipe(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.spiritDashState) { this.updateSpiritDash(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.illusionCloneState) { this.updateIllusionClone(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "foxFire") { this.startFoxFire(targetEntity, currentTimeSeconds); return; }
        if (chosen === "tailSwipe") { this.startTailSwipe(targetEntity, currentTimeSeconds); return; }
        if (chosen === "spiritDash") { this.startSpiritDash(targetEntity, currentTimeSeconds); return; }
        if (chosen === "illusionClone") { this.startIllusionClone(currentTimeSeconds); return; }

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
        return { ...base, attackDamage: this.tailSwipeDamage, attackRange: this.tailSwipeRange, attackCooldown: this.tailSwipeCooldownSeconds, detectionRange: Number.MAX_VALUE };
    }

    private pickNextAttack(distance: number, now: number): NineTailedFoxAttackType | null {
        const choices: Array<{ type: NineTailedFoxAttackType; score: number }> = [];
        if (now >= this.nextFoxFireAtSeconds && distance <= this.foxFireRange) {
            choices.push({ type: "foxFire", score: 1.1 });
        }
        if (now >= this.nextTailSwipeAtSeconds && distance <= this.tailSwipeRange) {
            choices.push({ type: "tailSwipe", score: 1.3 });
        }
        if (now >= this.nextSpiritDashAtSeconds && distance >= 4 && distance <= 25) {
            choices.push({ type: "spiritDash", score: 1.2 });
        }
        if (now >= this.nextIllusionAtSeconds) {
            choices.push({ type: "illusionClone", score: 0.9 });
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

    private startFoxFire(_target: Entity, now: number): void {
        this.lastAttackType = "foxFire"; this.lastAttackAtSeconds = now;
        const orb = this.createFoxFireOrb();
        this.foxFireState = { endTimeSeconds: now + this.foxFireDurationSeconds, hasHit: false, orb };
        this.attackLockUntilSeconds = this.foxFireState.endTimeSeconds + 0.2;
    }

    private updateFoxFire(_dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.foxFireState; if (!state) return;
        {
            const myPos = this.getEntity().getPosition();
            const targetPos = target.getPosition();
            this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, _dt);
        }
        if (state.orb) {
            const pos = this.getEntity().getPosition();
            state.orb.setPosition(pos.x, pos.y + 2.5, pos.z);
        }
        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.foxFireRange) {
            state.hasHit = true;
            this.applyDamage(this.foxFireDamage, onAttack);
            this.spawnRingEffect(this.getEntity().getPosition(), this.foxFireRange * 0.6, 500, this.foxFireMaterial, "fox-fire-ring", 0.5);
        }
        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.orb);
            this.foxFireState = null;
            this.nextFoxFireAtSeconds = now + this.foxFireCooldownSeconds;
        }
    }

    private createFoxFireOrb(): Entity | null {
        const orb = new Entity("fox-fire-orb");
        orb.addComponent("render", { type: "sphere", material: this.foxFireMaterial });
        orb.setLocalScale(2, 2, 2);
        const myPos = this.getEntity().getPosition();
        orb.setPosition(myPos.x, myPos.y + 2.5, myPos.z);
        this.getEntity().parent?.addChild(orb) ?? this.getEntity().addChild(orb);
        this.activeEffects.add(orb);
        return orb;
    }

    private startTailSwipe(_target: Entity, now: number): void {
        this.lastAttackType = "tailSwipe"; this.lastAttackAtSeconds = now;
        this.tailSwipeState = { endTimeSeconds: now + 0.5, hasHit: false };
        this.attackLockUntilSeconds = this.tailSwipeState.endTimeSeconds;
    }

    private updateTailSwipe(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.tailSwipeState; if (!state) return;
        {
            const myPos = this.getEntity().getPosition();
            const targetPos = target.getPosition();
            this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
        }
        if (!state.hasHit && now >= state.endTimeSeconds - 0.15) {
            state.hasHit = true;
            const myPos = this.getEntity().getPosition();
            this.spawnRingEffect(myPos, this.tailSwipeRange, 350, this.tailSwipeMaterial, "tail-swipe-arc", 0.6);
            if (this.getFlatDistanceTo(target) <= this.tailSwipeRange) {
                this.applyDamage(this.tailSwipeDamage, onAttack);
            }
        }
        if (now >= state.endTimeSeconds) {
            this.tailSwipeState = null;
            this.nextTailSwipeAtSeconds = now + this.tailSwipeCooldownSeconds;
        }
    }

    private startSpiritDash(target: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return; dir.normalize();
        this.lastAttackType = "spiritDash"; this.lastAttackAtSeconds = now;
        this.spiritDashState = {
            endTimeSeconds: now + this.spiritDashDurationSeconds,
            direction: dir,
            hasHit: false
        };
        this.attackLockUntilSeconds = this.spiritDashState.endTimeSeconds + 0.3;
    }

    private updateSpiritDash(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.spiritDashState; if (!state) return;
        this.moveToward(state.direction.x, state.direction.z, this.spiritDashSpeed, dt);
        {
            const myPos = this.getEntity().getPosition();
            const trail = new Entity("spirit-dash-trail");
            trail.addComponent("render", { type: "sphere", material: this.spiritDashMaterial });
            trail.setLocalScale(1.5, 1.5, 1.5);
            trail.setPosition(myPos.x, myPos.y + 0.5, myPos.z);
            this.getEntity().parent?.addChild(trail) ?? this.getEntity().addChild(trail);
            this.activeEffects.add(trail);
            const startMs = Date.now(); const durationMs = 250;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs) { this.destroyEffect(trail); return; }
                const mat = trail.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.7 * (1 - elapsed / durationMs); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.spiritDashHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.spiritDashDamage, onAttack);
        }
        if (now >= state.endTimeSeconds) {
            this.spiritDashState = null;
            this.nextSpiritDashAtSeconds = now + this.spiritDashCooldownSeconds;
        }
    }

    private startIllusionClone(now: number): void {
        this.lastAttackType = "illusionClone"; this.lastAttackAtSeconds = now;
        const clone = this.createIllusionClone();
        this.illusionCloneState = { endTimeSeconds: now + this.illusionDurationSeconds, clone };
        this.attackLockUntilSeconds = now + 0.5;
    }

    private updateIllusionClone(_dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.illusionCloneState; if (!state) return;
        {
            const myPos = this.getEntity().getPosition();
            const targetPos = target.getPosition();
            this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, _dt);
        }
        if (state.clone) {
            const offset = new Vec3(Math.sin(now * 2) * 3, 0, Math.cos(now * 2) * 3);
            const myPos = this.getEntity().getPosition();
            state.clone.setPosition(myPos.x + offset.x, myPos.y + 1, myPos.z + offset.z);
            if (this.getFlatDistanceTo(target) <= this.illusionDamage) {
                // Deal passive damage while illusion is active
                if (now >= this.nextIllusionAtSeconds - this.illusionDurationSeconds + 1.0) {
                    this.applyDamage(this.illusionDamage * 0.3, onAttack);
                }
            }
        }
        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.clone);
            this.illusionCloneState = null;
            this.nextIllusionAtSeconds = now + this.illusionCooldownSeconds;
        }
    }

    private createIllusionClone(): Entity | null {
        const clone = new Entity("fox-illusion-clone");
        clone.addComponent("render", { type: "sphere", material: this.illusionMaterial });
        clone.setLocalScale(3, 3, 3);
        const myPos = this.getEntity().getPosition();
        clone.setPosition(myPos.x + 3, myPos.y + 1, myPos.z);
        this.getEntity().parent?.addChild(clone) ?? this.getEntity().addChild(clone);
        this.activeEffects.add(clone);
        return clone;
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
        this.foxFireState = null;
        this.tailSwipeState = null;
        this.spiritDashState = null;
        this.illusionCloneState = null;
    }
}