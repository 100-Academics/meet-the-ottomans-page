import { Vec3 } from "playcanvas";
import type { NpcSceneSpawnOptions, NpcSpawnOverrides, NpcSpawnPoint } from "./sceneNpcSystem";

// Central list of model asset paths used by NPC types.
// How to add a new model:
// 1) Put the .glb under src/assets (the loader resolves relative to that).
// 2) Add the path here.
// 3) Map your NPC type to it in NPC_TYPE_MODEL_PATHS below.
const NPC_MODEL_PATHS = {
  mongolTroop: "models/npc/MongolHorseman.glb",
  templarTroop: "models/npc/Crusader.glb",
  frenchSoldierOld: "models/npc/OldFrenchSoldier.glb",
  modernFrenchSoldier: "models/npc/ModernerFrenchSoldier.glb",
  huntingrifledude: "models/npc/WWISoldier.glb",
  joanofarc: "models/npc/boss/JoanOfArc.glb",
  willieconquer: "models/npc/boss/WillieConquer.glb",
  koreansldier: "models/npc/KoreanSoldier.glb",
  mamlukIthink: "models/npc/Mamluk.glb",
  modernishsoldier: "models/npc/boss/AnotherOldDude.glb",
  genghisKhan: "models/npc/boss/genghis_khan.glb",
  kingGeser: "models/npc/boss/KingGeser.glb",
  christ: "models/npc/boss/Jesus10K.glb",
  georgeWashington: "models/npc/boss/GeorgeWashington.glb",
  americanRevolutionist: "models/npc/americanRevolutionist.glb",
  baybars: "models/npc/boss/Baybars.glb",
  caesar: "models/npc/boss/Caesar.glb",
  napoleon: "models/npc/boss/Napolean.glb",
  uncleSam: "models/npc/boss/UncleSam.glb",
  vietnamDragonKing: "models/npc/boss/dragon_king.glb",
  vietnameseSoldier: "models/npc/VietnamSoldier.glb",
  binLadin: "models/npc/boss/osama_bin_laden.glb",
  airLadin: "models/npc/boss/osama_bin_laden.glb",
  cainAndAbel: "models/npc/boss/CainAndAbel.glb",
  kingGeorgeIII: "models/npc/boss/KingGeorgeIII.glb",
  kinGerorge: "models/npc/boss/KinGerorge.glb",
  lenin: "models/npc/boss/Lenin.glb",
  stalin: "models/npc/boss/Stalin.glb",
  unionSoldier: "models/npc/UnionSoldier.glb",
  germanLookingSoldier: "models/npc/GermanLookingSoldier.glb",
  towerBoss: "models/npc/boss/throne.glb",
  polishHussar: "models/npc/polish_hussar.glb",
  wingedHussarBoss: "models/npc/polish_hussar.glb",
  moses: "models/npc/boss/Moses.glb",
  nineTailedFox: "models/npc/boss/nine-tailed_fox.glb"
};

// Boss-specific defaults. These override size/rotation/offset for each boss model.
const KHAN_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.genghisKhan,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const KING_GESER_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.kingGeser,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const CHRIST_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.christ,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const WILLIAM_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.willieconquer,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const GEORGE_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.georgeWashington,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const BAYBARS_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.baybars,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const CAESAR_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.caesar,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const NAPOLEON_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.napoleon,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const UNCLE_SAM_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.uncleSam,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const VIETNAM_DRAGON_KING_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.vietnamDragonKing,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(1, 1, 1),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const BIN_LADIN_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
 modelPath: NPC_MODEL_PATHS.binLadin,
 modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};
export const AIR_LADIN_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
 modelPath: NPC_MODEL_PATHS.airLadin,
 modelRotation: new Vec3(0, 0, 0),
 modelScale: new Vec3(4, 4, 4),
 // Air Ladin flies at ~50 units up (half the previous 100).
 modelHeightOffset: 12.5,
 facingYawOffsetDegrees: 0,
 hitboxRadius: 2.4
};

const CAIN_AND_ABEL_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.cainAndAbel,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const KING_GEORGE_III_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.kingGeorgeIII,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const KIN_GERORGE_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.kinGerorge,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const LENIN_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.lenin,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const STALIN_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.stalin,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const TOWER_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.towerBoss,
  modelRotation: new Vec3(0, 0, 0),
  modelScale: new Vec3(500, 500, 500),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};
export { TOWER_BOSS_SPAWN_OVERRIDES };

const MOSES_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.moses,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const NINE_TAILED_FOX_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.nineTailedFox,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const WINGED_HUSSAR_BOSS_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: NPC_MODEL_PATHS.wingedHussarBoss,
  modelRotation: new Vec3(-90, 0, 0),
  modelScale: new Vec3(4, 4, 4),
  modelHeightOffset: 11,
  facingYawOffsetDegrees: 0,
  hitboxRadius: 2.4
};

const POLISH_HUSSAR_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(-90, 0, 0),
  facingYawOffsetDegrees: 0
};

// Non-boss per-type overrides (used in typeSpawnOverrides below).
const TEMPLAR_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const HUNTING_RIFLE_DUDE_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const FRENCH_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const MODERN_FRENCH_SOLDIER_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const OLD_FRENCH_SOLDIER_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const JOAN_OF_ARC_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const AMERICAN_REVOLUTIONIST_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const UNION_SOLDIER_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const RUSSIAN_SOLDIER_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelPath: "models/npc/russianSoldier.glb",
  modelRotation: new Vec3(-90, 0, 0),
  facingYawOffsetDegrees: 0,
  detectionRange: 1000
};

const KOREAN_SOLDIER_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0,
  detectionRange: 1000
};

const ITALIAN_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

