export const NON_SECRET_BATTLES = [
  'Battle of Legnica',
  'Battle of Ain Jalut',
  'Siege of Constantinople',
  'Battle of Agincourt',
  'Siege of Orléans',
  'Fall of Constantinople',
  'Battle of Ridaniya',
  'Battle of Pavia (Italian Wars)',
  'Siege of Vienna',
  'Battle of Yorktown',
  'Battle of Three Emperors',
  'Battle of Gettysburg',
  'Battle of Verdun',
  'Battle of Gallipoli',
  'Battle of Stalingrad',
  'Battle of Chosin Reservoir',
  'Fall of Saigon',
  'Operation Abirey-Halev',
  'Operation Anaconda',
  'Battle of Kyiv',
  'Operation Arnon',
] as const;

let completedBattleNames = new Set<string>();

export function markBattleComplete(name: string): void {
  completedBattleNames.add(name);
}

export function isBattleComplete(name: string): boolean {
  return completedBattleNames.has(name);
}

export function isAllNonSecretComplete(): boolean {
  return NON_SECRET_BATTLES.every(name => completedBattleNames.has(name));
}

export function getCompletedCount(): number {
  return NON_SECRET_BATTLES.filter(name => completedBattleNames.has(name)).length;
}

export function getTotalNonSecretCount(): number {
  return NON_SECRET_BATTLES.length;
}

export function resetBattleProgress(): void {
  completedBattleNames.clear();
}

export function markAllNonSecretComplete(): void {
  for (const name of NON_SECRET_BATTLES) {
    completedBattleNames.add(name);
  }
}
