server_name _;

charset utf8;

client_max_body_size 0;

# Disable direct access to jitsi UI
# root /usr/share/jitsi-meet;
root <%= static_dir %>;

# ssi on with javascript for multidomain variables in config.js
ssi on;
ssi_types application/x-javascript application/javascript;

index index.html index.htm;
error_page 404 /static/404.html;

# Security headers
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";

set $prefix "";


# Opt out of FLoC (deprecated)
add_header Permissions-Policy "interest-cohort=()";

location = /config.js {
   alias /etc/jitsi/web/config.js;
}

location = /interface_config.js {
   alias /etc/jitsi/web/interface_config.js;
}

location = /external_api.js {
   alias /usr/share/jitsi-meet/libs/external_api.min.js;
}



# ensure all static content can always be found first
location ~ ^/(libs|css|static|images|fonts|lang|sounds|connection_optimization|.well-known)/(.*)$ {
   add_header 'Access-Control-Allow-Origin' '*';
   alias /usr/share/jitsi-meet/$1/$2;

    # cache all versioned files
   if ($arg_v) {
       expires 1y;
   }
}


# colibri (JVB) websockets
location ~ ^/colibri-ws/([a-zA-Z0-9-\._]+)/(.*) {
    tcp_nodelay on;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_pass http://$1:9090/colibri-ws/$1/$2$is_args$args;
}


# BOSH
location = /http-bind {
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host <%= jitsi_domain %>;
    proxy_pass http://127.0.0.1:5280/http-bind?prefix=$prefix&$args;
}


# xmpp websockets
location = /xmpp-websocket {
    proxy_pass http://localhost:5280/xmpp-websocket;
    proxy_http_version 1.1;
    proxy_set_header Connection "upgrade";
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Host <%= jitsi_domain %>;
    proxy_set_header X-Forwarded-For $remote_addr;
    tcp_nodelay on;
}


location ~ ^/([^/?&:'"]+)$ {
    try_files $uri @root_path;
}

location @root_path {
    rewrite ^/(.*)$ / break;
}


# Matches /(TENANT)/pwa-worker.js or /(TENANT)/manifest.json to rewrite to / and look for file
location ~ ^/([^/?&:'"]+)/(pwa-worker.js|manifest.json)$ {
    set $subdomain "$1.";
    set $subdir "$1/";
    rewrite ^/([^/?&:'"]+)/(pwa-worker.js|manifest.json)$ /$2;
}

location ~ ^/([^/?&:'"]+)/config.js$ {
    set $subdomain "$1.";
    set $subdir "$1/";

    alias /etc/jitsi/web/config.js;
}

# BOSH for subdomains
location ~ ^/([^/?&:'"]+)/http-bind {
    set $subdomain "$1.";
    set $subdir "$1/";
    set $prefix "$1";

    rewrite ^/(.*)$ /http-bind;
}


# websockets for subdomains
location ~ ^/([^/?&:'"]+)/xmpp-websocket {
    set $subdomain "$1.";
    set $subdir "$1/";
    set $prefix "$1";

    rewrite ^/(.*)$ /xmpp-websocket;
}


# Anything that didn't match above, and isn't a real file, assume it's a room name and redirect to /
location ~ ^/([^/?&:'"]+)/(.*)$ {
    set $subdomain "$1.";
    set $subdir "$1/";
    rewrite ^/([^/?&:'"]+)/(.*)$ /$2;
}
