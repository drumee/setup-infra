const argparse = require("argparse");
const { existsSync } = require("fs");
const { readFileSync } = require(`jsonfile`);
const {
  BACKUP_STORAGE,
  DRUMEE_DATA_DIR,
  DRUMEE_DB_DIR,
  MAX_BODY_SIZE,
  PRIVATE_DOMAIN,
  PRIVATE_IP4,
  PUBLIC_DOMAIN,
  PUBLIC_IP4,
  PUBLIC_IP6,
  DRUMEE_ROOT,
  HTTP_PORT,
  HTTPS_PORT,
  FORCE_INSTALL,
  ADMIN_EMAIL,
  DRUMEE_DESCRIPTION
} = process.env;

const parser = new argparse.ArgumentParser({
  description: "Drumee Infrastructure Helper",
  add_help: true,
});

parser.add_argument("--admin_email", {
  type: String,
  default: ADMIN_EMAIL || "admin@localhost",
  help: "Drumee Instance Admin User Email",
});

parser.add_argument("--description", {
  type: String,
  default: DRUMEE_DESCRIPTION || "My Drumee Team Server",
  help: "Drumee Instance Description",
});

parser.add_argument("--readonly", {
  type: "int",
  default: 0,
  help: "Print content instead of actually writing to files",
});

parser.add_argument("--chroot", {
  type: String,
  default: '/',
  help: "Output root. Defaulted to /",
});

parser.add_argument("--reconfigure", {
  type: "int",
  default: FORCE_INSTALL || 0,
  help: "Override existing configs",
});

parser.add_argument("--outdir", {
  type: String,
  default: '/',
  help: "If set, takes precedent on chroot. Output root. Defaulted to /",
});

parser.add_argument("--log-dir", {
  type: String,
  default: '/var/log/drumee',
  help: "Drumee server log location",
});

parser.add_argument("--verbosity", {
  type: "int",
  default: 2,
  help: "Server log level",
});

parser.add_argument("--public-domain", {
  type: String,
  default: PUBLIC_DOMAIN,
  help: "Public domain name",
});

parser.add_argument("--private-domain", {
  type: String,
  default: PRIVATE_DOMAIN,
  help: "Private domain name",
});

parser.add_argument("--local-domain", {
  type: String,
  default: PRIVATE_DOMAIN,
  help: "",
});

parser.add_argument("--public-ip4", {
  type: String,
  default: PUBLIC_IP4,
  help: "Public IPV4",
});

parser.add_argument("--public-ip6", {
  type: String,
  default: PUBLIC_IP6,
  help: "Public IPV6",
});

parser.add_argument("--private-ip4", {
  type: String,
  default: PRIVATE_IP4,
  help: "Private IPV4",
});

parser.add_argument("--envfile", {
  type: String,
  help: "Dataset required to install Drumee",
});

parser.add_argument("--only-infra", {
  type: "int",
  default: 0,
  help: "If set, write only configs related to infra. Same as no-jitsi",
});

parser.add_argument("--localhost", {
  type: "int",
  default: 0,
  help: "If set, write minimal configs, no jitsi, no bind",
});

parser.add_argument("--http-port", {
  type: "int",
  default: HTTP_PORT || 80,
  help: "If set, write minimal configs, no jitsi, no bind",
});

parser.add_argument("--https-port", {
  type: "int",
  default: HTTPS_PORT || 443,
  help: "If set, write minimal configs, no jitsi, no bind",
});

parser.add_argument("--data-dir", {
  type: String,
  default: DRUMEE_DATA_DIR || "/var/lib/drumee/data",
  help: "Partition or directory dedicated to store drumee data",
});

parser.add_argument("--db-dir", {
  type: String,
  default: DRUMEE_DB_DIR || "/var/lib/mysql",
  help: "Partition or directory dedicated to store drumee database",
});

parser.add_argument("--system-user", {
  type: String,
  default: "www-data",
  help: "System user used to run Drumee",
});

parser.add_argument("--system-group", {
  type: String,
  default: "www-data",
  help: "System group used to run Drumee",
});

parser.add_argument("--watch-dirs", {
  type: String,
  default: null,
  help: "pm2 watch directories",
});

parser.add_argument("--watch-delay", {
  type: 'int',
  default: 1000,
  help: "pm2 watch delay",
});

parser.add_argument("--watch-symlinks", {
  type: 'int',
  default: 0,
  help: "pm2 watch delay",
});

parser.add_argument("--watch-ignore", {
  type: String,
  default: null,
  help: "pm2 ignore directories",
});

parser.add_argument("--drumee-root", {
  type: String,
  default: DRUMEE_ROOT || "/var/lib/drumee",
  help: "Drumee main base",
});


parser.add_argument("--no-jitsi", {
  type: "int",
  default: 0,
  help: "If set, won't write configs related to jisit. Same as only-infra",
});

parser.add_argument("--max-body-size", {
  type: String,
  default: MAX_BODY_SIZE || '10G',
  help: "If set, won't write configs related to jisit. Same as only-infra",
});

parser.add_argument("--backup-storage", {
  type: String,
  default: BACKUP_STORAGE || '10G',
  help: "If set, the partition or directiry will used to backup Drumee data",
});

const args = parser.parse_args();

/**
 * 
 */
function hasExistingSettings(envfile = '/etc/drumee/drumee.json') {
  if (!existsSync(envfile)) return false;
  const { domain_name } = readFileSync(envfile);
  if (!domain_name) return false;
  if (args.reconfigure == 1) {
    console.log(
      `There is already a Drumee instance installed on this server but you selected reconfigure\n`,
      `ALL EXISTING DATA related to ${domain_name} WILL BE LOST\n`,
    );
    return false;
  }
  console.log(
    `There is already a Drumee instance installed on this server\n`,
    `domain name = ${domain_name}\n`,
    `Use --reconfigure=1 \n`,
    `********************************************\n`,
    `* WARNING : ALL EXISTING DATA WILL BE LOST *\n`,
    `********************************************\n`,
  );
  return true;
}

module.exports = { args, parser, hasExistingSettings };