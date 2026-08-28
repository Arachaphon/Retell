import { translateText } from "../src/translate/free.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const res = await translateText("Good morning. How are you today?");
assert(res.ok, `translation ok`);
if (res.ok) {
  assert(res.translated.length > 0, "has translated text");
  console.log("  sample:", res.translated);
} else {
  console.warn("  (network may be unavailable; skipping content asserts)");
}

console.log("done");
