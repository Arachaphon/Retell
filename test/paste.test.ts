import { parsePastedText } from "../src/parsers/paste.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const text = `It was a quiet night when the phone rang.

She picked up, and the voice on the other end made her heart stop.

"We found him," the man said.
Rain began to fall against the windowpane.`;

const { chapters, isEmpty } = parsePastedText(text);
assert(!isEmpty, "not empty");
assert(chapters.length === 1, "single chapter");
const paras = chapters[0]!.paragraphs;
assert(paras.length === 3, `3 paragraphs (got ${paras.length})`);
assert(paras[0] === "It was a quiet night when the phone rang.", "para 0");
assert(paras[1] === "She picked up, and the voice on the other end made her heart stop.", "para 1");
assert(
  paras[2] === '"We found him," the man said. Rain began to fall against the windowpane.',
  "para 2 joins non-blank-line-wrapped lines",
);

const empty = parsePastedText("   \n  \n   ");
assert(empty.isEmpty, "whitespace-only -> empty");

const single = parsePastedText("A single line.");
assert(single.chapters[0]!.paragraphs.length === 1, "single line -> 1 paragraph");

console.log("done");
