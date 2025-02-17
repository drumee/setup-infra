# -------------------------------------------------------------
# !!!!!!! DO NOT EDIT !!!!!!!!
# Config file automatically generated by <setup-infra>
# Purpose     : Provide Nginx config to a specific server
# Server name : <%= domain %>
# Date        : <%= date %>
# -------------------------------------------------------------

map $http_upgrade $connection_upgrade {
	default upgrade;
	''      close;
}

server {
	listen <%= public_http_port %> default_server;
	listen [::]:<%= public_http_port %> default_server;
    server_name *.<%= jitsi_private_domain %>;
	include /etc/jitsi/meet.private.conf;
}

server {
	listen <%= public_https_port %> ssl http2;
	listen [::]:<%= public_https_port %> ssl http2;
	server_name <%= jitsi_private_domain %>; 
	include /etc/jitsi/ssl.private.conf;
	include /etc/jitsi/meet.private.conf;
}

