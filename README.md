# Drumee Infrastructure Setup Utilities

`@drumee/setup-infra` generates the system configuration for a self-hosted **Drumee**
instance. It takes environment variables and a handful of CLI flags and renders
production-ready config files for nginx, BIND (DNS), Postfix + DKIM (mail), MariaDB,
the PM2 process ecosystem, and — optionally — Jitsi Meet, Prosody, and Coturn.

The Node scripts here only *generate* files. The shell helpers in `bin/` apply them to
a running system. In production this whole repo ships inside the `drumee-infra` Debian
package (see the [`debian`](../debian) repo), whose post-install runs `bin/install`.

> For how this repo fits with `setup-schemas`, `debian`, and the docs site, see
> [`DOCUMENTATION.md`](DOCUMENTATION.md).

## Quick start

```bash
# Generate the full infra config (+ Jitsi) onto the live system
DRUMEE_DOMAIN_NAME=example.com ./infra.js
DRUMEE_DOMAIN_NAME=example.com ./jitsi.js

# Dry run — print what would be written, touch nothing
DRUMEE_DOMAIN_NAME=example.com ./infra.js --readonly 1

# Render the whole tree under a sandbox prefix instead of /
DRUMEE_DOMAIN_NAME=example.com ./infra.js --chroot /tmp/drumee-config

# Full orchestration (helpers + both configurators), as the package runs it
./bin/install
```

`npm run configure` is an alias for `./infra.js`.

## Entry points

| Script | Purpose |
|---|---|
| `infra.js` | Core configurator — writes `drumee.json`, nginx, BIND, Postfix/DKIM, MariaDB, PM2 ecosystem, and credential files. Optionally invokes Jitsi. |
| `jitsi.js` | Jitsi-only — Jicofo, JVB, Prosody, Coturn, and nginx-jitsi configs. Seeds from the existing `drumee.json`; never modifies it. |
| `template.js` | Legacy entry point with hardcoded paths (no `--chroot`). |
| `bin/install` | Shell orchestrator the Debian package runs: helper scripts + `node infra.js && node jitsi.js`, then applies configs, crontab, certs, and Prosody. |

`bin/` also holds the helpers `install` invokes: `init-mail`, `init-named`,
`init-acme`, `init-private`, `create-local-certs`, `preset-jitsi`, `prosody`,
`set-jitsi-conf`, and `env`.

## How `infra.js` works

1. **Assemble `data`** — `getSysConfigs()` merges `sysEnv()` (the existing
   `drumee.json`, if any), environment variables, and CLI args via `makeData()`. If a
   Drumee instance already exists and `--reconfigure 1` was not passed,
   `hasExistingSettings()` aborts to avoid clobbering it.
2. **Detect addresses** — `getAddresses()` walks the host's network interfaces and
   fills in public/private IPv4/IPv6, the private subnet mask, broadcast address, and
   reverse-zone fragments (overridable via flags/env).
3. **Write `drumee.json`** — the resolved config is written to
   `/etc/drumee/drumee.json` (or the `--chroot` equivalent). This is the file every
   other component reads.
4. **Render configs** — `writeInfraConf()` renders the `.tpl` files for whichever sides
   are configured (public domain → nginx/BIND/Postfix/DKIM/SSL; private domain →
   private nginx/BIND/certs) and writes the PM2 ecosystem via `writeEcoSystem()`.
5. **Generate credentials** — fresh random secrets are written under
   `/etc/drumee/credential/` (`db.json`, `postfix.json`, `email.json`) **on every run**.

`writeEcoSystem()` scales the `main/service` cluster to available RAM: under 2 GB → 2
instances, under 6 GB → 3, otherwise 4 (plus the `main` and `factory` processes).

`jitsi.js` follows the same seed-and-render shape but writes only Jitsi/Prosody/Coturn
configs and mints its own TURN/XMPP/Jicofo/JVB/app secrets.

## Templates

