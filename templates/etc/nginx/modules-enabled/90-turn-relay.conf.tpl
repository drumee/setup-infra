# Rendered by setup-infra — do not edit.
#
# Guarded for the same reason as the public and private variants: this file is
# included at nginx's MAIN context, so an incomplete stream block stops nginx for
# every site on the host rather than breaking one vhost. An unset address rendered
# `server :5349;`, and nginx refused the entire configuration with
# `no host in upstream ":5349"`.
<% if (typeof(public_ip4) !== "undefined" && public_ip4 != ""
    && typeof(jitsi_domain) !== "undefined" && jitsi_domain != "") { %>
stream {
    map $ssl_preread_server_name $name {
        turn.<%= jitsi_domain %> web_backend;
        turn-jitsi.<%= jitsi_domain %> turn_backend;
    }

    upstream web_backend {
        server 127.0.0.1:3478;
    }

    upstream turn_backend {
        server <%= public_ip4 %>:5349;
    }

    server {
        listen 443 udp;
        listen [::]:443 udp;

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
# inert rather than emitting a stream block nginx would reject.
<% } %>
