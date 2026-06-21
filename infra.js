#!/usr/bin/env node

const Template = require("./templates");
const { writeFileSync, readFileSync: readJson } = require(`jsonfile`);
const { join, dirname } = require("path");
const { isString } = require("lodash");
const { exit } = process;
const { loadSysEnv, sysEnv, uniqueId } = require("@drumee/server-essentials");
const { totalmem, userInfo } = require('os');
const {
  existsSync, close, writeSync, openSync, readFileSync, mkdirSync
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
  DRUMEE_DESCRIPTION,
  DRUMEE_DOMAIN_NAME,
  DRUMEE_HTTP_PORT,
  DRUMEE_HTTPS_PORT,
  DRUMEE_LOCAL_PORT,
  INSTANCE_TYPE,
  MAIL_USER,
  NSUPDATE_KEY,
  PRIVATE_DOMAIN,
  PRIVATE_IF4,
  PRIVATE_IP4,
  PRIVATE_IP6,
  PUBLIC_IP4,
  PUBLIC_IP6,
  STORAGE_BACKUP,
  USE_JITSI,
} = process.env;

let PUBLIC_DOMAIN = DRUMEE_DOMAIN_NAME;

if (PUBLIC_DOMAIN) {
  if (!PRIVATE_DOMAIN) PRIVATE_DOMAIN = PUBLIC_DOMAIN.replace(/\.([a-z_\-0-9]{2,})$/, '.local');
}

PRIVATE_DOMAIN = PRIVATE_DOMAIN || 'local.drumee';
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
  writeTemplates({ ecosystem, chroot: Template.chroot }, targets);
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
  const nsupdate_key = Template.chroot('etc/bind/keys/update.key')
  if (args.own_certs_dir && existsSync(args.own_certs_dir)) args.certs_dir = args.own_certs_dir;
  const opt = [
    ["acme_dir", args.acme_dir || ACME_DIR || "/usr/share/acme/"],
    ["acme_email_account", ACME_EMAIL_ACCOUNT, ADMIN_EMAIL],
    ["acme_env_file", ACME_ENV_FILE, ""],
    ["admin_email", args.admin_email || ADMIN_EMAIL],
    ["backup_storage", backup_storage, ""],
    ["certs_dir", args.certs_dir],
    ["credential_dir", Template.chroot('etc/drumee/credential')],
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
  configs.main_domain = data.domain;
  configs.domain_name = data.domain;
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

  configs.tmp_dir = join(configs.runtime_dir, 'tmp');
  configs.static_dir = join(configs.runtime_dir, 'static');

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
      `${infra}/routes/public.conf`,
      `${nginx}/sites-enabled/01-public.conf`,
      `${drumee}/ssl/public.conf`,
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
    data.mail_password = uniqueId();
    data.smptd_cache_db = "btree:$";
  }

  if (data.private_ip4 && private_domain) {
    let dir = join(data.drumee_root, 'cache', private_domain)
    mkdirSync(dir, { recursive: true });
    targets.push(
      `${infra}/internals/accel.private.conf`,
      `${infra}/mfs.private.conf`,
      `${infra}/routes/private.conf`,
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


  writeTemplates(data, targets);

  if (!args.localhost) {
    writeCredentials("postfix", {
      host: 'localhost',
      user: data.mail_user,
      password: data.mail_password,
    })

    writeCredentials("db", {
      password: uniqueId(),
      user: "drumee-app",
      host: "localhost",
    })

    writeCredentials("email", {
      host: `localhost`,
      port: 587,
      secure: false,
      auth: {
        user: `butler@${public_domain}`,
        pass: uniqueId()
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