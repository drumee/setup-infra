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
const { args, hasExistingSettings } = require('./templates/utils')

const JSON_OPT = { spaces: 2, EOL: "\r\n" };

const {
  ACME_DIR,
  ACME_EMAIL_ACCOUNT,
  CERTS_DIR,
  MAIL_USER,
  NSUPDATE_KEY,
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
      console.error(e)
      console.error("Failed to write configs for", target)
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
  //let ecosystem = "etc/drumee/infrastructure/ecosystem.json";
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
  data.acme_store = join(data.certs_dir, `${data.domain_name}_ecc`);
  data.ca_server = data.ca_server || data.acme_ssl;
  if (data.own_ssl && data.certs_dir) {
    data.own_certs_dir = data.certs_dir;
  }
  for (let row of opt) {
    let [key, value, fallback] = row;
    if (!value) value = data[key] || fallback;
    if (value == null) continue;
    if (isString(value)) {
      if (/.+\+$/.test(value)) {
        value = value.replace(/\+$/, data[key]);
      }
      data[key] = value.trim() || fallback;
    } else {
      data[key] = value
    }
  }

  /** Named extra settings */
  data.allow_recursion = 'localhost;';
  if (data.public_ip4) {
    data.reverse_ip4 = data.public_ip4.split('.').reverse().join('.');
  } else {
    data.reverse_ip4 = ""
  }

  if (!data.public_ip6) {
    data.public_ip6 = "";
  }

  if (!data.storage_backup) {
    data.storage_backup = ""
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
  if (hasExistingSettings(Template.chroot('etc/drumee/drumee.json'))) {
    exit(0)
  }

  let use_email = 0;
  if (args.public_domain) use_email = 1;
  let domain_name = args.public_domain || args.private_domain;
  if (!domain_name) {
    if (!args.localhost) {
      console.log("There is no domain name defined for the installation", args);
      exit(0)
    }
  }

  const nsupdate_key = Template.chroot('etc/bind/keys/update.key')
  const opt = [
    ["nsupdate_key", NSUPDATE_KEY, nsupdate_key],
    ["admin_email", args.admin_email],
    ["credential_dir", Template.chroot('etc/drumee/credential')],
    ["domain_desc", args.description, 'My Drumee Box'],
    ["max_body_size", args.max_body_size, '10G'],
    ["drumee_root", args.drumee_root, "/var/lib/drumee"],
    ["use_email", use_email, 0],
    ["db_dir", args.db_dir, '/var/lib/mysql'],
    ["backup_storage", args.backup_storage, ""],
    ["data_dir", args.data_dir, '/var/lib/drumee/data'],
    ["http_port", args.http_port, 80],
    ["https_port", args.https_port, 443],
  ]

  if (!args.localhost) {
    opt.push(
      ["private_ip4", args.private_ip4],
      ["public_domain", args.public_domain],
      ["public_ip4", args.public_ip4],
      ["public_ip6", args.public_ip6],
      ["storage_backup", args.backup_storage], /** Legacy */
      ["private_domain", args.private_domain],
      ["acme_dir", ACME_DIR],
      ["acme_email_account", ACME_EMAIL_ACCOUNT, args.admin_email],
      ["certs_dir", CERTS_DIR],
    )

  }

  let data = makeData(opt);

  if (!data) {
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
  console.log("Writing main conf into drumee.json", filename);
  Template.makedir(dirname(filename));
  writeFileSync(filename, configs, JSON_OPT);
  console.log(configs)
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
  console.error("Caught error", err);
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
  const { public_domain, private_domain } = data;
  let targets = [
    `${drumee}/drumee.sh`,
    `${drumee}/conf.d/drumee.json`,
    `${drumee}/conf.d/exchange.json`,
    `${drumee}/conf.d/myDrumee.json`,
    `${drumee}/conf.d/drumee.json`,
    `${drumee}/conf.d/myDrumee.json`,

    `${infra}/mfs.conf`,
    `${infra}/routes/main.conf`,
    `${infra}/internals/accel.conf`,
  ];

  if (args.localhost) {
    let { username } = userInfo();
    let system_group = username;
    if (username = 'root') {
      username = data.system_user || 'www-data';
      system_group = data.system_group || 'www-data';
    }
    data.system_user = username;
    data.system_group = system_group;
    targets.push(`${nginx}/sites-enabled/localhost.conf`)
    let dir = join(args.drumee_root, 'cache', 'localhost')
    mkdirSync(dir, { recursive: true });
    if (args.db_dir != '/var/lib/mysql') {
      targets.push(
        `${mariadb}/50-server.cnf`,
        `${mariadb}/50-client.cnf`,
      )
    }
  } else {
    targets.push(
      `${bind}/named.conf.log`,
      `${bind}/named.conf.options`,
      `${mariadb}/50-server.cnf`,
      `${mariadb}/50-client.cnf`,
    )
  }

  writeEcoSystem(data);
  if (data.public_ip4 && public_domain) {
    let dir = join(args.drumee_root, 'cache', public_domain)
    mkdirSync(dir, { recursive: true });
    targets.push(
      `${nginx}/sites-enabled/public.conf`,
      `${drumee}/ssl/public.conf`,
      `${bind}/named.conf.public`,
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
    let dir = join(args.drumee_root, 'cache', private_domain)
    mkdirSync(dir, { recursive: true });
    targets.push(
      `${nginx}/sites-enabled/private.conf`,
      `${drumee}/ssl/private.conf`,
      `${bind}/named.conf.private`,
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
    ui_base: join(data.ui_base, 'main'),
    location: '/-/',
    pushPort: 23000,
    restPort: 24000,
  };
  if (!data.export_dir) data.export_dir = null;
  if (!data.import_dir) data.import_dir = null;
  if (!data.private_address) {
    data.private_address = data.public_address || "127.0.0.1";
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
 */
async function getAddresses(data) {
  const isPrivate = await privateIp();
  let os = require("os");
  let interfaces = os.networkInterfaces();
  let private_ip4, public_ip4, private_ip6, public_ip6;
  for (let name in interfaces) {
    if (name == 'lo') continue;
    for (let dev of interfaces[name]) {
      switch (dev.family) {
        case 'IPv4':
          if (isPrivate(dev.address) && !private_ip4) {
            private_ip4 = dev.address;
          }
          if (!isPrivate(dev.address) && !public_ip4) {
            public_ip4 = dev.address;
          }
          break;
        case 'IPv6':
          if (isPrivate(dev.address) && !private_ip6) {
            private_ip6 = dev.address;
          }
          if (!isPrivate(dev.address) && !public_ip6) {
            public_ip6 = dev.address;
          }
          break;
      }
    }
  }
  data.private_ip4 = data.private_ip4 || private_ip4;
  data.private_ip6 = data.private_ip6 || private_ip6;
  data.local_address = data.private_ip4;

  data.public_ip4 = data.public_ip4 || public_ip4;
  data.public_ip6 = data.public_ip6 || public_ip6;

  return data;
}

/**
 *
 * @returns
 */
function main() {
  const env_root = args.outdir || args.chroot;
  if (env_root) loadSysEnv(env_root);
  return new Promise(async (res, rej) => {
    let data = getSysConfigs();
    data.chroot = Template.chroot();
    data = { ...data, ...makeConfData(data) };
    data = await getAddresses(data);
    let func = [];
    if (args.only_infra || args.no_jitsi || args.localhost || data.local_domain) {
      func.push(writeInfraConf)
    } else {
      func = [writeInfraConf, writeJitsiConf];
    }
    func.map(function (f) {
      f(data);
    })
    res();

  });
}

main()
  .then(() => {
    exit(0);
  })
  .catch((e) => {
    console.error("Failed to setup Drumee infra", e);
    exit(0);
  });
