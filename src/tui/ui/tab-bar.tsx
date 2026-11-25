/** The ornament above the prompt: one tab per option while the inserted text can still be swapped. */
import { For, Show } from "solid-js";
import { TextAttributes } from "@opentui/core";
import type { State } from "../state.ts";
import type { Tabs } from "../tabs.ts";
import { COLOR, ICON } from "./theme.ts";

export function TabBar(props: { state: State; tabs: Tabs }) {
  const view = () => props.state.ui.tabs;
  const visible = () => (view()?.count ?? 0) > 1 && view()!.session === props.state.currentSession();
  const indices = () => Array.from({ length: view()?.count ?? 0 }, (_, i) => i);
  return (
    <Show when={visible()}>
      <box
        flexDirection="row"
        flexShrink={0}
        gap={1}
        border={["left"]}
        borderColor={COLOR.iris as any}
        backgroundColor={COLOR.surface as any}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={COLOR.iris as any}>{ICON.mic}</text>
        <text fg={COLOR.muted as any}>voice options</text>
        <For each={indices()}>
          {(i) => {
            const active = () => i === view()!.index;
            return (
              <text
                fg={(active() ? COLOR.foam : COLOR.muted) as any}
                attributes={active() ? TextAttributes.BOLD : 0}
                onMouseUp={() => props.tabs.select(i)}
              >
                {active() ? `[${i + 1}]` : ` ${i + 1} `}
              </text>
            );
          }}
        </For>
        <text fg={COLOR.muted as any}>tab for the next · typing keeps this one</text>
      </box>
    </Show>
  );
}
