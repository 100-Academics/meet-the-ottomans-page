import { AppBase, BLEND_ADDITIVE, Color, CULLFACE_NONE, Entity, StandardMaterial, Vec3 } from "playcanvas";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";
import { Boss } from "./boss";
import type { npc } from "../npc";

type ChristAttackType = "spire" | "ray" | "divineLight";

interface HolyRayState {
    root: Entity;
    origin: Vec3;
    targetPoint: Vec3;
    beamEnd: Vec3;
    startTimeMs: number;
    windupEndMs: number;
    endTimeMs: number;
    hasHit: boolean;
}

interface HolySpireState {
    root: Entity;
    center: Vec3;
    startTimeMs: number;
    impactTimeMs: number;
    endTimeMs: number;
    hasHit: boolean;
}

interface DivineLightState {
    root: Entity;
    center: Vec3;
    startTimeMs: number;
    strikeTimeMs: number;
    endTimeMs: number;
    hasHit: boolean;
}

export class Christ extends Boss {
    private readonly holySpireDamage = 28;
    private readonly holySpireRange = 180;
    private readonly holySpireCooldown = 4.1;
    private readonly holySpireWindupMs = 620;
    private readonly holySpireDurationMs = 500;
    private readonly holySpireHitRadius = 7.5;
    private readonly holySpireMaterial = this.createHolySpireMaterial();

    private readonly holyRayDamage = 24;
    private readonly holyRayRange = 240;
    private readonly holyRayCooldown = 5.6;
    private readonly holyRayWindupMs = 450;
    private readonly holyRayTravelMs = 430;
    private readonly holyRayDurationMs = 820;
    private readonly holyRayHitRadius = 6.5;
    private readonly holyRayOvershoot = 160;
    private readonly holyRayMaterial = this.createHolyRayMaterial();

    private readonly divineLightDamage = 34;
    private readonly divineLightRange = 220;
    private readonly divineLightCooldown = 7.2;
    private readonly divineLightWindupMs = 900;
    private readonly divineLightDurationMs = 700;
    private readonly divineLightAreaRadius = 12;
    private readonly divineLightBeamRadius = 5.5;
    private readonly divineLightSkyHeight = 60;
    private readonly divineLightMaterial = this.createHolyLightMaterial();
    private readonly divineLightWarningMaterial = this.createHolyGlowMaterial(
        new Color(0.82, 0.92, 1),
        new Color(0.95, 0.98, 1),
        4.0,
        0.42
    );

    private nextHolySpireAtSeconds = 0;
    private nextHolyRayAtSeconds = 0;
    private nextDivineLightAtSeconds = 0;
    private lastAttackType: ChristAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    private holyRayState: HolyRayState | null = null;
    private holySpireState: HolySpireState | null = null;
    private divineLightState: DivineLightState | null = null;
    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Jesus Christ")) {
        super(id, maxHealth, entity, "Jesus Christ");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.08;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.65;
        this.aiConfig.attackRange = this.divineLightRange;
        this.aiConfig.attackCooldown = Math.min(this.holySpireCooldown, this.holyRayCooldown, this.divineLightCooldown);

