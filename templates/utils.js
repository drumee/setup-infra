const argparse = require("argparse");
const { existsSync } = require("fs");
const { readFileSync } = require(`jsonfile`);

const parser = new argparse.ArgumentParser({
  description: "Drumee Infrastructure Helper",
  add_help: true,
});

parser.addArgument("--readonly", {
  type: "int",
  defaultValue: 0,
  help: "Print content instead of actually writing to files",
});

parser.addArgument("--chroot", {
  type: String,
  defaultValue: null,
  help: "Output root. Defaulted to /",
});

parser.addArgument("--force-install", {
  type: String,
  defaultValue: 0,
  help: "Override existing configs",
});

parser.addArgument("--outdir", {
  type: String,
  defaultValue: null,
  help: "If set, takes precedent on chroot. Output root. Defaulted to /",
});

parser.addArgument("--public-domain", {
  type: String,
  defaultValue: null,
  help: "Public domain name",
});

parser.addArgument("--private-domain", {
  type: String,
  defaultValue: null,
  help: "Private domain name",
});

parser.addArgument("--public-ip4", {
  type: String,
  defaultValue: null,
  help: "Public IPV4",
});

parser.addArgument("--public-ip6", {
  type: String,
  defaultValue: null,
  help: "Public IPV6",
});

parser.addArgument("--private-ip4", {
  type: String,
  defaultValue: null,
  help: "Private IPV4",
});

parser.addArgument("--envfile", {
  type: String,
  help: "Data set required to install Drumee",
});

parser.addArgument("--only-infra", {
  type: "int",
  defaultValue: 0,
  help: "If set, write only configs related to infra. Same as no-jitsi",
});

parser.addArgument("--no-jitsi", {
  type: "int",
  defaultValue: 0,
  help: "If set, won't write configs related to jisit. Same as only-infra",
});

const args = parser.parseArgs();

/**
 * 
 */
function hasExistingSettings(envfile = '/etc/drumee/drumee.json') {
  if (!existsSync(envfile)) return false;
  const { domain_name } = readFileSync(envfile);
  if (!domain_name) return false;
  const override = process.env.FORCE_INSTALL || args.force_install;
  if (override) {
    console.log(
      `There is already a Drumee instance installed on this server but you selected FORCE_INSTALL\n`,
      `ALL EXISTING DATA related to ${domain_name} WILL BE LOST\n`,
    );
    return false;
  }
  console.log(
    `There is already a Drumee instance installed on this server\n`,
    `domain name = ${domain_name}\n`,
    `Use --force-install or export FORCE_INSTALL=1\n`,
    `********************************************\n`,
    `* WARNING : ALL EXISTING DATA WILL BE LOST *\n`,
    `********************************************\n`,
  );
  return true;
}

module.exports = { args, hasExistingSettings };