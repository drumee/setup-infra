const argparse = require("argparse");
const { existsSync } = require("fs");
const { readFileSync } = require(`jsonfile`);
const ip = require('@assetval/ip');
const { isPublishableIp6 } = require("./ip6");

const {
  ACME_DIR,
  ADMIN_EMAIL,
  BACKUP_STORAGE,
  DRUMEE_DATA_DIR,
  DRUMEE_DB_DIR,
  DRUMEE_DESCRIPTION,
  DRUMEE_RECONFIGURE,
  DRUMEE_ROOT,
  FORCE_INSTALL,
  HTTP_PORT,
  HTTPS_PORT,
  MAX_BODY_SIZE,
  OWN_CERTS_DIR,
  PRIVATE_DOMAIN,
  PRIVATE_IF4,
  PRIVATE_IP4,
  PRIVATE_IP6,
  PUBLIC_DOMAIN,
  PUBLIC_IP4,
  PUBLIC_IP6,
} = process.env;

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

parser.add_argument("--debug", {
  type: "int",
  default: 0,
  help: "Debug",
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
  help: "Dataset required to install Drumee",
});

parser.add_argument("--localhost", {
  type: "int",
  default: 0,
  help: "If set, write only configs related to localhost setup. No bind",
});

// Defaults from DRUMEE_RECONFIGURE so a package can drive it: bin/install invokes
// `node infra.js` with no arguments, so without an environment default there is no
// way for an operator's answer to reach this. drumee-infra's debconf asks before
// re-rendering an existing host and exports the variable when the answer is yes.
//
// Compared as a string rather than coerced: an unset variable is undefined, and
// "0"/"false" must not read as true — the whole point is that re-rendering happens
// only when it was explicitly agreed to.
parser.add_argument("--reconfigure", {
  type: "int",
  default: (DRUMEE_RECONFIGURE === "1" || DRUMEE_RECONFIGURE === "true") ? 1 : 0,
  help: "If set, overwrite all exisiting settings (env: DRUMEE_RECONFIGURE=1)",
});

parser.add_argument("--db-dir", {
  type: String,
  default: DRUMEE_DB_DIR || '/srv/db',
  help: "Db data dir",
});

parser.add_argument("--data-dir", {
  type: String,
  default: DRUMEE_DATA_DIR || '/data',
  help: "Db data dir",
});

parser.add_argument("--own-certs-dir", {
  type: String,
  default: OWN_CERTS_DIR,
  help: "If set, use as sertificates dir",
});

parser.add_argument("--acme-dir", {
  type: String,
  default: ACME_DIR || '/usr/share/acme',
  help: "Acme base dir",
});

parser.add_argument("--watch", {
  type: "int",
  default: 0,
  help: "If set, configure pm2 to watch changes on main endpoint",
});

parser.add_argument("--only-infra", {
  type: "int",
  default: 1,
  help: "If set, write only configs related to infra. Same as no-jitsi",
});

parser.add_argument("--no-jitsi", {
  type: "int",
  default: 1,
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
  // --force-install is accepted as an alias for --reconfigure. It was declared
  // (below, "Override existing configs") but read by nothing, so a caller passing
  // it got the opposite of what it says: the guard held, infra.js exit(0)'d, and the
  // caller saw success with nothing re-rendered. drumee-infra's postinst passed
  // exactly that on `dpkg-reconfigure`, which is why no configuration fix could
  // reach an installed host. Kept rather than removed: an already-deployed postinst
  // still passes it, and deleting the option would turn that into an argparse error.
  if (args.reconfigure == 1 || args.force_install == 1 || args.force_install === "true") {
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

/**
 * 
 */
function randomString() {
  let crypto = require("crypto");
  return crypto.randomBytes(16).toString("base64").replace(/[\+\/=]+/g, "");
}


/**
 * 
 */
function getAddresses(data) {
  let os = require("os");
  let interfaces = os.networkInterfaces();
  let private_ip4, public_ip4, private_ip6, public_ip6;
  let private_if4, private_subnet_mask, private_broadcast_address;
  for (let name in interfaces) {
    if (name == 'lo') continue;
    for (let dev of interfaces[name]) {
      switch (dev.family) {
        case 'IPv4':
          if (ip.isPrivate(dev.address) && !private_ip4) {
            private_ip4 = dev.address;
            private_if4 = name;
            private_subnet_mask = dev.netmask;
            let a = private_ip4.split('.');
            let b = private_subnet_mask.split('.');
            let i = 0;
            let br = [];
            for (let c of b) {
              if (c == '255') {
                br.push(a[i])
              } else {
                br.push('255')
              }
              i++;
            }
            private_broadcast_address = br.join('.')
          }
          if (!ip.isPrivate(dev.address) && !public_ip4) {
            public_ip4 = dev.address;
          }
          break;
        case 'IPv6':
          // A link-local address must never reach a zone file — see ip6.js. The ip
          // module classes fe80::/10 as private, so without this guard a box whose
          // only IPv6 is link-local published it as the AAAA of every name it serves.
          if (!isPublishableIp6(dev.address)) break;
          if (ip.isPrivate(dev.address) && !private_ip6) {
            private_ip6 = dev.address;
          }
          if (!ip.isPrivate(dev.address) && !public_ip6) {
            public_ip6 = dev.address;
          }
          break;
      }
    }
  }

  // Normalized to "" rather than left undefined, exactly as public_ip6 is below:
  // the zone templates gate their AAAA block on `!== "undefined" && != ""`, and an
  // operator-supplied value gets the same guard as a detected one — an explicit
  // --private-ip6 fe80::1 is no more publishable than a detected one.
  data.private_ip6 = args.private_ip6 || PRIVATE_IP6 || private_ip6 || "";
  if (!isPublishableIp6(data.private_ip6)) data.private_ip6 = "";
  data.private_ip4 = args.private_ip4 || PRIVATE_IP4 || private_ip4;
  data.private_if4 = args.private_ip4 || PRIVATE_IF4 || private_if4;
  data.private_if4 = args.private_ip4 || PRIVATE_IF4 || private_if4;
  data.private_broadcast_address = private_broadcast_address || '255.255.255.255';
  data.private_subnet_mask = private_subnet_mask || '255.255.255.0';

  data.public_ip4 = args.public_ip4 || PUBLIC_IP4 || public_ip4;
  data.public_ip6 = args.public_ip6 || PUBLIC_IP6 || public_ip6 || "";
  if (!isPublishableIp6(data.public_ip6)) data.public_ip6 = "";

  /** Named extra settings */
  data.allow_recursion = 'localhost;';

  if (data.public_ip4) {
    data.allow_recursion = `${data.allow_recursion} ${data.public_ip4};`
    let a = data.public_ip4.split('.');
    a.pop();
    data.reverse_public_ip4 = a.reverse().join('.');
  } else {
    data.reverse_public_ip4 = ""
  }

  if (!data.public_ip6) {
    data.public_ip6 = "";
  }
  if (data.private_ip4) {
    data.allow_recursion = `${data.allow_recursion} ${data.private_ip4};`
    let a = data.private_ip4.split('.');
    a.pop();
    data.reverse_private_ip4 = a.reverse().join('.');
  } else {
    data.reverse_private_ip4 = ""
  }

  if (!data.public_ip6) {
    data.public_ip6 = "";
  }

  return data;
}

module.exports = { args, parser, hasExistingSettings, randomString, getAddresses };