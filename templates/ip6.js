/**
 * Which IPv6 addresses may be published in a DNS zone.
 *
 * Its own module, and not a helper inside utils.js, so a test can require it
 * without utils.js parsing process.argv on load.
 *
 * The case that made this necessary: a LAN box whose only IPv6 address is the
 * interface's link-local one. The `ip` module classes fe80::/10 as private, so it
 * became `private_ip6` and the private zone published it as the AAAA of the apex,
 * ns1, ns2, smtp, jit and the wildcard. The result is a zone that hands every
 * client an address it cannot use: a link-local address is only meaningful together
 * with an interface scope, and an AAAA record has nowhere to put one. Measured on a
 * real install — `curl -6 https://<domain>/` failed outright, and plain curl only
 * survived because happy-eyeballs falls back to IPv4 after wasting a connection
 * attempt on every request. An IPv6-only client, or any library without that
 * fallback, simply cannot reach the instance.
 *
 * No AAAA at all is strictly better than an AAAA nothing can connect to: without
 * one, clients use the A record and reach the box.
 *
 * fd00::/8 (unique-local) is deliberately still publishable. It is private in the
 * same sense as 192.168/16 — routable within the site, and usable by every client
 * that can reach the box at all.
 */
function isPublishableIp6(addr) {
  if (!addr) return false;
  // Strip any zone index (`fe80::1%eth0`) before testing: the presence of one is
  // itself a sign of a scoped address, but node reports link-locals without it.
  const a = String(addr).toLowerCase().split("%")[0];
  if (a === "::1" || a === "::") return false;   // loopback, unspecified
  if (/^fe[89ab][0-9a-f]:/.test(a)) return false; // fe80::/10 link-local
  return true;
}

module.exports = { isPublishableIp6 };