// NPC type -> model path. The spawn system picks the model from this map
// based on the `type` field in each spawn point.
export const NPC_TYPE_MODEL_PATHS: Record<string, string> = {
  mongol: NPC_MODEL_PATHS.mongolTroop,
  templar: NPC_MODEL_PATHS.templarTroop,
  french: NPC_MODEL_PATHS.frenchSoldierOld,
  frenchSoldierOld: NPC_MODEL_PATHS.frenchSoldierOld,
  modernFrenchSoldier: NPC_MODEL_PATHS.modernFrenchSoldier,
  huntingrifledude: NPC_MODEL_PATHS.frenchSoldierOld,
  joanofarc: NPC_MODEL_PATHS.joanofarc,
  willieconquer: NPC_MODEL_PATHS.willieconquer,
  koreansldier: NPC_MODEL_PATHS.koreansldier,
  mamlukIthink: NPC_MODEL_PATHS.mamlukIthink,
  modernishsoldier: NPC_MODEL_PATHS.modernishsoldier,
  genghisKhan: NPC_MODEL_PATHS.genghisKhan,
  kingGeser: NPC_MODEL_PATHS.kingGeser,
  christ: NPC_MODEL_PATHS.christ,
  williamTheConquerer: NPC_MODEL_PATHS.willieconquer,
  georgeWashington: NPC_MODEL_PATHS.georgeWashington,
  americanRevolutionist: NPC_MODEL_PATHS.americanRevolutionist,
  baybars: NPC_MODEL_PATHS.baybars,
  caesar: NPC_MODEL_PATHS.caesar,
  napoleon: NPC_MODEL_PATHS.napoleon,
  uncleSam: NPC_MODEL_PATHS.uncleSam,
  vietnamDragonKing: NPC_MODEL_PATHS.vietnamDragonKing,
  vietnameseSoldier: NPC_MODEL_PATHS.vietnameseSoldier,
  binLadin: NPC_MODEL_PATHS.binLadin,
  cainAndAbel: NPC_MODEL_PATHS.cainAndAbel,
  kingGeorgeIII: NPC_MODEL_PATHS.kingGeorgeIII,
  kinGerorge: NPC_MODEL_PATHS.kinGerorge,
  lenin: NPC_MODEL_PATHS.lenin,
  stalin: NPC_MODEL_PATHS.stalin,
  unionSoldier: NPC_MODEL_PATHS.unionSoldier,
  russianSoldier: NPC_MODEL_PATHS.germanLookingSoldier,
  towerBoss: NPC_MODEL_PATHS.towerBoss,
  airLadin: NPC_MODEL_PATHS.airLadin,
  italian: "models/npc/ItalianSoldier.glb",
  polishHussar: NPC_MODEL_PATHS.polishHussar,
  wingedHussarBoss: NPC_MODEL_PATHS.wingedHussarBoss,
  nineTailedFox: "models/npc/boss/nine-tailed_fox.glb"
};

const MONGOL_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0
};

const MAMLUK_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0,
  detectionRange: 1000
};

const VIETNAMESE_SOLDIER_SPAWN_OVERRIDES: NpcSpawnOverrides = {
  modelRotation: new Vec3(0, 0, 0),
  facingYawOffsetDegrees: 0,
  detectionRange: 1000
};

// NPC type -> spawn overrides. Allows the spawn system to accept a type->overrides map.
export const NPC_TYPE_SPAWN_OVERRIDES: Record<string, NpcSpawnOverrides> = {
  mongol: MONGOL_SPAWN_OVERRIDES,
  templar: TEMPLAR_SPAWN_OVERRIDES,
  french: FRENCH_SPAWN_OVERRIDES,
  frenchSoldierOld: OLD_FRENCH_SOLDIER_SPAWN_OVERRIDES,
  modernFrenchSoldier: MODERN_FRENCH_SOLDIER_SPAWN_OVERRIDES,
  joanofarc: JOAN_OF_ARC_SPAWN_OVERRIDES,
  americanRevolutionist: AMERICAN_REVOLUTIONIST_SPAWN_OVERRIDES,
  unionSoldier: UNION_SOLDIER_SPAWN_OVERRIDES,
  russianSoldier: RUSSIAN_SOLDIER_SPAWN_OVERRIDES,
  italian: ITALIAN_SPAWN_OVERRIDES,
  huntingrifledude: HUNTING_RIFLE_DUDE_SPAWN_OVERRIDES,
  mamlukIthink: MAMLUK_SPAWN_OVERRIDES,
  koreansldier: KOREAN_SOLDIER_SPAWN_OVERRIDES,
  baybars: BAYBARS_BOSS_SPAWN_OVERRIDES,
  caesar: CAESAR_BOSS_SPAWN_OVERRIDES,
  napoleon: NAPOLEON_BOSS_SPAWN_OVERRIDES,
  uncleSam: UNCLE_SAM_BOSS_SPAWN_OVERRIDES,
  vietnamDragonKing: VIETNAM_DRAGON_KING_BOSS_SPAWN_OVERRIDES,
  vietnameseSoldier: VIETNAMESE_SOLDIER_SPAWN_OVERRIDES,
  binLadin: BIN_LADIN_BOSS_SPAWN_OVERRIDES,
  cainAndAbel: CAIN_AND_ABEL_BOSS_SPAWN_OVERRIDES,
  kingGeorgeIII: KING_GEORGE_III_BOSS_SPAWN_OVERRIDES,
  kinGerorge: KIN_GERORGE_BOSS_SPAWN_OVERRIDES,
  lenin: LENIN_BOSS_SPAWN_OVERRIDES,
  stalin: STALIN_BOSS_SPAWN_OVERRIDES,
  towerBoss: TOWER_BOSS_SPAWN_OVERRIDES,
  airLadin: AIR_LADIN_BOSS_SPAWN_OVERRIDES,
  polishHussar: POLISH_HUSSAR_SPAWN_OVERRIDES,
  wingedHussarBoss: WINGED_HUSSAR_BOSS_SPAWN_OVERRIDES,
  nineTailedFox: NINE_TAILED_FOX_BOSS_SPAWN_OVERRIDES,
  moses: MOSES_BOSS_SPAWN_OVERRIDES
};