- Engine: lodash `_.template()` with `<%= … %>` interpolation (`templates/index.js`).
- Template files are `.tpl` files under `templates/`, whose directory tree mirrors the
  target filesystem (`templates/etc/nginx/…`, `templates/etc/bind/…`,
  `templates/var/lib/bind/…`, `templates/server/…`, etc.).
- Output paths are prefixed by `--outdir` / `--chroot` / `$DRUMEE_CONF_BASE`, or `/`.
- Public/private variants exist where relevant (e.g. `meet.public.conf.tpl`,
  `meet.private.conf.tpl`).
- Static (non-templated) files in `configs/etc/` (`postfix/master.cf`,
  `cron.d/drumee`) are copied verbatim by `copyConfigs()`.

## CLI arguments

These are the flags actually defined in `templates/utils.js`. Anything not listed here
(domain, admin email, ports, root directories) is taken from **environment variables**
and `sysEnv()`.

| Argument | Default | Description |
|---|---|---|
| `--public-domain` | null | Public-facing domain. Triggers nginx/BIND/Postfix/DKIM/SSL generation. |
| `--private-domain` | `<public>.local` (else `local.drumee`) | Private/LAN domain. |
| `--public-ip4` / `--public-ip6` | auto-detected | Override detected public IPs. |
| `--private-ip4` / `--private-ip6` | auto-detected | Override detected private IPs. |
| `--chroot` / `--outdir` | `/` | Output root prefix; `--outdir` wins if both set. |
| `--readonly` | 0 | Print targets instead of writing (`>1` also dumps `data`). |
| `--debug` | 0 | Verbose output; prints the merged `data`. |
| `--localhost` | 0 | Localhost-only mode (no BIND, no public domain). |
| `--reconfigure` | 0 | Regenerate over an existing install — **destroys existing data**. |
| `--force-install` | 0 | Override the existing-installation guard. |
| `--own-certs-dir` | `$OWN_CERTS_DIR` | Use pre-existing TLS certs; disables private-domain cert generation. |
| `--acme-dir` | `/usr/share/acme` | ACME / Let's Encrypt working dir. |
| `--data-dir` | `/data` | User data directory. |
| `--db-dir` | `/srv/db` | MariaDB data directory. |
| `--watch` | 0 | Configure PM2 to watch endpoint dirs for changes. |
| `--only-infra` / `--no-jitsi` | 1 | Skip Jitsi config generation. |
| `--envfile` | null | Load values from an env file before building `data`. |

Key environment variables include `DRUMEE_DOMAIN_NAME` (the public domain),
`PRIVATE_DOMAIN`, `ADMIN_EMAIL`, `ACME_EMAIL_ACCOUNT`, `DRUMEE_HTTP_PORT` /
`DRUMEE_HTTPS_PORT` / `DRUMEE_LOCAL_PORT`, `USE_JITSI`, `INSTANCE_TYPE` (a `dev*` value
relaxes symlink restrictions and raises log verbosity), and `FORCE_INSTALL`.

## Public vs. private domain

- **`--public-domain` set:** public nginx, BIND zone + reverse zone, Postfix, DKIM, and
  SSL configs are generated, and `use_email` is enabled.
- **`--private-domain` set** (auto-derived as `<public>.local` when omitted): private
  nginx, BIND, and certificate configs are generated.
- **`--own-certs-dir` set:** the private domain is suppressed and the provided cert
  directory is used instead.

## Output

Configuration files land under `/etc/` (or the `--chroot` prefix), notably:

- `/etc/drumee/drumee.json` — the master config every component reads
- `/etc/drumee/credential/{db,postfix,email}.json` — generated secrets
- `/etc/drumee/infrastructure/ecosystem.json` — the PM2 process definitions
- `/etc/nginx/`, `/etc/bind/` + `/var/lib/bind/`, `/etc/postfix/`,
  `/etc/mysql/mariadb.conf.d/`, `/etc/opendkim/`
- Jitsi: `/etc/jitsi/`, `/etc/prosody/`, `/etc/turnserver.*.conf`

## Release

```bash
npm run release   # git push + npm publish --access public + npm version patch
```

## License

AGPL V3.
