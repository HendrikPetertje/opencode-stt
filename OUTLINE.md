# OUTLINE (for AI agents)

Read this before changing the plugin. It explains how the files fit together,
the flows, and the traps. User docs are in `README.md`.

## What it is

An OpenCode **V2** plugin (`@opencode/plugin` 2.3.x) with two halves loaded from
one package (`package.json` `exports`: `.` -> `index.ts`, `./tui` -> `tui.tsx`).
Speech-to-text only; there is no text-to-speech.

- **TUI half** (`tui.tsx` -> `src/tui/`): records with `sox`, transcribes with
  `whisper-cli`, puts the text into the prompt, keeps the list of recordings, and
  draws the sidebar widget, the bottom-bar recording status and the modal (recordings + settings).
  It gets **no plugin options and no server state**.
- **Server half** (`index.ts` -> `src/server/`): serves the plugin options over
  RPC and cleans up a transcript with a model from the user's own providers
  (`normalize`). It is the only part that can call models and see prices.

The halves talk only through the RPC contract in `src/rpc.ts` and the types in
`src/shared/protocol.ts`.

Registered in `~/.config/opencode/opencode.jsonc` as
`{ "package": "./configured-plugins/opencode-stt", "options": { "model": "provider/model", ... } }`.
It lives in `configured-plugins/`, not `plugins/`: OpenCode auto-loads every
directory under `plugins/` **without options**. Not in `cli.json`: the `./tui`
export is loaded from the same entry (this is how auto-mode and agent-dashboard
work). The structure follows agent-dashboard's.

