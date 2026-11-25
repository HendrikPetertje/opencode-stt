/**
 * opencode-stt, TUI part: records with sox, transcribes with whisper-cli, has the transcript cleaned up through the
 * server part and puts it into your prompt. The sidebar widget lists the latest recordings and the session's cost; the
 * modal (click the widget, /stt, <leader>v) lists them all with a preview and has the settings. The pieces live in src/tui.
 */
import { Plugin } from "@opencode/plugin/tui";
import type { JSX } from "@opentui/solid";
import type { Actions } from "./src/tui/actions.ts";
import { registerCommands } from "./src/tui/commands.ts";
import { createPickers } from "./src/tui/pickers.ts";
import { createPipeline } from "./src/tui/pipeline.ts";
import { createState } from "./src/tui/state.ts";
import { createTabs } from "./src/tui/tabs.ts";
import { showModal } from "./src/tui/ui/modal.tsx";
import { TabBar } from "./src/tui/ui/tab-bar.tsx";
import { FooterIcon, RecordingStatus, Sidebar } from "./src/tui/ui/widgets.tsx";

export default Plugin.define({
  id: "opencode-stt.tui",
  setup(context) {
    const state = createState(context);
    void state.loadConfig();
    const tabs = createTabs(state);
    const pipeline = createPipeline(state, tabs);
    const pickers = createPickers(state, pipeline.download);
    const actions: Actions = {
      open: (sessionID, recordID) => showModal(state, pickers, actions, sessionID, { recordID }),
      insert: pipeline.insertRecording,
    };

    const stopSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (input) => <Sidebar state={state} actions={actions} sessionID={input.sessionID} />,
    });
    // The slot's default content is the folder and branch, or `esc interrupt` while the agent works. Claims sit next to
    // it in the footer row: prepend puts the recording at the far left without hiding either; append puts the idle
    // icon after the other items. Both also render in a new chat, which has no sidebar yet.
    const inPrompt = (render: (sessionID: string | undefined) => JSX.Element) => () => {
      const route = context.ui.router.current();
      if (route?.type === "session") return render(route.sessionID);
      return route?.type === "home" ? render(undefined) : null;
    };
    const stopRecording = context.ui.slot({
      prepend: "prompt.footer.status",
      render: inPrompt((sessionID) => <RecordingStatus state={state} actions={actions} sessionID={sessionID} />),
    });
    const stopFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: inPrompt((sessionID) => <FooterIcon state={state} actions={actions} sessionID={sessionID} />),
    });
    const stopTabs = context.ui.slot({
      prepend: "session.composer.top",
      render: () => <TabBar state={state} tabs={tabs} />,
    });
    registerCommands(state, pipeline, (sessionID) => actions.open(sessionID));

    return () => {
      state.stop();
      pipeline.dispose();
      tabs.dispose();
      stopTabs?.();
      stopSidebar?.();
      stopFooter?.();
      stopRecording?.();
    };
  },
});
