#!/usr/bin/env node

const Template = require("./templates");
const { join } = require("path");
const { isString } = require("lodash");
const { exit } = process;
const { loadSysEnv, sysEnv } = require("@drumee/server-essentials");
const { args } = require('./templates/utils');

const {
  DRUMEE_DOMAIN_NAME,
  PRIVATE_DOMAIN,
  PUBLIC_IP4,
  PUBLIC_IP6,
  PRIVATE_IP4,
  PRIVATE_IP6,
  PRIVATE_IF4,
} = process.env;

function randomString() {
  let crypto = require("crypto");
  return crypto.randomBytes(16).toString("base64").replace(/[\+\/=]+/g, "");
}

function writeTemplates(data, targets) {
  if (args.readonly || args.noCheck) {
    console.log("Readonly", targets, data);
    return;
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
      console.error("Failed to write configs for", target, e);
    }
  }
}

function addJitsiConfigsFiles(targets, data, type = 'private') {
  const etc = 'etc';
  const jitsi = join(etc, 'jitsi');
  const nginx = join(etc, 'nginx');
  const prosody = join(etc, 'prosody');
  const drumee = join(etc, 'drumee');

  const domain = data[`jitsi_${type}_domain`];
  targets.push(
    {
      tpl: `${jitsi}/jicofo/jicofo.${type}.conf`,
      out: `${jitsi}/jicofo/jicofo.conf`,
    },
    {
      tpl: `${jitsi}/jicofo/sip-cmmunicator.${type}.properties`,
      out: `${jitsi}/jicofo/sip-cmmunicator.properties`,
    },
    `${jitsi}/videobridge/jvb.${type}.conf`,
    `${jitsi}/ssl.${type}.conf`,
    `${jitsi}/meet.${type}.conf`,
    `${jitsi}/web/config.${type}.js`,
    `${nginx}/sites-enabled/20-jitsi.${type}.conf`,
    `${nginx}/modules-enabled/90-turn-relay.${type}.conf`,
    {
      tpl: `${prosody}/conf.d/${type}.cfg.lua`,
      out: `${prosody}/conf.d/${domain}.cfg.lua`,
    },
    `${etc}/turnserver.${type}.conf`,
    {
      tpl: `${drumee}/conf.d/conference.${type}.json`,
      out: `${drumee}/conf.d/${domain}.json`,
    },
  );
}

function writeJitsiConf(data) {
  const etc = 'etc';
  const jitsi = join(etc, 'jitsi');
  const prosody = join(etc, 'prosody');
  let targets = [
    `${jitsi}/jicofo/config`,
    `${jitsi}/jicofo/logging.properties`,
    `${jitsi}/videobridge/config`,
    `${jitsi}/videobridge/logging.properties`,
    `${jitsi}/web/interface_config.js`,
    `${jitsi}/web/defaults/ffdhe2048.txt`,
    `${prosody}/defaults/credentials.sh`,
    `${prosody}/prosody.cfg.lua`,
  ];

  if (data.public_domain) {
    addJitsiConfigsFiles(targets, data, 'public');
  } else if (data.private_domain) {
    addJitsiConfigsFiles(targets, data, 'private');
  } else {
    console.error("No domain name available!");
    return;
  }

  writeTemplates(data, targets);
}

function makeConfData(data) {
  const endpoint_name = "main";
  return {
    ...data,
    endpoint_name,
    turn_sercret: randomString(),
    prosody_plugins: "/usr/share/jitsi-meet/prosody-plugins/",
    xmpp_password: randomString(),
    public_port: 9090,
    ice_port: 10000,
    jicofo_password: randomString(),
    jvb_password: randomString(),
    app_id: randomString(),
    app_password: randomString(),
    ui_base: join(data.ui_base || '', endpoint_name),
    location: '/-/',
    pushPort: 23000,
    restPort: 24000,
  };
}

function getSysConfigs() {
  let data = sysEnv();

  let public_domain = args.public_domain || DRUMEE_DOMAIN_NAME || data.public_domain;
  let private_domain = args.private_domain || PRIVATE_DOMAIN || data.private_domain;

  if (!public_domain && !private_domain) {
    console.error("No domain name defined. Use --public-domain or --private-domain.");
    exit(1);
  }

  if (public_domain && !private_domain) {
    private_domain = public_domain.replace(/\.([a-z_\-0-9]{2,})$/, '.local');
  }

  data.public_domain = public_domain;
  data.private_domain = args.own_certs_dir ? null : private_domain;
  data.chroot = Template.chroot();

  if (public_domain) {
    data.jitsi_public_domain = `jit.${public_domain}`;
  }
  if (data.private_domain) {
    data.jitsi_private_domain = `jit.${data.private_domain}`;
  }

  return data;
}

function privateIp() {
  return new Promise((res) => {
    import("private-ip").then((module) => res(module.default));
  });
}

async function getAddresses(data) {
  const isPrivate = await privateIp();
  const os = require("os");
  const interfaces = os.networkInterfaces();
  let private_ip4, public_ip4, private_ip6, public_ip6;
  let private_if4, private_subnet_mask;

  for (let name in interfaces) {
    if (name === 'lo') continue;
    for (let dev of interfaces[name]) {
      if (dev.family === 'IPv4') {
        if (isPrivate(dev.address) && !private_ip4) {
          private_ip4 = dev.address;
          private_if4 = name;
          private_subnet_mask = dev.netmask;
        }
        if (!isPrivate(dev.address) && !public_ip4) {
          public_ip4 = dev.address;
        }
      } else if (dev.family === 'IPv6') {
        if (isPrivate(dev.address) && !private_ip6) private_ip6 = dev.address;
        if (!isPrivate(dev.address) && !public_ip6) public_ip6 = dev.address;
      }
    }
  }

  data.private_ip4 = args.private_ip4 || PRIVATE_IP4 || private_ip4;
  data.private_ip6 = args.private_ip6 || PRIVATE_IP6 || private_ip6;
  data.private_if4 = args.private_ip4 || PRIVATE_IF4 || private_if4;
  data.private_subnet_mask = private_subnet_mask || '255.255.255.0';
  data.public_ip4 = args.public_ip4 || PUBLIC_IP4 || public_ip4;
  data.public_ip6 = args.public_ip6 || PUBLIC_IP6 || public_ip6 || '';

  return data;
}

async function main() {
  const env_root = args.outdir || args.chroot;
  if (env_root) loadSysEnv(env_root);

  let data = getSysConfigs();
  data = await getAddresses(data);
  data = makeConfData(data);
  writeJitsiConf(data);
}

main()
  .then(() => exit(0))
  .catch((e) => {
    console.error("Failed to configure Jitsi", e);
    exit(1);
  });
