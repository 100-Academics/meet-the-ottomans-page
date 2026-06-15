const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const archivePath = path.join(projectRoot, "src/assets/models/Tower_00001_.7z");
const targetDirs = [
  path.join(projectRoot, "src/assets/models/npc/boss"),
  path.join(projectRoot, "public/models/npc/boss"),
];

function resolveSevenZipPath() {
  try {
    const sevenZipBin = require("7zip-bin");
    return sevenZipBin.path7za || sevenZipBin.path7z || sevenZipBin.path || "7z";
  } catch (err) {
    return "7z";
  }
}

function ensureExecutable(binaryPath) {
  if (!path.isAbsolute(binaryPath) || !fs.existsSync(binaryPath)) {
    return;
  }

  try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
  } catch (err) {
    const stat = fs.statSync(binaryPath);
    const mode = stat.mode | 0o111;
    fs.chmodSync(binaryPath, mode);
  }
}

function getArchiveSignature(filePath) {
  const stat = fs.statSync(filePath);
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function readMarker(markerPath) {
  try {
    const raw = fs.readFileSync(markerPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function signaturesMatch(left, right) {
  return Boolean(
    left &&
      right &&
      left.size === right.size &&
      left.mtimeMs === right.mtimeMs
  );
}

function writeMarker(markerPath, signature) {
  fs.writeFileSync(markerPath, JSON.stringify(signature, null, 2));
}

function runSevenZip(archive, outDir, sevenZipPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      sevenZipPath,
      ["x", "-y", "-aoa", `-o${outDir}`, archive],
      { stdio: "inherit" }
    );

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`7z exited with code ${code}`));
      }
    });
  });
}

async function main() {
  if (!fs.existsSync(archivePath)) {
    console.error(`Missing archive: ${archivePath}`);
    process.exit(1);
  }

  const signature = getArchiveSignature(archivePath);
  const sevenZipPath = resolveSevenZipPath();
  ensureExecutable(sevenZipPath);

  for (const targetDir of targetDirs) {
    const markerPath = path.join(targetDir, ".tower_00001_extracted.json");
    const existingMarker = readMarker(markerPath);
    if (signaturesMatch(existingMarker, signature)) {
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const displayPath = path.relative(projectRoot, targetDir);
    console.log(`Extracting Tower_00001_.7z to ${displayPath}...`);

    await runSevenZip(archivePath, targetDir, sevenZipPath);
    writeMarker(markerPath, signature);
  }
}

main().catch((err) => {
  console.error("Failed to extract Tower_00001_.7z.");
  console.error(err);
  process.exit(1);
});
