#!/bin/bash
set -e
source /etc/drumee/drumee.sh

echo "Configuring DNS server for $DRUMEE_DOMAIN_NAME"

service named stop
mkdir -p /var/log/named/
chown -R bind:bind /var/log/named/
mkdir -p /etc/bind/keys/

if [ "$NSUPDATE_KEY" = "" ];then
  export NSUPDATE_KEY=/etc/bind/keys/update.key
fi 

echo Will use update key from $NSUPDATE_KEY
if [ ! -f "$NSUPDATE_KEY" ]; then
  echo Generating tsig key
  tsig-keygen -a hmac-sha512 update > $NSUPDATE_KEY
fi

chown -R bind:bind /etc/bind

echo Restarting named
service named restart

echo "DNS server has been successfuly setup!"
