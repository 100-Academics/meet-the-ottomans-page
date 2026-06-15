import { Weapon } from './weapon';

export class Sword extends Weapon {

    constructor(range: number = 1.5, damage: number = 25) {
        super('Sword', damage, range);
    }

}