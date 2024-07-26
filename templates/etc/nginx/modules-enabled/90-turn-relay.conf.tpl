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
