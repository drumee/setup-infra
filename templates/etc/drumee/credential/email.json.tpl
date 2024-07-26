{
  "host": "<%= email_host %>",
  "port": <%= email_port %>,
  "secure": false,
  "auth": { 
    "user": "<%= email_user %>@<%= domain_name %>",
    "pass": "<%= email_pass %>" 
  },
  "tls": { 
      "rejectUnauthorized": false
  }
}