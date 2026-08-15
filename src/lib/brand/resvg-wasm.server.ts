// The Worker runtime refuses to compile WebAssembly from bytes at request time
// ("Wasm code generation disallowed by embedder"). A build-time module import is
// the only shape it accepts: the bundler hands the runtime an already-compiled
// WebAssembly.Module, which resvg's loader instantiates directly.
// @ts-expect-error - .wasm?module has no type declaration
import resvgModule from "@resvg/resvg-wasm/index_bg.wasm?module";

export default resvgModule as WebAssembly.Module;
