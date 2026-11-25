# opencode-stt

Speech-to-text for OpenCode V2. Record a prompt with your microphone, have it
transcribed locally with [whisper.cpp](https://github.com/ggml-org/whisper.cpp),
and let a model from your own OpenCode providers clean it up before you send it.
Only speech-to-text: there is no text-to-speech.

Recording, whisper and the model picker run in the TUI. The cleanup goes
through the server half, the same way [auto-mode](../auto-mode/README.md) calls
its reviewer, so it uses whatever providers you have configured (GitHub Copilot,
Anthropic, a local model...) and no extra API key.

Based on [renjfk/opencode-voice](https://github.com/renjfk/opencode-voice)
(MIT): the sox recording, the whisper arguments and the normalization prompt
come from there.

## At a glance

```
 ctrl+r           ctrl+r again
   │                   │
   ▼                   ▼
┌─────────┐ audio ┌─────────────┐  raw text  ┌─────────────┐  best text + up to
│   sox   │──────▶│ whisper-cli │───────────▶│ your model  │  2 alternatives
│  (mic)  │       │   (local)   │            │ (cleanup +  │──────────┐
└─────────┘       └─────────────┘            │ topic words)│          ▼
 live level bar                                 └─────────────┘  ┌─────────────────┐
 in the bottom bar                                            │ your prompt     │
                                                              │ [1] 2 3  ← tab  │
 ┌────────────────┐   Enter · ctrl+c · typing                 └────────┬────────┘
 │ you edit, send │◀──────── (the tabs go away) ───────────────────────┘
 │ or discard     │
 └────────────────┘

 Every recording, good or failed, is also saved in the session's list:
 shown in the sidebar widget, browsable in the modal, click to insert again.
```

You never leave the prompt: dictate, edit the text like anything you typed, send.
Nothing pops up for recordings; the sidebar widget shows what is happening.

## Requirements

- OpenCode V2
- `sox` and `whisper-cli` on your `PATH`: `brew install sox whisper-cpp`
  (`curl`, which macOS ships, is used to download whisper models)
- A whisper model file. You can download one from the settings modal, see
  [Models](#models)
- A model for the cleanup, ideally on the same provider as your chat model
  (see [Cost](#cost)). Optional: without it you get whisper's raw text

On Linux, sox records through PulseAudio when `pactl` is available. macOS is
what this plugin is used on, so Linux is untested.

## Installation

Clone it (or add it as a git submodule) somewhere your OpenCode config can reach:

```bash
cd ~/.config/opencode
git submodule add https://github.com/HendrikPetertje/opencode-stt.git configured-plugins/opencode-stt
# or, without submodules:
git clone https://github.com/HendrikPetertje/opencode-stt.git configured-plugins/opencode-stt
```

To update later, run `git pull` in the plugin folder (or
`git submodule update --remote configured-plugins/opencode-stt`).

It lives in `configured-plugins/`, not `plugins/`: OpenCode auto-loads every
directory under `plugins/` **without options**, which would give you a second
copy without your settings next to the configured one.

There is no build step: OpenCode loads the TypeScript directly. Add it to
`~/.config/opencode/opencode.jsonc`:

```jsonc
"plugins": [
  {
    "package": "./configured-plugins/opencode-stt",
    "options": {
      "model": "github-copilot/claude-haiku-5.5"
    }
  }
]
```

Both halves load from this one entry (`.` is the server part, `./tui` the TUI
part). Do not also add it to `cli.json`.

`ctrl+r` is OpenCode's default key for renaming a session. Free it in
`~/.config/opencode/cli.json`, or pick another key with `recordKeybind`:

```json
"keybinds": { "session.rename": "none" }
```

Restart OpenCode. To run the tests: `bun test` in the plugin folder.

## Usage

| Command | Default key | Does |
|---|---|---|
| `/stt-record` | `ctrl+r` | Start recording. Press again to stop and transcribe; the text lands in your prompt |
| `/stt-submit` | `<leader>r` | Stop, transcribe and send straight away, without editing |
| `/stt-stop` | | Cancel the recording |
| `/stt` | `<leader>v` | Open the voice modal |

The transcript is inserted into the prompt at the cursor, **not sent**. There is
no popup: edit it like anything you typed, press Enter to send it, or discard it
the usual way. Text already in the prompt stays, and the transcript is added
after it. Recording needs an open session.

OpenCode has no API for writing into the composer, so the plugin inserts the text
into whichever text input has focus, which is the prompt while you dictate. If
you switched session meanwhile, or nothing editable has focus, the text is not
inserted. It is still in the list, marked "not inserted": click it to insert it.

Your `<leader>` is whatever `cli.json` sets (`ctrl+x` by default). Every key
can be changed there by command id: `opencode-stt.record`,
`opencode-stt.submit`, `opencode-stt.open`.

### What happens to a recording

1. `sox` streams the microphone to the plugin. The plugin draws the live volume
   meter, trims leading silence, and writes a private temporary wav.
2. `whisper-cli` transcribes it locally. The wav is deleted right after.
3. The normalizer model fixes punctuation, drops filler words and corrects
   software homophones ("Jason" to "JSON", "bullion" to "boolean"...), and names
   the topic in one or two words. It only sees the transcript and the session
   title, not your conversation.
4. The text is inserted into your prompt, and the recording is added to the list.

If step 3 fails, or normalization is off, you get whisper's raw text. A failure
never loses what you said.

### Options as tabs

When the speech was ambiguous (a mis-heard word that could be two different
technical terms, say), the normalizer returns up to two alternative versions
next to the best one, in the same single answer, so there is no extra call and
only a few more output tokens. Most prompts have none.

The best version goes into the prompt, and the alternatives show up as tabs just
above it:

```
▌ voice options  [1] 2  3   tab for the next · typing keeps this one
```

- `tab` swaps the text in the prompt for the next option and wraps round after
  the last; a click on a tab picks that one. Text you already had in the prompt
  stays. `shift+tab` is not used: OpenCode keeps it for switching agents.
- The tabs disappear as soon as the prompt no longer holds exactly what the
  plugin put there: type a letter, space or backspace, clear it with `ctrl+c`,
  step through history with up/down, or send it with Enter. Moving the cursor
  does not remove them.
- They also disappear when you start a new recording or switch session.
- `tab` is only used while tabs are shown. In OpenCode 2.3 plain Tab is otherwise
  bound only to accepting an autocomplete item (the `/` and `@` popups), and
  `shift+tab` switches agents.
- Inserting a recording again from the sidebar or the modal shows its tabs again.
  The modal's preview lists the other options.

## The sidebar widget

```
● Voice  $0.0031            title with the session's price
● recording 0:07            live row, only while recording or working
✓ 14:03:22 · 0:07           the last 5 recordings, newest first
  fix login
✗ 14:01:40 · 0:01
  too short
```

- **Live row.** While you record it shows a blinking red dot, "recording" and
  the elapsed time. While working it shows a spinner and "transcribing…" or
  "cleaning up…". When the recording is done the row collapses and the recording
  appears in the list below.
- **Each recording takes two rows.** Time of day and length on the first. On the
  second: for a success the one or two word topic the normalizer chose (or
  "success" when normalization is off, "raw text" when it failed); for a failure
  the short reason (`too short`, `no speech`, `no audio`, `no model`, `whisper
  failed`, `mic error`, `sox missing`...). A text that did not make it into the
  prompt says "not inserted".
- **Click a finished recording** to insert its text into the prompt again.
  Click a failed one to open the modal on it and read the details.
- **Click the title** to open the modal.

There are no notifications for recordings. Everything that happens, including
failures, shows up in this widget.

### The bottom bar

While you record, the far left of OpenCode's bottom bar shows the live volume, as
a bar that only grows to the right, with the time after it. It sits in front of
the current folder and branch:

```
🎤 ████▌····· 0:07  ~/.config/opencode/configured-plugins:main        …  442.4K (44%) · $12.00  ctrl+p commands
```

While the agent is working, that spot normally shows `■■■■⬝⬝⬝⬝ esc interrupt`.
The recording is added in front of it, so the interrupt hint stays visible:

```
🎤 ████▌····· 0:07  ■■■■⬝⬝⬝⬝ esc interrupt                  …  447.3K (45%) · $12.19  ctrl+p commands
```

The bar follows how loud you are, and is also shown next to an open sidebar.
When the sidebar is hidden, and in a new chat before it has a sidebar, a small
microphone also shows after the other items while idle (grey), and a spinner
while the recording is being transcribed. Click either to open the modal.

## The modal

Click the widget, or `/stt` / `<leader>v`. It opens on the recordings of the
session: the list on the left (same two rows as the sidebar), and a preview of
the selected one on the right: the text, and what whisper heard when the
normalizer changed it. Under the preview are the buttons, always visible:

| Key | Does |
|---|---|
| `↑` `↓` | Select a recording |
| `a` or `enter` | Insert into the prompt (closes the modal first) |
| `dd` | Remove the recording (press `d` twice) |
| `c` | Switch to the settings, and back |
| `esc` | Close |

Vim motions (`j`, `k`, `g`, `G`, `ctrl+d`, `ctrl+u`) work too.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Voice                                          $0.0031 · 4 transcripts · … │
│ ─────────────────────────────────────────────────────────────────────────── │
│ ✓ 14:03:22 · 0:07            │ ✓ fix login                                  │
│   fix login                  │ 14:03:22 · 0:07 · cleaned up                 │
│ ✓ 14:02:05 · 0:12            │                                              │
│   deploy                     │ Fix the login bug in the auth module and     │
│ ✗ 14:01:40 · 0:01            │ add a test for it.                           │
│   too short                  │                                              │
│ ✓ 13:58:11 · 0:05            │ Other options (tab in the prompt):           │
│   success                    │ 2. Fix the log in bug in the off module ...  │
│                              │                                              │
│                              │ As heard:                                    │
│                              │ fix the log in bug in the auth module ...    │
│                              │ ──────────────────────────────────────────── │
│                              │ ✎ insert into prompt (a)   🗑 remove (dd)    │
│ ─────────────────────────────┴──────────────────────────────────────────── │
│  esc close · ↑/↓ select · a insert into prompt · dd remove · ⚙ c config     │
└─────────────────────────────────────────────────────────────────────────────┘
```

The buttons under the preview stay in place while the text scrolls. A selected
recording that failed shows its full error instead of text, with only "remove".

Recordings are kept per session (the newest 50, in the 200 most recent
sessions), also across restarts.

### Settings (`c`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Voice · settings                               $0.0031 · 4 transcripts · … │
│ ─────────────────────────────────────────────────────────────────────────── │
│   Whisper model          Base English                                       │
│   Language               English                                            │
│   Microphone             system default                                     │
│   Normalize with LLM     on                                                 │
│   Normalizer model       github-copilot/claude-haiku-5.5                    │
│   Trim leading silence   on                                                 │
│   Reset to defaults      nothing changed                                    │
│   Open log folder        ~/.local/state/opencode-stt                        │
│                                                                             │
│  space: pick the speech model. Models that aren't downloaded yet can be     │
│  downloaded from the picker.                                                │
│  Normalizer and chat model (github-copilot/…) share a provider: priced.     │
│ ─────────────────────────────────────────────────────────────────────────── │
│  esc close · ↑/↓ move · space/enter select · ←/→ change · 🎤 c recordings    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Pick and save:

| Row | |
|---|---|
| Whisper model | Space opens the picker. Models that are not downloaded can be downloaded from there |
| Language | The spoken language. English-only models always use English |
| Microphone | The input device, or the system default |
| Normalize with LLM | On: clean up the transcript. Off: raw whisper text |
| Normalizer model | Any model from your providers, like auto-mode's reviewer model |
| Trim leading silence | Cut silence at the start. A recording that is quiet throughout is kept whole |
| Reset to defaults | Forgets every change made here and goes back to the plugin options in `opencode.jsonc` (or the built-in defaults). Shows how many settings differ |
| Open log folder | Opens `~/.local/state/opencode-stt/` |

Keys: `↑` `↓` move, `space`/`enter`/click select, `←` `→` toggle, `c` back to the
recordings. Settings are remembered across sessions and projects. Only what you
change is stored; everything else follows the plugin options, so changing an
option affects every setting you have not touched.

## Models

whisper models live in `~/.local/share/whisper-cpp/` (or `modelsDir`). The
plugin also looks in Homebrew's `/opt/homebrew/share/whisper-cpp/models` and
`/usr/local/share/whisper-cpp/models`.

| Model | Size | Notes |
|---|---|---|
| `tiny.en`, `tiny` | 75 MB | Fastest, roughest |
| `base.en`, `base` | 142 MB | The default. Fine for clear English |
| `small.en`, `small` | 466 MB | Noticeably better with accents and jargon |
| `medium-q5_0` | 539 MB | Multilingual |
| `large-v3-turbo-q5_0` | 574 MB | Best quality for the size; fast with Metal on Apple Silicon |
| `large-v3-turbo-q8_0`, `large-v3-turbo` | 874 MB, 1.6 GB | Higher precision of the same model |

`.en` models are English only. The others are multilingual.

Picking a model that is not downloaded asks for confirmation, then downloads it
from `huggingface.co/ggerganov/whisper.cpp` with `curl` into the first models
folder. It goes through a `.part` file, so a broken download is never picked up.
The row shows "downloading…" meanwhile, and the model is selected when it is
done.

## Cost

Whisper runs locally and is free. Only the cleanup call costs money. The widget
title shows the session's price, and the top right of the modal adds the number
of transcripts and tokens.

Like auto-mode, the price depends on the provider:

- **Normalizer on the same provider as your chat model:** the call runs as a
  transient `session.generate` on your session, so tokens and cost are reported.
  Nothing is added to the conversation.
- **Another provider:** the call goes through `generate.text`. It works with any
  configured model but reports no price, so the total gets a trailing `+` and
  the modal says how many calls were unpriced.

The settings view tells you which case you are in. Cost is kept per root session
(subagents count towards their parent), stored in OpenCode's plugin storage, and
the newest 200 sessions are remembered.

## Options

All optional. The modal's choices override `model`, `whisperModel`, `language`,
`normalize` and `trimSilence`.

| Option | Default | |
|---|---|---|
| `model` | none | Normalizer as `provider/model`. Without it, you get raw text until you pick one |
| `whisperModel` | `base.en` | Whisper model id (see the table above) |
| `language` | `en` | Spoken language code, or `auto`. Any whisper.cpp code works, not only the ones in the picker |
| `modelsDir` | `~/.local/share/whisper-cpp` | Where models are found and downloaded to |
| `normalize` | `true` | Clean up transcripts with the normalizer |
| `trimSilence` | `true` | Trim leading silence |
| `prompt` | built in | Path to a file that replaces the normalization system prompt |
| `keybind` | `<leader>v` | Open the settings |
| `recordKeybind` | `ctrl+r` | Record / stop and insert into the prompt |
| `submitKeybind` | `<leader>r` | Stop and send |

## Troubleshooting

- **`no model`:** the selected whisper model is not downloaded. Open the modal,
  press `c`, pick the model and confirm the download.
- **`sox missing` / `whisper missing`:** `brew install sox whisper-cpp`. The
  settings view also lists what is missing.
- **`no audio`:** macOS asks for microphone permission for your terminal
  the first time. Allow it under System Settings, Privacy & Security,
  Microphone, then try again. Test with `sox -d /tmp/t.wav trim 0 3`.
- **First word is cut off:** turn off "Trim leading silence", or speak a moment
  after starting: sox needs about 0.2 s to start capturing.
- **`too short`:** whisper needs at least one second of audio, counted after the
  leading silence is trimmed.
- **`no speech`:** whisper heard nothing it could transcribe. Speak up or check
  the microphone in the settings.
- **"not inserted":** the prompt had no focus (or you changed session) when the
  text arrived. Click the recording to insert it.
- **Everything shows `+`:** the normalizer is on another provider than your chat
  model. That is only about the price. Pick a normalizer on your chat provider.
- **Nothing in the sidebar:** the widget needs the sidebar to be visible; the
  small microphone in the bottom bar takes over when it is not (click it to open
  the modal).
- **Errors:** `~/.local/state/opencode-stt/plugin.log` (latest 1000 lines).

## Privacy

Audio never leaves your machine. It is held in memory while you record, written
to a private temporary file (`opencode-stt-<pid>.wav` in your temp folder, only
you can read it) for the local `whisper-cli`, and deleted **the moment whisper is
done**: before the cleanup call, not after it. So it exists for as long as the
transcription takes, normally a second or two. Cancelling a recording discards it
without writing anything.

Besides that, the file is removed when the plugin unloads and when OpenCode exits
(quit, restart, closing the terminal normally). If OpenCode is killed outright
(`kill -9`, a crash, power loss), nothing can run at that moment, so the leftover
file is removed the next time OpenCode starts. A file from another OpenCode that
is still running is left alone. Sleep does not kill anything: the file just waits
a few seconds for the transcription to continue after waking up.

Only the transcript text and the session
title go to your normalizer model, through your own provider. The one network
access besides that is the model download you confirm yourself.

## Layout

See [OUTLINE.md](OUTLINE.md) for how the files fit together.
