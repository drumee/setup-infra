# Drumee Platform — Repository Guide

Entry point for the four repositories that build, configure, bootstrap, and document
a **Drumee** instance (a self-hosted, sovereign data platform). This guide explains
what each repo actually does — based on a read of the code, not just the prose — and
how they hand off to each other.

Each repo also has its own `README.md` and `CLAUDE.md`; this file is the map across
all four.

---

## The repositories

| Repo | npm / package | What it produces | Stack |
|---|---|---|---|
| [`setup-infra`](#setup-infra) | `@drumee/setup-infra` | System config files: nginx, BIND, Postfix/DKIM, MariaDB, PM2 ecosystem, Jitsi | Node.js + Bash |
| [`setup-schemas`](#setup-schemas) | `@drumee/setup-schemas` | A populated MariaDB: schemas, system accounts, hubs, seed media, RSA keys | Node.js |
| [`debian`](#debian) | `drumee-*` `.deb`s | Installable Debian packages built from the repos above + server/ui/static | Bash + Debian tooling |
| [`drumee.github.io`](#drumeegithubio) | the docs site | `https://drumee.github.io` (CNAME `docs.drumee.com`) | Docusaurus 3 / TS |

All live side by side under `/home/somanos/github/`. `setup-infra` and `setup-schemas`
are published to npm under `@drumee`; `debian` clones them (and the other source
repos) at build time.

---

## How they fit together

```
                         ┌────────────────────────────────┐
                         │      debian  (build host)       │
                         │  build-all.sh: infra → schemas  │
                         │            → ui → server        │
                         └───────────────┬─────────────────┘
        bundle(): git clone + npm i      │  dh_make + dpkg-buildpackage
   ┌──────────────────┬──────────────────┼───────────────────┬──────────────────┐
   ▼                  ▼                  ▼                   ▼                  ▼
setup-infra      setup-schemas     server-team           ui-team            static
(drumee-infra)   (drumee-schemas)  (drumee-server-pod)   (drumee-ui-pod)   (drumee-static)
   │                  │
   │ post-install     │ post-install
   ▼                  ▼
writes config    reads that config, populates the DB
/etc/drumee/     ┌─────────────────────────────────────┐
 drumee.json  ──▶│ drumee-app DB user, schemas, the     │
 credential/* ──▶│ "yp" master DB, nobody/guest/system/ │
                 │ admin accounts, hubs, seed media      │
                 └─────────────────────────────────────┘
                              │
                              ▼
                  a running Drumee instance

   drumee.github.io documents all of the above; it is NOT part of the build.
```

### The contract between the repos

The repos do **not** call each other directly — they communicate through the
filesystem on the target machine:

1. **`drumee-infra`** (built from `setup-infra`) installs first. Its post-install runs
   `infra.js` + `jitsi.js`, which write every system config file and the master
   `/etc/drumee/drumee.json`, plus credential files under `/etc/drumee/credential/`
   (`db.json`, `postfix.json`, `email.json`).
2. **`drumee-schemas`** (built from `setup-schemas`) installs next. `populate.js` reads
   `/etc/drumee/credential/db.json`, creates the `drumee-app` MariaDB user, then builds
   the schemas and writes the `nobody`/`guest`/`system`/`admin` accounts, the
   public/portal hubs, and imports seed media — all via the `yp` master database.
3. **`drumee-static` / `drumee-server-pod` / `drumee-ui-pod`** deliver the runtime code
   and assets that run against that config + database.
4. **`drumee.github.io`** is published independently to GitHub Pages.

So the single source of truth handed between `setup-infra` and `setup-schemas` is
`/etc/drumee/drumee.json` + `/etc/drumee/credential/*`. `setup-infra` writes them;
`setup-schemas` reads them.

---

## setup-infra

**Infrastructure config generator.** Turns environment variables + a small set of CLI
flags into production config files, using lodash `_.template()` over `.tpl` files whose
`templates/` tree mirrors the target `/etc/`.

- **`infra.js`** — the core configurator. Assembles a `data` object from `sysEnv()` +
  env vars + CLI args (`getSysConfigs` → `makeData`), auto-detects public/private
  IPv4/IPv6 from the host's interfaces (`getAddresses`), writes
  `/etc/drumee/drumee.json`, then renders nginx, BIND zones + reverse zones, Postfix +
  DKIM, MariaDB `50-server.cnf`/`50-client.cnf`, and the PM2 ecosystem
  (`writeEcoSystem` — scales `main/service` worker count to RAM: <2 GB→2, <6 GB→3,
  else 4). It generates **fresh random credentials on every run** (DB, postfix, email).
- **`jitsi.js`** — Jitsi/Prosody/Coturn/nginx-jitsi configs only. Seeds from the
  existing `drumee.json`, mints fresh TURN/XMPP/Jicofo/JVB/app secrets, and writes the
  `public` or `private` variant depending on which domain is set. Does **not** touch
  `drumee.json`, BIND, the ecosystem, or DB credentials.
- **`template.js`** — legacy entry point with hardcoded paths (no `--chroot`).
- **`bin/install`** — the shell orchestrator the `.deb` runs: calls `init-mail`, then
  `node infra.js && node jitsi.js` (or the single `${DRUMEE_COMPONENTS}.js` if that
  file exists), sources the generated `/etc/drumee/drumee.sh`, installs the crontab,
  protects directories, then runs `init-named`, `create-local-certs`, `init-acme`, and
  Prosody setup. The `bin/` helpers apply configs to the live system; the Node scripts
  only generate files.

**Safe inspection:** `--readonly 1` prints targets instead of writing; `--chroot
/tmp/...` writes the whole tree under a harmless prefix.

> Note on CLI args: `templates/utils.js` defines the *actual* argparse set
> (`--public-domain`, `--private-domain`, `--public-ip4/6`, `--private-ip4/6`,
> `--chroot`/`--outdir`, `--readonly`, `--debug`, `--localhost`, `--reconfigure`,
> `--watch`, `--db-dir`, `--data-dir`, `--own-certs-dir`, `--acme-dir`, `--only-infra`,
> `--no-jitsi`, `--force-install`, `--envfile`). Most other settings (domain,
> admin email, ports, root dirs) come from **environment variables** and `sysEnv()`,
> not flags.

See [`setup-infra/README.md`](README.md) and [`setup-infra/CLAUDE.md`](CLAUDE.md).

---

## setup-schemas

**Platform bootstrapper.** A Node.js library (consumed by the install pipeline, not run
standalone by end users) that takes a fresh, config-only machine to a fully populated
Drumee database.

- **Public API (`index.js`):** `Drumate`, `Mfs`, `Organization`.
- **`populate.js`** runs the canonical sequence: `prepare()` (create the `drumee-app`
  DB user from `db.json`, smoke-test connectivity via a throwaway DB) → `Cache.load()`
  → `Organization.populate()` (write `sys_conf`, `domain`, `vhost`, `organisation`,
  `settings`, `mailserver` rows) → `createNobody`/`createGuest` (fixed-UID system
  accounts) → `createSystemUser` (the `system@<domain>` account + media and portal
  hubs) → `createAdmin` (admin account, disk-quota sizing, a password-reset link) →
  `Mfs.importContent("content.drumee.com/Wallpapers")` + `importTutorial()` →
  `afterInstall()` (generate the RSA key pair, render the welcome page).
- **Conventions (enforced throughout the code):** all DB access goes through `Mariadb`
  from `@drumee/server-essentials` against the **`yp` master DB**, using stored
  procedures (`await_proc`) and `await_query`/`await_func`; IDs come from `uniqueId()`;
  classes extend `Logger` and use `this.debug()` rather than `console.log`. Raw shell
  `mariadb` calls in `lib/utils.js` handle user creation/grants and schema loading.

See [`setup-schemas/README.md`](../setup-schemas/README.md) and
`setup-schemas/CLAUDE.md`.

---

## debian

**Build host.** Self-contained Debian builders; each subdir clones source, compiles,
and produces one signed `.deb` via `dh_make --native` + `dpkg-buildpackage`. Versions
come from each package's `debian/changelog`, never from flags. **Never run as root** —
every `build.sh` aborts if `UID == 0`.

| Subdir | Package | Source bundled |
|---|---|---|
| `infra/` | `drumee-infra` | `setup-infra` (main) + `acme.sh` |
| `schemas/` | `drumee-schemas` | `schemas` (preview) |
| `server/` | `drumee-server-pod` | `server-team` (preview) |
| `ui/` | `drumee-ui-pod` | `ui-team` (preview) |
| `static/` | `drumee-static` | `static` |
| `schemas-patch/` | `drumee-patch` | `schemas` — incremental, needs `--manifest` |
| `admin/` | `drumee-schemas-patch` | local |
| `builder/` | interactive installer | reads pre-built `target/`, builds **unsigned** (`-us -uc`) |

- `./build-all.sh` builds `infra → schemas → ui → server` (each with `--force=yes`).
- Single package: `<pkg>/build.sh` (e.g. `server/build.sh --force=yes`).
- Schema patch: `schemas-patch/build.sh --manifest=auto` (derives the file list from
  the last commits) or `--manifest=<file>`.
- Shared helpers live in `utils/functions.sh` (`bundle()`, `get_version()`,
  `get_email()`, `get_build_dir()`) and `utils/env.sh` (runtime paths:
  `DRUMEE_ROOT_DIR=/srv/drumee`, `DRUMEE_DATA_DIR=/data`, `ACME_DIR=/etc/acme`, …).
- `.deb`s land in `<pkg>/build/`; set `DEB_BUILD_TARGET` to also copy them elsewhere.

This repo already ships extensive docs under `debian/docs/`. Start at
[`debian/README.md`](../debian/README.md), which links overview, build-pipeline,
utilities, version-management, deployment, and per-package guides.

---

## drumee.github.io

**Public documentation site.** Docusaurus 3.9.2 (TypeScript config), Node ≥ 20, npm.

- **Develop:** `npm start` (live reload at `localhost:3000`).
- **Build:** `npm run build` → static site in `build/`.
- **Deploy:** automated — `.github/workflows/deploy.yml` runs `npm ci` → `npm run
  build` → GitHub Pages on every push to `main`. (The `yarn deploy` flow in the
  template README is not what CI uses.)
- **Served at** `https://drumee.github.io` with `baseUrl: "/"`; `static/CNAME` points
  the custom domain `docs.drumee.com` at it; `.nojekyll` disables Jekyll.
- **Content:** `docs/` is organized into Introduction, Technology (incl. an SDK
  reference), Getting Started, Product Guide, Package Building, and Resources, wired up
  manually in `sidebars.ts`. Mermaid diagrams are enabled.
- **Generated API docs:** `scripts/generate-api-docs.js` reads ACL JSON from a sibling
  `../acl/` directory and writes Markdown into `docs/api-reference/backend-sdk/`.
- **Custom React:** `src/pages/index.tsx` (homepage) and
  `src/components/PermissionBitmaskVisualizer.tsx` (interactive ACL bitmask widget,
  embeddable via MDX).
- **Conventions:** every doc needs frontmatter (`id`, `title`, `slug`,
  `sidebar_position`, `description`), uses `NN-` filename prefixes for ordering, and
  must be added to `sidebars.ts` to appear.

See [`drumee.github.io/README.md`](../drumee.github.io/README.md) and
`drumee.github.io/CLAUDE.md`.

---

## Working across the repos

- **Toolchain:** Node.js (≥ 20 for the docs site), npm, and Debian build tooling
  (`dh_make`, `dpkg-buildpackage`, GPG) for `debian`.
- **Layout:** all four checked out under `/home/somanos/github/`. The `debian` builders
  clone sibling sources by default; `REPO_BASE` can repoint them at local mirrors.
- **Landing a change in a release:**
  1. Edit `setup-infra` / `setup-schemas`; publish (`npm run release`).
  2. Bump the matching `debian/<pkg>/debian/changelog` (or run its
     `update-changelog.sh`).
  3. Rebuild with `debian/build-all.sh` (or the single `build.sh`).
  4. Deploy the resulting `.deb` (see `debian/docs/deployment.md`).
- **Documenting it:** update the relevant page under `drumee.github.io/docs/` and wire
  it into `sidebars.ts`.

---

*Cross-repo orientation guide. For authoritative detail, defer to each repo's own
`README.md`, `CLAUDE.md`, and (for `debian`) `docs/`.*
