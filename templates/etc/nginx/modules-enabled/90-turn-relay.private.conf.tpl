# Rendered by setup-infra — do not edit.
#
# Guarded for the same reason as the public variant: this file is included at nginx's
# MAIN context, so an incomplete stream block stops nginx for every site on the host
# rather than breaking one vhost. An unset address rendered `server :5349;`, and
# nginx refused the entire configuration with `no host in upstream ":5349"`.
<% if (typeof(private_ip4) !== "undefined" && private_ip4 != ""
    && typeof(jitsi_private_domain) !== "undefined" && jitsi_private_domain != "") { %>
stream {
    map $ssl_preread_server_name $name {
        turn.<%= jitsi_private_domain %> web_backend;
        turn-jitsi.<%= jitsi_private_domain %> turn_backend;
    }

    upstream web_backend {
        server 127.0.0.1:3478;
    }

    upstream turn_backend {
        server <%= private_ip4 %>:5349;
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
# TURN relay not configured: this instance has no private IPv4 address and/or no
# conferencing domain, so there is no endpoint to proxy media to. Deliberately left
# inert rather than emitting a stream block nginx would reject.
<% } %>
