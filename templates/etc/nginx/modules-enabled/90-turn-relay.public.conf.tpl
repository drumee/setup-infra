# Rendered by setup-infra — do not edit.
#
# This file lands in modules-enabled, which nginx includes at MAIN context. A bad
# directive here does not break one vhost, it stops nginx entirely — so the values
# used below are guarded rather than interpolated blind. An unset public_ip4 used to
# render `server :5349;` and nginx then refused its whole configuration:
#
#   nginx: [emerg] no host in upstream ":5349" in
#          /etc/nginx/modules-enabled/90-turn-relay.public.conf:12
#
# A total outage on an instance whose only fault was not having been told its own
# address. The address is optional — debconf leaves it empty unless asked — while
# this file was written unconditionally, and nothing reconciled the two.
<% if (typeof(public_ip4) !== "undefined" && public_ip4 != ""
    && typeof(jitsi_public_domain) !== "undefined" && jitsi_public_domain != "") { %>
stream {
    map $ssl_preread_server_name $name {
        turn.<%= jitsi_public_domain %> web_backend;
        turn-jitsi.<%= jitsi_public_domain %> turn_backend;
    }

    upstream web_backend {
        server 127.0.0.1:3478;
    }

    upstream turn_backend {
        server <%= public_ip4 %>:5349;
    }

    server {
        listen <%= public_https_port %> udp;
        listen [::]:<%= public_https_port %> udp;

        # since 1.11.5
        ssl_preread on;

        proxy_pass $name;

        # Increase buffer to serve video
        proxy_buffer_size 10m;
    }
}
<% } else { %>
# TURN relay not configured: this instance has no public IPv4 address and/or no
# conferencing domain, so there is no endpoint to proxy media to. Deliberately left
# inert — an incomplete stream block here would take nginx down for every site on
# the host. Set the address and the conferencing domain, then re-run the installer.
<% } %>