// Shared battle options applied in scenes.
export const DEFAULT_BATTLE_NPC_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES,
  groundProbeHeight: 5000,
  groundProbeDepth: 5000
};

// Boss spawn options used by scenes that include the named boss.
export const DEFAULT_KHAN_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...KHAN_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_KING_GESER_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...KING_GESER_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_CHRIST_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...CHRIST_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_WILLIAM_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...WILLIAM_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_GEORGE_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...GEORGE_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_BAYBARS_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...BAYBARS_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_CAESAR_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...CAESAR_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_NAPOLEON_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...NAPOLEON_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_UNCLE_SAM_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...UNCLE_SAM_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_WINGED_HUSSAR_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...WINGED_HUSSAR_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_VIETNAM_DRAGON_KING_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...VIETNAM_DRAGON_KING_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_BIN_LADIN_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...BIN_LADIN_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_CAIN_AND_ABEL_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...CAIN_AND_ABEL_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_KING_GEORGE_III_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...KING_GEORGE_III_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_KIN_GERORGE_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...KIN_GERORGE_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_LENIN_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...LENIN_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_STALIN_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...STALIN_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_TOWER_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...TOWER_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_NINE_TAILED_FOX_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...NINE_TAILED_FOX_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

export const DEFAULT_MOSES_BOSS_SPAWN_OPTIONS: NpcSceneSpawnOptions = {
  ...MOSES_BOSS_SPAWN_OVERRIDES,
  typeModelPaths: NPC_TYPE_MODEL_PATHS,
  typeSpawnOverrides: NPC_TYPE_SPAWN_OVERRIDES
};

// ── Spawn points for each scene ──
// Set `type` to pick a model and NPC class.
// How to add a new spawn: add a new entry with id/team/x/z/type.

// Per-battle enemy type. Change this const to switch out every FOE unit in that battle.
const LEGNICA_ENEMY_TYPE = "mongol";
const AIN_JALUT_ENEMY_TYPE = "mongol";
const CONSTANTINOPLE_ENEMY_TYPE = "templar";
const ORLEANS_ENEMY_TYPE = "french";
const CHOSIN_RESERVOIR_ENEMY_TYPE = "koreansldier";
const GALLIPOLI_ENEMY_TYPE = "frenchSoldierOld";
const RIDANIYA_ENEMY_TYPE = "mamlukIthink";
const GETTYSBURG_ENEMY_TYPE = "unionSoldier";
const KYIV_ENEMY_TYPE = "russianSoldier";
const STALINGRAD_ENEMY_TYPE = "russianSoldier";
const THREE_EMPERORS_ENEMY_TYPE = "french";
const VERDUN_ENEMY_TYPE = "modernFrenchSoldier";
const YORKTOWN_ENEMY_TYPE = "americanRevolutionist";
const SAIGON_ENEMY_TYPE = "vietnameseSoldier";
const ANACONDA_ENEMY_TYPE = "huntingrifledude";
const ARNON_ENEMY_TYPE = "mongol";
const AGINCOURT_ENEMY_TYPE = "french";
const VIENNA_ENEMY_TYPE = "polishHussar";
const PAVIA_ENEMY_TYPE = "italian";

// Legnica
export const LEGNICA_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: LEGNICA_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: 1, type: LEGNICA_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1, type: LEGNICA_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: 1, type: LEGNICA_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: -3, type: LEGNICA_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: -3, type: LEGNICA_ENEMY_TYPE },
  { id: 7, team: "foe", x: 12, z: -3, type: LEGNICA_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -3, type: LEGNICA_ENEMY_TYPE },
  { id: 9, team: "foe", x: 6, z: 5, type: LEGNICA_ENEMY_TYPE },
  { id: 10, team: "foe", x: 9, z: 5, type: LEGNICA_ENEMY_TYPE },
  { id: 11, team: "foe", x: 12, z: 5, type: "mongol" },
  { id: 12, team: "foe", x: 15, z: 5, type: "mongol" },
  { id: 13, team: "foe", x: -6, z: 1, type: "mongol" },
  { id: 14, team: "foe", x: -9, z: 1, type: "mongol" },
  { id: 15, team: "foe", x: -6, z: -3, type: "mongol" },
  { id: 16, team: "foe", x: -9, z: -3, type: "mongol" },
  { id: 17, team: "foe", x: -6, z: 5, type: "mongol" },
  { id: 18, team: "foe", x: -9, z: 5, type: "mongol" },
  { id: 19, team: "foe", x: 0, z: 8, type: "mongol" },
  { id: 20, team: "foe", x: 3, z: 8, type: "mongol" },
  { id: 21, team: "foe", x: -3, z: -6, type: "mongol" },
  { id: 22, team: "foe", x: 0, z: -6, type: "mongol" },
  { id: 23, team: "foe", x: 3, z: -6, type: "mongol" },
  { id: 24, team: "foe", x: -3, z: 8, type: "mongol" },
  { id: 25, team: "foe", x: 18, z: 1, type: "mongol" },
];
export const LEGNICA_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 30, maxHealth: 500, type: "genghisKhan" }];

