// Shared mutable app state, used across most modules. Centralized here
// (rather than split across each module that 'owns' a given piece) because
// the original single-file app.js has ~20 variables that are written from
// multiple sections - a pattern only a shared mutable object supports
// cleanly under real ES module import bindings, which are read-only.
//
// applicationData starts null and is set by bootstrap.js (`state.applicationData
// = loadData();`), not computed eagerly here: data.js and other modules that
// state.js's importers pull in form a circular import graph (e.g.
// data.js -> appearance.js -> state.js -> data.js), and calling loadData()
// during state.js's own module evaluation can run before data.js has
// finished initializing its own top-level `const`s (a real "Cannot access
// before initialization" TDZ error, not a hypothetical one - it reliably
// reproduced under test). bootstrap.js runs only after every other module
// has fully evaluated, so assigning there is safe.
export const state = {
  runtimeSchedule: {},
  viewDay: new Date().getDay() === 0 || new Date().getDay() === 6 ? 1 : new Date().getDay(),
  lastListKey: '',
  autoAdvancedAfterFinishedDay: null,
  lastAutoScrollKey: '',
  stylePanelDraft: null,
  testPanelOpen: false,
  pendingAfterEditorDiscard: null,
  pendingEditorImportData: null,
  pendingEditorSaveData: null,
  editorBaselineData: null,
  pendingBellDelete: null,
  pendingTeacherDelete: null,
  pendingStyleSaveData: null,
  pendingStyleSlotIndex: null,
  pendingStyleSlotSaveIndex: null,
  editorBaselineSnapshot: '',
  assignmentDay: 1,
  isOcrProcessing: false,
  userScrolledDuringAlign: false,
  applicationData: null
};
