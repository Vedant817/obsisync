/**
 * CodeMirror 6 <-> Y.Text binding with guards for how Obsidian uses editors.
 *
 * y-codemirror.next's ySync assumes an editor shows one document forever.
 * Obsidian reuses one EditorView when a pane switches notes, and replaces the
 * whole text when a note is reloaded. Pushing that into the old note's live
 * doc would wipe the note for everyone. So this binding:
 * - only forwards local edits while the editor still shows the bound path,
 * - re-syncs the editor from Y.Text if the two ever disagree in length
 *   instead of applying positions to the wrong text,
 * - reuses y-codemirror.next's remote cursors (they read ySyncFacet).
 */
import { Annotation, type ChangeSpec, type Extension, type Text } from "@codemirror/state";
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from "@codemirror/view";
import { yRemoteSelections, yRemoteSelectionsTheme, ySyncFacet, YSyncConfig } from "y-codemirror.next";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { textOps } from "@vaultbridge/live-core";

/** Marks editor transactions that came from Y.Text, so they are not echoed back. */
export const liveSyncAnnotation = Annotation.define<object>();

export interface LiveBindingTarget {
  ytext: Y.Text;
  awareness: Awareness;
  /** True while the editor still shows the note this binding belongs to. */
  stillBound(view: EditorView): boolean;
  /** The editor moved to another note or diverged beyond repair. */
  onDetach(view: EditorView): void;
}

type YDelta = { insert?: string | object; delete?: number; retain?: number }[];

/** Y.Text delta -> CodeMirror changes, in the coordinates of the old editor text. */
export function deltaToChanges(delta: YDelta): { changes: ChangeSpec[]; lengthBefore: number; lengthAfter: number } {
  const changes: ChangeSpec[] = [];
  let pos = 0;
  let removed = 0;
  let added = 0;
  for (const d of delta) {
    if (typeof d.insert === "string") {
      changes.push({ from: pos, to: pos, insert: d.insert });
      added += d.insert.length;
    } else if (d.delete !== undefined) {
      changes.push({ from: pos, to: pos + d.delete, insert: "" });
      pos += d.delete;
      removed += d.delete;
    } else if (d.retain !== undefined) {
      pos += d.retain;
    }
  }
  return { changes, lengthBefore: removed, lengthAfter: added };
}

/** Apply a CodeMirror change set to Y.Text (positions shift as we go). */
export function applyChangesToYText(
  ytext: Y.Text,
  iter: (fn: (fromA: number, toA: number, fromB: number, toB: number, inserted: Text) => void) => void,
): void {
  let adj = 0;
  iter((fromA, toA, _fromB, _toB, inserted) => {
    const insertText = inserted.sliceString(0, inserted.length, "\n");
    if (fromA !== toA) {
      ytext.delete(fromA + adj, toA - fromA);
    }
    if (insertText.length > 0) {
      ytext.insert(fromA + adj, insertText);
    }
    adj += insertText.length - (toA - fromA);
  });
}

/** Changes that make the editor read `target`, as one minimal hunk list. */
export function editorChangesTo(current: string, target: string): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  // textOps indexes are in the evolving text; CodeMirror wants old-text
  // coordinates. Track the shift to convert.
  let shift = 0;
  for (const op of textOps(current, target)) {
    const from = op.index - shift;
    changes.push({ from, to: from + op.delete, insert: op.insert });
    shift += op.insert.length - op.delete;
  }
  return changes;
}

class GuardedSync implements PluginValue {
  private readonly observer: (event: Y.YTextEvent, tr: Y.Transaction) => void;
  private detached = false;

  constructor(
    private readonly view: EditorView,
    private readonly target: LiveBindingTarget,
    private readonly origin: object,
  ) {
    this.observer = (event, tr) => {
      if (tr.origin === this.origin || this.detached) {
        return;
      }
      if (!this.target.stillBound(this.view)) {
        this.detach();
        return;
      }
      const { changes, lengthBefore, lengthAfter } = deltaToChanges(event.delta);
      const expectedBefore = this.target.ytext.length - lengthAfter + lengthBefore;
      if (this.view.state.doc.length !== expectedBefore) {
        this.resync();
        return;
      }
      this.dispatch({ changes, annotations: [liveSyncAnnotation.of(this.origin)] });
    };
    this.target.ytext.observe(this.observer);
  }

  update(update: ViewUpdate): void {
    if (this.detached || !update.docChanged) {
      return;
    }
    if (update.transactions.some((tr) => tr.annotation(liveSyncAnnotation) === this.origin)) {
      return;
    }
    if (!this.target.stillBound(update.view)) {
      // The pane now shows another note. Its text must not reach this doc.
      this.detach();
      return;
    }
    const ytext = this.target.ytext;
    if (ytext.length !== update.startState.doc.length) {
      this.resync();
      return;
    }
    const doc = ytext.doc;
    const apply = () => applyChangesToYText(ytext, (fn) => update.changes.iterChanges(fn));
    if (doc) {
      doc.transact(apply, this.origin);
    } else {
      apply();
    }
  }

  /** Make the editor read exactly what Y.Text says. */
  private resync(): void {
    const target = this.target.ytext.toJSON();
    const current = this.view.state.doc.toString();
    if (current === target) {
      return;
    }
    this.dispatch({ changes: editorChangesTo(current, target), annotations: [liveSyncAnnotation.of(this.origin)] });
  }

  private dispatch(spec: { changes: ChangeSpec[]; annotations: Annotation<object>[] }): void {
    // A remote edit can land while CodeMirror is mid-update. Defer then.
    const run = () => {
      if (!this.detached) {
        this.view.dispatch(spec);
      }
    };
    if ((this.view as unknown as { updateState?: number }).updateState === 2) {
      queueMicrotask(run);
    } else {
      run();
    }
  }

  private detach(): void {
    if (this.detached) {
      return;
    }
    this.detached = true;
    this.target.ytext.unobserve(this.observer);
    queueMicrotask(() => this.target.onDetach(this.view));
  }

  destroy(): void {
    this.detached = true;
    this.target.ytext.unobserve(this.observer);
  }
}

/** Editor extension for one live note: text sync, local cursor, remote cursors. */
export function liveEditorExtension(target: LiveBindingTarget): Extension {
  const origin = {};
  return [
    ySyncFacet.of(new YSyncConfig(target.ytext, target.awareness)),
    ViewPlugin.define((view) => new GuardedSync(view, target, origin)),
    yRemoteSelectionsTheme,
    yRemoteSelections,
  ];
}

export { EditorView };
