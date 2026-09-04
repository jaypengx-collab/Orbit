// ---- src/constants.js ----
// A handful of plain constants shared by data.js and appearance.js. Kept in
// their own leaf module (imports nothing) rather than declared in either
// one, because data.js and appearance.js import *from each other*
// (data.js needs appearance.js's normalize* functions, appearance.js used
// to need these two constants from data.js) - a real circular import, and
// unlike function declarations (hoisted, safe either way), a `const` read
// at another module's own top level can hit "Cannot access before
// initialization" depending on which side of the cycle evaluates first.
// It did, reliably, under the browser's native module loader (though not
// under every bundler's reordering, which is how this got missed at
// first). Moving the constants to a module neither side needs anything
// else from removes the cycle entirely instead of just working around one
// symptom of it.
const DEFAULT_STYLE_PRIMARY = '#0A84FF';
const DEFAULT_STYLE_SECONDARY = '#5856D6';

export { DEFAULT_STYLE_PRIMARY, DEFAULT_STYLE_SECONDARY };
