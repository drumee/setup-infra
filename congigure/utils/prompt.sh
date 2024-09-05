

# 
prompt () {
  name=$1
  pattern=$2
  toggle=$3
  db_input high $name || true
  db_get $name  
  is_valid=$(echo $RET | grep -E "$pattern")
  if ["$toggle" = "" ]; then
    while [ "$is_valid" = "" ]
    do
      db_input high $name || true
      db_get $name
      is_valid=$(echo $RET | grep -E "$pattern")
    done 
  else 
    while [ "$is_valid" != "" ]
    do
      db_input high $name || true
      db_get $name
      is_valid=$(echo $RET | grep -E "$pattern")
    done 
  fi
}

should_reinstall () {
  db_input high drumee/reinstall || true
  db_go
  db_get drumee/reinstall
  if [ "$RET" = "quit" ]; then
    exit 0
  fi
}