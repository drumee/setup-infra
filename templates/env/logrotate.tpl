<%= runtime_dir %>/backend/.pm2/logs/* {
    daily
    rotate 2
    olddir <%= runtime_dir %>/backend/.pm2/logs.old/
    missingok
}
/srv/drumee/runtime/backend/.pm2/logs/