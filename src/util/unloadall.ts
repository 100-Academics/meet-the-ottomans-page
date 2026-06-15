import type { AppBase } from "playcanvas";

export function unloadAll(app: AppBase) {
  while (app.root.children.length > 0) {
    app.root.children[0].destroy();
  }
}
