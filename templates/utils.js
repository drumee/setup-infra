const argparse = require("argparse");
const { existsSync } = require("fs");
const { readFileSync } = require(`jsonfile`);

const parser = new argparse.ArgumentParser({
  description: "Drumee Infrastructure Helper",
  add_help: true,
});

parser.add_argument("--readonly", {
  type: "int",
  default: 0,
  help: "Print content instead of actually writing to files",
});

parser.add_argument("--chroot", {
  type: String,
  default: null,
  help: "Output root. Defaulted to /",
});

parser.add_argument("--force-install", {
  type: String,
  default: 0,
  help: "Override existing configs",
});

parser.add_argument("--outdir", {
  type: String,
  default: null,
  help: "If set, takes precedent on chroot. Output root. Defaulted to /",
});

parser.add_argument("--public-domain", {
  type: String,
  default: null,
  help: "Public domain name",
});

parser.add_argument("--private-domain", {
  type: String,
  default: null,
  help: "Private domain name",
});

parser.add_argument("--public-ip4", {
  type: String,
  default: null,
  help: "Public IPV4",
});

parser.add_argument("--public-ip6", {
  type: String,
  default: null,
  help: "Public IPV6",
});

parser.add_argument("--private-ip4", {
  type: String,
  default: null,
  help: "Private IPV4",
});

parser.add_argument("--private-ip6", {
  type: String,
  default: null,
  help: "Private IPV6",
});

parser.add_argument("--envfile", {
  type: String,
  help: "Data set required to install Drumee",
});

parser.add_argument("--only-infra", {
  type: "int",
  default: 0,
  help: "If set, write only configs related to infra. Same as no-jitsi",
});

parser.add_argument("--no-jitsi", {
  type: "int",
  default: 0,
  help: "If set, won't write configs related to jisit. Same as only-infra",
});

const args = parser.parse_args();

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