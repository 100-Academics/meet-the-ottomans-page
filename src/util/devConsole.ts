/**
 * Dev Console — an in-game command line with full autocomplete.
 *
 * USAGE (adding a new command):
 * import { DevConsole } from '../util/devConsole';
 * DevConsole.register('mycommand', 'Description of what it does', (args) => { ... });
 * // Or with arg hints + custom autocomplete provider:
 * DevConsole.register('mycommand', 'Does a thing', handler, {
 *   args: [
 *     { name: 'requiredArg', completions: () => ['opt1', 'opt2'] },
 *     { name: 'optionalArg', optional: true },
 *   ],
 * });
 *
 * OPEN / CLOSE: Tab key (Shift+Tab also works)
 * NAVIGATE: Up/Down to scroll suggestions, Shift+Up/Down for history
 * AUTOCOMPLETE: Tab to cycle / complete; suggestions shown inline
 * SCROLL OUTPUT: PageUp / PageDown or mouse wheel
 */

import { AppBase, Vec3} from 'playcanvas';
import { changeScene } from '../App';
import { Player } from '../player/player';
import { Boss } from '../world/npc/bosses/boss';
import { npc } from '../world/npc/npc';
import { loadModel } from './loadModel';
import { NPC_TYPE_MODEL_PATHS, DEFAULT_BATTLE_NPC_SPAWN_OPTIONS } from '../world/npc/sceneNpcPresets';
import { spawnSceneNpcs } from '../world/npc/sceneNpcSystem';
import type { NpcSpawnPoint } from '../world/npc/sceneNpcSystem';
import { getSecretsFound, resetSecretsFound, setSecretsFound } from '../world/secrets';
import { markAllNonSecretComplete } from './battleProgress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A command handler receives the raw arg string (empty string if none). Can be async. */
type CommandHandler = (args: string) => string | void | Promise<string | void>;

/** Completions can be a static list of strings or a dynamic function. */
type CompletionProvider = string[] | ((partial: string) => string[]);

/** Definition for a single argument slot in a command. */
interface ArgDef {
  /** Display name for this argument (shown in hint/suggestions). */
  name: string;
  /** Whether this argument is optional. Optional args are shown in [brackets]. */
  optional?: boolean;
  /** Static list or dynamic function returning candidate strings for this arg. */
  completions?: CompletionProvider;
  /** Short description shown next to suggestion items for this arg. */
  description?: string;
}

interface CommandOptions {
  /** Legacy single hint string — still supported for backward compat. */
  hint?: string;
  /** Legacy single completions provider — maps to a single-arg definition. */
  completions?: CompletionProvider;
  /** Structured multi-arg definitions for per-argument autocomplete. */
  args?: ArgDef[];
}

interface CommandEntry {
  name: string;
  description: string;
  handler: CommandHandler;
  hint?: string;
  /** @deprecated Use args instead for per-arg autocomplete. */
  completions?: CompletionProvider;
  /** Structured multi-arg definitions. */
  args?: ArgDef[];
}

// ---------------------------------------------------------------------------
// Model path index — mirrors loadModel.ts but we only need the alias keys
// ---------------------------------------------------------------------------

