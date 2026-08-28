import { Ao3Parser } from "../src/parsers/ao3.ts";
import { fetchAndParse, resolveParser } from "../src/parsers/registry.ts";

const sampleHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Midnight Rain - Luna (physical_reader)</title>
  <meta property="og:title" content="Midnight Rain" />
  <meta property="og:site_name" content="Archive of Our Own" />
  <meta property="article:author" content="Luna" />
</head>
<body>
  <nav><a href="/">Home</a><a href="/login">Login</a></nav>
  <div id="main">
    <h2 class="title heading">Midnight Rain</h2>
    <div class="byline">by <a rel="author" href="/users/x">Luna</a></div>
    <div id="chapters">
      <div class="chapter">
        <h3 class="title">Chapter 1: The Call</h3>
        <div class="userstuff">
          <p>It was a quiet night when the phone rang.</p>
          <p>She picked up, and the voice on the other end made her heart stop.</p>
          <p>"We found him," the man said.</p>
          <div class="ad sponsored">Buy cheap phones now!</div>
          <p>Rain began to fall against the windowpane.</p>
        </div>
      </div>
      <div class="chapter">
        <h3 class="title">Chapter 2: Answers</h3>
        <div class="userstuff">
          <p>The station smelled of coffee and old paper.</p>
          <p>He was sitting in the corner, exactly where she knew he would be.</p>
        </div>
      </div>
    </div>
    <footer>Site footer with navigation</footer>
  </div>
</body>
</html>`;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// 1. Registry resolves AO3 URLs
const res = resolveParser("https://archiveofourown.org/works/1234567");
assert("parser" in res, "registry resolves AO3 URL");

// 2. Parser extracts title/author/metadata
const parser = new Ao3Parser();
const parsed = parser.parse(sampleHtml, "https://archiveofourown.org/works/1234567");
assert(parsed.ok, "parse returns ok");
if (parsed.ok) {
  assert(parsed.title === "Midnight Rain", `title "${parsed.title}"`);
  assert(parsed.author === "Luna", `author "${parsed.author}"`);
  assert(parsed.chapters.length === 2, `chapters=${parsed.chapters.length}`);
  const ch1 = parsed.chapters[0]!;
  assert(ch1.paragraphs.length === 4, `ch1 paragraphs=${ch1.paragraphs.length}`);
  assert(ch1.paragraphs[0] === "It was a quiet night when the phone rang.", "ch1 p0");
  // The ad div should have been stripped -> content text remains 4 paragraphs
  assert(ch1.paragraphs.length === 4, "ad div stripped -> 4 paragraphs");
  assert(ch1.paragraphs.some((p) => p.includes("We found him,")), "ch1 includes dialogue");
}

// 3. Graceful error on non-content
const bad = parser.parse("<html><body><div>Just a login page</div></body></html>", "https://archiveofourown.org/works/1");
assert(!bad.ok, "empty content -> not ok");

console.log("done");
