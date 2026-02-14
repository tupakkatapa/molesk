const path = require("path");
const fsSync = require("fs");
const { MD_EXTENSIONS, ensureProtocol } = require("./helpers");

function parseLinkArgs(args, startIndex, config) {
  let i = startIndex + 1;
  while (i < args.length && !args[i].startsWith("-")) {
    const splitIndex = args[i].indexOf(":");
    if (splitIndex === -1) {
      console.error(`Invalid format for --link: ${args[i]}`);
    } else {
      const fab = args[i].slice(0, splitIndex);
      const href = ensureProtocol(args[i].slice(splitIndex + 1));
      config.SOCIAL_LINKS.push({ fab, href });
    }
    i++;
  }
  return i - 1;
}

function handlePositionalArg(target, config) {
  if (!fsSync.existsSync(target)) {
    console.error(`Error: Path does not exist: ${target}`);
    process.exit(1);
  }
  const stat = fsSync.statSync(target);
  if (
    stat.isFile() &&
    MD_EXTENSIONS.includes(path.extname(target).toLowerCase())
  ) {
    config.SINGLE_FILE = target;
    config.CONTENTS_DIR = path.dirname(target);
    config.AUTO_OPEN = true;
  } else if (stat.isDirectory()) {
    config.CONTENTS_DIR = target;
  }
}

const TOGGLE_FLAGS = {
  "--no-source": ["SHOW_SOURCE", false],
  "--no-rss": ["SHOW_RSS", false],
  "--no-download": ["SHOW_DOWNLOAD", false],
  "-o": ["AUTO_OPEN", true],
  "--open": ["AUTO_OPEN", true],
};

const VALUE_FLAGS = {
  "-a": "HOST",
  "--address": "HOST",
  "-i": "IMAGE",
  "--image": "IMAGE",
};

function parseArgs(config) {
  const args = process.argv.slice(2);
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (TOGGLE_FLAGS[arg]) {
      const [key, value] = TOGGLE_FLAGS[arg];
      config[key] = value;
      continue;
    }
    if (VALUE_FLAGS[arg] && args[i + 1]) {
      config[VALUE_FLAGS[arg]] = args[++i];
      continue;
    }
    switch (arg) {
      case "-h":
      case "--help":
        displayHelp();
        process.exit(0);
        break;
      case "-p":
      case "--port":
        if (args[i + 1]) config.PORT = parseInt(args[++i], 10);
        break;
      case "-t":
      case "--title":
        if (args[i + 1] && !args[i + 1].startsWith("-")) {
          config.TITLE = args[++i];
          while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
            config.TITLE += ` ${args[++i]}`;
          }
        }
        break;
      case "-l":
      case "--link":
        i = parseLinkArgs(args, i, config);
        break;
      default:
        if (!arg.startsWith("-")) positionalArgs.push(arg);
        break;
    }
  }
  if (positionalArgs.length > 0) {
    handlePositionalArg(path.resolve(positionalArgs[0]), config);
  }
}

function displayHelp() {
  const cmd =
    path.basename(process.argv[1]) === "molesk" ? "molesk" : "node app.js";
  console.log(`Usage: ${cmd} [file.md|directory] [options]

Arguments:
  file.md             Open a single markdown file in viewer mode
  directory           Serve markdown files from directory

Options:
  -h, --help          Display this help information
  -o, --open          Auto-open browser after starting server
  -a, --address       Set the host address (default: '0.0.0.0')
  -p, --port          Set the port number (default: 8080)
  -t, --title         Set the title displayed on the site (default: data source name)
  -i, --image         Set the path to the profile picture
  -l, --link          Add link with icon and URL in the format 'icon:url'
                      (e.g., --link fa-github:https://github.com/username)
  --no-source         Hide source code link in footer
  --no-rss            Hide RSS feed link in footer
  --no-download       Hide download button on content

Examples:
  ${cmd} README.md${" ".repeat(14 - cmd.length)}View single file (opens browser)
  ${cmd} ./docs${" ".repeat(17 - cmd.length)}Serve docs directory
  ${cmd} -o ./blog${" ".repeat(14 - cmd.length)}Serve blog and open browser`);
}

function openBrowser(url) {
  const { exec } = require("child_process");
  const commands = { darwin: "open", win32: "start" };
  const cmd = commands[process.platform] || "xdg-open";
  exec(`${cmd} ${url}`);
}

module.exports = { parseArgs, displayHelp, openBrowser };
