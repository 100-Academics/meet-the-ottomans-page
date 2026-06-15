
export class Battle{
    private timePeriod: number; // what time period the battle takes place in
    private location: [number, number]; // location on the map. x, y = lat, long. Input as degrees. Will be converted to radians in the return function.
    private name: string; // name of the battle
    private spawnPoint?: [number, number, number];
    private obj: pc.Entity;

    constructor(timePeriod: number, location: [number, number], name: string, obj: pc.Entity, spawnPoint?: [number, number, number]) {
        this.timePeriod = timePeriod;
        this.location = location;
        this.name = name;
        this.spawnPoint = spawnPoint;
        this.obj = obj;
    }

    getTimePeriod(): number{
        return this.timePeriod;
    }

    getLocation(): [number, number]{
        // return location in degrees (same as stored)
        return this.location;
    }

    getName(): string{
        return this.name;
    }

    getSpawnPoint(): [number, number, number] | undefined {
        return this.spawnPoint;
    }

    getObj(): pc.Entity{
        return this.obj;
    }
}