// Ain Jalut
export const AIN_JALUT_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 10, z: 8, type: AIN_JALUT_ENEMY_TYPE },
  { id: 3, team: "foe", x: -10, z: 8, type: AIN_JALUT_ENEMY_TYPE },
  { id: 5, team: "foe", x: 10, z: -8, type: AIN_JALUT_ENEMY_TYPE },
  { id: 6, team: "foe", x: 5, z: 3, type: AIN_JALUT_ENEMY_TYPE },
  { id: 7, team: "foe", x: -5, z: 3, type: AIN_JALUT_ENEMY_TYPE },
  { id: 8, team: "foe", x: 5, z: -3, type: AIN_JALUT_ENEMY_TYPE },
  { id: 9, team: "foe", x: -5, z: -3, type: AIN_JALUT_ENEMY_TYPE },
  { id: 10, team: "foe", x: 10, z: 0, type: AIN_JALUT_ENEMY_TYPE },
  // { id: 11, team: "foe", x: -10, z: 0, type: "mongol" },
  // { id: 12, team: "foe", x: 0, z: 6, type: "mongol" },
  // { id: 13, team: "foe", x: 0, z: -6, type: "mongol" },
  // { id: 14, team: "foe", x: 8, z: 6, type: "mongol" },
  // { id: 15, team: "foe", x: -8, z: 6, type: "mongol" },
  // { id: 16, team: "foe", x: 8, z: -6, type: "mongol" },
  // { id: 17, team: "foe", x: -8, z: -6, type: "mongol" },
  // { id: 18, team: "foe", x: 15, z: 3, type: "mongol" },
  // { id: 19, team: "foe", x: -15, z: 3, type: "mongol" },
  // { id: 20, team: "foe", x: 15, z: -3, type: "mongol" },
  // { id: 21, team: "foe", x: -15, z: -3, type: "mongol" },
  // { id: 22, team: "foe", x: 3, z: 10, type: "mongol" },
  // { id: 23, team: "foe", x: -3, z: 10, type: "mongol" },
  // { id: 24, team: "foe", x: 3, z: -10, type: "mongol" },
  // { id: 25, team: "foe", x: -3, z: -10, type: "mongol" },
];
export const AIN_JALUT_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 30, maxHealth: 500, type: "kingGeser" }];

// Constantinople
export const CONSTANTINOPLE_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: -12, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: -12, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: -12, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 4, team: "foe", x: 6, z: -16, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 5, team: "foe", x: 9, z: -16, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 6, team: "foe", x: 12, z: -16, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 7, team: "foe", x: 15, z: -12, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -16, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 9, team: "foe", x: 18, z: -12, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 10, team: "foe", x: 18, z: -16, type: CONSTANTINOPLE_ENEMY_TYPE },
  { id: 11, team: "foe", x: -6, z: -12, type: "templar" },
  { id: 12, team: "foe", x: -9, z: -12, type: "templar" },
  { id: 13, team: "foe", x: -6, z: -16, type: "templar" },
  { id: 14, team: "foe", x: -9, z: -16, type: "templar" },
  { id: 15, team: "foe", x: -12, z: -12, type: "templar" },
  { id: 16, team: "foe", x: -12, z: -16, type: "templar" },
  { id: 17, team: "foe", x: 6, z: -20, type: "templar" },
  { id: 18, team: "foe", x: 9, z: -20, type: "templar" },
  { id: 19, team: "foe", x: 12, z: -20, type: "templar" },
  { id: 20, team: "foe", x: -6, z: -20, type: "templar" },
  { id: 21, team: "foe", x: -9, z: -20, type: "templar" },
  { id: 22, team: "foe", x: -12, z: -20, type: "templar" },
  { id: 23, team: "foe", x: 0, z: -8, type: "templar" },
  { id: 24, team: "foe", x: 3, z: -8, type: "templar" },
  { id: 25, team: "foe", x: -3, z: -8, type: "templar" },
];
export const CONSTANTINOPLE_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: -178, z: 77, maxHealth: 500, type: "christ" }];

// Orléans
export const ORLEANS_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 5, team: "foe", x: 18, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 6, team: "foe", x: 6, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 7, team: "foe", x: 9, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 8, team: "foe", x: 12, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 9, team: "foe", x: 15, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 10, team: "foe", x: 18, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 11, team: "foe", x: -6, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 12, team: "foe", x: -9, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 13, team: "foe", x: -6, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 14, team: "foe", x: -9, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 15, team: "foe", x: 6, z: -2, type: ORLEANS_ENEMY_TYPE },
  { id: 16, team: "foe", x: 9, z: -2, type: ORLEANS_ENEMY_TYPE },
  { id: 17, team: "foe", x: 12, z: -2, type: ORLEANS_ENEMY_TYPE },
  { id: 18, team: "foe", x: -6, z: -2, type: ORLEANS_ENEMY_TYPE },
  { id: 19, team: "foe", x: -9, z: -2, type: ORLEANS_ENEMY_TYPE },
  { id: 20, team: "foe", x: 0, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 21, team: "foe", x: 3, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 22, team: "foe", x: -3, z: -6, type: ORLEANS_ENEMY_TYPE },
  { id: 23, team: "foe", x: 0, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 24, team: "foe", x: 3, z: -10, type: ORLEANS_ENEMY_TYPE },
  { id: 25, team: "foe", x: -3, z: -10, type: ORLEANS_ENEMY_TYPE },
];

// Chosin Reservoir
export const CHOSIN_RESERVOIR_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: -3, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: -3, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 7, team: "foe", x: 12, z: -3, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -3, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 9, team: "foe", x: 6, z: 5, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 10, team: "foe", x: 9, z: 5, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 11, team: "foe", x: 12, z: 5, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 12, team: "foe", x: 15, z: 5, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 13, team: "foe", x: -6, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 14, team: "foe", x: -9, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 15, team: "foe", x: -6, z: -3, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 16, team: "foe", x: -9, z: -3, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 17, team: "foe", x: -6, z: 5, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 18, team: "foe", x: -9, z: 5, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 19, team: "foe", x: 0, z: 8, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 20, team: "foe", x: 3, z: 8, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 21, team: "foe", x: -3, z: -6, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 22, team: "foe", x: 0, z: -6, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 23, team: "foe", x: 3, z: -6, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 24, team: "foe", x: -3, z: 8, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
  { id: 25, team: "foe", x: 18, z: 1, type: CHOSIN_RESERVOIR_ENEMY_TYPE },
];
export const CHOSIN_RESERVOIR_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 30, maxHealth: 500, type: "nineTailedFox" }];

