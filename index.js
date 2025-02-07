#!/usr/bin/env node

const Template = require("./templates");
const { writeFileSync } = require(`jsonfile`);
const { join, dirname } = require("path");
const { isString } = require("lodash");
const { exit } = process;
const { sysEnv, uniqueId } = require("@drumee/server-essentials");
const { totalmem } = require('os');
const ARGV = require('minimist')(process.argv.slice(2));
const {
  existsSync, close, writeSync, openSync, readFileSync, mkdirSync
} = require("fs");

const JSON_OPT = { spaces: 2, EOL: "\r\n" };

const {
  ACME_DIR,
  ACME_EMAIL_ACCOUNT,
  ADMIN_EMAIL,
  DB_BACKUP,
  DRUMEE_DB_DIR,
  DRUMEE_DESCRIPTION,
  DRUMEE_DOMAIN_NAME,
  FORCE_INSTALL,
  MAIL_USER,
  MAX_BODY_SIZE,
  NSUPDATE_KEY,
  PUBLIC_IP4,
  PUBLIC_IP6,
  STORAGE_BACKUP,
} = process.env;

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
  let mode = "dist";
  let base = `${data.server_dir}/${mode}/${route}/`;
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
    mode,
  } = data;
  if (!server_dir) server_dir = join(runtime_dir, 'server');
  let base = `${server_dir}/${mode}/${route}`;
  return {
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
    instances
  };
}

/***
 * 
 */
function writeTemplates(data, targets) {
  if (ARGV.readonly || ARGV.noCheck) {
    console.log("Readonly", targets, data);
    return
  }
  for (let target of targets) {
    if (isString(target)) {
      Template.write(data, target, target);
    } else {
      let { out, tpl } = target;
      Template.write(data, out, tpl);
    }
  }
}

/**
 *
 */
