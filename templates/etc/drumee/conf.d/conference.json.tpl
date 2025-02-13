{
  "domain": "<%= jitsi_public_domain %>",
  "hosts": {
    "domain": "<%= jitsi_public_domain %>",
    "muc": "conference.<%= jitsi_public_domain %>"
  },
  "bosh": "https://<%= jitsi_public_domain %>/http-bind",
  "auth": ["<%= app_id %>", "<%= app_password %>"]
}