// Gallipoli
export const GALLIPOLI_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: GALLIPOLI_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: 1, type: GALLIPOLI_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1, type: GALLIPOLI_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: 1, type: GALLIPOLI_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: -3, type: GALLIPOLI_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: -3, type: GALLIPOLI_ENEMY_TYPE },
  { id: 7, team: "foe", x: 12, z: -3, type: GALLIPOLI_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -3, type: GALLIPOLI_ENEMY_TYPE },
  { id: 9, team: "foe", x: 6, z: 5, type: GALLIPOLI_ENEMY_TYPE },
  { id: 10, team: "foe", x: 9, z: 5, type: GALLIPOLI_ENEMY_TYPE },
  { id: 11, team: "foe", x: 12, z: 5, type: GALLIPOLI_ENEMY_TYPE },
  { id: 12, team: "foe", x: 15, z: 5, type: GALLIPOLI_ENEMY_TYPE },
  { id: 13, team: "foe", x: -6, z: 1, type: GALLIPOLI_ENEMY_TYPE },
  { id: 14, team: "foe", x: -9, z: 1, type: GALLIPOLI_ENEMY_TYPE },
  { id: 15, team: "foe", x: -6, z: -3, type: GALLIPOLI_ENEMY_TYPE },
  { id: 16, team: "foe", x: -9, z: -3, type: GALLIPOLI_ENEMY_TYPE },
  { id: 17, team: "foe", x: -6, z: 5, type: GALLIPOLI_ENEMY_TYPE },
  { id: 18, team: "foe", x: -9, z: 5, type: GALLIPOLI_ENEMY_TYPE },
  { id: 19, team: "foe", x: 0, z: 8, type: GALLIPOLI_ENEMY_TYPE },
  { id: 20, team: "foe", x: 3, z: 8, type: GALLIPOLI_ENEMY_TYPE },
  { id: 21, team: "foe", x: -3, z: -6, type: GALLIPOLI_ENEMY_TYPE },
  { id: 22, team: "foe", x: 0, z: -6, type: GALLIPOLI_ENEMY_TYPE },
  { id: 23, team: "foe", x: 3, z: -6, type: GALLIPOLI_ENEMY_TYPE },
  { id: 24, team: "foe", x: -3, z: 8, type: GALLIPOLI_ENEMY_TYPE },
  { id: 25, team: "foe", x: 18, z: 1, type: GALLIPOLI_ENEMY_TYPE },
];
export const GALLIPOLI_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 30, maxHealth: 500, type: "kinGerorge" }];

// Ridaniya — ~30 Mamluk troops spread far from center (±200–300) in small clusters (~3-5 per group). Baybars arrives as reinforcement after they fall.
export const RIDANIYA_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  // Cluster A — far northwest corner
  { id: 1, team: "foe", x: -240, z: 260, type: RIDANIYA_ENEMY_TYPE },
  { id: 2, team: "foe", x: -235, z: 270, type: RIDANIYA_ENEMY_TYPE },
  { id: 3, team: "foe", x: -245, z: 250, type: RIDANIYA_ENEMY_TYPE },
  // Cluster B — far northeast corner
  { id: 4, team: "foe", x: 230, z: 260, type: RIDANIYA_ENEMY_TYPE },
  { id: 5, team: "foe", x: 240, z: 270, type: RIDANIYA_ENEMY_TYPE },
  { id: 6, team: "foe", x: 235, z: 250, type: RIDANIYA_ENEMY_TYPE },
  // Cluster C — far southwest corner
  { id: 7, team: "foe", x: -250, z: -240, type: RIDANIYA_ENEMY_TYPE },
  { id: 8, team: "foe", x: -260, z: -235, type: RIDANIYA_ENEMY_TYPE },
  { id: 9, team: "foe", x: -245, z: -245, type: RIDANIYA_ENEMY_TYPE },
  // Cluster D — far southeast corner
  { id: 10, team: "foe", x: 240, z: -260, type: RIDANIYA_ENEMY_TYPE },
  { id: 11, team: "foe", x: 250, z: -250, type: RIDANIYA_ENEMY_TYPE },
  { id: 12, team: "foe", x: 235, z: -245, type: RIDANIYA_ENEMY_TYPE },
  // Cluster E — far north line
  { id: 13, team: "foe", x: -200, z: 280, type: RIDANIYA_ENEMY_TYPE },
  { id: 14, team: "foe", x: -210, z: 290, type: RIDANIYA_ENEMY_TYPE },
  // Cluster F — far south line
  { id: 15, team: "foe", x: 200, z: -280, type: RIDANIYA_ENEMY_TYPE },
  { id: 16, team: "foe", x: 210, z: -290, type: RIDANIYA_ENEMY_TYPE },
  // Cluster G — far west line
  { id: 17, team: "foe", x: -280, z: 200, type: RIDANIYA_ENEMY_TYPE },
  { id: 18, team: "foe", x: -290, z: 210, type: RIDANIYA_ENEMY_TYPE },
  // Cluster H — far east line
  { id: 19, team: "foe", x: 270, z: 230, type: RIDANIYA_ENEMY_TYPE },
  { id: 20, team: "foe", x: 280, z: 240, type: RIDANIYA_ENEMY_TYPE },
  // Cluster I — mid-north skirmish line
  { id: 21, team: "foe", x: -260, z: 270, type: RIDANIYA_ENEMY_TYPE },
  { id: 22, team: "foe", x: -255, z: 280, type: RIDANIYA_ENEMY_TYPE },
  // Cluster J — mid-south skirmish line
  { id: 23, team: "foe", x: 250, z: -270, type: RIDANIYA_ENEMY_TYPE },
  { id: 24, team: "foe", x: 260, z: -265, type: RIDANIYA_ENEMY_TYPE },
  // Cluster K — mid-west skirmish line
  { id: 25, team: "foe", x: -270, z: -230, type: RIDANIYA_ENEMY_TYPE },
  { id: 26, team: "foe", x: -280, z: -240, type: RIDANIYA_ENEMY_TYPE },
  // Cluster L — mid-east skirmish line
  { id: 27, team: "foe", x: 260, z: 250, type: RIDANIYA_ENEMY_TYPE },
  { id: 28, team: "foe", x: 270, z: 260, type: RIDANIYA_ENEMY_TYPE },
  // Cluster M — scattered advanced scouts
  { id: 29, team: "foe", x: -220, z: -280, type: RIDANIYA_ENEMY_TYPE },
  { id: 30, team: "foe", x: 230, z: 280, type: RIDANIYA_ENEMY_TYPE },
];
export const RIDANIYA_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 30, maxHealth: 500, type: "baybars" }];

