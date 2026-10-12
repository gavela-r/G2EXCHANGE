// Restore ONLY the explicitly named isolated database; never targets DB_NAME.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const container=process.env.G2_MYSQL_CONTAINER||'mysql_valoracion';
const isolated='g2_activation_test_20261012';
const result=spawnSync('docker',['exec',container,'sh','-c',
  `export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -e 'CREATE DATABASE IF NOT EXISTS ${isolated}'; mysql -uroot ${isolated} < /tmp/g2-before-activation.sql`
],{encoding:'utf8'});
if(result.status!==0)throw new Error(result.stderr||'Restauración fallida');
console.log('Restaurado backup en '+isolated);