const modelAssetUrls = import.meta.glob("../assets/**/*.{glb,gltf}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const MODEL_ASSET_PREFIX = "../assets/";

function buildModelPathAliases(): string[] {
  const aliases: string[] = [];
  for (const sourcePath of Object.keys(modelAssetUrls)) {
    if (!sourcePath.startsWith(MODEL_ASSET_PREFIX)) continue;
    const rel = sourcePath.slice(MODEL_ASSET_PREFIX.length);
    aliases.push(rel);
    if (rel.startsWith("models/")) aliases.push(rel.slice("models/".length));
    if (rel.startsWith("world/")) aliases.push(rel.slice("world/".length));
  }
  // Sort for deterministic display
  aliases.sort();
  return aliases;
}

/** All available model-path aliases for autocomplete. */
const MODEL_PATH_ALIASES: string[] = buildModelPathAliases();

/** All NPC type keys from NPC_TYPE_MODEL_PATHS for autocomplete. */
const NPC_TYPE_KEYS: string[] = Object.keys(NPC_TYPE_MODEL_PATHS).sort();

// ---------------------------------------------------------------------------
// DevConsole singleton
// ---------------------------------------------------------------------------

export class DevConsole {
  // ---- public API (static) ------------------------------------------------

  /** Register a new command. Overloads: (name, desc, handler, hint) or (name, desc, handler, opts) */
  static register(
    name: string,
    description: string,
    handler: CommandHandler,
    argHintOrOpts?: string | CommandOptions,
  ): void {
    const key = name.toLowerCase();
    let hint: string | undefined;
    let completions: CompletionProvider | undefined;
    let args: ArgDef[] | undefined;

    if (typeof argHintOrOpts === 'string') {
      hint = argHintOrOpts;
    } else if (argHintOrOpts) {
      hint = argHintOrOpts.hint;
      completions = argHintOrOpts.completions;
      args = argHintOrOpts.args;

      // If legacy `completions` was provided but no `args`, synthesize a single-arg definition
      if (!args && completions) {
        args = [{ name: hint?.replace(/[<>\[\]]/g, '') || 'arg', completions }];
      }
    }

    // If args were provided, auto-generate hint from them
    if (args && args.length > 0 && !hint) {
      hint = args.map(a => a.optional ? `[${a.name}]` : `<${a.name}>`).join(' ');
    }

    DevConsole._commands.set(key, { name: key, description, handler, hint, completions, args });
  }

  /** Unregister a command. */
  static unregister(name: string): void {
    DevConsole._commands.delete(name.toLowerCase());
  }

  /** Initialize the console UI and key listener. Call once at app startup. */
  static init(): void {
    if (DevConsole._initialized) return;
    DevConsole._initialized = true;
    DevConsole._buildUI();
    DevConsole._bindKeys();
    DevConsole._registerBuiltinCommands();
  }

  /** Show the console. */
  static open(): void {
    if (!DevConsole._initialized) DevConsole.init();
    DevConsole._visible = true;
    DevConsole._container.style.display = 'flex';
    DevConsole._inputEl.focus();
    DevConsole._scrollToBottom();
    DevConsole._updateSuggestions();
  }

  /** Hide the console. */
  static close(): void {
    DevConsole._visible = false;
    DevConsole._container.style.display = 'none';
    DevConsole._inputEl.blur();
    DevConsole._hideSuggestions();
  }

  /** Toggle the console. */
  static toggle(): void {
    if (DevConsole._visible) {
      DevConsole.close();
    } else {
      DevConsole.open();
    }
  }

  /** Whether the console is currently visible. */
  static get isOpen(): boolean {
    return DevConsole._visible;
  }

  /** Print a line to the console output (useful from commands). */
  static log(message: string): void {
    DevConsole._appendOutput(message, 'log');
  }

  /** Print an error line to the console output. */
  static error(message: string): void {
    DevConsole._appendOutput(message, 'error');
  }

  // ---- scene hooks (set by scenes) ----------------------------------------

  /** Set the current Player reference. Scenes call this after creating the player. */
  static setPlayer(player: Player | null): void {
    DevConsole._player = player;
  }

  /** Set the current NPC list reference. Scenes call this after spawning NPCs. */
  static setNpcs(npcs: npc[]): void {
    DevConsole._npcs = npcs;
  }

  /** Set the current AppBase reference. Scenes call this during setup. */
  static setApp(app: AppBase | null): void {
    DevConsole._app = app;
  }

  /** Get the current player — checks explicit ref first, then globalThis bridge. */
  private static getPlayer(): Player | null {
    return DevConsole._player ?? (globalThis as any).__devConsolePlayer ?? null;
  }

  // ---- internals ----------------------------------------------------------

  private static _initialized = false;
  private static _visible = false;
  private static _commands = new Map<string, CommandEntry>();
  private static _history: string[] = [];
  private static _historyIndex = -1;
  private static _player: Player | null = null;
  private static _npcs: npc[] = [];
  private static _app: AppBase | null = null;

  // Autocomplete state
  private static _suggestionIndex = -1;
  private static _currentSuggestions: string[] = [];
  /** Descriptions for current suggestions (parallel array). */
  private static _currentSuggestionDescriptions: (string | undefined)[] = [];
  /** Current arg index being completed (for contextual display). */
  private static _currentArgIndex = -1;
  /** The active ArgDef for the arg being completed. */
  private static _currentArgDef: ArgDef | null = null;
  /** The command entry currently being typed. */
  private static _currentCommand: CommandEntry | null = null;

  // DOM refs
  private static _container: HTMLDivElement;
  private static _outputEl: HTMLDivElement;
  private static _inputEl: HTMLInputElement;
  private static _suggestionsEl: HTMLDivElement;
  /** Inline hint overlay showing the full command syntax with current arg highlighted. */
  private static _hintOverlay: HTMLDivElement;

  private static _buildUI(): void {
    // Container
    const container = document.createElement('div');
    container.id = 'dev-console';
    container.style.display = 'none';
    DevConsole._container = container;

    // Output area
    const output = document.createElement('div');
    output.id = 'dev-console-output';
    DevConsole._outputEl = output;

    // Suggestions dropdown (above the input row)
    const suggestions = document.createElement('div');
    suggestions.id = 'dev-console-suggestions';
    DevConsole._suggestionsEl = suggestions;

    // Input row (contains prompt, input, and hint overlay)
    const inputRow = document.createElement('div');
    inputRow.id = 'dev-console-input-row';

    const prompt = document.createElement('span');
    prompt.id = 'dev-console-prompt';
    prompt.textContent = '>';
    inputRow.appendChild(prompt);

    // Wrapper for input + hint overlay so they overlap
    const inputWrap = document.createElement('div');
    inputWrap.id = 'dev-console-input-wrap';

    const hintOverlay = document.createElement('div');
    hintOverlay.id = 'dev-console-hint-overlay';
    hintOverlay.style.display = 'none';
    DevConsole._hintOverlay = hintOverlay;
    inputWrap.appendChild(hintOverlay);

    const input = document.createElement('input');
    input.id = 'dev-console-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    DevConsole._inputEl = input;
    inputWrap.appendChild(input);

    inputRow.appendChild(inputWrap);

    container.appendChild(output);
    container.appendChild(suggestions);
    container.appendChild(inputRow);
    document.body.appendChild(container);

    // Input event handlers
    input.addEventListener('keydown', (e) => DevConsole._onInputKeyDown(e));
    input.addEventListener('input', () => {
      DevConsole._suggestionIndex = -1;
      DevConsole._updateSuggestions();
    });

    // Clicking a suggestion inserts it
    suggestions.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const suggestionEl = target.closest('.dev-console-suggestion') as HTMLElement | null;
      if (suggestionEl) {
        const value = suggestionEl.getAttribute('data-value');
        if (value !== null) {
          DevConsole._applySuggestion(value);
        }
      }
    });

    // Scroll output with mouse wheel even when pointer is over the output area
    output.addEventListener('wheel', (e) => {
      e.stopPropagation();
    });
  }

  private static _bindKeys(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Toggle on Tab (Shift+Tab also works)
      if (e.key === 'Tab') {
        // Don't toggle if user is typing in a different text input
        const active = document.activeElement;
        const isOtherInput =
          active instanceof HTMLInputElement &&
          active.id !== 'dev-console-input';
        if (isOtherInput) return;

        e.preventDefault();
        DevConsole.toggle();
        return;
      }

      // If console is open, prevent game key bindings from firing
      if (DevConsole._visible) {
        const gameKeys = new Set([
          'w', 'a', 's', 'd', ' ', 'Shift', 'Control',
          '1', '2', '3', '4',
        ]);
        if (gameKeys.has(e.key) && !(e.ctrlKey || e.metaKey)) {
          e.stopPropagation();
        }
      }
    }, true); // capture phase — runs before PlayCanvas handlers
  }

  private static _onInputKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      DevConsole._hideSuggestions();
      DevConsole._executeCurrentLine();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Up = always history
        DevConsole._navigateHistory(-1);
      } else if (DevConsole._currentSuggestions.length > 0 && DevConsole._suggestionIndex >= 0) {
        // Navigate up through suggestions
        DevConsole._suggestionIndex = Math.max(0, DevConsole._suggestionIndex - 1);
        DevConsole._renderSuggestions();
      } else {
        DevConsole._navigateHistory(-1);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Down = always history
        DevConsole._navigateHistory(1);
      } else if (DevConsole._currentSuggestions.length > 0 && DevConsole._suggestionIndex < DevConsole._currentSuggestions.length - 1) {
        DevConsole._suggestionIndex = Math.min(DevConsole._currentSuggestions.length - 1, DevConsole._suggestionIndex + 1);
        DevConsole._renderSuggestions();
      } else if (DevConsole._suggestionIndex >= 0) {
        DevConsole._suggestionIndex = -1;
        DevConsole._renderSuggestions();
        DevConsole._navigateHistory(1);
      } else {
        DevConsole._navigateHistory(1);
      }
    } else if (e.key === "/") {
      e.preventDefault();
      DevConsole._autoComplete();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (DevConsole._currentSuggestions.length > 0) {
        DevConsole._hideSuggestions();
      } else {
        DevConsole.close();
      }
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      DevConsole._outputEl.scrollBy(0, -200);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      DevConsole._outputEl.scrollBy(0, 200);
    }
  }

  // ---- Arg tokenization ---------------------------------------------------

  /**
   * Tokenize the args portion of the input into positional argument tokens.
   *
   * Rules:
   *  - Arguments are separated by spaces.
   *  - An argument containing a comma (e.g. "10,0,5") is treated as a single token
   *    even though it has no surrounding quotes — it's a position triple.
   *  - The last token may be incomplete (the user is still typing it).
   */
  private static _tokenizeArgs(argsStr: string): string[] {
    if (!argsStr) return [];
    const tokens: string[] = [];
    let current = '';
    let i = 0;
    while (i < argsStr.length) {
      const ch = argsStr[i];
      if (ch === ' ') {
        // If current token contains a comma, it might be a "x,y,z" position that
        // hasn't finished yet — greedily consume until we see a space after a
        // non-comma-ending token, or end of string.
        if (current.includes(',')) {
          // This is a position token. But it might be followed by more coords.
          // Check if this comma-token is "complete" (3 parts).
          const parts = current.split(',').map(s => s.trim());
          if (parts.length >= 3 && parts[2] !== '') {
            // Position is complete — this space starts a new token
            tokens.push(current);
            current = '';
            i++;
            // Skip trailing spaces
            while (i < argsStr.length && argsStr[i] === ' ') i++;
            continue;
          } else {
            // Position token is incomplete — keep consuming (space might be
            // part of "10, 0, 5" with spaces after commas)
            current += ch;
            i++;
            continue;
          }
        }
        // Normal space separator
        if (current) {
          tokens.push(current);
          current = '';
        }
        i++;
      } else {
        current += ch;
        i++;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }

  /**
   * Determine which argument index the cursor is currently in,
   * and whether the user is still typing that argument or has moved past it.
   */
  private static _getCurrentArgIndex(argsStr: string, _cursorPos?: number): {
    argIndex: number;
    partial: string;
    isTyping: boolean;
  } {
    const tokens = DevConsole._tokenizeArgs(argsStr);
    if (tokens.length === 0) {
      return { argIndex: 0, partial: '', isTyping: true };
    }

    // Check if argsStr ends with a space (user finished typing an arg and moved on)
    const trimmedArgs = argsStr.replace(/\s+$/, '');
    const endsWithSpace = argsStr.length > trimmedArgs.length;

    if (endsWithSpace) {
      // User has finished the last token — they're on the next arg
      return { argIndex: tokens.length, partial: '', isTyping: true };
    }

    // User is still typing the last token
    const lastToken = tokens[tokens.length - 1] ?? '';
    return { argIndex: tokens.length - 1, partial: lastToken, isTyping: true };
  }

  // ---- Autocomplete / suggestions -----------------------------------------

  /** Given the current input, return candidate completions for the current token. */
  private static _getCompletionsForInput(input: string): {
    completions: string[];
    descriptions: (string | undefined)[];
    argIndex: number;
    argDef: ArgDef | null;
    command: CommandEntry | null;
  } {
    const trimmed = input.trimStart();
    const result = {
      completions: [] as string[],
      descriptions: [] as (string | undefined)[],
      argIndex: -1,
      argDef: null as ArgDef | null,
      command: null as CommandEntry | null,
    };

    if (!trimmed) {
      // No input — list all command names with their descriptions
      const sorted = [...DevConsole._commands.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      result.completions = sorted.map(c => c.name);
      result.descriptions = sorted.map(c => c.description);
      return result;
    }

    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      // Completing command name
      const partial = trimmed.toLowerCase();
      const sorted = [...DevConsole._commands.values()]
        .filter(c => c.name.startsWith(partial))
        .sort((a, b) => a.name.localeCompare(b.name));
      result.completions = sorted.map(c => c.name);
      result.descriptions = sorted.map(c => c.description);
      return result;
    }

    // We have a command name + args
    const cmdName = trimmed.substring(0, spaceIdx).toLowerCase();
    const entry = DevConsole._commands.get(cmdName);
    result.command = entry ?? null;

    if (!entry) return result;

    const argsStr = trimmed.substring(spaceIdx + 1);
    const { argIndex, partial } = DevConsole._getCurrentArgIndex(argsStr);

    result.argIndex = argIndex;

    // Try the new args system first
    if (entry.args && entry.args.length > 0) {
      const argDef = entry.args[Math.min(argIndex, entry.args.length - 1)];
      result.argDef = argDef ?? null;

      if (argDef?.completions) {
        const provider = argDef.completions;
        let candidates: string[];
        if (typeof provider === 'function') {
          candidates = provider(partial);
        } else {
          const lower = partial.toLowerCase();
          candidates = provider.filter(s => s.toLowerCase().startsWith(lower));
        }
        result.completions = candidates;
        // If each completion has a description, attach those. For now, use the arg description.
        result.descriptions = candidates.map(() => argDef.description);
      } else if (argDef) {
        // Arg exists but has no completions — show the arg hint as a single ghost item
        result.completions = [];
        result.descriptions = [];
      }
      return result;
    }

    // Fallback: legacy single-completions system
    if (entry.completions) {
      const provider = entry.completions;
      if (typeof provider === 'function') {
        result.completions = provider(partial);
      } else {
        const lower = partial.toLowerCase();
        result.completions = provider.filter(s => s.toLowerCase().startsWith(lower));
      }
      result.descriptions = result.completions.map(() => undefined);
    }
    return result;
  }

  /** Recompute and show suggestions based on current input. */
  private static _updateSuggestions(): void {
    const input = DevConsole._inputEl.value;
    const result = DevConsole._getCompletionsForInput(input);
    DevConsole._currentSuggestions = result.completions;
    DevConsole._currentSuggestionDescriptions = result.descriptions;
    DevConsole._currentArgIndex = result.argIndex;
    DevConsole._currentArgDef = result.argDef;
    DevConsole._currentCommand = result.command;
    DevConsole._suggestionIndex = -1;
    DevConsole._renderSuggestions();
    DevConsole._renderHintOverlay();
  }

  /** Render the suggestions dropdown. */
  private static _renderSuggestions(): void {
    const el = DevConsole._suggestionsEl;
    if (DevConsole._currentSuggestions.length === 0) {
      // If we have an argDef but no completions, show a hint for what to type
      if (DevConsole._currentArgDef && DevConsole._currentCommand) {
        el.style.display = 'block';
        el.innerHTML = '';
        const hintItem = document.createElement('div');
        hintItem.className = 'dev-console-suggestion-hint';
        const argName = DevConsole._currentArgDef.optional
          ? `[${DevConsole._currentArgDef.name}]`
          : `<${DevConsole._currentArgDef.name}>`;
        hintItem.textContent = `${argName}${DevConsole._currentArgDef.description ? ' — ' + DevConsole._currentArgDef.description : ''}`;
        el.appendChild(hintItem);
        return;
      }
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }

    // Show at most 12 suggestions (more room for context)
    const maxVisible = 12;
    const visible = DevConsole._currentSuggestions.slice(0, maxVisible);
    el.style.display = 'block';
    el.innerHTML = '';

    for (let i = 0; i < visible.length; i++) {
      const item = document.createElement('div');
      item.className = 'dev-console-suggestion';
      if (i === DevConsole._suggestionIndex) {
        item.classList.add('active');
      }
      item.setAttribute('data-value', visible[i]);

      // Two-part layout: completion text + description
      const textSpan = document.createElement('span');
      textSpan.className = 'dev-console-suggestion-text';
      textSpan.textContent = visible[i];
      item.appendChild(textSpan);

      const desc = DevConsole._currentSuggestionDescriptions[i];
      if (desc) {
        const descSpan = document.createElement('span');
        descSpan.className = 'dev-console-suggestion-desc';
        descSpan.textContent = desc;
        item.appendChild(descSpan);
      }

      el.appendChild(item);
    }

    // If we have more than maxVisible, show a count
    if (DevConsole._currentSuggestions.length > maxVisible) {
      const more = document.createElement('div');
      more.className = 'dev-console-suggestion-more';
      more.textContent = `...and ${DevConsole._currentSuggestions.length - maxVisible} more (Tab to complete)`;
      el.appendChild(more);
    }
  }

  /** Render the inline hint overlay showing command syntax with current arg highlighted. */
  private static _renderHintOverlay(): void {
    const overlay = DevConsole._hintOverlay;
    const input = DevConsole._inputEl.value.trimStart();

    if (!input) {
      overlay.style.display = 'none';
      return;
    }

    const spaceIdx = input.indexOf(' ');
    const cmdName = spaceIdx === -1 ? input.toLowerCase() : input.substring(0, spaceIdx).toLowerCase();
    const entry = DevConsole._commands.get(cmdName);

    if (!entry || !entry.args || entry.args.length === 0) {
      overlay.style.display = 'none';
      return;
    }

    // Build the hint: command name + arg slots, highlight current
    // Use the cached arg index from the last _updateSuggestions call
    const argIndex = DevConsole._currentArgIndex >= 0
      ? DevConsole._currentArgIndex
      : (spaceIdx === -1 ? 0 : DevConsole._getCurrentArgIndex(input.substring(spaceIdx + 1)).argIndex);

    let html = `<span class="hint-cmd">${entry.name}</span> `;
    for (let i = 0; i < entry.args.length; i++) {
      const arg = entry.args[i];
      const bracket = arg.optional ? ['[', ']'] : ['<', '>'];
      const isCurrent = (i === argIndex || (argIndex >= entry.args.length && i === entry.args.length - 1 && arg.optional));
      if (isCurrent) {
        html += `<span class="hint-arg-current">${bracket[0]}${arg.name}${bracket[1]}</span>`;
      } else {
        html += `<span class="hint-arg">${bracket[0]}${arg.name}${bracket[1]}</span>`;
      }
    }

    overlay.innerHTML = html;
    overlay.style.display = 'block';
  }

  /** Hide the suggestions dropdown. */
  private static _hideSuggestions(): void {
    DevConsole._suggestionsEl.style.display = 'none';
    DevConsole._suggestionsEl.innerHTML = '';
    DevConsole._currentSuggestions = [];
    DevConsole._currentSuggestionDescriptions = [];
    DevConsole._suggestionIndex = -1;
    DevConsole._currentArgIndex = -1;
    DevConsole._currentArgDef = null;
    DevConsole._currentCommand = null;
    DevConsole._hintOverlay.style.display = 'none';
  }

  /** Apply a selected suggestion to the input. */
  private static _applySuggestion(value: string): void {
    const input = DevConsole._inputEl.value;
    const trimmed = input.trimStart();
    const spaceIdx = trimmed.indexOf(' ');

    if (spaceIdx === -1) {
      // Replacing command name portion
      DevConsole._inputEl.value = value + ' ';
    } else {
      // We need to replace the current argument token only
      const cmdPrefix = trimmed.substring(0, spaceIdx + 1); // "command "
      const argsStr = trimmed.substring(spaceIdx + 1);
      const { argIndex } = DevConsole._getCurrentArgIndex(argsStr);
      const tokens = DevConsole._tokenizeArgs(argsStr);

      // Rebuild the args: replace token at argIndex with the selected value
      const newTokens = [...tokens];
      // If the argIndex is beyond current tokens, we're adding a new one
      while (newTokens.length <= argIndex) {
        newTokens.push('');
      }
      newTokens[argIndex] = value;

      // Check if this arg value contains a comma (position arg) — don't add trailing space
      const isPositionArg = value.includes(',');
      const suffix = isPositionArg ? '' : ' ';

      DevConsole._inputEl.value = cmdPrefix + newTokens.join(' ') + suffix;
    }

    DevConsole._hideSuggestions();
    DevConsole._inputEl.focus();
    // Move cursor to end
    DevConsole._inputEl.setSelectionRange(DevConsole._inputEl.value.length, DevConsole._inputEl.value.length);
    // Trigger new suggestions for next arg
    DevConsole._updateSuggestions();
  }

  /** Tab key autocomplete: complete to common prefix or cycle through suggestions. */
  private static _autoComplete(): void {
    const input = DevConsole._inputEl.value;
    const result = DevConsole._getCompletionsForInput(input);
    const completions = result.completions;

    if (completions.length === 0) return;

    if (completions.length === 1) {
      DevConsole._applySuggestion(completions[0]);
      return;
    }

    // Multiple matches — if we're already cycling, go to next
    if (DevConsole._suggestionIndex >= 0 && DevConsole._suggestionIndex < completions.length - 1) {
      DevConsole._suggestionIndex++;
      DevConsole._renderSuggestions();
      // Also apply the selected suggestion so the user can see it
      const selected = completions[DevConsole._suggestionIndex];
      if (selected) DevConsole._applySuggestion(selected);
      return;
    }

    // Find the common prefix
    const commonPrefix = DevConsole._commonPrefix(completions);
    const trimmed = input.trimStart();
    const spaceIdx = trimmed.indexOf(' ');

    if (commonPrefix && commonPrefix.length > 0) {
      if (spaceIdx === -1) {
        DevConsole._inputEl.value = commonPrefix;
      } else {
        // Replace only the current arg token with the common prefix
        const cmdPrefix = trimmed.substring(0, spaceIdx + 1);
        const argsStr = trimmed.substring(spaceIdx + 1);
        const { argIndex } = DevConsole._getCurrentArgIndex(argsStr);
        const tokens = DevConsole._tokenizeArgs(argsStr);
        const newTokens = [...tokens];
        while (newTokens.length <= argIndex) {
          newTokens.push('');
        }
        newTokens[argIndex] = commonPrefix;
        DevConsole._inputEl.value = cmdPrefix + newTokens.join(' ');
      }
    }

    // Show all matches
    DevConsole._currentSuggestions = completions;
    DevConsole._currentSuggestionDescriptions = result.descriptions;
    DevConsole._suggestionIndex = -1;
    DevConsole._renderSuggestions();
    DevConsole._scrollToBottom();
  }

  /** Find the longest common prefix among an array of strings. */
  private static _commonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    if (strings.length === 1) return strings[0];
    let prefix = strings[0] ?? '';
    for (let i = 1; i < strings.length; i++) {
      const s = strings[i] ?? '';
      let j = 0;
      while (j < prefix.length && j < s.length && prefix[j] === s[j]) {
        j++;
      }
      prefix = prefix.substring(0, j);
      if (!prefix) break;
    }
    return prefix;
  }

  // ---- Execution & history -------------------------------------------------

  private static _executeCurrentLine(): void {
    const raw = DevConsole._inputEl.value.trim();
    DevConsole._inputEl.value = '';

    if (!raw) return;

    // Add to history
    DevConsole._history.push(raw);
    DevConsole._historyIndex = DevConsole._history.length;

    // Echo the command
    DevConsole._appendOutput(`> ${raw}`, 'input');

    // Parse: first token is command name, rest is args string
    const spaceIdx = raw.indexOf(' ');
    const cmdName = (spaceIdx === -1 ? raw : raw.substring(0, spaceIdx)).toLowerCase();
    const args = spaceIdx === -1 ? '' : raw.substring(spaceIdx + 1);

    const entry = DevConsole._commands.get(cmdName);
    if (!entry) {
      DevConsole.error(`Unknown command: "${cmdName}". Type "help" for a list.`);
      return;
    }

    try {
      const result = entry.handler(args);
      // Handle both sync and async command handlers
      if (result instanceof Promise) {
        void result.then((val) => {
          if (typeof val === 'string' && val.length > 0) {
            DevConsole.log(val);
            DevConsole._scrollToBottom();
          }
        }).catch((err) => {
          DevConsole.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        });
      } else if (typeof result === 'string' && result.length > 0) {
        DevConsole.log(result);
      }
    } catch (err) {
      DevConsole.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    DevConsole._scrollToBottom();
  }

  private static _navigateHistory(direction: -1 | 1): void {
    if (DevConsole._history.length === 0) return;

    const newIndex = DevConsole._historyIndex + direction;
    if (newIndex < 0 || newIndex > DevConsole._history.length) return;

    DevConsole._historyIndex = newIndex;

    if (newIndex === DevConsole._history.length) {
      DevConsole._inputEl.value = '';
    } else {
      DevConsole._inputEl.value = DevConsole._history[newIndex] ?? '';
    }
    DevConsole._suggestionIndex = -1;
    DevConsole._updateSuggestions();
  }

  private static _appendOutput(text: string, type: 'log' | 'error' | 'input'): void {
    const line = document.createElement('div');
    line.className = `dev-console-line dev-console-${type}`;
    line.textContent = text;
    DevConsole._outputEl.appendChild(line);

    // Cap at 500 lines to prevent unbounded growth
    while (DevConsole._outputEl.childElementCount > 500) {
      DevConsole._outputEl.firstChild!.remove();
    }
  }

  private static _scrollToBottom(): void {
    DevConsole._outputEl.scrollTop = DevConsole._outputEl.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // Ground-snapping helper — shared by loadmodel & spawn
  // ---------------------------------------------------------------------------

  /**
   * Compute a spawn position. If `explicitX/Y/Z` are all given, use those
   * (Y is raycast-snapped to ground). If no position is given, spawn 10 units
   * in front of the player, snapped to the ground.
   */
  private static _resolveSpawnPosition(
    explicitX?: number,
    explicitY?: number,
    explicitZ?: number,
  ): Vec3 | null {
    const app = DevConsole._app;
    const player = DevConsole.getPlayer();

    // Determine XZ
    let x: number;
    let z: number;

    if (explicitX !== undefined && explicitZ !== undefined) {
      x = explicitX;
      z = explicitZ;
    } else if (player) {
      // 10 units in front of the player
      const pos = player.getPosition();
      const fwd = player.getCameraEntity().forward;
      x = pos.x + fwd.x * 10;
      z = pos.z + fwd.z * 10;
    } else {
      DevConsole.error('No player reference and no position given. Cannot determine spawn location.');
      return null;
    }

    // Try to raycast to ground for Y
    let y = explicitY ?? 0;
    const rigidbodySystem = app
      ? (app.systems as { rigidbody?: { raycastFirst?: (s: Vec3, e: Vec3) => { point?: Vec3; entity?: any } | null } }).rigidbody
      : undefined;

    if (rigidbodySystem && typeof rigidbodySystem.raycastFirst === 'function') {
      const rayStart = new Vec3(x, 5000, z);
      const rayEnd = new Vec3(x, -5000, z);
      const hit = rigidbodySystem.raycastFirst(rayStart, rayEnd);
      if (hit?.point && Number.isFinite(hit.point.y)) {
        // Check if the hit entity has the "ground" tag
        let hasGroundTag = false;
        let entity: any = hit.entity;
        while (entity) {
          if (entity.tags?.has('ground')) {
            hasGroundTag = true;
            break;
          }
          entity = entity.parent;
        }
        if (hasGroundTag) {
          y = hit.point.y + 0.1; // small clearance
        } else if (explicitY === undefined) {
          // No ground tag on hit — fall back to hit Y anyway (better than 0)
          y = hit.point.y + 0.1;
        }
      }
    } else if (explicitY === undefined) {
      // No physics system — estimate from player ground height
      if (player) {
        const state = player.getDebugState();
        y = state.groundHeight + 0.1;
      }
    }

    return new Vec3(x, y, z);
  }

  /** Parse "x,y,z" from a single arg string. Returns undefined if invalid. */
  private static _parsePositionArg(args: string): { x: number; y: number; z: number } | undefined {
    const parts = args.split(',').map(s => s.trim());
    if (parts.length !== 3) return undefined;
    const [xs, ys, zs] = parts;
    const x = parseFloat(xs);
    const y = parseFloat(ys);
    const z = parseFloat(zs);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
    return { x, y, z };
  }

  // -----------------------------------------------------------------------
  // Built-in commands
  // -----------------------------------------------------------------------

  private static _registerBuiltinCommands(): void {
    // ---- help ----
    DevConsole.register('help', 'List all commands, or get help on one command', (args) => {
      if (args) {
        const entry = DevConsole._commands.get(args.toLowerCase());
        if (!entry) return `Unknown command: "${args}"`;
        let text = ` ${entry.name}`;
        if (entry.hint) text += ` ${entry.hint}`;
        text += `\n ${entry.description}`;
        if (entry.args && entry.args.length > 0) {
          text += '\n\n Arguments:';
          for (const arg of entry.args) {
            const bracket = arg.optional ? '[' : '<';
            const bracketEnd = arg.optional ? ']' : '>';
            text += `\n   ${bracket}${arg.name}${bracketEnd}${arg.description ? ' — ' + arg.description : ''}`;
          }
        }
        return text;
      }
      const lines: string[] = ['Available commands:', ''];
      const sorted = [...DevConsole._commands.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const cmd of sorted) {
        let line = ` ${cmd.name}`;
        if (cmd.hint) line += ` ${cmd.hint}`;
        line += ` — ${cmd.description}`;
        lines.push(line);
      }
      lines.push('');
      lines.push('Use Tab to autocomplete. Up/Down for suggestions. Shift+Up/Down for history. Esc to close.');
      return lines.join('\n');
    }, {
      hint: '[command]',
      args: [
        { name: 'command', optional: true, description: 'Command name to get help for', completions: () => [...DevConsole._commands.keys()].sort() },
      ],
      completions: () => [...DevConsole._commands.keys()].sort(),
    });

    // ---- clear ----
    DevConsole.register('clear', 'Clear the console output', () => {
      DevConsole._outputEl.replaceChildren();
    });

    // ---- god ----
    DevConsole.register('god', 'Toggle god mode (invincibility)', () => {
      DevConsole._godMode = !DevConsole._godMode;
      (globalThis as any).__devConsoleGodMode = DevConsole._godMode;
      return DevConsole._godMode ? 'God mode ON' : 'God mode OFF';
    });

    // ---- heal ----
    DevConsole.register('heal', 'Fully heal the player', () => {
      const player = DevConsole.getPlayer();
      if (!player) return 'No player in current scene';
      player.revive(player.getPosition());
      return `Player healed to full`;
    });

    // ---- scene ----
    DevConsole.register('scene', 'Change scene: -2=title, 0=globe, 666=death, 777=victory, or any battle ID', (args) => {
      const num = parseInt(args, 10);
      if (!Number.isFinite(num)) {
        return 'Usage: scene <number> (-2=title, 0=globe, 666=death, 777=victory)';
      }
      const canvas = DevConsole._app?.graphicsDevice.canvas as HTMLCanvasElement | undefined;
      if (!canvas || !DevConsole._app) {
        return 'No app reference available';
      }
      void changeScene(canvas, DevConsole._app, num);
      return `Changing to scene ${num}...`;
    }, {
      hint: '<sceneNumber>',
      args: [
        { name: 'sceneNumber', description: '-2=title, 0=globe, 666=death, 777=victory, 888=end game, or battle ID', completions: ['-2', '0', '666', '777', '888'] },
      ],
    });

    // ---- pos ----
    DevConsole.register('pos', 'Print player position and camera direction', () => {
      const player = DevConsole.getPlayer();
      if (!player) return 'No player in current scene';
      const state = player.getDebugState();
      return `pos: (${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)}, ${state.position.z.toFixed(2)})\nfwd: (${state.forward.x.toFixed(2)}, ${state.forward.y.toFixed(2)}, ${state.forward.z.toFixed(2)})\nhealth: ${state.health}/${state.maxHealth}\nweapon: ${state.weapon}`;
    });

    // ---- npcs ----
    DevConsole.register('npcs', 'List NPCs and their health state', () => {
      const npcs = DevConsole._npcs;
      if (npcs.length === 0) return 'No NPCs registered in current scene';
      const lines: string[] = [`${npcs.length} NPC(s):`];
      for (const n of npcs) {
        const pos = n.getEntity().getPosition();
        const alive = n.isAlive();
        lines.push(
          ` #${n.getId()} [${n.getTeam()}] ${alive ? 'ALIVE' : 'DEAD'} hp=${n.getHealth()}/${n.getMaxHealth()} pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`,
        );
      }
      return lines.join('\n');
    });

    // ---- killall ----
    DevConsole.register('killall', 'Kill all enemy NPCs (foes)', () => {
      const foes = DevConsole._npcs.filter((n) => n.getTeam() === 'foe' && n.isAlive());
      for (const foe of foes) {
        foe.takeDamage(foe.getMaxHealth());
      }
      return `Killed ${foes.length} enemy NPC(s)`;
    });

    // ---- weapon ----
    DevConsole.register('weapon', 'Equip a weapon: 1=sword, 2=gun, 3=bow, 4=old gun', (args) => {
      const player = DevConsole.getPlayer();
      if (!player) return 'No player in current scene';
      const slot = parseInt(args, 10) as 1 | 2 | 3 | 4;
      if (slot < 1 || slot > 4 || !Number.isFinite(slot)) {
        return 'Usage: weapon <1|2|3|4> (1=sword, 2=gun, 3=bow, 4=old gun)';
      }
      player.equipWeapon(slot);
      return `Equipped ${player.getEquippedWeaponName()}`;
    }, {
      hint: '<1|2|3|4>',
      args: [
        { name: 'slot', description: '1=sword, 2=gun, 3=bow, 4=old gun', completions: ['1', '2', '3', '4'] },
      ],
      completions: ['1', '2', '3', '4'],
    });

    // ---- boss ----
    DevConsole.register('boss', 'Show active boss info or damage the boss', (args) => {
      const boss = Boss.getActiveBoss();
      if (!boss) return 'No active boss in current scene';
      if (!args) {
        const pos = boss.getEntity().getPosition();
        return `Boss: "${boss.getTitle()}"\nHP: ${boss.getHealth()}/${boss.getMaxHealth()}\nState: ${boss.isAlive() ? 'ALIVE' : 'DEAD'}\nPos: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
      }
      const dmg = parseInt(args, 10);
      if (!Number.isFinite(dmg) || dmg <= 0) return 'Usage: boss [damage] — leave empty for info, or pass a damage number';
      boss.takeDamage(dmg);
      return `Dealt ${dmg} damage to "${boss.getTitle()}" (HP: ${boss.getHealth()}/${boss.getMaxHealth()})`;
    }, {
      hint: '[damage]',
      args: [
        { name: 'damage', optional: true, description: 'Damage to deal (leave empty for info)' },
      ],
    });

    // ---- fly ----
    DevConsole.register('fly', 'Toggle fly mode (disable gravity, move freely with Space/Shift)', () => {
      const player = DevConsole.getPlayer();
      if (!player) return 'No player in current scene';
      const controller = player.getCameraController();
      if (!controller) return 'No camera controller available';
      DevConsole._flyMode = !DevConsole._flyMode;
      if ('devFlyMode' in controller) {
        (controller as unknown as Record<string, unknown>).devFlyMode = DevConsole._flyMode;
      }
      return DevConsole._flyMode ? 'Fly mode ON (Space=up, Shift=down)' : 'Fly mode OFF';
    });

    // ---- timescale ----
    DevConsole.register('timescale', 'Set the app time scale (1=normal, 0.5=half, 2=double)', (args) => {
      const app = DevConsole._app;
      if (!app) return 'No app reference available';
      const scale = parseFloat(args);
      if (!Number.isFinite(scale) || scale <= 0) {
        return `Usage: timescale <number> (current: ${app.timeScale})`;
      }
      app.timeScale = scale;
      return `Time scale set to ${scale}`;
    }, {
      hint: '<scale>',
      args: [
        { name: 'scale', description: 'Time multiplier (1=normal, 0.5=half, 2=double)', completions: ['0.25', '0.5', '1', '2', '4'] },
      ],
    });

    // ---- echo ----
    DevConsole.register('echo', 'Print text back to the console', (args) => {
      return args || '';
    }, {
      hint: '<text>',
      args: [
        { name: 'text', description: 'Text to echo back' },
      ],
    });

    // ---- exec ----
    DevConsole.register('exec', 'Run arbitrary JavaScript (dangerous)', (args) => {
      if (!args) return 'Usage: exec <javascript expression>';
      try {
        const result = new Function(`return (${args})`)();
        return String(result);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }, {
      hint: '<expression>',
      args: [
        { name: 'expression', description: 'JavaScript expression to evaluate' },
      ],
    });

    // ---- noclip ----
    DevConsole.register('noclip', 'Toggle noclip (alias for fly mode — disable gravity, move freely)', () => {
      DevConsole._flyMode = !DevConsole._flyMode;
      const player = DevConsole.getPlayer();
      if (player) {
        const controller = player.getCameraController();
        if (controller && 'devFlyMode' in controller) {
          (controller as unknown as Record<string, unknown>).devFlyMode = DevConsole._flyMode;
        }
      }
      return DevConsole._flyMode ? 'Noclip ON (Space=up, Shift=down)' : 'Noclip OFF';
    });

    // ---- kill ----
    DevConsole.register('kill', 'Kill the player (deal lethal damage)', () => {
      const player = DevConsole.getPlayer();
      if (!player) return 'No player reference available';
      player.takeDamage(player.getHealth());
      return 'Player killed';
    });

    // ---- give ----
    DevConsole.register('give', 'Give/equip a weapon: sword=1, gun=2, bow=3, old gun=4', (args) => {
      const player = DevConsole.getPlayer();
      if (!player) return 'No player reference available';
      const nameMap: Record<string, 1 | 2 | 3 | 4> = {
        sword: 1, gun: 2, bow: 3, 'old gun': 4,
      };
      const slot = nameMap[args.trim().toLowerCase()];
      if (!slot) return 'Usage: give <weapon> (sword, gun, bow, old gun)';
      player.equipWeapon(slot);
      return `Equipped weapon slot ${slot}`;
    }, {
      hint: '<weaponName>',
      args: [
        { name: 'weaponName', description: 'Weapon to equip', completions: ['sword', 'gun', 'bow', 'old gun'] },
      ],
      completions: ['sword', 'gun', 'bow', 'old gun'],
    });

    // ---- lockround ----
    DevConsole.register('lockround', 'Prevent a level from ending', () => {
      if (DevConsole._roundLock) {
        DevConsole._roundLock = false;
        return 'Round end prevention DISABLED';
      } else {
        DevConsole._roundLock = true;
        return 'Round end prevention ENABLED';
      }
    });

    // ======================================================================
    // loadmodel — loads a 3D model at an optional position
    // Usage: loadmodel <modelPath> [x,y,z]
    // If no position: spawns 10 units in front of the player, on ground
    // If position given: Y is ground-snapped (raycasted)
    // ======================================================================
    DevConsole.register('loadmodel', 'Load a 3D model at a position (default: 10 units in front of player, on ground)', async (args) => {
      const app = DevConsole._app;
      if (!app) return 'No app reference available';

      // Parse args: "modelPath" or "modelPath x,y,z"
      const parts = args.trim().split(/\s+/);
      if (parts.length < 1 || !parts[0]) {
        return 'Usage: loadmodel <modelPath> [x,y,z]\nExample: loadmodel models/npc/MongolHorseman.glb\nExample: loadmodel models/npc/MongolHorseman.glb 10,0,5';
      }

      const modelPath = parts[0];
      let explicitPos: { x: number; y: number; z: number } | undefined;

      if (parts.length >= 2) {
        explicitPos = DevConsole._parsePositionArg(parts.slice(1).join(' '));
        if (!explicitPos) {
          return 'Invalid position format. Use: loadmodel <modelPath> x,y,z\nExample: loadmodel models/npc/MongolHorseman.glb 10,0,5';
        }
      }

      const spawnPos = DevConsole._resolveSpawnPosition(
        explicitPos?.x,
        explicitPos?.y,
        explicitPos?.z,
      );
      if (!spawnPos) return 'Could not determine spawn position. No player and no position given.';

      try {
        await loadModel(modelPath, app, {
          rigidbodyType: 'dynamic',
          mass: 1,
          autoCollision: true,
          position: spawnPos,
          rotation: new Vec3(0, 0, 0),
          scale: new Vec3(1, 1, 1),
        });
        return `Model loaded: "${modelPath}" at (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`;
      } catch (err) {
        return `Failed to load model "${modelPath}": ${err instanceof Error ? err.message : String(err)}`;
      }
    }, {
      args: [
        {
          name: 'modelPath',
          description: 'Path to .glb model (e.g. models/npc/MongolHorseman.glb)',
          completions: (partial) => {
            const lower = partial.toLowerCase();
            return MODEL_PATH_ALIASES.filter(p => p.toLowerCase().startsWith(lower));
          },
        },
        {
          name: 'x,y,z',
          optional: true,
          description: 'Spawn position (default: 10 units in front of player, on ground)',
        },
      ],
    });

    // ======================================================================
    // spawn — spawns an NPC of a given type at an optional position
    // Usage: spawn <npcType> [x,y,z]
    // If no position: spawns 10 units in front of the player, on ground
    // If position given: Y is ground-snapped (raycasted)
    // ======================================================================
    DevConsole.register('spawn', 'Spawn an NPC type at a position (default: 10 units in front of player, on ground)', async (args) => {
      const app = DevConsole._app;
      if (!app) return 'No app reference available';

      // Parse args: "npcType" or "npcType x,y,z"
      const parts = args.trim().split(/\s+/);
      if (parts.length < 1 || !parts[0]) {
        return 'Usage: spawn <npcType> [x,y,z]\nExample: spawn mongol\nExample: spawn genghisKhan 10,0,5\nAvailable types: ' + NPC_TYPE_KEYS.join(', ');
      }

      const npcType = parts[0].toLowerCase();
      if (!NPC_TYPE_MODEL_PATHS[npcType]) {
        return `Unknown NPC type: "${npcType}"\nAvailable types: ${NPC_TYPE_KEYS.join(', ')}`;
      }

      let explicitPos: { x: number; y: number; z: number } | undefined;
      if (parts.length >= 2) {
        explicitPos = DevConsole._parsePositionArg(parts.slice(1).join(' '));
        if (!explicitPos) {
          return 'Invalid position format. Use: spawn <npcType> x,y,z\nExample: spawn mongol 10,0,5';
        }
      }

      const spawnPos = DevConsole._resolveSpawnPosition(
        explicitPos?.x,
        explicitPos?.y,
        explicitPos?.z,
      );
      if (!spawnPos) return 'Could not determine spawn position. No player and no position given.';

      // Build a spawn point for the sceneNpcSystem
      const spawnPoint: NpcSpawnPoint = {
        id: 9000 + Math.floor(Math.random() * 999),
        team: 'foe',
        x: spawnPos.x,
        z: spawnPos.z,
        type: npcType,
        maxHealth: 100,
      };

      // Get the rigidbody system for ground snapping
      const rigidbodySystem = (app.systems as { rigidbody?: any }).rigidbody;

      try {
        const newNpcs = await spawnSceneNpcs(app, rigidbodySystem, [spawnPoint], {
          ...DEFAULT_BATTLE_NPC_SPAWN_OPTIONS,
          playerSafeRadius: 0, // Don't skip — user explicitly asked for this position
        });

        // Register new NPCs with the console
        if (newNpcs.length > 0) {
          DevConsole._npcs.push(...newNpcs);
          const npcEntity = newNpcs[0]!;
          const pos = npcEntity.getEntity().getPosition();
          return `Spawned "${npcType}" at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
        } else {
          return `Spawn system returned no NPCs for type "${npcType}"`;
        }
      } catch (err) {
        return `Failed to spawn NPC "${npcType}": ${err instanceof Error ? err.message : String(err)}`;
      }
    }, {
      args: [
        {
          name: 'npcType',
          description: 'NPC type to spawn',
          completions: (partial) => {
            const lower = partial.toLowerCase();
            return NPC_TYPE_KEYS.filter(k => k.toLowerCase().startsWith(lower));
          },
        },
        {
          name: 'x,y,z',
          optional: true,
          description: 'Spawn position (default: 10 units in front of player, on ground)',
        },
      ],
    });

    DevConsole.register('setSecretsFound', 'Set the number of secrets found', (count) => {
      setSecretsFound(parseInt(count, 10));
      return `Set secrets found to ${count}`;
    });

    DevConsole.register('resetSecretsFound', 'Reset the number of secrets found', () => {
      resetSecretsFound();
      return `Reset secrets found. Secrets found: ${getSecretsFound()}`;
    });

    DevConsole.register("unlockAllSecrets", "Unlock all secrets", () => {
      setSecretsFound(21);
      return `All ${getSecretsFound()} secrets unlocked`;
    });

    // ---- skipToSecretBoss ----
    DevConsole.register('skipToSecretBoss', 'Mark all non-secret battles complete and show the end-game screen', () => {
      markAllNonSecretComplete();
      const canvas = DevConsole._app?.graphicsDevice.canvas as HTMLCanvasElement | undefined;
      if (!canvas || !DevConsole._app) return 'No app reference available';
      changeScene(canvas, DevConsole._app, 888);
      return 'All battles marked complete. Taking you to the end-game screen...';
    });

    // ---- exit ----
    DevConsole.register('exit', 'Close the dev console', () => {
      DevConsole.toggle();
      return '';
    });
  }

  /** God mode flag — checked by damage handlers. */
  static _godMode = false;

  /** Fly mode flag — checked by FirstPersonCamera. */
  static _flyMode = false;

  static _roundLock = false; // flag to prevent the round from ending
}

// Expose on window for quick browser-console access: DevConsole.toggle()
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['DevConsole'] = DevConsole;
}
