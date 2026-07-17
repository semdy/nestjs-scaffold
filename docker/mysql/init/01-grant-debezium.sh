#!/bin/bash
set -eu

if [ -z "${MYSQL_USER:-}" ]; then
  exit 0
fi

MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket -uroot <<SQL
GRANT RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${MYSQL_USER}'@'%';
SQL
