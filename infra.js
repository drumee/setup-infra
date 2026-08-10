#!/usr/bin/env node

const Template = require("./templates");
const { writeFileSync, readFileSync: readJson } = require(`jsonfile`);
const { join, dirname } = require("path");
const { isString } = require("lodash");
const { exit } = process;
const { loadSysEnv, sysEnv, uniqueId } = require("@drumee/server-essentials");
const { totalmem, userInfo } = require('os');
const {
  existsSync, close, writeSync, openSync, readFileSync, mkdirSync, unlinkSync
} = require("fs");
const { args, hasExistingSettings, getAddresses } = require('./templates/utils')


const JSON_OPT = { spaces: 2, EOL: "\r\n" };
let {
  ACME_EMAIL_ACCOUNT,
  ACME_ENV_FILE,
  ACME_DIR,
  ADMIN_EMAIL,
  BACKUP_STORAGE,
  CERTS_DIR,
  // Where the database actually is, and who connects to it. Hardcoded as
  // localhost/drumee-app until now, which is right for a single box and wrong for a
  // deployment where the database is a container of its own: the rendered db.json said
  // localhost, so the container channel had to overwrite the file from its own
  // entrypoint — two writers for one credential, and the copy the render produced was
  // never the one in use. Defaults below preserve the native values exactly.
  // Where the application tier listens, for the nginx upstreams. Hardcoded 127.0.0.1 in
  // the route templates until now — correct on one box, and guaranteed wrong when nginx and
  // the app are separate containers: the web role proxied to itself and answered 502 with a
  // perfectly healthy app one hostname away. Same shape of bug as db.json's host.
  APP_HOST,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DRUMEE_DESCRIPTION,
  DRUMEE_DOMAIN_NAME,
  DRUMEE_HTTP_PORT,
  DRUMEE_HTTPS_PORT,
  DRUMEE_LOCAL_PORT,
  INSTANCE_TYPE,
  MAIL_USER,
  NSUPDATE_KEY,
  PRIVATE_DOMAIN,
  STORAGE_BACKUP,
  USE_JITSI,
} = process.env;

let PUBLIC_DOMAIN = DRUMEE_DOMAIN_NAME;

if (PUBLIC_DOMAIN) {
  if (!PRIVATE_DOMAIN) PRIVATE_DOMAIN = PUBLIC_DOMAIN.replace(/\.([a-z_\-0-9]{2,})$/, '.lan');
}

PRIVATE_DOMAIN = PRIVATE_DOMAIN || 'drumee.lan';
if (args.own_certs_dir) PRIVATE_DOMAIN = null;
DRUMEE_HTTPS_PORT = DRUMEE_HTTPS_PORT || 443;
DRUMEE_LOCAL_PORT = DRUMEE_LOCAL_PORT || 8443;
DRUMEE_HTTP_PORT = DRUMEE_HTTP_PORT || 80;

/**
 *
 * @param {*} l
 * @returns
 */
function randomString(l = 16) {
  let crypto = require("crypto");
  return crypto
    .randomBytes(16)
    .toString("base64")
    .replace(/[\+\/=]+/g, "");
}

/**
 *
 * @param {*} data
 * @returns
 */
function copyFields(data, keys) {
  let r = {};
  for (let key of keys) {
    if (data[key] !== null) {
      r[key] = data[key];
    }
  }
  return r;
}

/**
 *
 * @param {*} data
 * @returns
 */
function factory(data) {
  let route = "main";
  let base = `${data.server_dir}/${route}/`;
  return {
    name: "factory",
    script: `./index.js`,
    autorestart: false,
    cwd: `${base}/offline/factory`,
    env: copyFields(data, [
      "domain_name",
      "domain_desc",
      "data_dir",
      "system_user",
      "system_group",
      "drumee_root",
      "cache_dir",
      "acme_dir",
      "acme_dns",
      "acme_email_account",
      "static_dir",
      "runtime_dir",
      "credential_dir",
    ]),
    dependencies: [`pm2-logrotate`],
  };
}

/**
 *
 * @param {*} data
 * @returns
 */