function writeEcoSystem(data) {
  const ports = {
    pushPort: 23000,
    restPort: 24000,
    mode: "dist",
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
  let ecosystem = "/etc/drumee/infrastructure/ecosystem.json";
  if (ARGV.readonly) {
    console.log("Readonly", ecosystem, routes);
    return
  }
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

function makeData(opt) {
  let data = sysEnv();

  data.chroot = Template.chroot();
  data.acme_store = join(data.certs_dir, `${data.domain_name}_ecc`);
  data.ca_server = data.ca_server || data.acme_ssl;
  if (data.own_ssl && data.certs_dir) {
    data.own_certs_dir = data.certs_dir;
  }
  for (let row of opt) {
    let [key, value, fallback] = row;
    if (!value) value = fallback;
    if (!value) continue;
    if (!data[key]) {
      if (/.+\+$/.test(value)) {
        value = value.replace(/\+$/, data[key]);
      }
      data[key] = value.trim() || fallback;
    }
  }

  if (data.public_ip4) {
    data.reverse_ip4 = data.public_ip4.split('.').reverse().join('.');
  }

  return data;
}
/**
 *
 */
function getSysConfigs() {
  let { domain_name } = sysEnv();
  if (existsSync('/etc/drumee/drumee.sh') && !FORCE_INSTALL) {
    console.log(
      `There is already a domain name configured on this server (${domain_name})\n`, `Use FORCE_INSTALL=yes to override`);
    exit(0)
  }
  domain_name = domain_name || ARGV.domain || DRUMEE_DOMAIN_NAME;
  if (!domain_name) {
    console.log("There no domain name defined for the installation");
    exit(0)
  }
  const opt = [
    ["acme_dir", ACME_DIR, '/usr/share/acme'],
    ["jitsi_domain", `jit.+`],
    ["domain_name", domain_name],
    ["nsupdate_key", NSUPDATE_KEY, '/etc/bind/keys/update.key'],
    ["domain_desc", DRUMEE_DESCRIPTION, 'My Drumee Box'],
    ["admin_email", ADMIN_EMAIL, ''],
    ["acme_email_account", ACME_EMAIL_ACCOUNT, ADMIN_EMAIL],
    ["public_ip4", PUBLIC_IP4, ''],
    ["public_ip6", PUBLIC_IP6, ''],
    ["storage_backup", STORAGE_BACKUP, ''],
    ["db_backup", DB_BACKUP, ''],
    ["db_dir", DRUMEE_DB_DIR, '/srv/db'],
    ["max_body_size", MAX_BODY_SIZE, '10G'],
  ]
  let data = makeData(opt)
  let d = new Date().toISOString();
  let [day, hour] = d.split('T')
  day = day.replace(/\-/g, '');
  hour = hour.split(':')[0];
  data.serial = `${day}${hour}`;

  let args = { ...data };
  let keys = ["myConf", "chroot", "date"];

  for (let key of keys) {
    delete args[key];
  }

  if (ARGV.readonly) {
    return args;
  }
  args.socketPath = getSocketPath();
  console.log("Writing main conf into drumee.json");
  writeFileSync(
    Template.chroot("etc/drumee/drumee.json"), args, JSON_OPT
  );
  return args;
}

/**
 * 
 * @param {*} data 
 */
function writeCredentials(file, data) {
  let target = Template.chroot(`etc/drumee/credential/${file}.json`);
  console.log(`Writing credentials into ${target}`);
  writeFileSync(target, data, JSON_OPT);
}

/**
 * 
 */
function errorHandler(err) {
  console.error("Caught error", err);
}

/**
 * 
 * @param {*} data 
 */
function copyConfigs(items) {
  for (let item of items) {
    let p = join(__dirname, 'configs', item);
    console.log(`Copying ${item}`)
    let dname = dirname(p);
    mkdirSync(dname, { recursive: true });
    let content = readFileSync(p);
    let str = String(content).toString();
    //Buffer.from(content, "utf8");
    let dest = Template.chroot(item);
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
  writeEcoSystem(data);
  const etc = 'etc';
  const nginx = join(etc, 'nginx');
  const drumee = join(etc, 'drumee');
  const bind = join(etc, 'bind',);
  const postfix = join(etc, 'postfix',);
  const mariadb = join(etc, 'mysql', 'mariadb.conf.d');
  const infra = join(drumee, 'infrastructure');
  const { domain } = data;
  const dkim = join(etc, 'opendkim', 'keys', domain, 'dkim.txt');
  let targets = [

    // Nginx 
    `${nginx}/sites-enabled/drumee.conf`,

    // Drumee 
    `${drumee}/ssl/main.conf`,
    `${drumee}/drumee.sh`,
    `${drumee}/conf.d/conference.json`,
    `${drumee}/conf.d/drumee.json`,
    `${drumee}/conf.d/exchange.json`,
    `${drumee}/conf.d/myDrumee.json`,
    `${drumee}/conf.d/conference.json`,
    `${drumee}/conf.d/drumee.json`,
    `${drumee}/conf.d/myDrumee.json`,

    `${infra}/mfs.conf`,
    `${infra}/routes/main.conf`,
    `${infra}/internals/accel.conf`,
    {
      tpl: `var/lib/bind/domain.tpl`,
      out: `var/lib/bind/${domain}`
    },
    `${bind}/named.conf.local`,
    `${bind}/named.conf.log`,
    `${bind}/named.conf.options`,
    `${postfix}/main.cf`,
    `${postfix}/mysql-virtual-alias-maps.cf`,
    `${postfix}/mysql-virtual-mailbox-domains.cf`,
    `${postfix}/mysql-virtual-mailbox-maps.cf`,
    `${etc}/dkimkeys/dkim.key`,
    `${etc}/mail/dkim.key`,
    `${etc}/mailname`,
    `${etc}/opendkim/KeyTable`,
    `${mariadb}/50-server.cnf`,
    `${mariadb}/50-client.cnf`,
  ];

  if (data.reverse_ip4) {
    targets.push({
      tpl: `var/lib/bind/reverse.tpl`,
      out: `var/lib/bind/${data.public_ip4}`
    })
  }
  data.dkim_key = getDkim(dkim);
  data.mail_user = MAIL_USER || 'postfix';
  data.mail_password = uniqueId();
  data.smptd_cache_db = "btree:$";
  data.endpoint = 'main';
  writeTemplates(data, targets);

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
      user: `butler@${domain}`,
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

/**
 *
 */
function writeJitsiConf(data) {
  const etc = 'etc';
  const jitsi = join(etc, 'jitsi');
  const nginx = join(etc, 'nginx');
  const prosody = join(etc, 'prosody');
  const drumee = join(etc, 'drumee');
  let targets = [
    // Jicofo
    `${jitsi}/jicofo/config`,
    `${jitsi}/jicofo/jicofo.conf`,
    `${jitsi}/jicofo/logging.properties`,

    // Jitsi Video Bridge 
    `${jitsi}/videobridge/config`,
    `${jitsi}/videobridge/jvb.conf`,
    `${jitsi}/videobridge/logging.properties`,

    // Jitsi meet
    `${jitsi}/ssl.conf`,
    `${jitsi}/meet.conf`,
    `${jitsi}/web/config.js`,
    `${jitsi}/web/interface_config.js`,
    `${jitsi}/web/defaults/ffdhe2048.txt`,

    // Nginx 
    `${nginx}/sites-enabled/jitsi.conf`,
    `${nginx}/modules-enabled/90-turn-relay.conf`,
    //`${nginx}/sites-enabled/turnrelay.conf`,

    // Prosody 
    `${prosody}/prosody.cfg.lua`,
    `${prosody}/defaults/credentials.sh`,
    {
      out: `${prosody}/conf.d/${data.jitsi_domain}.cfg.lua`,
      tpl: `${prosody}/conf.d/vhost.cfg.lua`
    },
    // `${prosody}/migrator.cfg.lua`,

    // Turnserver 
    `${etc}/turnserver.conf`,

    `${drumee}/conf.d/conference.json`,
  ];
  writeTemplates(data, targets);

}

/**
 *
 */
function makeConfData(data) {
  data = {
    ...data,
    turn_sercret: randomString(),
    prosody_plugins: "/usr/share/jitsi-meet/prosody-plugins/",
    xmpp_password: randomString(),
    public_port: 9090,
    ice_port: 10000,
    jicofo_password: randomString(),
    jvb_password: randomString(),
    app_id: randomString(),
    app_password: randomString(),
    ui_base: join(data.ui_base, 'dist', 'main'),
    location: '/-/',
    pushPort: 23000,
    restPort: 24000,
  };
  if (!data.export_dir) data.export_dir = null;
  if (!data.import_dir) data.import_dir = null;
  if (!data.local_address) {
    data.local_address = data.public_address || "127.0.0.1";
  }
  return data
}

/**
 * 
 */
function privateIp() {
  return new Promise(async (res, rej) => {
    import("private-ip").then(module => { res(module.default) });
  })
}

/**
 *
 * @returns
 */
function configure() {
  return new Promise(async (res, rej) => {
    let data = getSysConfigs();
    data.chroot = Template.chroot();
    const isPrivate = await privateIp();
    let os = require("os");
    let interfaces = os.networkInterfaces();
    for (let name in interfaces) {
      for (let dev of interfaces[name]) {
        if (dev.family == 'IPv4') {
          if (isPrivate(dev.address)) {
            data.local_address = dev.address;
            break;
          }
          if (!dev.internal) {
            public_address = dev.address;
          }
        }
      }
      if (data.local_address) break;
    }
    data = makeConfData(data);
    let func = [];
    if (!ARGV.infra && !ARGV.jitsi) {
      func = [writeInfraConf, writeJitsiConf];
    } else {
      if (ARGV.infra) func.push(writeInfraConf)
      if (ARGV.jitsi) func.push(writeJitsiConf)
    }
    func.map(function (f) {
      f(data);
    })
    res();

  });
}

configure()
  .then(() => {
    exit(0);
  })
  .catch((e) => {
    console.error("Failed to setup Drumee infra", e);
    exit(0);
  });