// Gettysburg
export const GETTYSBURG_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 50, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 2, team: "foe", x: 55, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 3, team: "foe", x: 60, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 4, team: "foe", x: 65, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 5, team: "foe", x: 70, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 6, team: "foe", x: 50, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 7, team: "foe", x: 55, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 8, team: "foe", x: 60, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 9, team: "foe", x: 65, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 10, team: "foe", x: 70, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 11, team: "foe", x: -50, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 12, team: "foe", x: -55, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 13, team: "foe", x: -50, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 14, team: "foe", x: -55, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 15, team: "foe", x: 50, z: -40, type: GETTYSBURG_ENEMY_TYPE },
  { id: 16, team: "foe", x: 55, z: -40, type: GETTYSBURG_ENEMY_TYPE },
  { id: 17, team: "foe", x: 60, z: -40, type: GETTYSBURG_ENEMY_TYPE },
  { id: 18, team: "foe", x: -50, z: -40, type: GETTYSBURG_ENEMY_TYPE },
  { id: 19, team: "foe", x: -55, z: -40, type: GETTYSBURG_ENEMY_TYPE },
  { id: 20, team: "foe", x: 0, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 21, team: "foe", x: 10, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 22, team: "foe", x: -10, z: -50, type: GETTYSBURG_ENEMY_TYPE },
  { id: 23, team: "foe", x: 0, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 24, team: "foe", x: 10, z: -60, type: GETTYSBURG_ENEMY_TYPE },
  { id: 25, team: "foe", x: -10, z: -60, type: GETTYSBURG_ENEMY_TYPE },
];
export const GETTYSBURG_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 80, maxHealth: 500, type: "uncleSam" }];

// Kyiv
export const KYIV_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 20, z: 15, type: KYIV_ENEMY_TYPE },
  { id: 2, team: "foe", x: 30, z: 10, type: KYIV_ENEMY_TYPE },
  { id: 3, team: "foe", x: 40, z: 5, type: KYIV_ENEMY_TYPE },
  { id: 4, team: "foe", x: 25, z: -5, type: KYIV_ENEMY_TYPE },
  { id: 5, team: "foe", x: 35, z: -10, type: KYIV_ENEMY_TYPE },
  { id: 6, team: "foe", x: -20, z: 15, type: KYIV_ENEMY_TYPE },
  { id: 7, team: "foe", x: -30, z: 10, type: KYIV_ENEMY_TYPE },
  { id: 8, team: "foe", x: -40, z: 5, type: KYIV_ENEMY_TYPE },
  { id: 9, team: "foe", x: -25, z: -5, type: KYIV_ENEMY_TYPE },
  { id: 10, team: "foe", x: -35, z: -10, type: KYIV_ENEMY_TYPE },
  { id: 11, team: "foe", x: 15, z: 25, type: KYIV_ENEMY_TYPE },
  { id: 12, team: "foe", x: -15, z: 25, type: KYIV_ENEMY_TYPE },
  { id: 13, team: "foe", x: 0, z: 20, type: KYIV_ENEMY_TYPE },
  { id: 14, team: "foe", x: 10, z: -20, type: KYIV_ENEMY_TYPE },
  { id: 15, team: "foe", x: -10, z: -20, type: KYIV_ENEMY_TYPE },
  { id: 16, team: "foe", x: 0, z: -15, type: KYIV_ENEMY_TYPE },
  { id: 17, team: "foe", x: 45, z: 15, type: KYIV_ENEMY_TYPE },
  { id: 18, team: "foe", x: -45, z: 15, type: KYIV_ENEMY_TYPE },
  { id: 19, team: "foe", x: 10, z: 30, type: KYIV_ENEMY_TYPE },
  { id: 20, team: "foe", x: -10, z: 30, type: KYIV_ENEMY_TYPE },
  { id: 21, team: "foe", x: 20, z: -25, type: KYIV_ENEMY_TYPE },
  { id: 22, team: "foe", x: -20, z: -25, type: KYIV_ENEMY_TYPE },
  { id: 23, team: "foe", x: 5, z: -30, type: KYIV_ENEMY_TYPE },
  { id: 24, team: "foe", x: -5, z: -30, type: KYIV_ENEMY_TYPE },
  { id: 25, team: "foe", x: 0, z: 35, type: KYIV_ENEMY_TYPE },
];
export const KYIV_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "stalin" }];

