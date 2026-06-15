import { AppBase, Entity, Vec3 } from 'playcanvas';
import { Weapon } from "./weapon";

export class Gun extends Weapon {
    constructor(damage: number, range: number, _ammo: number, name: string = "Gun") {
        super(name, damage, range);
    }

    public getAmmo(): number {
        return Number.POSITIVE_INFINITY;
    }

    public shoot(app?: AppBase, origin?: Vec3, direction?: Vec3): boolean {
        console.log(`${this.getName()} fired!`);

        const sceneApp = app ?? (globalThis as { app?: AppBase }).app;
        if (!sceneApp?.root) {
            return false; // Can't create shot effect without a valid app and root entity
        }

        const shotOrigin = origin?.clone() ?? new Vec3(0, 0, 0);
        const shotDirection = direction?.clone() ?? new Vec3(0, 0, -1);
        if (shotDirection.lengthSq() <= 0.0001) {
            shotDirection.set(0, 0, -1);
        }
        shotDirection.normalize();

        const shotLength = this.getRange();
        const shotMidpoint = shotOrigin.clone().add(shotDirection.clone().mulScalar(shotLength * 0.5));
        const shotEntity = new Entity(`${this.getName()} shot`);
        shotEntity.setPosition(shotMidpoint);
        shotEntity.lookAt(shotMidpoint.clone().add(shotDirection));

        const tracer = new Entity(`${this.getName()} shot tracer`);
        tracer.addComponent('render', { type: 'box' } as any);
        tracer.setLocalScale(0.08, 0.08, shotLength);

        shotEntity.addChild(tracer);
        sceneApp.root.addChild(shotEntity);

        window.setTimeout(() => {
            shotEntity.destroy();
        }, 500);

        return true;
    }

    public reload(amount: number): void {
        void amount;
    }

}