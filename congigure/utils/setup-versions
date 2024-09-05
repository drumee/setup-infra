#!/bin/bash
base="$(dirname "$(readlink -f "$0")")"
mkdir -p /etc/jitsi
dest=/etc/jitsi/versions.js
echo "module.exports={" > $dest
dpkg -l | egrep "ii +jitsi" | awk '{print  "\"", $2, "\"", ":", "\"", $3, "\"", ","}'  | sed -E "s/ +//g" >> $dest
echo "}" >>  $dest