// Stalingrad
export const STALINGRAD_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1,    type: STALINGRAD_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: 1,    type: STALINGRAD_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1,   type: STALINGRAD_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: 1,   type: STALINGRAD_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: -3,   type: STALINGRAD_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: -3,   type: STALINGRAD_ENEMY_TYPE },
  { id: 7, team: "foe", x: 12, z: -3,  type: STALINGRAD_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -3,  type: STALINGRAD_ENEMY_TYPE },
  { id: 9, team: "foe", x: 6, z: 5,    type: STALINGRAD_ENEMY_TYPE },
  { id: 10, team: "foe", x: 9, z: 5,   type: STALINGRAD_ENEMY_TYPE },
  { id: 11, team: "foe", x: 12, z: 5,  type: STALINGRAD_ENEMY_TYPE },
  { id: 12, team: "foe", x: 15, z: 5,  type: STALINGRAD_ENEMY_TYPE },
  { id: 13, team: "foe", x: -6, z: 1,  type: STALINGRAD_ENEMY_TYPE },
  { id: 14, team: "foe", x: -9, z: 1,  type: STALINGRAD_ENEMY_TYPE },
  { id: 15, team: "foe", x: -6, z: -3, type: STALINGRAD_ENEMY_TYPE },
  { id: 16, team: "foe", x: -9, z: -3, type: STALINGRAD_ENEMY_TYPE },
  { id: 17, team: "foe", x: -6, z: 5,  type: STALINGRAD_ENEMY_TYPE },
  { id: 18, team: "foe", x: -9, z: 5,  type: STALINGRAD_ENEMY_TYPE },
  { id: 19, team: "foe", x: 0, z: 8,   type: STALINGRAD_ENEMY_TYPE },
  { id: 20, team: "foe", x: 3, z: 8,   type: STALINGRAD_ENEMY_TYPE },
  { id: 21, team: "foe", x: -3, z: -6, type: STALINGRAD_ENEMY_TYPE },
  { id: 22, team: "foe", x: 0, z: -6,  type: STALINGRAD_ENEMY_TYPE },
  { id: 23, team: "foe", x: 3, z: -6,  type: STALINGRAD_ENEMY_TYPE },
  { id: 24, team: "foe", x: -3, z: 8,  type: STALINGRAD_ENEMY_TYPE },
  { id: 25, team: "foe", x: 18, z: 1,  type: STALINGRAD_ENEMY_TYPE },
]; 
export const STALINGRAD_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "lenin" }];

// Three Emperors
export const THREE_EMPERORS_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: -3, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: -3, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 7, team: "foe", x: 12, z: -3, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -3, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 9, team: "foe", x: 6, z: 5, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 10, team: "foe", x: 9, z: 5, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 11, team: "foe", x: 12, z: 5, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 12, team: "foe", x: 15, z: 5, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 13, team: "foe", x: -6, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 14, team: "foe", x: -9, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 15, team: "foe", x: -6, z: -3, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 16, team: "foe", x: -9, z: -3, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 17, team: "foe", x: -6, z: 5, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 18, team: "foe", x: -9, z: 5, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 19, team: "foe", x: 0, z: 8, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 20, team: "foe", x: 3, z: 8, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 21, team: "foe", x: -3, z: -6, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 22, team: "foe", x: 0, z: -6, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 23, team: "foe", x: 3, z: -6, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 24, team: "foe", x: -3, z: 8, type: THREE_EMPERORS_ENEMY_TYPE },
  { id: 25, team: "foe", x: 18, z: 1, type: THREE_EMPERORS_ENEMY_TYPE },
];
export const THREE_EMPERORS_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "napoleon" }];

// Verdun
export const VERDUN_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: VERDUN_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: 1, type: VERDUN_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1, type: VERDUN_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: 1, type: VERDUN_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: -3, type: VERDUN_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: -3, type: VERDUN_ENEMY_TYPE },
  { id: 7, team: "foe", x: 12, z: -3, type: VERDUN_ENEMY_TYPE },
  { id: 8, team: "foe", x: 15, z: -3, type: VERDUN_ENEMY_TYPE },
  { id: 9, team: "foe", x: 6, z: 5, type: VERDUN_ENEMY_TYPE },
  { id: 10, team: "foe", x: 9, z: 5, type: VERDUN_ENEMY_TYPE },
  { id: 11, team: "foe", x: 12, z: 5, type: VERDUN_ENEMY_TYPE },
  { id: 12, team: "foe", x: 15, z: 5, type: VERDUN_ENEMY_TYPE },
  { id: 13, team: "foe", x: -6, z: 1, type: VERDUN_ENEMY_TYPE },
  { id: 14, team: "foe", x: -9, z: 1, type: VERDUN_ENEMY_TYPE },
  { id: 15, team: "foe", x: -6, z: -3, type: VERDUN_ENEMY_TYPE },
  { id: 16, team: "foe", x: -9, z: -3, type: VERDUN_ENEMY_TYPE },
  { id: 17, team: "foe", x: -6, z: 5, type: VERDUN_ENEMY_TYPE },
  { id: 18, team: "foe", x: -9, z: 5, type: VERDUN_ENEMY_TYPE },
  { id: 19, team: "foe", x: 0, z: 8, type: VERDUN_ENEMY_TYPE },
  { id: 20, team: "foe", x: 3, z: 8, type: VERDUN_ENEMY_TYPE },
  { id: 21, team: "foe", x: -3, z: -6, type: VERDUN_ENEMY_TYPE },
  { id: 22, team: "foe", x: 0, z: -6, type: VERDUN_ENEMY_TYPE },
  { id: 23, team: "foe", x: 3, z: -6, type: VERDUN_ENEMY_TYPE },
  { id: 24, team: "foe", x: -3, z: 8, type: VERDUN_ENEMY_TYPE },
  { id: 25, team: "foe", x: 18, z: 1, type: VERDUN_ENEMY_TYPE },
];
export const VERDUN_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 1500, type: "napoleon" }];

