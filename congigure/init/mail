#!/bin/bash
if [ "$DRUMEE_DOMAIN_NAME" = "" ]; then
  echo "Domain name was not defined"
  exit 1
fi

echo "Configuring DKIM for domain $DRUMEE_DOMAIN_NAME"
set -e

dkim_dir=/etc/opendkim/keys/$DRUMEE_DOMAIN_NAME
mkdir -p $dkim_dir
cd $dkim_dir
key_file=private.pem
openssl genrsa -out $key_file 2048 
openssl rsa -in $key_file -pubout -outform der 2>/dev/null | openssl base64 -A > dkim.txt

