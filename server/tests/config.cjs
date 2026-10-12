// Unit tests require no real account; integration uses its own explicit command.
require('dotenv').config({path:require('node:path').resolve(__dirname,'../../.env')});
for(const [key,value] of Object.entries({DB_USER:'SYNTHETIC_TEST_USER',DB_PASSWORD:'SYNTHETIC_TEST_PASSWORD',DB_NAME:'SYNTHETIC_TEST_DATABASE'}))process.env[key]??=value;
