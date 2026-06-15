import AmmoWasmFactory from "ammojs3/dist/ammo.wasm.js";
import AmmoAsmFactory from "ammojs3/dist/ammo.js";
import AmmoLegacyFactory from "ammo.js";
import ammoWasmUrl from "ammojs3/dist/ammo.wasm.wasm?url";

let ammoPromise;

async function resolveAmmo(factory, moduleOptions = undefined) {
  const candidates = [
    factory,
    factory?.default,
    factory?.Ammo,
    factory?.default?.Ammo,
  ].filter((entry) => entry != null);

  let lastError;
  for (const candidate of candidates) {
    try {
      if (typeof candidate === "function") {
        const args = moduleOptions === undefined ? [] : [moduleOptions];
        const maybeAmmo = candidate.apply(globalThis, args);
        const ammoLib = await Promise.resolve(maybeAmmo);
        if (ammoLib) {
          return ammoLib;
        }
      } else if (typeof candidate === "object" || typeof candidate?.then === "function") {
        const ammoLib = await Promise.resolve(candidate);
        if (ammoLib) {
          return ammoLib;
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("No valid Ammo export found");
}

export function loadAmmo() {
  if (!ammoPromise) {
    ammoPromise = (async () => {
      const attempts = [
        {
          name: "ammojs3-wasm",
          factory: AmmoWasmFactory,
          options: {
            locateFile: (path) => (path.endsWith("ammo.wasm.wasm") ? ammoWasmUrl : path),
          },
        },
        {
          name: "ammojs3-asm",
          factory: AmmoAsmFactory,
        },
        {
          name: "ammojs-legacy",
          factory: AmmoLegacyFactory,
        },
      ];

      let lastError;
      for (const attempt of attempts) {
        try {
          const ammoLib = await resolveAmmo(attempt.factory, attempt.options);
          globalThis.Ammo = ammoLib;
          globalThis.__ammoRuntime = attempt.name;
          console.info(`Ammo runtime initialized: ${attempt.name}`);
          return ammoLib;
        } catch (error) {
          lastError = error;
          console.warn(`Failed to initialize ${attempt.name}`, error);
        }
      }

      throw new Error(
        `Unable to initialize ammo runtime${lastError ? `: ${String(lastError)}` : ""}`
      );
    })();
  }

  return ammoPromise;
}
