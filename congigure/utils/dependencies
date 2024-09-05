
# Install postfix
ensure_postfix () {
  debconf-set-selections $1
  DEBIAN_FRONTEND="noninteractive" apt install -y libopendkim11 opendkim-tools libmail-dkim-perl opendkim postfix mailutils spamass-milter postfix-mysql
}

# Install Jitsi packages
ensure_jitsi () {
  installed=$(dpkg -l | egrep "^ii +jitsi-meet")
  if [ "$installed" != "" ]; then
    echo Already have jitsi-meet.
  else
    debconf-set-selections $1
    curl -sS https://download.jitsi.org/jitsi-key.gpg.key | gpg --dearmor | tee /etc/apt/trusted.gpg.d/jitsi-key.gpg
    echo "deb https://download.jitsi.org stable/" | tee /etc/apt/sources.list.d/jitsi-stable.list

    apt update
    apt install -y prosody
    DEBIAN_FRONTEND="noninteractive" apt install -y jitsi-meet
  fi
}

ensure_mariadb () {
  v=$(which mariadb)
  if [ "$v" = "" ]; then
    v=0
  else
    v=$(mariadb --version | awk '{print $5}' | sed -E "s/\..+$//")
  fi
  if (($v > 9)); then
    echo "Already have MariaDb"
  else
    if [ ! -f /etc/apt/sources.list.d/mariadb.list ]; then
      curl -sS https://downloads.mariadb.com/MariaDB/mariadb_repo_setup | bash
    fi
    apt install -y --no-install-recommends mariadb-server mariadb-client mariadb-backup
  fi
  service mariadb stop
}


#
node_version () {
  v=$(which node)
  if [ -z $v ]; then
    echo "0"
  else
    v=$(node -v | sed -E "s/^v//" | sed -E "s/\..+$//")
    echo $v
  fi
}

# Install Node packages dependencies
ensure_node_packages () {
  echo Installing Node packages dependencies...
  version=$(node_version)
  if (($version < 20)); then
    curl -s https://deb.nodesource.com/setup_20.x | bash && apt-get update && apt-get install nodejs -y
  fi

  node -v
  npm -v

  npm install -g moment minimist shelljs jsonfile readline-sync pm2 pm2-logrotate lodash node-gyp node-pre-gyp coffeescript sass
}

check_installation () {
  if [ -f /etc/drumee/drumee.sh ]; then
    source /etc/drumee/drumee.sh
    yp=$(mysql yp -e "select main_domain() mydomain")
    if [ "$yp" = "" ]; then
      RET=maiden
    else
      RET=exists
    fi
  else
    RET=exists
  fi
}

select_installation_mode () {
  for i in DRUMEE_DOMAIN_NAME PUBLIC_IP4 PUBLIC_IP6 ADMIN_EMAIL DRUMEE_DB_DIR DRUMEE_DATA_DIR; do
    if [ "${!i}" = "" ]; then
      RET=menu
      break
    fi
  done
  RET=auto
}