function worker(data, instances = 1, exec_mode = 'fork_mode') {
  let {
    script,
    pushPort,
    route,
    restPort,
    name,
    server_dir,
    runtime_dir,
  } = data;

  if (!server_dir) server_dir = join(runtime_dir, 'server');
  let base = `${server_dir}/${route}`;
  let iname = name.replace(/\//g, '-');
  const opt = {
    name,
    script,
    cwd: base,
    args: `--pushPort=${pushPort} --restPort=${restPort}`,
    route,
    env: {
      cwd: base,
      route,
      server_home: base,
    },
    dependencies: [`pm2-logrotate`],
    exec_mode,
    instances,
    out_file: join(data.log_dir, `log-${iname}.log`),
    error_file: join(data.log_dir, `error-${iname}.log`),
    pm2_log_routes: {
      rotateInterval: '0 0 * * *', // Rotate daily at midnight
      rotateModule: true,
      max_size: '10M', // Rotate when log reaches 10MB
      retain: 30 // Keep 30 rotated logs
    }
  };
  if (args.watch) {
    opt.watch = [
      base,
      join(runtime_dir, 'plugins', 'server', route),
      join(runtime_dir, 'plugins', 'ui', route),
    ]
  }
  return opt;
}

/***
 * 
 */
function writeTemplates(data, targets) {
  if (args.readonly || args.noCheck) {
    console.log("Readonly", targets, data);
    return
  }
  for (let target of targets) {
    try {
      if (isString(target)) {
        Template.write(data, target, target);
      } else {
        let { out, tpl } = target;
        Template.write(data, out, tpl);
      }
    } catch (e) {
      console.error("Failed to write configs for", target, e)
    }
  }
}

/**
 * 
 * @returns 
 */
function isDevInstance() {
  return /^dev/.test(INSTANCE_TYPE)
}

/**
 *
 */
function writeEcoSystem(data) {
  const ports = {
    pushPort: 23000,
    restPort: 24000,
    route: "main",
  };
  let main = worker({
    ...data,
    ...ports,
    name: "main",
    script: "./index.js",
  });

  let instances = 4;
  if ((totalmem() / (1024 * 1024 * 1024)) < 2) {
    instances = 2;
  } else if ((totalmem() / (1024 * 1024 * 1024) < 6)) {
    instances = 3;
  }

  let main_service = worker({
    ...data,
    ...ports,
    name: "main/service",
    script: "./service.js"
  }, instances, 'cluster_mode');


  let f = factory(data);
  let routes = [main, main_service, f];

  let ecosystem = Template.chroot("etc/drumee/infrastructure/ecosystem.json");
  if (args.readonly) {
    console.log("Readonly", ecosystem, routes);
    return
  }
  console.log("Writing ecosystem into ", ecosystem);
  Template.makedir(dirname(ecosystem));
  writeFileSync(ecosystem, routes, JSON_OPT);
  let targets = [
    {
      out: `${data.server_dir}/ecosystem.config.js`,
      tpl: "server/ecosystem.config.js",
    },
  ];
  // The RUNTIME path, not the chroot one. `ecosystem` is where this render writes the
  // file, and under --chroot that is prefixed — so passing it to the template baked
  // `require("/out/etc/drumee/infrastructure/ecosystem.json")` into
  // srv/drumee/runtime/server/ecosystem.config.js, a path that exists only on the machine
  // that did the rendering. Native installs never saw it because the prefix is empty there.
  //
  // The rule this is an instance of: a path written INTO a rendered file has to be the path
  // the file's reader will see, which is never the chroot-prefixed one.
  writeTemplates({
    ecosystem: "/etc/drumee/infrastructure/ecosystem.json",
    chroot: Template.chroot,
  }, targets);
}

function getSocketPath() {
  const { exec } = require("shelljs");
  let socketPath = "/var/run/mysqld/mysqld.sock";
  try {
    socketPath = exec(`mariadb_config --socket`, {
      silent: true,
    }).stdout;
    if (socketPath) {
      socketPath = socketPath.trim();
    }
  } finally {
  }
  return socketPath;
}


/**
 * 
 * @param {*} opt 
 * @returns 
 */
function makeData(opt) {
  let data = sysEnv();
  if (args.env_file && existsSync(args.env_file)) {
    loadEnvFile(args.env_file, opt)
  }
  data.chroot = Template.chroot();
  data.ca_server = data.ca_server || data.acme_ssl;
  for (let row of opt) {
    let [key, value, fallback] = row;
    if (!value) value = data[key] || fallback;
    if (value == null) continue;
    if (isString(value)) {
      if (/.+\+$/.test(value)) {
        value = value.replace(/\+$/, data[key]);
      }
      if (isString(value)) {
        data[key] = value.trim() || fallback;
      } else {
        data[key] = value;
      }
    } else {
      data[key] = value
    }
  }


  if (!data.storage_backup) {
    data.storage_backup = ""
  }

  if (data.private_domain) {
    data.jitsi_private_domain = `jit.${data.private_domain}`;
  } else {
    data.jitsi_private_domain = "";
  }
  // The public counterpart was never derived here, even though templates rendered
  // by infra.js use it — var/lib/bind/public.tpl sets `$ORIGIN <jitsi_public_domain>`
  // for the conferencing sub-zone, and drumee.sh exports it as JITSI_DOMAIN for
  // bin/init-acme and bin/prosody.
  data.jitsi_public_domain = data.public_domain ? `jit.${data.public_domain}` : "";

  // Vendors surface. Same backend as the apex, but served under its own name so
  // that it carries its own certificate: a wildcard matches exactly ONE label, so
  // *.<domain> covers vendors.<domain> and nothing below it. The private/LAN name
  // is derived for completeness, but only the public one gets a vhost — the
  // self-signed path (bin/create-local-certs) would need a matching .cnf first.
  data.vendors_public_domain = data.public_domain ? `vendors.${data.public_domain}` : "";
  data.vendors_private_domain = data.private_domain ? `vendors.${data.private_domain}` : "";

  if (data.public_domain) {
    data.use_email = 1;
  } else {
    data.use_email = 0;
  }

  if (isDevInstance()) {
    data.disable_symlinks = 'off';
    data.logLevel = 3;
  } else {
    data.disable_symlinks = 'on';
    data.logLevel = 2;
  }
  return data;
}

/**
 * 
 * @param {*} env 
 * @param {*} opt 
 */
function loadEnvFile(file, opt) {
  let src = readJson(file);
  opt.map((r) => {
    let [key] = r;
    if (src[key] != null) r[1] = src[key];
  })
  console.log(opt)
}

/**
 *
 */
function getSysConfigs() {
  let {
    public_domain, private_domain, private_ip4, public_ip4, public_ip6, backup_storage, ui_plugins_home,
  } = sysEnv();
  if (hasExistingSettings(Template.chroot('etc/drumee/drumee.json'))) {
    exit(0)
  }

  public_domain = args.public_domain || PUBLIC_DOMAIN || public_domain;
  private_domain = args.private_domain || PRIVATE_DOMAIN || private_domain;
  backup_storage = args.backup_storage || BACKUP_STORAGE || STORAGE_BACKUP || backup_storage;

  if (!public_domain && !private_domain) {
    console.log("There is no domain name defined for the installation", args);
    exit(0)
  }
  let use_email = 0;
  if (public_domain) {
    use_email = 1;
  }
  // The RUNTIME path. This value is written INTO named.conf.local as an `include`, so it
  // must be the path named will read — not the chroot-prefixed one, which produced
  // `include "/out/etc/bind/keys/update.key"` in a container render and made named refuse
  // its entire configuration. Second instance of this exact mistake (see the ecosystem
  // wrapper above): the chroot prefix belongs to where we WRITE and nowhere else.
  const nsupdate_key = '/etc/bind/keys/update.key'
  if (args.own_certs_dir && existsSync(args.own_certs_dir)) args.certs_dir = args.own_certs_dir;
  const opt = [
    ["acme_dir", args.acme_dir || ACME_DIR || "/usr/share/acme/"],
    // args.admin_email FIRST, matching the line below and the equivalent at :448.
    //
    // The bare ADMIN_EMAIL constant is sysEnv's, whose default is admin@localhost. When the
    // answered admin email arrives as an argument rather than in the environment — which is
    // what dpkg-reconfigure does — this rendered acme_email_account=admin@localhost beside a
    // correct admin_email in the same file. setup-schemas' createAdmin resolves
    // ADMIN_EMAIL || ACME_EMAIL_ACCOUNT || admin@<domain>, so the ADMIN ACCOUNT was created
    // as admin@localhost: the operator's login identity and the destination of the welcome
    // and password-reset mail, both wrong, on an instance whose every other domain field
    // was right. Same class as the domain_name/main_domain fix; this key was missed.
    ["acme_email_account", ACME_EMAIL_ACCOUNT, args.admin_email || ADMIN_EMAIL],
    ["acme_env_file", ACME_ENV_FILE, ""],
    ["admin_email", args.admin_email || ADMIN_EMAIL],
    ["backup_storage", backup_storage, ""],
    ["certs_dir", args.certs_dir],
    ["backend_host", APP_HOST, "127.0.0.1"],
    // Runtime path, like nsupdate_key and the ecosystem wrapper. This value is written into
    // drumee.sh, drumee.json and ecosystem.json, all of which are READ by other processes —
    // so under a chroot it leaked `/out/etc/drumee/credential` into three files the
    // application sources. writeCredentials() resolves its own write target separately, so
    // this only ever needed to be the reader's path.
    ["credential_dir", '/etc/drumee/credential'],
    ["data_dir", args.data_dir, '/var/lib/drumee/data'],
    ["db_dir", args.db_dir, '/var/lib/mysql'],
    ["domain_desc", args.description, DRUMEE_DESCRIPTION || 'My Drumee Box'],
    ["drumee_root", args.drumee_root, "/var/lib/drumee"],
    ["http_port", args.http_port, DRUMEE_HTTP_PORT, 80],
    ["https_port", args.https_port, DRUMEE_HTTPS_PORT, 443],
    ["log_dir", args.log_dir, '/var/log/drumee'],
    ["max_body_size", args.max_body_size, '10G'],
    ["nsupdate_key", NSUPDATE_KEY, nsupdate_key],
    ["own_certs_dir", args.own_certs_dir],
    ["private_domain", args.private_domain, PRIVATE_DOMAIN],
    ["private_ip4", private_ip4],
    ["private_port", DRUMEE_LOCAL_PORT],
    ["public_domain", public_domain],
    ["public_http_port", DRUMEE_HTTP_PORT, 80],
    ["public_https_port", DRUMEE_HTTPS_PORT, 443],
    ["public_ip4", public_ip4],
    ["public_ip6", public_ip6],
    ["storage_backup", backup_storage], /** Legacy */
    ["system_group", args.system_group, 'www-data'],
    ["system_user", args.system_user, 'www-data'],
    ["ui_plugins_home", ui_plugins_home],
    ["use_email", use_email, 0],
    ["use_jitsi", USE_JITSI],
    ["verbosity", args.verbosity, 2],
  ]

  if (!args.localhost) {
    opt.push(
      ["private_ip4", args.private_ip4],
      ["public_domain", args.public_domain],
      ["public_ip4", args.public_ip4],
      ["public_ip6", args.public_ip6],
      ["storage_backup", args.backup_storage], /** Legacy */
      ["private_domain", args.private_domain],
      ["acme_dir", ACME_DIR, "/usr/share/acme/"],
      ["acme_email_account", ACME_EMAIL_ACCOUNT, args.admin_email],
      ["certs_dir", CERTS_DIR],
    )

  }

  let data = makeData(opt);
  if (!data) {
    console.error("Invalid data")
    exit(1);
  }
  let d = new Date().toISOString();
  let [day, hour] = d.split('T')
  day = day.replace(/\-/g, '');
  hour = hour.split(':')[0];
  data.serial = `${day}${hour}`;

  let configs = { ...data };
  let keys = ["myConf", "chroot", "date"];

  for (let key of keys) {
    delete configs[key];
  }

  if (args.readonly) {
    return configs;
  }

  /** Settings designed to be used by the backend server */
  configs.domain = public_domain || private_domain;
  configs.public_domain = public_domain;
  configs.private_domain = private_domain;
  // configs.domain, not data.domain. `data` comes from sysEnv(), i.e. whatever the
  // machine already had — so on a host with no prior configuration these two keys were
  // written as "localhost" while every other file in the same render carried the real
  // domain. Reproduced in a container: `infra.js --chroot=X --public-domain=example.com`
  // wrote DRUMEE_DOMAIN_NAME=example.com into drumee.sh and "domain_name": "localhost"
  // into drumee.json, from one run. It only looked correct where PUBLIC_DOMAIN happened
  // to be exported as well, or where a previous render had already left the value in
  // /etc/drumee/drumee.json for sysEnv() to read back.
  //
  // configs.domain is `public_domain || private_domain` resolved a few lines above with
  // infra.js's own precedence (--public-domain beats the environment), so this is the
  // one authoritative answer for this run.
  configs.main_domain = configs.domain;
  configs.domain_name = configs.domain;
  configs.log_dir = data.log_dir;

  configs.socketPath = getSocketPath();
  configs.runtime_dir = join(configs.drumee_root, 'runtime');
  configs.server_dir = join(configs.runtime_dir, 'server');
  configs.server_base = configs.server_dir;
  configs.server_home = join(configs.server_base, 'main');
  configs.server_location = configs.server_home;

  //console.log(configs)
  configs.ui_dir = join(configs.runtime_dir, 'ui');
  configs.ui_base = join(configs.ui_dir, 'main');
  configs.ui_home = configs.ui_base;
  configs.ui_location = configs.ui_base;

  /** Temp files (download zip staging, upload buffers) can grow very large;
      keep them on the data partition, not the system disk */
  configs.tmp_dir = join(configs.data_dir, 'tmp');
  Template.makedir(Template.chroot(configs.tmp_dir));
  // drumee_root, NOT runtime_dir: the drumee-static package installs its assets to
  // /srv/drumee/static (debian/static/build.sh: bundle … "srv/drumee/static"), while
  // this derived /srv/drumee/runtime/static — a directory that exists but holds only
  // the runtime-generated certs/*.der. Every consumer of static_dir inherited the
  // wrong path: the nginx aliases for /-/static/, /-/images/ and /-/fonts/, the
  // jitsi meet root, DRUMEE_STATIC_DIR in drumee.sh, STATIC_DIR in env.json and
  // static_dir in the pm2 ecosystem.
  //
  // Effect: every stylesheet, font and image 404'd. The page itself was served —
  // generated live, session cookie and all — so status checks on / and the REST
  // endpoint both passed while the UI rendered unstyled. Found by fetching the
  // assets the page references instead of trusting the 200 on the page.
  configs.static_dir = join(configs.drumee_root, 'static');

  let filename = Template.chroot("etc/drumee/drumee.json");
  Template.makedir(dirname(filename));
  writeFileSync(filename, configs, JSON_OPT);
  return configs;
}

/**
 * 
 * @param {*} data 
 */
function writeCredentials(file, data) {
  let target = Template.chroot(`etc/drumee/credential/${file}.json`);
  console.log(`Writing credentials into ${target}`);
  Template.makedir(dirname(target));
  writeFileSync(target, data, JSON_OPT);
}

/**
 * Return a secret this host already has, so a second render does not mint a new one.
 *
 * The three secrets below were generated unconditionally with uniqueId(), which makes
 * re-rendering destructive in a way the warning about it never spelled out: a second
 * run overwrites credential/db.json with a password MariaDB has never been told, and
 * the application loses access to its own database. The mail password is worse still
 * because it is also embedded in the rendered postfix configuration and stored in the
 * mailserver tables, so all three copies must agree.
 *
 * That is the substance behind hasExistingSettings() refusing to re-render at all —
 * and therefore behind the fact that no configuration fix can reach an installed
 * host. Keeping secrets stable is the precondition for ever relaxing that; it does
 * not relax it by itself.
 *
 * `path` walks nested keys (["auth","pass"]). Returns undefined when the file is
 * missing, unparseable, or holds nothing usable there, so the caller generates a
 * fresh secret exactly as on a first install.
 */
function existingCredential(file, path) {
  const target = Template.chroot(`etc/drumee/credential/${file}.json`);
  if (!existsSync(target)) return undefined;
  try {
    let node = readJson(target);
    for (const key of path) {
      if (!node || typeof node !== "object") return undefined;
      node = node[key];
    }
    if (typeof node === "string" && node !== "") {
      console.log(`Keeping the existing ${file} secret (${path.join(".")})`);
      return node;
    }
    return undefined;
  } catch (e) {
    // Never let an unreadable file silently become a new password — say so, and fall
    // back to generating, which is the same outcome as a fresh install.
    console.warn(`Could not read ${target} (${e.message}); generating a new secret`);
    return undefined;
  }
}

/**
 * 
 */
function errorHandler(err) {
  if (err) {
    console.error("Caught error", err);
  }
}

/**
 * 
 * @param {*} data 
 */
function copyConfigs(items) {
  for (let item of items) {
    let src = join(__dirname, 'configs', item);
    let dest = Template.chroot(item);
    console.log(`Copying ${src} to ${dest}`)
    Template.makedir(dirname(dest))
    let content = readFileSync(src);
    let str = String(content).toString();
    //Buffer.from(content, "utf8");
    let fd = openSync(dest, "w+");
    writeSync(fd, str);
    close(fd, errorHandler);
  }
}

/**
 * 
 * @param {*} data 
 */
function getDkim(file) {
  let p = Template.chroot(file);
  // A missing key costs mail signing; it must not cost the configuration. This used to
  // be a bare readFileSync, so any render on a public domain died with an unhandled
  // ENOENT on etc/opendkim/keys/<domain>/dkim.txt — no nginx config, no drumee.sh,
  // nothing — unless the caller had generated the key first. That ordering requirement
  // was undocumented and cost a container render its entire output.
  if (!existsSync(p)) {
    console.warn(`No DKIM key at ${p} — rendering an empty DKIM record.`);
    console.warn(`  Outbound mail will not be signed until opendkim-genkey has run.`);
    return '"v=DKIM1; k=rsa; p="';
  }
  let content = readFileSync(p);
  let str = Buffer.from(content, "utf8");
  let v = `v=DKIM1; k=rsa; p=${str.toString()}`;
  let r = [];
  let start = 0;
  let end = 80;
  let t = v.slice(start, end);;

  while (t.length) {
    t = v.slice(start, end);
    if (t.length) {
      r.push(`"${t}"`)
    }
    start = end;
    end = end + 80;
  }
  return r.join('\n');
}


/**
 *
 */
function writeInfraConf(data) {

  const etc = 'etc';
  const nginx = join(etc, 'nginx');
  const drumee = join(etc, 'drumee');
  const bind = join(etc, 'bind');
  const libbind = join('var', 'lib', 'bind');
  const postfix = join(etc, 'postfix');
  const mariadb = join(etc, 'mysql', 'mariadb.conf.d');
  const infra = join(drumee, 'infrastructure');
  let { certs_dir, own_certs_dir, public_domain, private_domain } = data;
  let targets = [
    `${drumee}/drumee.sh`,
    `${drumee}/conf.d/drumee.json`,
    `${drumee}/conf.d/exchange.json`,
    `${drumee}/conf.d/myDrumee.json`,
    `${drumee}/conf.d/drumee.json`,
    `${drumee}/conf.d/myDrumee.json`,

    `${bind}/named.conf.log`,
    `${bind}/named.conf.options`,
    `${mariadb}/50-server.cnf`,
    `${mariadb}/50-client.cnf`,
    `${bind}/named.conf.local`,
  ];
  if (own_certs_dir) {
    certs_dir = own_certs_dir;
    data.certs_dir = certs_dir;
    private_domain = null;
  }

  if (data.public_ip4 && public_domain) {
    let dir = join(data.drumee_root, 'cache', public_domain)
    mkdirSync(dir, { recursive: true });
    targets.push(
      `${infra}/internals/accel.public.conf`,
      `${infra}/mfs.public.conf`,
      // One shared route set for every vhost — see routes/app.conf.tpl. The old
      // per-domain public.conf/private.conf both declared `location /-/`, and
      // every server block globs routes/*.conf, so rendering both broke nginx
      // outright on any instance that had a public and a private domain.
      `${infra}/routes/app.conf`,
      `${nginx}/sites-enabled/01-public.conf`,
      `${drumee}/ssl/public.conf`,
      // vendors.<domain> + *.vendors.<domain>: same backend, own certificate
      `${nginx}/sites-enabled/03-vendors.public.conf`,
      `${drumee}/ssl/vendors.public.conf`,
      { tpl: `${libbind}/public.tpl`, out: `${libbind}/${public_domain}` },
      { tpl: `${libbind}/public-reverse.tpl`, out: `${libbind}/${data.public_ip4}` }
    );

    const dkim = join(etc, 'opendkim', 'keys', public_domain, 'dkim.txt');
    targets.push(
      `${postfix}/main.cf`,
      `${postfix}/mysql-virtual-alias-maps.cf`,
      `${postfix}/mysql-virtual-mailbox-domains.cf`,
      `${postfix}/mysql-virtual-mailbox-maps.cf`,
      `${etc}/dkimkeys/dkim.key`,
      `${etc}/mail/dkim.key`,
      `${etc}/mailname`,
      `${etc}/opendkim/KeyTable`,
    )
    data.dkim_key = getDkim(dkim);
    data.mail_user = MAIL_USER || 'postfix';
    // Set before the templates render: this value is embedded in the postfix
    // configuration written below AND held in the mailserver tables, so minting a
    // new one on a re-render would break mail on an instance that was working.
    data.mail_password = existingCredential("postfix", ["password"]) || uniqueId();
    data.smptd_cache_db = "btree:$";
  }

  if (data.private_ip4 && private_domain) {
    let dir = join(data.drumee_root, 'cache', private_domain)
    mkdirSync(dir, { recursive: true });
    targets.push(
      `${infra}/internals/accel.private.conf`,
      `${infra}/mfs.private.conf`,
      // Same shared route set as the public vhost. Rendering it here as well is
      // harmless — identical content, and it is the only routes file now — but a
      // private-only instance still needs it written.
      `${infra}/routes/app.conf`,
      `${nginx}/sites-enabled/02-private.conf`,
      `${drumee}/ssl/private.conf`,
      {
        tpl: `${drumee}/certs/private.cnf`,
        out: `${certs_dir}/${private_domain}_ecc/${private_domain}.cnf`
      },
      { tpl: `${libbind}/private.tpl`, out: `${libbind}/${private_domain}` },
      { tpl: `${libbind}/private-reverse.tpl`, out: `${libbind}/${data.private_ip4}` },
    )
  }


  // These files are RENDERED, not shipped, so dpkg cannot clean them: purging
  // drumee-infra leaves every one of them in place, and a reinstall with different
  // settings then inherits them. Anything nginx loads is dangerous when stale,
  // because nginx refuses its ENTIRE configuration over one bad include — a single
  // leftover file takes the whole site down, not just its own vhost. This is
  // therefore done here, where the tree's contents are decided, rather than in a
  // maintainer script.
  //
  // Template.chroot() resolves these the same way the writes do (--outdir /
  // --chroot / DRUMEE_CONF_BASE, else /). The target paths are RELATIVE
  // ("etc/drumee/..."), so testing them directly would check them against the
  // process working directory, silently match nothing, and leave the stale files
  // exactly where they were — which is the failure this exists to prevent.
  const removeStale = (paths, what) => {
    for (const p of paths) {
      const f = Template.chroot(p);
      if (!existsSync(f)) continue;
      try { unlinkSync(f); console.log(`Removed superseded ${what}: ${f}`); }
      catch (e) { console.warn(`Could not remove ${f}: ${e.message}`); }
    }
  };

  // routes/*.conf is glob-included by every vhost, so a file left behind by an
  // older release is still loaded. public.conf and private.conf declared the same
  // location prefixes that app.conf now owns, so an upgrade that only added the new
  // file would keep failing with `duplicate location "/-/"` — the very bug app.conf
  // replaces.
  removeStale(
    [join(infra, 'routes', 'public.conf'), join(infra, 'routes', 'private.conf')],
    'route file');

  // The private vhost, and the files only it includes. The branch above did not run
  // — either because own_certs_dir nulled private_domain, or because the instance
  // has no private address — but a previously rendered 02-private.conf is still in
  // sites-enabled, including an ssl/private.conf this render deliberately no longer
  // produces:
  //
  //   nginx: [emerg] open() "/etc/drumee/ssl/private.conf" failed (2: No such file
  //   or directory) in /etc/nginx/sites-enabled/02-private.conf:36
  //
  // Measured on a reinstall that switched to own certificates: nginx refused to
  // start until that one leftover was removed by hand, even though everything this
  // run produced was correct.
  //
  // The public side is the same hazard in principle, but is deliberately NOT swept:
  // public_domain is set on every supported install (postinst refuses an empty
  // domain), so a falsy value here would more likely be a bug than an intent — and
  // acting on it would delete the live vhost that serves the instance.
  if (!private_domain) {
    removeStale([
      join(nginx, 'sites-enabled', '02-private.conf'),
      join(drumee, 'ssl', 'private.conf'),
      join(infra, 'internals', 'accel.private.conf'),
      join(infra, 'mfs.private.conf'),
    ], 'private vhost file');
  }

  writeTemplates(data, targets);

  if (!args.localhost) {
    writeCredentials("postfix", {
      host: 'localhost',
      user: data.mail_user,
      password: data.mail_password,
    })

    writeCredentials("db", {
      // The one that matters most: MariaDB holds this password, and nothing here
      // re-grants it, so overwriting it locks the application out of its database.
      //
      // Order matters. An existing secret always wins, because MariaDB already holds it.
      // DB_PASSWORD comes next: in a compose deployment the database is initialised from
      // it, so on a FIRST render it is the authoritative value and a generated one would
      // lock the application out immediately. Generating is the last resort, exactly as
      // before on a native first install.
      password: existingCredential("db", ["password"]) || DB_PASSWORD || uniqueId(),
      user: DB_USER || "drumee-app",
      host: DB_HOST || "localhost",
      ...(DB_PORT ? { port: Number(DB_PORT) } : {}),
    })

    writeCredentials("email", {
      host: `localhost`,
      port: 587,
      secure: false,
      auth: {
        user: `butler@${public_domain}`,
        pass: existingCredential("email", ["auth", "pass"]) || uniqueId()
      },
      tls: {
        rejectUnauthorized: false
      }
    })

    copyConfigs([
      'etc/postfix/master.cf',
      'etc/cron.d/drumee',
    ])
  }
}

/**
 *
 */
function makeConfData(data) {
  const endpoint_name = "main";
  data = {
    ...data,
    endpoint_name,
    ui_base: join(data.ui_base, endpoint_name),
    location: '/-/',
    pushPort: 23000,
    restPort: 24000,
  };
  if (!data.export_dir) data.export_dir = null;
  if (!data.import_dir) data.import_dir = null;
  return data
}



/**
 *
 * @returns
 */
function main() {
  const env_root = args.outdir || args.chroot;
  if (env_root) loadSysEnv(env_root);
  let data = getSysConfigs();
  data.chroot = Template.chroot();
  data = { ...data, ...makeConfData(data) };
  data = getAddresses(data);
  if (args.debug) console.log(data)
  writeInfraConf(data)
  // Generate the pm2 ecosystem (index.js + service.js + factory) that
  // /etc/init.d/drumee starts — without this the app never launches.
  writeEcoSystem(data)
}

main();