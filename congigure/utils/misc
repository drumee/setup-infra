
export log_dir=/var/log/drumee
export log_file="${log_dir}/info.log"

if [ ! -d $log_dir ]; then
  mkdir -p $log_dir
fi

# log
log () {
  echo $(date "+%Y:%m:%d[%H:%M:%s]") $* | tee $log_file
}

#answer
answer () {
  stdin="${1:-/dev/stdin}"
  while read line; do
    break
  done <$stdin
  echo $line$()
}

# Ensure there won't be confilcting ports
check_ports () {
  set +
  echo Scanning ports in use. This may take a while
  netstat -alpute | awk 'BEGIN { FS=" " } {print $4}' | egrep -E ".+:.+" >/tmp/netstat.log
  ports="53 10000 3478 5222 5269 5280 5281 5282 5283 5349 8888 9090 domain xmpp-client xmpp-server"

  for i in $ports; do
    port=$(grep -w $i /tmp/netstat.log)
    if [ ! -z "$port" ]; then
      echo port $i is already in used
    fi
  done
}


#-------------------
log () {
  echo $(date "+%Y:%m:%d[%H:%M:%s]") $* | tee $log_file
}


##-------------------
protect_dir () {
  dir=$1
  conidential=$2
  if [ -z $dir ]; then
    if [ "$3" = "mkdir" ]; then
       mkdir -p $dir
    else
      echo "No directory to protect. Skipped"
    fi
  else
    mkdir -p $dir
    chown -R $DRUMEE_SYSTEM_USER:$DRUMEE_SYSTEM_GROUP $dir
    if [ "$confidential" = "yes" ]; then
      chmod -R go-rwx $dir
    fi
    chmod -R u+rwx $dir
  fi
}

check_installation() {
  if [ -f /etc/drumee/drumee.sh ]; then
    source /etc/drumee/drumee.sh 
    yp=$(mysql yp -e  "select main_domaissn() mydomain");
    if [ "$yp" = "" ]; then
      RET=maiden
    else 
      RET=exists
    fi
  else
    RET=maiden
  fi
}