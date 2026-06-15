import { AppBase, Entity } from "playcanvas";
import { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";
import { Sword } from "../../../player/weapon/sword";

export class Templar extends npc {
    private readonly sword = new Sword(4, 18);
    private readonly arcLifetimeMs = 260;
    private readonly arcDegrees = 120;

    constructor(id: number, modelEntity: Entity = new Entity("templar")) {
        super(id, "foe", 100, modelEntity);
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 0.85;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.75;
        this.aiConfig.detectionRange = Number.MAX_VALUE;
        this.aiConfig.attackCooldown = 3;
    }

    protected override getCombatProfile() {
        return {
            attackDamage: this.sword.getDamage(),
            attackRange: this.sword.getRange(),
            attackCooldown: 0.9,
            detectionRange: this.aiConfig.detectionRange
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
        if (!targetEntity || !onAttack) {
            super.updateAI(deltaTime, targetEntity, currentTimeSeconds, onAttack, profileOverride);
            return;
        }

        const profile = profileOverride ?? this.getCombatProfile();
        const wrappedOnAttack = (attacker: npc) => {
            this.spawnSwordArc(targetEntity, profile.attackRange);
            onAttack(attacker);
        };

        super.updateAI(deltaTime, targetEntity, currentTimeSeconds, wrappedOnAttack, profile);
    }

    private resolveSceneApp(targetEntity?: Entity | null): AppBase | undefined {
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

    private spawnSwordArc(targetEntity: Entity, range: number): void {
        const sceneApp = this.resolveSceneApp(targetEntity);
        if (!sceneApp?.root) return;

        const origin = this.getEntity().getPosition().clone();
        const targetPos = targetEntity.getPosition().clone();
        const dir = targetPos.clone().sub(origin);
        dir.y = 0;
        if (dir.lengthSq() <= 0.0001) {
            const forward = this.getEntity().forward;
            dir.set(forward.x, 0, forward.z);
        }
        if (dir.lengthSq() <= 0.0001) {
            dir.set(0, 0, 1);
        }
        dir.normalize();

        const arcRadius = Math.max(0.5, range);
        const segmentCount = Math.min(20, Math.max(10, Math.round(arcRadius * 4)));
        const segmentScale = Math.max(0.08, arcRadius * 0.04);
        const baseAngle = Math.atan2(dir.x, dir.z);
        const halfArcRad = (this.arcDegrees * Math.PI / 180) * 0.5;
        const arcHeight = origin.y + Math.max(0.6, this.getHitboxRadius() * 0.7);

        const arcRoot = new Entity("templar sword arc");
        sceneApp.root.addChild(arcRoot);

        for (let i = 0; i < segmentCount; i++) {
            const t = segmentCount === 1 ? 0.5 : i / (segmentCount - 1);
            const angle = baseAngle - halfArcRad + (t * halfArcRad * 2);
            const x = origin.x + (arcRadius * Math.sin(angle));
            const z = origin.z + (arcRadius * Math.cos(angle));

            const segment = new Entity("templar sword arc segment");
            segment.addComponent("render", { type: "sphere" } as any);
            segment.setLocalScale(segmentScale, segmentScale, segmentScale);
            segment.setPosition(x, arcHeight, z);
            arcRoot.addChild(segment);
        }

        window.setTimeout(() => {
            try { arcRoot.destroy(); } catch (e) {}
        }, this.arcLifetimeMs);
    }
}