        this.setTauntSet({
            highHealth: [
                "You have come far to fall here.",
                "I am the way, the truth, and the life. Stand down."
            ],
            bossLowPlayerHigh: [
                "I'll show you divine justice!",
                "I have given my life for Man before, and I will not do it again."
            ],
            playerLowBossHigh: [
                "Your burden grows heavier.",
                "You walk a harder road now."
            ],
            bothLow: [
                "I have felled those stronger than you.",
                "Endurance is all that remains.",
                "If I fall here, my Father will finish the job."
            ],
            death: [
                "I forgive you.",
                "Your sins have been cleansed."
            ],
            bossDeath: [
                "The body falls, but the path remains.",
                "Forgive me, my children."
            ]
        });
        this.setIntroTaunt("Ego sum via, veritas, et vita.", "I am the way, the truth, and the life.");
        this.setIntroNameTranslation("Iesus Christus", "Jesus Christ");
    }

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

    protected override getCombatProfile() {
        const base = super.getCombatProfile();
        return {
            ...base,
            attackDamage: this.divineLightDamage,
            attackRange: this.divineLightRange,
            attackCooldown: Math.min(this.holySpireCooldown, this.holyRayCooldown, this.divineLightCooldown),
            detectionRange: Number.MAX_VALUE
        };
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
        if (!targetEntity) {
            super.updateAI(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack, profileOverride);
            return;
        }

	if (this.holyRayState || this.holySpireState || this.divineLightState) {
			this.faceTarget(targetEntity, clampedDeltaTime);
			return;
		}

        const profile = profileOverride ?? this.getCombatProfile();
        const bossPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - bossPos.x;
        const dz = targetPos.z - bossPos.z;
        const distance = Math.sqrt((dx * dx) + (dz * dz));

        if (distance > profile.detectionRange) {
            super.updateAI(clampedDeltaTime, null, currentTimeSeconds, undefined, profile);
            return;
        }

        if (distance > profile.attackRange) {
            this.moveToward(dx, dz, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
            return;
        }

	const chosenAttack = this.pickNextAttack(distance, currentTimeSeconds);
		if (!chosenAttack) {
			this.moveToward(dx, dz, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
			return;
		}

        this.lastAttackType = chosenAttack;
        this.lastAttackAtSeconds = currentTimeSeconds;

        if (chosenAttack === "ray") {
            this.nextHolyRayAtSeconds = currentTimeSeconds + this.holyRayCooldown;
            this.fireHolyRay(targetEntity);
            return;
        }

        if (chosenAttack === "divineLight") {
            this.nextDivineLightAtSeconds = currentTimeSeconds + this.divineLightCooldown;
            this.fireDivineLight(targetEntity);
            return;
        }

        this.nextHolySpireAtSeconds = currentTimeSeconds + this.holySpireCooldown;
        this.fireHolySpire(targetEntity);
    }

    public override kill(): boolean {
        if (this.holyRayState) {
            this.destroyEffect(this.holyRayState.root);
        }
        if (this.holySpireState) {
            this.destroyEffect(this.holySpireState.root);
        }
        if (this.divineLightState) {
            this.destroyEffect(this.divineLightState.root);
        }
        this.holyRayState = null;
        this.holySpireState = null;
        this.divineLightState = null;

        for (const effect of this.activeEffects) {
            this.destroyEffect(effect);
        }
        this.activeEffects.clear();

        return super.kill();
    }

    private pickNextAttack(distance: number, nowSeconds: number): ChristAttackType | null {
        const choices: Array<{ type: ChristAttackType; score: number }> = [];

        if (nowSeconds >= this.nextHolySpireAtSeconds) {
            const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.holySpireRange));
            choices.push({ type: "spire", score: 1.1 + closeness });
        }

        if (nowSeconds >= this.nextHolyRayAtSeconds) {
            const farBias = Math.min(1, distance / Math.max(0.001, this.holyRayRange));
            choices.push({ type: "ray", score: 1.0 + farBias });
        }

        if (nowSeconds >= this.nextDivineLightAtSeconds) {
            const idealRange = this.divineLightRange * 0.55;
            const rangeOffset = Math.abs(distance - idealRange);
            const midBias = 1 - Math.min(1, rangeOffset / Math.max(0.001, idealRange));
            choices.push({ type: "divineLight", score: 1.05 + midBias });
        }

        if (choices.length === 0) {
            return null;
        }

        const recentWindowSeconds = 1.6;
        if (this.lastAttackType && (nowSeconds - this.lastAttackAtSeconds) < recentWindowSeconds) {
            for (const choice of choices) {
                if (choice.type === this.lastAttackType) {
                    choice.score *= 0.6;
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

    private fireHolyRay(targetEntity: Entity): void {
        const app = this.getSceneApp();
        if (!app?.root) return;

        const origin = this.getSpellOrigin(4.4);
        const targetPoint = this.getAimedTargetPosition(targetEntity);
        const beamEnd = this.calculateHolyRayEnd(origin, targetPoint);
        const state: HolyRayState = {
            root: new Entity("holy ray root"),
            origin,
            targetPoint,
            beamEnd,
            startTimeMs: performance.now(),
            windupEndMs: 0,
            endTimeMs: 0,
            hasHit: false
        };
        state.windupEndMs = state.startTimeMs + this.holyRayWindupMs;
        state.endTimeMs = state.windupEndMs + this.holyRayDurationMs;

        this.holyRayState = state;
        app.root.addChild(state.root);
        this.activeEffects.add(state.root);

        const animate = () => {
            if (!this.isAlive() || this.holyRayState !== state || !state.root.parent) {
                this.cleanupState(state);
                return;
            }

            const nowMs = performance.now();
            if (nowMs >= state.endTimeMs) {
                this.cleanupState(state);
                return;
            }

            if (nowMs >= state.windupEndMs && !state.hasHit && this.isHitByRay(targetEntity, state.origin, state.beamEnd, this.holyRayHitRadius)) {
                state.hasHit = true;
                this.applyDamage(this.holyRayDamage);
                this.spawnExplosion(state.targetPoint.clone(), 2.4, new Color(1, 0.96, 0.72), 220);
            }

            if (nowMs >= state.windupEndMs) {
                const progress = Math.min(1, (nowMs - state.windupEndMs) / this.holyRayTravelMs);
                const beam = this.createCylinderBeam(
                    state.origin,
                    state.beamEnd,
                    progress,
                    this.getHolyRayBeamRadius(progress),
                    this.holyRayMaterial,
                    "holy ray beam"
                );
                this.replaceChild(state.root, beam);
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    private fireHolySpire(targetEntity: Entity): void {
        const app = this.getSceneApp();
        if (!app?.root) return;

        const center = this.getPlayerCenterPosition(targetEntity);
        const state: HolySpireState = {
            root: new Entity("holy spire root"),
            center,
            startTimeMs: performance.now(),
            impactTimeMs: 0,
            endTimeMs: 0,
            hasHit: false
        };
        state.impactTimeMs = state.startTimeMs + this.holySpireWindupMs;
        state.endTimeMs = state.impactTimeMs + this.holySpireDurationMs;

        this.holySpireState = state;
        app.root.addChild(state.root);
        this.activeEffects.add(state.root);

        const animate = () => {
            if (!this.isAlive() || this.holySpireState !== state || !state.root.parent) {
                this.cleanupState(state);
                return;
            }

            const nowMs = performance.now();
            if (nowMs >= state.endTimeMs) {
                this.cleanupState(state);
                return;
            }

            const progress = Math.min(1, Math.max(0, (nowMs - state.startTimeMs) / this.holySpireWindupMs));
            const orb = this.createSpireOrb(state.center, progress, this.holySpireMaterial, "holy spire orb");
            this.replaceChild(state.root, orb);

            if (nowMs >= state.impactTimeMs && !state.hasHit) {
                state.hasHit = true;
                if (this.isWithinRadius3D(targetEntity.getPosition(), state.center, this.holySpireHitRadius)) {
                    this.applyDamage(this.holySpireDamage);
                    this.spawnExplosion(state.center.clone(), 3, new Color(1, 0.92, 0.4), 260);
                }
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    private fireDivineLight(targetEntity: Entity): void {
        const app = this.getSceneApp();
        if (!app?.root) return;

        const center = this.getPlayerGroundPosition(targetEntity);
        const state: DivineLightState = {
            root: new Entity("divine light root"),
            center,
            startTimeMs: performance.now(),
            strikeTimeMs: 0,
            endTimeMs: 0,
            hasHit: false
        };
        state.strikeTimeMs = state.startTimeMs + this.divineLightWindupMs;
        state.endTimeMs = state.strikeTimeMs + this.divineLightDurationMs;

        this.divineLightState = state;
        app.root.addChild(state.root);
        this.activeEffects.add(state.root);

        const animate = () => {
            if (!this.isAlive() || this.divineLightState !== state || !state.root.parent) {
                this.cleanupState(state);
                return;
            }

            const nowMs = performance.now();
            if (nowMs >= state.endTimeMs) {
                this.cleanupState(state);
                return;
            }

            const telegraph = this.createDivineLightTelegraph(
                state.center,
                Math.min(1, Math.max(0, (nowMs - state.startTimeMs) / this.divineLightWindupMs)),
                this.divineLightWarningMaterial,
                "divine light telegraph"
            );
            this.replaceChild(state.root, telegraph);

            if (nowMs >= state.strikeTimeMs) {
                const beamOrigin = state.center.clone();
                beamOrigin.y += this.divineLightSkyHeight;
                const beam = this.createCylinderBeam(
                    beamOrigin,
                    state.center,
                    Math.min(1, (nowMs - state.strikeTimeMs) / this.divineLightDurationMs),
                    this.divineLightBeamRadius,
                    this.divineLightMaterial,
                    "divine light beam"
                );
                this.replaceChild(state.root, beam);

                if (!state.hasHit && this.isWithinRadiusFlat(targetEntity.getPosition(), state.center, this.divineLightAreaRadius)) {
                    state.hasHit = true;
                    this.applyDamage(this.divineLightDamage);
                    this.spawnExplosion(state.center.clone(), 4, new Color(0.92, 0.98, 1), 280);
                }
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

	private faceTarget(targetEntity: Entity, deltaTime: number): void {
		const myPos = this.getEntity().getPosition();
		const targetPos = targetEntity.getPosition();
		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, deltaTime);
	}

	private applyDamage(damage: number): void {
        this.onPlayerAttack?.(this, damage);
    }

    private cleanupState(state: HolyRayState | HolySpireState | DivineLightState): void {
        this.destroyEffect(state.root);
        if (this.holyRayState === state) {
            this.holyRayState = null;
        }
        if (this.holySpireState === state) {
            this.holySpireState = null;
        }
        if (this.divineLightState === state) {
            this.divineLightState = null;
        }
    }

    private destroyEffect(effect: Entity | null | undefined): void {
        if (!effect) {
            return;
        }

        this.activeEffects.delete(effect);
        try {
            if (effect.parent) {
                effect.parent.removeChild(effect);
            }
            effect.destroy();
        } catch {
            // ignore cleanup races
        }
    }

    private replaceChild(root: Entity, child: Entity): void {
        if (root.children.length > 0) {
            try {
                root.removeChild(root.children[0] as Entity);
            } catch {
                // ignore
            }
        }

        root.addChild(child);
    }

    private getSceneApp(): AppBase | undefined {
        const selfEntity = this.getEntity() as any;
        const selfApp = (selfEntity?.app ?? selfEntity?._app) as AppBase | undefined;
        if (selfApp?.root) return selfApp;

        const globalApp = (globalThis as any)?.app as AppBase | undefined;
        if (globalApp?.root) return globalApp;

        return undefined;
    }

    private getSpellOrigin(heightOffset = 4.4): Vec3 {
        const origin = this.getEntity().getPosition().clone();
        origin.y += heightOffset;
        return origin;
    }

    private getAimedTargetPosition(targetEntity: Entity): Vec3 {
        const targetPos = targetEntity.getPosition().clone();
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
        const groundHeight = Number.isFinite(controller?.groundHeight)
            ? controller.groundHeight
            : targetPos.y - playerHeight;

        targetPos.y = groundHeight + (playerHeight * 0.55);
        return targetPos;
    }

    private getPlayerCenterPosition(targetEntity: Entity): Vec3 {
        const targetPos = targetEntity.getPosition().clone();
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
        const groundHeight = Number.isFinite(controller?.groundHeight)
            ? controller.groundHeight
            : targetPos.y - playerHeight;

        targetPos.y = groundHeight + (playerHeight * 0.75);
        return targetPos;
    }

    private getPlayerGroundPosition(targetEntity: Entity): Vec3 {
        const targetPos = targetEntity.getPosition().clone();
        const controller = (targetEntity as any)?.script?.FirstPersonCamera
            ?? (targetEntity as any)?.script?.firstPersonCamera;
        const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
        const groundHeight = Number.isFinite(controller?.groundHeight)
            ? controller.groundHeight
            : targetPos.y - playerHeight;

        targetPos.y = groundHeight + 0.05;
        return targetPos;
    }

    private calculateHolyRayEnd(origin: Vec3, targetPos: Vec3): Vec3 {
        const direction = targetPos.clone().sub(origin);
        const length = direction.length();
        if (length <= 0.001) {
            return targetPos.clone();
        }

        const totalLength = Math.max(this.holyRayRange, length) + this.holyRayOvershoot;
        return origin.clone().add(direction.normalize().mulScalar(totalLength));
    }

    private getHolyRayBeamRadius(progress: number): number {
        const clamped = Math.max(0, Math.min(1, progress));
        return 3.6 * (0.65 + (0.7 * clamped));
    }

    private createCylinderBeam(
        origin: Vec3,
        end: Vec3,
        progress: number,
        radius: number,
        material: StandardMaterial,
        label: string
    ): Entity {
        const direction = end.clone().sub(origin);
        const fullDistance = direction.length();
        const beamRoot = new Entity(label);

        if (fullDistance <= 0.5) {
            return beamRoot;
        }

        const traveledDistance = fullDistance * Math.min(1, progress);
        if (traveledDistance <= 0.5) {
            return beamRoot;
        }

        const beam = new Entity(`${label} mesh`);
        beam.addComponent("render", { type: "cylinder" } as any);
        beam.setLocalScale(radius, traveledDistance, radius);
        beam.setLocalPosition(0, traveledDistance * 0.5, 0);

        if (beam.render?.meshInstances?.length) {
            beam.render.meshInstances[0].material = material;
        }

        beamRoot.addChild(beam);
        beamRoot.setPosition(origin.x, origin.y, origin.z);

        const quaternion = this.directionToQuaternionFromUp(direction.clone().mulScalar(1 / fullDistance));
        beamRoot.setLocalRotation(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        return beamRoot;
    }

    private createSpireOrb(center: Vec3, progress: number, material: StandardMaterial, label: string): Entity {
        const root = new Entity(label);
        const orb = new Entity(`${label} mesh`);
        orb.addComponent("render", { type: "sphere" } as any);
        const scale = 0.45 + (progress * 5.8);
        orb.setLocalScale(scale, scale, scale);

        if (orb.render?.meshInstances?.length) {
            orb.render.meshInstances[0].material = material;
        }

        root.addChild(orb);
        root.setPosition(center.x, center.y, center.z);
        return root;
    }

    private createDivineLightTelegraph(center: Vec3, progress: number, material: StandardMaterial, label: string): Entity {
        const root = new Entity(label);
        const disc = new Entity(`${label} disc`);
        disc.addComponent("render", { type: "cylinder" } as any);
        const pulse = 0.9 + (Math.sin(performance.now() * 0.02) * 0.1);
        const radius = this.divineLightAreaRadius * (0.8 + (progress * 0.35)) * pulse;
        disc.setLocalScale(radius, 0.12, radius);

        if (disc.render?.meshInstances?.length) {
            disc.render.meshInstances[0].material = material;
        }

        root.addChild(disc);
        root.setPosition(center.x, center.y + 0.03, center.z);
        return root;
    }

    private createHolyGlowMaterial(diffuse: Color, emissive: Color, emissiveIntensity: number, opacity: number): StandardMaterial {
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

    private createHolySpireMaterial(): StandardMaterial {
        return this.createHolyGlowMaterial(new Color(1, 0.92, 0.4), new Color(1, 0.98, 0.55), 3.8, 0.82);
    }

    private createHolyRayMaterial(): StandardMaterial {
        return this.createHolyGlowMaterial(new Color(1, 0.97, 0.72), new Color(1, 0.99, 0.86), 6.4, 0.94);
    }

    private createHolyLightMaterial(): StandardMaterial {
        return this.createHolyGlowMaterial(new Color(0.95, 0.98, 1), new Color(1, 1, 1), 6.8, 0.92);
    }

    private spawnExplosion(position: Vec3, radius: number, color: Color, durationMs: number): void {
        const app = this.getSceneApp();
        if (!app?.root) return;

        const explosion = new Entity("explosion");
        explosion.addComponent("render", { type: "sphere" } as any);
        if (explosion.render?.meshInstances?.length) {
            explosion.render.meshInstances[0].material = this.createHolyGlowMaterial(color, color, 6, 0.95);
        }
        explosion.setLocalScale(radius, radius, radius);
        explosion.setPosition(position.x, position.y, position.z);
        app.root.addChild(explosion);
        this.activeEffects.add(explosion);
        setTimeout(() => this.destroyEffect(explosion), durationMs);
    }

    private isWithinRadius3D(point: Vec3, center: Vec3, radius: number): boolean {
        return point.distance(center) <= radius;
    }

    private isWithinRadiusFlat(point: Vec3, center: Vec3, radius: number): boolean {
        const dx = point.x - center.x;
        const dz = point.z - center.z;
        return Math.sqrt((dx * dx) + (dz * dz)) <= radius;
    }

    private isHitByRay(targetEntity: Entity, origin: Vec3, rayEnd: Vec3, hitRadius: number): boolean {
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
        return targetPos.distance(closest) <= hitRadius;
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
        let w: number;
        let x: number;
        let y: number;
        let z: number;

        if (trace > 0) {
            const scale = 0.5 / Math.sqrt(trace + 1);
            w = 0.25 / scale;
            x = (m21 - m12) * scale;
            y = (m02 - m20) * scale;
            z = (m10 - m01) * scale;
        } else if (m00 > m11 && m00 > m22) {
            const scale = 2 * Math.sqrt(1 + m00 - m11 - m22);
            w = (m21 - m12) / scale;
            x = 0.25 * scale;
            y = (m01 + m10) / scale;
            z = (m02 + m20) / scale;
        } else if (m11 > m22) {
            const scale = 2 * Math.sqrt(1 + m11 - m00 - m22);
            w = (m02 - m20) / scale;
            x = (m01 + m10) / scale;
            y = 0.25 * scale;
            z = (m12 + m21) / scale;
        } else {
            const scale = 2 * Math.sqrt(1 + m22 - m00 - m11);
            w = (m10 - m01) / scale;
            x = (m02 + m20) / scale;
            y = (m12 + m21) / scale;
            z = 0.25 * scale;
        }

        return { x, y, z, w };
    }
}
