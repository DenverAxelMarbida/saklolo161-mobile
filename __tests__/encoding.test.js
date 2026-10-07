const fs = require("fs");
const path = require("path");

function collectJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, out);
    } else if (entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const root = path.join(__dirname, "..");
const sourceFiles = [
  ...collectJsFiles(path.join(root, "src")),
  ...collectJsFiles(path.join(root, "lib")),
  path.join(root, "App.js"),
];

// UTF-8 bytes double-decoded as Windows-1252: â€¦ (ellipsis), â€” (em dash),
// â€™ / â€œ (smart quotes), Ã followed by a continuation byte.
const MOJIBAKE = /\u00e2\u20ac|\u00c3[\u0080-\u00bf]/;

describe("source text encoding", () => {
  it("contains no mojibake sequences in user-facing app sources", () => {
    const offenders = [];
    for (const file of sourceFiles) {
      const src = fs.readFileSync(file, "utf8");
      const matches = src.match(new RegExp(MOJIBAKE.source, "g"));
      if (matches) {
        offenders.push({ file: path.relative(root, file), matches });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the intended GPS/location wording intact", () => {
    const src = fs.readFileSync(
      path.join(root, "src", "screens", "IncidentForm.js"),
      "utf8"
    );
    expect(src).toContain("Acquiring GPS\u2026");
    expect(src).toContain("Waiting for your location\u2026");
    expect(src).toContain("ACQUIRING LOCATION\u2026");
    expect(src).toContain("Refresh GPS");
    expect(src).toContain("Retry GPS");
  });
});
