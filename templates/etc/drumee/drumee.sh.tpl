# -------------------------------------------------------------
# ! DO NOT EDIT !
# Config file automatically generated by <setup-infra>
# Date : <%= date %>
# -------------------------------------------------------------

export CERTS_DIR=<%= certs_dir %>
if [ -d "$OWN_CERTS_DIR" ]; then
  export ACME_DIR="$OWN_CERTS_DIR"
fi

<% if (typeof(public_domain) !== "undefined" && public_domain != "" ) { %>
export ACME_CA_SERVER=<%= ca_server %>
export ACME_DIR=<%= acme_dir %>
export ACME_EMAIL_ACCOUNT=<%= acme_email_account %>
export ACME_STORE=<%= certs_dir %>/<%= public_domain %>_ecc
export NSUPDATE_SERVER=ns1.<%= public_domain %>
export NSUPDATE_ZONE=<%= public_domain %>
export PUBLIC_DOMAIN=<%= public_domain %>
export DRUMEE_DOMAIN_NAME=<%= public_domain %>
<% } %>

<% if (typeof(private_domain) !== "undefined" && private_domain != "" ) { %>
export ACME_STORE=<%= certs_dir %>/<%= private_domain %>_ecc
export PRIVATE_DOMAIN=<%= private_domain %>
<% if (typeof(public_domain) === "undefined" || public_domain == "" ) { %>
export DRUMEE_DOMAIN_NAME=<%= private_domain %>
<% } %>

<% } %>

<% if (/^jit\.(.+)$/.test(jitsi_public_domain)) { %>
export JITSI_DOMAIN=<%= jitsi_public_domain %>
#jitsi_public_domain |<%= jitsi_public_domain %>|<%= typeof(jitsi_public_domain) %>|
<% } else if (/^jit\.(.+)$/.test(jitsi_private_domain)) { %>
#jitsi_private_domain
export JITSI_DOMAIN=<%= jitsi_private_domain %>
<% } %>

export APP_ROUTING_MARK=<%= public_ui_root %>
export CREDENTIAL_DIR=/etc/drumee/credential
export NSUPDATE_KEY=<%= nsupdate_key %>
export DRUMEE_DB_DIR=<%= db_dir %>
export DRUMEE_CACHE_DIR=<%= cache_dir %>
export DRUMEE_DATA_DIR=<%= data_dir %>
export DRUMEE_EXPORT_DIR=<%= export_dir %>
export DRUMEE_IMPORT_DIR=<%= import_dir %>
export DRUMEE_LOG_DIR=<%= log_dir %>
export DRUMEE_MFS_DIR=<%= data_dir %>/mfs
export DRUMEE_ROOT='/srv/drumee'
export DRUMEE_RUNTIME_DIR=<%= runtime_dir %>
export DRUMEE_SCHEMAS_DIR=<%= runtime_dir %>/server/schemas
export DRUMEE_SERVER_HOME=<%= server_dir %>
export DRUMEE_SERVER_MAIN=<%= server_location %>
export DRUMEE_SERVER_NODE=<%= server_location %>/node_modules
export DRUMEE_STATIC_DIR=<%= static_dir %>
export DRUMEE_SYSTEM_GROUP=<%= system_group %>
export DRUMEE_SYSTEM_USER=<%= system_user %>
export DRUMEE_TMP_DIR=<%= data_dir %>/tmp
export DRUMEE_UI_HOME=<%= runtime_dir %>/ui
export DRUMEE_BACKUP_STORAGE=<%= backup_storage %>
export DRUMEE_DB_BACKUP=<%= backup_storage %>/db
export PUBLIC_UI_ROOT=<%= public_ui_root %>
export PUBLIC_HTTP_PORT=<%= public_http_port %>
export PUBLIC_HTTPS_PORT=<%= public_https_port %>