// Yorktown
export const YORKTOWN_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 5, team: "foe", x: 18, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 6, team: "foe", x: 6, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 7, team: "foe", x: 9, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 8, team: "foe", x: 12, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 9, team: "foe", x: 15, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 10, team: "foe", x: 18, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 11, team: "foe", x: 6, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 12, team: "foe", x: 9, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 13, team: "foe", x: 12, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 14, team: "foe", x: 15, z: -6, type: YORKTOWN_ENEMY_TYPE },
  { id: 15, team: "foe", x: 18, z: -6, type: YORKTOWN_ENEMY_TYPE },
];
export const YORKTOWN_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 1500, type: "georgeWashington" }];

// Saigon — fall of Saigon ambush of Viet Cong / NVA soldiers around the player's entry waypoint.
export const SAIGON_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: SAIGON_ENEMY_TYPE },
  { id: 2, team: "foe", x: 9, z: -2, type: SAIGON_ENEMY_TYPE },
  { id: 3, team: "foe", x: 12, z: 1, type: SAIGON_ENEMY_TYPE },
  { id: 4, team: "foe", x: 15, z: -3, type: SAIGON_ENEMY_TYPE },
  { id: 5, team: "foe", x: 6, z: 5, type: SAIGON_ENEMY_TYPE },
  { id: 6, team: "foe", x: 9, z: 5, type: SAIGON_ENEMY_TYPE },
  { id: 7, team: "foe", x: -6, z: 1, type: SAIGON_ENEMY_TYPE },
  { id: 8, team: "foe", x: -9, z: -3, type: SAIGON_ENEMY_TYPE },
];
export const SAIGON_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "vietnamDragonKing" }];

// ginbirey Halev
export const ABIREY_HALEV_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [];
export const ABIREY_HALEV_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "cainAndAbel" }];

// Anaconda
export const ANACONDA_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
{ id: 1, team: "foe", x: 10, z: -8, type: ANACONDA_ENEMY_TYPE },
{ id: 2, team: "foe", x: -8, z: 10, type: ANACONDA_ENEMY_TYPE },
{ id: 3, team: "foe", x: 15, z: 5, type: ANACONDA_ENEMY_TYPE },
];
export const ANACONDA_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: -20, z: 25, maxHealth: 500, type: "binLadin" }];

// Arnon
export const ARNON_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: ARNON_ENEMY_TYPE },
];
export const ARNON_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "moses" }];

// Agincourt
export const AGINCOURT_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 8, z: 3, type: AGINCOURT_ENEMY_TYPE },
  { id: 2, team: "foe", x: 8, z: 4, type: AGINCOURT_ENEMY_TYPE },
  { id: 3, team: "foe", x: 8, z: 5, type: AGINCOURT_ENEMY_TYPE },
  { id: 4, team: "foe", x: 8, z: 6, type: AGINCOURT_ENEMY_TYPE },
  { id: 5, team: "foe", x: 8, z: 7, type: AGINCOURT_ENEMY_TYPE },
  { id: 6, team: "foe", x: 8, z: 8, type: AGINCOURT_ENEMY_TYPE },
  { id: 7, team: "foe", x: 8, z: 9, type: AGINCOURT_ENEMY_TYPE },
  { id: 8, team: "foe", x: 8, z: 10, type: AGINCOURT_ENEMY_TYPE },
  { id: 9, team: "foe", x: 8, z: 11, type: AGINCOURT_ENEMY_TYPE },
  { id: 10, team: "foe", x: 8, z: 12, type: AGINCOURT_ENEMY_TYPE },
  { id: 11, team: "foe", x: 8, z: 13, type: AGINCOURT_ENEMY_TYPE },
  { id: 12, team: "foe", x: 8, z: 14, type: AGINCOURT_ENEMY_TYPE },
  { id: 13, team: "foe", x: 8, z: 15, type: AGINCOURT_ENEMY_TYPE },
];
// Change boss spawn type for Agincourt to William the Conquerer
export const AGINCOURT_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "williamTheConquerer" }];

// Vienna
export const VIENNA_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: 6, z: 1, type: VIENNA_ENEMY_TYPE },
  { id: 2, team: "foe", x: -5, z: 3, type: VIENNA_ENEMY_TYPE },
  { id: 3, team: "foe", x: 4, z: -4, type: VIENNA_ENEMY_TYPE },
  { id: 4, team: "foe", x: -3, z: -5, type: VIENNA_ENEMY_TYPE },
  { id: 5, team: "foe", x: 8, z: 2, type: VIENNA_ENEMY_TYPE },
];
export const VIENNA_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 0, maxHealth: 500, type: "wingedHussarBoss" }];

// Pavia
export const PAVIA_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: 1, team: "foe", x: -150, z: 100, type: PAVIA_ENEMY_TYPE },
  { id: 2, team: "foe", x: -150, z: 100, type: PAVIA_ENEMY_TYPE },
  { id: 3, team: "foe", x: -150, z: 100, type: PAVIA_ENEMY_TYPE },
  { id: 4, team: "foe", x: -150, z: 100, type: PAVIA_ENEMY_TYPE },
  { id: 5, team: "foe", x: -150, z: 100, type: PAVIA_ENEMY_TYPE },
];
export const PAVIA_BOSS_SPAWN_POINT: NpcSpawnPoint[] = [{ id: 99, team: "foe", x: 0, z: 80, maxHealth: 500, type: "caesar" }];

// Northwood High School — do not investigate further
export const NORTHWOOD_HIGH_AIR_LADIN_SPAWN_POINT: NpcSpawnPoint[] = [
 { id: 98, team: "foe", x: 0, z: 0, maxHealth: 500, type: "AirLadin" }
];
export const NORTHWOOD_HIGH_TOWER_SPAWN_POINT: NpcSpawnPoint[] = [
  { id: 99, team: "foe", x: 0, z: 0, maxHealth: 9000, type: "towerBoss" }
];