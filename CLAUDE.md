# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the infra configurator (optionally + Jitsi)
./infra.js [options]

# Run the Jitsi-only configurator
./jitsi.js [options]

# Full install orchestration (runs the bin/ scripts, then infra.js + jitsi.js)
./bin/install

# Publish a new patch version
npm run release   # git push + npm publish + npm version patch
```

> **Note:** The `index.js` entry point was renamed to `infra.js` (commit `0c40b1d`,
> "Splited jitsi/infra"). `npm run configure` and `package.json`'s `main` field point
> at `infra.js`.

## CLI Arguments

Both `infra.js` and `jitsi.js` parse the same argument set defined in `templates/utils.js` (`parser.parse_args()`).

| Argument | Default | Description |
|---|---|---|
| `--public-domain` | null | Public-facing domain name |
| `--private-domain` | null | Private/LAN domain name |
| `--public-ip4` / `--public-ip6` | null | Override auto-detected public IPs |
| `--private-ip4` / `--private-ip6` | null | Override auto-detected private IPs |
| `--chroot` / `--outdir` | `/` | Output root — all config files are written under this prefix |
| `--readonly 1` | 0 | Print targets instead of writing files |
| `--debug 1` | 0 | Verbose / debug output |
| `--localhost 1` | 0 | Localhost-only mode (no public domain) |
| `--reconfigure 1` | 0 | Regenerate configs over an existing install |
| `--envfile` | null | Path to an env file to load before building `data` |
| `--only-infra 1` | 1 | Skip Jitsi config generation |
| `--no-jitsi 1` | 1 | Same as `--only-infra` |
| `--watch 1` | 0 | Configure pm2 to watch endpoint dirs for changes |
| `--force-install` | 0 | Override an existing installation |
| `--own-certs-dir` | null | Use pre-existing TLS certificates from this directory |
| `--acme-dir` | null | ACME / Let's Encrypt working directory |
| `--data-dir` | `/data` | User data directory |
| `--db-dir` | `/srv/db` | MariaDB data directory |

## Architecture

### Entry points

| Script | Purpose |
|---|---|
| `infra.js` | Infra setup — drumee.json, BIND, nginx, postfix, DB, PM2 ecosystem + optional Jitsi |
| `jitsi.js` | Jitsi-only reconfiguration |
| `template.js` | Legacy entry point (hardcoded paths, no `--chroot`) |
| `bin/install` | Top-level shell orchestrator — runs `bin/` helpers, then `node infra.js` + `node jitsi.js` (or the single script named by the `DRUMEE_COMPONENTS` env var if `${DRUMEE_COMPONENTS}.js` exists) |

`bin/` holds shell helpers invoked by `bin/install` (e.g. `init-mail`, `init-named`, `init-acme`, `init-private`, `create-local-certs`, `preset-jitsi`, `prosody`, `env`). The `node` configurators only generate files; these scripts apply them to the running system.

The core config-building functions (`makeData`, `getSysConfigs`, `makeConfData`, `writeInfraConf`, `writeEcoSystem`, `copyConfigs`) live in **`infra.js`** itself, not in a shared module; `writeJitsiConf` is defined in **`jitsi.js`**. `templates/utils.js` is the only shared helper module (`args`, `getAddresses`, `hasExistingSettings`, `randomString`).

**`infra.js`** flow:
1. Reads environment variables and CLI args to assemble a `data` object via `makeData()` / `getSysConfigs()`.
2. Auto-detects network interfaces (public/private IPv4/IPv6) via `getAddresses()`.
3. Calls `writeInfraConf(data)` (always) and optionally `writeJitsiConf(data)`.
4. Writes the resolved config to `/etc/drumee/drumee.json` (or `--chroot` equivalent) and generates random credentials (DB, postfix, email, XMPP passwords) on each run.

**`jitsi.js`** flow:
1. Seeds from the existing `drumee.json` via `sysEnv()` (domain, IPs already configured).
2. Auto-detects network interfaces via `getAddresses()`.
3. Generates fresh random secrets (TURN, XMPP, Jicofo, JVB, app keys).
4. Calls `writeJitsiConf(data)` — writes only Jitsi/Prosody/Coturn/nginx-jitsi configs; does not touch `drumee.json`, BIND zones, ecosystem, or DB credentials.

### Template engine (`templates/index.js`)

Templates use **lodash `_.template()`** (ES template literal syntax with `<%= %>` interpolation). Template files are `.tpl` files mirroring the target filesystem path under `templates/`. The `chroot()` function prefixes all output paths with `--outdir` / `--chroot` / `DRUMEE_CONF_BASE` env var, or `/` by default.

### Template directory layout

`templates/` mirrors the target system's directory tree:
- `etc/nginx/` — Nginx site and module configs
- `etc/drumee/` — Drumee runtime config, SSL, infrastructure routes, credential templates
- `etc/bind/` — BIND9 named configs and zone files
- `etc/jitsi/` — Jicofo, JVB, meet, and SSL configs
- `etc/prosody/` — Prosody XMPP server configs
- `etc/postfix/` — Postfix mail configs
- `etc/mysql/` — MariaDB configs
- `etc/turnserver.conf.tpl` — Coturn configs
- `server/` — PM2 ecosystem config template
- `var/lib/bind/` — DNS zone data templates
- `env/` — application env / logrotate templates (`application.json.tpl`, `logrotate.tpl`)
- `schema/` — DB schema helper templates

Templates exist in `public`, `private`, and base variants (e.g., `meet.public.conf.tpl`, `meet.private.conf.tpl`, `meet.conf.tpl`).

### Static configs (`configs/`)

`configs/etc/` contains static (non-templated) files copied verbatim via `copyConfigs()`:
- `etc/postfix/master.cf`
- `etc/cron.d/drumee`

### Key data flow

- `sysEnv()` from `@drumee/server-essentials` reads the existing `drumee.json` to seed defaults.
- `makeData(opt)` merges env vars, CLI args, and `sysEnv()` into the template data object.
- `makeConfData(data)` adds random secrets (XMPP passwords, TURN secret, app keys) — these are regenerated on every run.
- `writeEcoSystem(data)` generates the PM2 ecosystem JSON at `etc/drumee/infrastructure/ecosystem.json`; it scales worker instances based on available RAM (2 GB → 2, 6 GB → 3, more → 4 instances).
- `hasExistingSettings()` in `templates/utils.js` guards against overwriting an existing installation unless `FORCE_INSTALL=1` or `--force-install`.

### Public vs private domain logic

- If `--public-domain` is set: nginx, BIND, postfix, DKIM, and SSL configs for the public side are generated.
- If `--private-domain` is set (auto-derived as `<public>.local` if not given): private nginx, BIND, and cert configs are generated.
- `--own-certs-dir` suppresses private domain cert generation and uses the provided directory instead.
