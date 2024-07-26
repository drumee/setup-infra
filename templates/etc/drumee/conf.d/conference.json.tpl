{
  "domain": "<%= jitsi_domain %>",
  "hosts": {
    "domain": "<%= jitsi_domain %>",
    "muc": "conference.<%= jitsi_domain %>"
  },
  "bosh": "https://<%= jitsi_domain %>/http-bind",
  "auth": ["<%= app_id %>", "<%= app_password %>"]
}