Derived from [renjfk/opencode-voice](https://github.com/renjfk/opencode-voice)
(MIT, Soner Koksal): `engine/recorder.ts`, `shared/audio.ts`, `shared/whisper.ts`
and `shared/prompt.ts` are adapted from it. Keep the attribution in `LICENSE`.

## Data flow

```
            TUI process (Solid + OpenTUI)                         server process (Bun)
┌──────────────────────────────────────────────────┐        ┌──────────────────────────────┐
│ commands ─▶ pipeline ─▶ engine/recorder ─▶ sox    │        │ index.ts                     │
│              │   │                                │        │  ├─ config RPC ─▶ Options    │
│              │   └──▶ engine/transcribe ─▶ whisper-cli      │  └─ normalize RPC            │
│              │                                    │  RPC   │      │                       │
│              ├──▶ rpc.normalize(session, model, text) ────▶│      ▼                       │
│              │                                    │        │  normalizer.ts               │
│              │◀─ { text, alternatives, summary, usage } ◀──│   ├─ session.generate (+2 hooks) ─▶ provider
│              │                                    │        │   └─ generate.text (fallback)│
│              ▼                                    │        └──────────────────────────────┘
│  state ── durable stores: settings · cost · recordings
│        └─ memory store: phase · meter level · tabs · options
│              │
│              ├──▶ composer.insertIntoComposer ─▶ focused prompt textarea ◀── tabs (Tab swaps)
│              └──▶ ui: Sidebar · LiveRow · RecordingRow · Modal (recordings | settings) · TabBar
└──────────────────────────────────────────────────┘
```

Rules of thumb: only the server half can call models and see prices; only the
TUI half touches the microphone, the files and the prompt; `src/shared` is pure
and used by both; the architecture test (`src/architecture.test.ts`) keeps it so.

## Layout

```
index.ts          server entry: options, config + normalize RPC, normalizer (in a try block)
tui.tsx           TUI entry: composes src/tui, registers slots, cleanup
src/rpc.ts        the RPC contract (Stt: config, normalize)
src/shared/       pure code and types used by both halves
src/system/       Node-only helpers used by both halves: log.ts, paths.ts
src/server/       server only: normalizer.ts, prompt-file.ts
src/tui/          TUI only
  state.ts        stores (settings, cost, recordings), meter level, toasts, config loading, ticker
  pipeline.ts     record -> whisper -> normalize -> prompt; every outcome becomes a Recording; model download
  composer.ts     inserts text into the focused text input (the prompt); an Insertion can be swapped
  tabs.ts         the options tabs above the prompt: Tab swaps the text, dismissal rules
  actions.ts      the Actions interface the UI uses (open the modal, insert a recording)
  pickers.ts      the selection dialogs behind the settings rows
  commands.ts     the key layer (record, submit, cancel, open)
  engine/         Node processes and files, no Solid: recorder (sox stream, meter, trim, wav, plus the
                  wav cleanup: `sweepStale`, `removeOnExit`), transcribe,
                  download, devices, model-files, log-folder
  ui/             Solid components only: widgets.tsx (sidebar + live row + footer recording status + idle icon), recording-row.tsx,
                  modal.tsx (shell), recordings-view.tsx, settings-view.tsx, tab-bar.tsx, theme.ts
```

`src/shared/`: `options.ts` (plugin options, `parseModel`), `settings.ts`
(`Settings`, `ROWS`, `ACTIONS`, `PICKERS`, `toggle`, `changed`), `models.ts`
(whisper catalog, `findModel` with an injected `exists`), `cost.ts` (`CostTotal`,
`addUsage`, `addTranscript`, `formatUsd`, `prune`), `recording.ts` (`Recording`,
`REASON`, list helpers), `format.ts` (`clock`, `timeOfDay`, `clip`, `costLine`),
`whisper.ts` (args, language, output cleaning), `audio.ts` (sox args, pactl
parsing, and the pure audio maths: `pcmRms`, `levelOf`, `trimOffset`, `wavBytes`),
`text.ts` (`joinPrompt`), `prompt.ts` (system prompt, question, `splitAnswer`),
`protocol.ts` (`NormalizeInput`, `NormalizeReply`).

Import rules, enforced by `src/architecture.test.ts` (it fails with the
offending import):

- `shared` is pure: no `node:`, UI or `@opencode` imports, only itself.
- `system` uses only Node and itself.
- The server half never imports `src/tui`, `tui.tsx`, `.tsx` files or UI packages.
- The TUI half never imports `src/server`, `index.ts` or the server plugin API
  (`@opencode/plugin`, `@opencode/plugin/rpc`). `@opencode/plugin/tui` is fine.
- `engine` has no UI or OpenCode imports and knows only `shared` and `system`.
- `ui` components never import the process code (`recorder`, `transcribe`,
  `download`) or `node:child_process`. They get what they need through `State`,
  the `pickers` and `Actions`.
- `rpc.ts` imports only `@opencode/plugin/rpc`.
- Only the server half and `rpc.ts` use the server plugin API.

New code goes where the rules put it: logic without side effects in `shared`
(with a colocated `*.test.ts`), anything that spawns or reads files in
`engine`/`server`/`system`, anything that draws in `ui`.

## The recording flow (`src/tui/pipeline.ts`)

`createPipeline(state)` owns one `Recorder` (sox) and `target`, the session the
recording started in. **Every outcome is a `Recording`** (`shared/recording.ts`)
added to the session's list with `state.addRecording`: a success has `label` (the
normalizer's one or two word summary, `success` when normalization is off, `raw
text` when it failed), `text` and `raw`; a failure has a short `label` from
`REASON` (`too short`, `no speech`, `no audio`, `no model`, `whisper failed`,
`mic error`, plus `sox missing` / `whisper missing` from `missingTool()`) and the
full `detail`. **Nothing in the pipeline toasts**: the sidebar and the modal are
the feedback. Only things the user just asked for may toast (a download, a click
that could not insert, "Open a session first").

1. `record` (key): idle -> `start()`; recording -> `finish("prompt")`. `submit` ->
   `finish("send")`. `cancel` kills sox and drops the audio.
2. `start()`: needs a session route (else a toast, the one exception), `sox` and
   `whisper-cli` on PATH, and the selected whisper model on disk; otherwise a
   failed `Recording` and no recording. Sets phase `recording`.
3. The recorder (`engine/recorder.ts`) runs `sox <input> -t raw -r 16000 -c 1 -b 16
   -e signed-integer -` and reads stdout itself: per chunk it computes the RMS
   (`pcmRms`) for the volume meter (`state.pushLevel`, throttled, with decay) and
   keeps the chunk in memory. An odd trailing byte is carried to the next chunk.
4. `finish()`: phase `transcribing`; `recorder.stop()` (SIGINT so sox flushes,
   SIGKILL after 2 s), then the trim: `trimOffset` starts one chunk before the
   first one above `ONSET_RMS`, and a recording that is quiet throughout is kept
   **whole** (so a soft voice never ends up empty). The wav is written (mode 0600)
   from the PCM. Less than `MIN_SECONDS` (1 s, whisper.cpp's minimum) after the
   trim -> `too short`. Then `transcribe()`; empty text -> `no speech`. **The wav is
   removed the moment `transcribe()` returns** (win or lose), before the LLM call:
   only the text is needed from here on.
5. `normalize()`: phase `normalizing`; RPC `normalize`. Success -> cleaned text,
   alternatives, summary and `usage` to `state.addCost`; any failure -> raw text, label
   `raw text`, the transcript is still counted (`addCost(…, "none")`).
6. `deliver(sessionID, [best, ...alternatives], how)`: `send` -> `client.session.prompt`
   with the best text; `prompt` -> `insertIntoComposer`, only while the route is still
   the session the recording started in, and then `tabs.show` with all the options. The
   `Recording` is stored with `inserted` = whether that worked, then the phase goes
   back to `idle` (in `finally`, so the live row collapses as the recording appears).
   `finally` also removes the wav again: a no-op on the normal path, but it covers a
   throw between writing the file and transcribing. Beyond the pipeline: `removeOnExit`
   (a `process` exit hook) and `sweepStale()` at start, see State.

There is **no plugin API to write into the composer** (V2 2.3: `tui.prompt.append`
is an event type with no publisher). `composer.ts` therefore takes
`context.renderer.currentFocusedRenderable` and, when it has `insertText`
(OpenTUI's `EditBufferRenderable`, which the prompt textarea is), inserts the
text at the cursor, with a leading space (`shared/text.ts` `joinPrompt`) when the
prompt already has text. This relies on **no dialog having taken focus**: that is
why the flow opens none, and why inserting from the modal closes it first and
waits 80 ms (`recordings-view.tsx`; the 80 ms is a guess that needs checking in a
running OpenCode). It is duck-typed on purpose (no OpenTUI import). If OpenCode
adds a real composer API, replace `composer.ts` with it. A paste
(`renderer.keyInput.processPaste`) was rejected: OpenCode's prompt may fold long
pastes into a `[Pasted …]` chip you can't edit inline.

Phases: `idle | recording | transcribing | normalizing`, in the memory store;
`setPhase` stamps `startedAt` and zeroes the meter.

## The normalize call (`src/server/normalizer.ts`)

Same approach as auto-mode's reviewer, see its OUTLINE for the background.

- **Preferred: `ctx.session.generate({ sessionID, prompt })`**: a transient call
  on the user's session (no new session, nothing in history) that returns
  `text`, `cost` and `tokens`. The prompt ends with `[stt <nonce>]`.
  - `experimental.model.resolve` hook (kind `generate`, session has a pending
    call): swaps in the normalizer model. It can only pick a model from the
    session's own provider; otherwise it marks the call `mismatch`.
  - `generate` hook: when the last message ends with a pending nonce, replaces
    `system` with the normalization prompt, keeps **only that last message** (no
    conversation reaches the normalizer), clears `tools`, sets `maxTokens` (1 on
    a mismatch, to waste as little as possible).
  - The answer is trusted only if the `generate` hook marked the entry `shaped`.
- **Fallback: `generate.text`** with system + question in one prompt. Used for
  `session + provider` pairs in `textOnly` (a mismatch was seen) and for the
  rest of the process once the session path failed or the hook did not run
  (`shared.broken`). It reports no cost: the reply has `usage: null` and the TUI
  records an unpriced call, which shows as a `+`.
- **One response carries everything.** The question (not the system prompt, so a
  custom `prompt` file still works and the system prompt stays cacheable) asks for:
  the best text; optionally up to `MAX_ALTERNATIVES` (2) alternative versions, each
  after a line `---ALT---`, only when the speech is genuinely ambiguous; and a last
  line `SUMMARY: <one or two words>`. `splitAnswer` strips fences, splits the
  summary off (two words, no punctuation, 24 characters), splits the body on the
  marker, and keeps alternatives that differ from the best text and each other
  beyond case, punctuation and spacing (`sameText`). Missing parts are fine: no
  summary -> label `success`, no marker -> no alternatives.
- The `NormalizeReply` is `{ text, alternatives, summary?, usage }` or `{ error }`. An
  empty answer is an error.
- `maxTokens` = `min(4096, 300 + 2 * transcript length)`: room for three versions.
- No `sessionID` in the input -> `generate.text` only.

All mutable state (`pending`, `textOnly`, `broken`, `counter`) lives on
`globalThis.__opencodeStt` and is shared by every plugin copy in the server
process: the server runs one copy per location and a new one on every hot reload,
hooks run in the session's copy, and the TUI's RPC can land in another. Create
new mutable state there too, and mutate it in place.

`index.ts` sets the normalizer up in a try block: if its hooks fail, the error is
logged, `config` still works, and `normalize` answers
`{ error: "The normalizer could not start; see the log" }`, so the TUI falls
back to raw text.

## State and where it lives

| State | Where | Notes |
|---|---|---|
| Plugin options | server (`parseOptions(ctx.options)`) | Reach the TUI through RPC `config`; the TUI keeps them in the memory store as `ui.options` |
| `settings` overrides | TUI `storage.store("settings")` (durable, synced) | Only keys the user changed. `settings()` = `defaults(ui.options)` + overrides, so an untouched setting follows the options |
| Cost per root session | TUI `storage.store("cost")` (durable) | `{ sessions: Record<rootID, CostTotal> }`, least recently used first, pruned to 200 |
| Recordings per root session | TUI `storage.store("recordings")` (durable) | `{ sessions: Record<rootID, Recording[]> }`, newest first, 50 per session, same pruning. Subagent sessions share their parent's list |
| Phase, meter level, spinner frame, sidebar count, download id, options | TUI `storage.memory("opencode-stt")` | Survives hot reloads, gone when the TUI exits |
| Recorder, target session | closures in `createPipeline` | |
| Options tabs | `ui.tabs` (`{ count, index, session }`, memory store) for drawing; the `Insertion`, the option texts and the watcher live in `createTabs` closures | Not persisted. After a hot reload an old store may lack `tabs`: read it as `ui.tabs?.…` |
| Normalizer state | `globalThis.__opencodeStt` | See above |
| The audio | memory while recording, then `os.tmpdir()/opencode-stt-<pid>.wav` (0600) | Deleted right after `transcribe()` returns (not after the LLM call), again in `finally`, and on cancel. `removeOnExit()` (a `process` `exit` hook, taken off again on dispose) covers quit and restart. **No SIGTERM/SIGHUP hooks on purpose**: a handler would stop the default termination unless it re-raised, which could get in the way of OpenCode's own exit handling. `sweepStale()` at start removes wavs of dead pids (kill -9, crash, power loss) and never touches a live pid's |
| Logs | `~/.local/state/opencode-stt/plugin.log` | Latest 1000 lines |

`resetSettings()` (the "Reset to defaults" row, `ACTIONS` in `shared/settings.ts`)
just empties `overrides`; `changedSettings()` diffs `settings()` against
`defaults(ui.options)` for the row's "n changed" text. Rows that are actions are
skipped by the pickers/toggles, and downloaded model files are not touched.

Why the TUI owns settings and cost instead of the server (as auto-mode does):
recording, whisper and the pickers are TUI-only, the normalizer model travels
in each `normalize` call, and the durable stores need no RPC round trips or
change events. The server stays stateless apart from the hook bookkeeping.

## TUI <-> server

| Method | Does | Called by |
|---|---|---|
| `config` | the parsed `Options` | `state.loadConfig()` at setup |
| `normalize {sessionID, model, text, title}` | `NormalizeReply` | `pipeline.normalize` |

- The TUI does not receive plugin options. `loadConfig` retries with a growing
  delay while the RPC is `rpc.unavailable` (the server registers it a moment
  after the TUI starts), up to 8 times. Until it succeeds the TUI runs on
  `parseOptions(undefined)` defaults. Key bindings read `ui.options` inside the
  keymap layer factory, so they update when the options arrive.
- RPC calls pass `{ location }` (`state.location()`), like memory-ticker and
  agent-dashboard.
- Cost is charged to the **root** session (`context.data.session.root`).
  Subagent sessions share their parent's total.

## The UI

- **Sidebar** (`ui/widgets.tsx`, slot `sidebar.content`): the title row (mic, "Voice",
  the session price), the **live row**, then the latest 5 recordings
  (`SIDEBAR_RECORDINGS`) as `RecordingRow`s, then `… N more`. It follows the route
  for the session (`currentSession()`), not the slot's `sessionID`: a new chat draws
  the sidebar before its session exists. It counts itself in `ui.sidebars`.
  - **Live row**: rendered only while `ui.phase !== "idle"`, so it collapses when
    the recording lands in the list. Recording: a dot blinking on `ui.frame`
    (`frame % 8 < 4`), the word `recording` and the clock (`state.elapsed()`, which
    reads `ui.frame` so it re-renders every tick: `Date.now()` alone is not
    reactive); `transcribing…` / `cleaning up…` with the spinner otherwise. **No
    meter here**; the level bar is in the bottom bar.
  - **Click** a successful row -> `actions.insert` (text into the prompt again); a
    failed row -> `actions.open(sessionID, recordID)`; the title and `… more` open the modal.
- **Footer status** (`ui/widgets.tsx`, two claims on `prompt.footer.status`, both
  rendered in a session and on the home route). OpenCode puts either the folder and
  branch (element id `prompt.footer.location`) or `■■■■⬝⬝⬝⬝ esc interrupt` (agent
  running) in that slot's default content; plugin claims are siblings of it in the
  footer row. So:
  - `RecordingStatus`, `prepend`: far left, **in front of** the folder or the
    interrupt hint. Only while recording, **always**, also next to a visible sidebar:
    mic, level bar, clock. The bar is `meterBar(ui.level, METER_WIDTH)`
    (`shared/format.ts`): it only grows to the right, with eighth-block partials for
    smoothness, and `filled` + `empty` are always `METER_WIDTH` cells wide.
  - `FooterIcon`, `append`: after the other items (memory-ticker, context counter).
    The idle mic and the working spinner, only when `ui.sidebars` is 0 (the sidebar
    says it itself otherwise) and never while recording.
  - **Do not use `replace`** on this slot: it would suppress the default content
    (so `esc interrupt` would disappear while the agent works) and every other
    plugin's claims in the boundary, memory-ticker's counters included.
    Found by reading the 2.3.2 binary; the claim order and spacing are unverified in
    a running OpenCode.
- **`RecordingRow`** (`ui/recording-row.tsx`): the two-row item shared by the
  sidebar and the modal list: `✓ hh:mm:ss · m:ss` then the label (or the reason, in
  red). A success whose text is not in the prompt is gold with `· not inserted`.
- **Modal** (`ui/modal.tsx`): `showModal(state, pickers, actions, sessionID, {view, recordID})`
  in OpenCode's dialog (`size: "xlarge"`). A shell with the header (title, phase,
  cost line), one of two views, and the legend; `c` toggles the view (a layer in
  the shell). Each view registers its own key layer (priority 10, mode `global`)
  inside its component, so the keys vanish with the view.
  - **Recordings view** (default): the list left (40%), the preview right
    (label, meta, scrollable text, "As heard" when it differs), sticky buttons
    under the preview. `a`/enter insert (closes the dialog, then
    `actions.insert` after 80 ms), `d` twice within 700 ms removes (`dd`; the
    button shows "press d again"), arrows and vim motions move. **The legend
    advertises arrows only**; vim keys are bound but unadvertised (the opposite of
    auto-mode, on purpose). Selection follows the recording **id**; the index is
    only the fallback, which makes the next item take a removed one's place.
    The list is scrolled in rows (`ITEM_ROWS` = 2 per item).
  - **Settings view**: rows from `shared/settings.ts` (`ROWS`; `ACTIONS` run
    something, `PICKERS` open a dialog, the rest toggle). A picker
    (`ui.dialog.select`) replaces the modal, saves, and calls `reopen`, which opens
    the modal on the settings again.
- **Options tabs** (`ui/tab-bar.tsx` in slot `session.composer.top`, logic in `tui/tabs.ts`):
  - `composer.ts` returns an `Insertion` from `insertIntoComposer`: `intact()` (the
    prompt text is exactly what was inserted or last swapped in) and `replace(text)`
    (swap just the inserted span with `setText`, then put `cursorOffset` after it).
    The span's position is found with `locate()`: the cursor first, then the end of
    the common prefix, **each candidate verified exactly** (`after === before[..at] +
    addition + before[at..]`). An unclear case gives no `replace`, never a wrong
    guess; the first version used the common prefix alone and broke when the text
    started like what followed the cursor. The separator in front (a space) is kept
    when swapping.
  - `tabs.show(sessionID, insertion, options)` (needs two or more options) publishes
    `ui.tabs` and starts a 250 ms watcher. `select(i)` / Tab call
    `insertion.replace`; if that fails the tabs are dismissed. Tab only goes forward
    (wrapping); **Shift+Tab must not be bound**: OpenCode 2.3 binds it to
    `agent.cycle`. Picking an earlier option is a click on its tab.
  - **Dismissal is by content, not by key list**: a listener on
    `renderer.keyInput` (`keypress` and `paste`) schedules `verify()` for after the
    key was handled, and the watcher repeats it. `verify()` dismisses when
    `!intact()` or the route is another session. That covers letters, space,
    backspace, `ctrl+c`, up/down history, and Enter (submit clears the prompt)
    without naming them; cursor moves keep the tabs. Also dismissed when a new
    recording starts.
  - Tab is a key layer (mode `global`, priority 100) that is `enabled` only while
    `ui.tabs.count > 1`. Defaults in OpenCode 2.3.2 (read from the binary):
    plain `tab` is bound only to `prompt.autocomplete.complete`, `shift+tab` to
    `agent.cycle`, `ctrl+tab` to `session.tab.next`. The autocomplete overlap cannot
    happen: opening the popup means typing, and typing dismisses the tabs.
- **Whisper picker** lists the catalog with installed/not downloaded. A model
  that is not on disk asks for confirmation and runs `pipeline.download`
  (`curl` into the first models folder through a `.part` file, then rename).
- Colours follow the terminal palette via `RGBA.fromIndex` with Rosé Pine hex
  fallbacks (`ui/theme.ts`).

## Patterns to keep

- **Pure modules + thin glue.** Logic in `shared` with colocated tests; the
  entries and `state`/`pipeline`/`ui` only wire things up.
- **A failure never loses the user's words, and never pops up.** Normalization
  errors fall back to the raw transcript; every outcome is a `Recording` in the
  sidebar. Toasts only for what the user just asked for. If you add a new failure,
  give it a short `REASON` label (sidebar width!) and a full `detail`.
- **Audio stays local and temporary.** Never keep or upload the wav. Only the
  transcript and the session title go to the normalizer; do not add conversation
  history to the normalizer's input.
- **Never write inside the config dir or a project** at runtime: OpenCode watches
  them and reloads plugins in a loop. Logs go to `stateDir()`, the wav to `tmpdir()`.
- **Survive hot reloads.** Editing any plugin file reloads it in the running
  server and can pair a new file with an older copy of a `src/*` module. Give new
  options or state fields a fallback where they are read, and keep shared
  server state on `globalThis.__opencodeStt`. Restart OpenCode after larger changes.
- **Don't shadow Solid imports** in components, and guard optional values with
  `<Show keyed>` instead of `cond() ? (...) : ...` (see auto-mode's OUTLINE for
  the crashes this caused).
- **No `pkill`.** The recorder tracks its own sox process and wav file name
  (`opencode-stt-<pid>.wav`), so two OpenCode instances never kill each other's
  recording. The trim is done in the plugin (not sox's `silence` effect, which
  writes nothing until it hears sound and so can hang or yield an empty file with
  a quiet microphone).
- **Keybinds** are commands with ids (`opencode-stt.record`, `.submit`, `.cancel`,
  `.open`) so `cli.json` can override them. Only some have a default bind.

## Testing

```sh
podman run --rm -v ~/.config/opencode/configured-plugins/opencode-stt:/app:ro -w /app docker.io/oven/bun:1 bun test
```

The whole folder is mounted (not just `src`) because the architecture test also
reads `index.ts` and `tui.tsx`. Type check in a throwaway container: copy the
plugin, add a `tsconfig.json` (`strict`, `moduleResolution: bundler`,
`allowImportingTsExtensions`, `jsx: preserve`, `jsxImportSource:
@opentui/solid`, `types: ["node", "bun"]`, include `src/**/*.ts(x)` and the two
entries, exclude tests), install `@opencode/plugin@2.3.2 @opentui/core
@opentui/solid solid-js@1.9 typescript @types/node @types/bun` (solid-js **1.9**,
not 2.x) and run `bunx tsc -p .`.

What is **not** covered by tests: anything that needs a microphone, `whisper-cli`,
a real OpenCode, or a provider: the recorder's sox process, the process wrappers,
the hooks, the Solid components. These were type-checked and written against the
auto-mode and voice-plugin patterns, but check them in a running OpenCode after
changes. What is covered at the edges: `recorder.test.ts` sweeps a temp folder and
runs a real child process (`bun -e`, so `bun` must be on PATH, as in the container)
to prove the exit hook removes the wav; `composer.test.ts` drives the insert and swap
logic against a fake text input.

## Known gaps

- A wav can survive a hard kill (`kill -9`, crash, power loss) until the next start,
  when `sweepStale()` removes it. Signals are not hooked on purpose (see State).
- Inserting into the prompt depends on the prompt having focus and being an
  `insertText`-capable renderable. This is checked by type only, not by tests
  (there is no OpenTUI in the test setup); verify after OpenCode upgrades. When it
  fails the recording stays in the list, marked "not inserted", to insert by click.
- The 80 ms wait between closing the modal and inserting is a guess; if the text
  goes missing, make it longer or wait for the dialog's close event.
- That Tab reaches our layer (plain Tab has no default action in V2 apart from
  autocomplete), and that the dismissal's `renderer.keyInput` listener fires, are
  unverified in a running OpenCode. If Tab does nothing, look at the layer's `mode`
  and `priority` first. Suspect number one: OpenCode's prompt declares a key
  capture list (`capture: ["tab"]` in normal mode, `["escape","navigate","submit","tab"]`
  while autocomplete is open, found in the 2.3.2 binary). It looks like the prompt
  telling the host it wants Tab, not a binding with an action, but it was not
  traced further. The tab bar is shown in `session.composer.top`
  and only in a session (not on the home screen).
- The alternatives depend on the normalizer model following the `---ALT---` format;
  a model that ignores it simply gives no tabs. There is no setting to turn the
  alternatives off.
- The `dd` key is implemented as two presses of `d` within 700 ms, because the
  keymap's sequence syntax was not checked.
- Recordings and cost are per root session; whisper is free, so cost only counts
  the normalization call. Normalizations on another provider than the chat model
  show `+`.
- A recording is held in memory until you stop it (32 KB per second): fine for
  prompts, not for long meetings.
- The `prompt` option is read once at server start; edits apply after a plugin reload.
- Model files are looked up by the fixed catalog in `shared/models.ts`; a ggml
  file you add yourself does not show up in the picker.
- Linux (PulseAudio) support is ported from opencode-voice but untested.
- The first normalization for a session on another provider spends one call
  with `maxTokens: 1` to learn that the provider does not match; after that the
  pair is remembered in `textOnly` until the server restarts.
