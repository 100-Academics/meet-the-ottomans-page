import { AppBase, Entity, Vec3 } from 'playcanvas';
import { npc } from '../../world/npc/npc';
import { Gun } from './gun';

export class Bow extends Gun {
    
    private arrows: number;
    private drawTimeMs: number;
    private isDrawing: boolean = false;

    constructor(damage: number, range: number, arrows: number, drawTimeMs: number = 800) {
        super(damage, range, 90, "Bow");
        this.arrows = Number.POSITIVE_INFINITY;
        this.drawTimeMs = drawTimeMs; 
        void arrows;
    }

    public getArrows(): number {
        return this.arrows;
    }

    public draw(app?: AppBase, origin?: Vec3, direction?: Vec3, target?: npc | null): boolean {
        return this.shoot(app, origin, direction, target);
    }

    public shoot(app?: AppBase, origin?: Vec3, direction?: Vec3, target?: npc | null): boolean {
        if (this.isDrawing) {
            console.log(`${this.getName()} is currently being drawn...`);
            return false;
        }

        this.isDrawing = true;
        console.log(`Drawing ${this.getName()}...`);

        window.setTimeout(() => {
            this.isDrawing = false;
            console.log(`${this.getName()} fired!`);

            const sceneApp = app ?? (globalThis as { app?: AppBase }).app;
            if (!sceneApp?.root) {
                return;
            }

            const shotOrigin = origin?.clone() ?? new Vec3(0, 0, 0);
            const shotDirection = direction?.clone() ?? new Vec3(0, 0, -1);
            if (shotDirection.lengthSq() <= 0.0001) {
                shotDirection.set(0, 0, -1);
            }
            shotDirection.normalize();

            const arrowEntity = new Entity(`${this.getName()} arrow`);
            arrowEntity.setPosition(shotOrigin);
            arrowEntity.lookAt(shotOrigin.clone().add(shotDirection));

            const tracer = new Entity(`${this.getName()} arrow tracer`);
            tracer.addComponent('render', { type: 'cylinder' } as any);
            tracer.setLocalScale(0.03, 0.03, 0.9);
            arrowEntity.addChild(tracer);
            sceneApp.root.addChild(arrowEntity);

            let travelled = 0;
            const speed = 35;
            const maxRange = Math.max(1, this.getRange());
            const tickMs = 16;

            const cleanup = () => {
                try { arrowEntity.destroy(); } catch (e) {}
            };

            const interval = window.setInterval(() => {
                const dt = tickMs / 1000;
                const move = speed * dt;
                travelled += move;
                const newPos = shotOrigin.clone().add(shotDirection.clone().mulScalar(travelled));
                arrowEntity.setPosition(newPos);

                if (target && target.isAlive()) {
                    const targetPos = target.getEntity().getPosition();
                    const dx = targetPos.x - newPos.x;
                    const dy = targetPos.y - newPos.y;
                    const dz = targetPos.z - newPos.z;
                    const distance = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
                    const hitRadius = Math.max(1.0, target.getHitboxRadius());
                    if (distance <= hitRadius) {
                        if (target.getTeam() === 'foe') {
                            target.takeDamage(this.getDamage());
                        }
                        window.clearInterval(interval);
                        cleanup();
                        return;
                    }
                }

                if (travelled >= maxRange || !arrowEntity.parent) {
                    window.clearInterval(interval);
                    cleanup();
                }
            }, tickMs);

            const maxLife = Math.max(2, maxRange / speed + 0.5);
            window.setTimeout(() => {
                window.clearInterval(interval);
                cleanup();
            }, maxLife * 1000);
        }, this.drawTimeMs);

        return true;
    }

    public reload(amount: number): void {
        void amount;
    }

}