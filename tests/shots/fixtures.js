const LONG = `---
date: "2026-09-14"
---
# Building a Rust CLI

A long note exercising **every** element: *italic*, \`inline code\`, [a link](https://example.com), ~~strike~~.

## Code

\`\`\`rust
fn main() {
    let args: Vec<String> = std::env::args().collect();
    println!("Hello {}, this is a deliberately long line that should overflow horizontally in the code block", args[0]);
}
\`\`\`

## Table

| Crate | Purpose | Stars |
|---|---|---:|
| clap | argument parsing | 13k |
| serde | serialization | 9k |
| tokio | async runtime | 26k |

## Tasks

- [x] scaffold project
- [ ] write tests
- [ ] publish

> A blockquote with some wisdom about software that wraps across lines when it is long enough.

### Lists

1. one
2. two
   - nested
   - nested again

---

Final paragraph. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
`;

export const FILES = {
  "Home.md":
    "# Welcome\n\nThis is the home page.\n\n- [ ] task one\n- [x] task two\n",
  "posts/First post.md":
    '---\ndate: "2026-10-01"\n---\n# First post\n\nHello world, this is the first post with a longer excerpt that should wrap nicely.\n',
  "posts/Second post.md":
    '---\ndate: "2026-11-02"\n---\n# Second post\n\nAnother day, another note.\n',
  "posts/Building a Rust CLI.md": LONG,
  "ideas/Garden.md":
    "# Garden\n\nTomatoes, basil and **chili**.\n\n1. Water\n2. Weed\n",
  "ideas/deep/nested/Very deeply nested note with a long title.md":
    "# Deep\n\ntext\n",
  "ideas/empty/": "",
  "Shopping.md": "# Shopping\n\n- [ ] milk\n- [x] bread\n",
};

export const MANY = {
  ...FILES,
  ...Object.fromEntries(
    Array.from({ length: 16 }, (_, i) => [
      `garden/Plant ${i}.md`,
      `# Plant ${i}\n`,
    ]),
  ),
};
