import { splitLongText, translateSegments } from "../src/translate/free.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// --- splitLongText ---
const short = "Hello world.";
assert(JSON.stringify(splitLongText(short, 500)) === JSON.stringify(["Hello world."]), "short stays one chunk");

const long = "word ".repeat(200).trim(); // ~1000 chars
const chunks = splitLongText(long, 500);
assert(chunks.length > 1, "long text splits into multiple chunks");
assert(chunks.every((c) => c.length <= 500), "all chunks within limit");
assert(chunks.join(" ") === long, "join with space reproduces original");

const singleLong = "a".repeat(1200);
const hard = splitLongText(singleLong, 500);
assert(hard.length === 3, "single long word hard-cuts into 3");
assert(hard.every((c) => c.length <= 500), "hard-cut chunks within limit");

// --- translateSegments correctness (no network: verify batching doesn't drop) ---
// We can't test the network easily here without a key, but verify it returns
// one result per input (may be failures if offline, but count must match).
const segs = ["a", "b", "c"];
const res = await translateSegments(segs);
assert(res.length === segs.length, "translateSegments returns one result per input");

console.log("done");
