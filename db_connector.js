const dbModule = process.env.DATABASE_URL ? './database_pg' : './database';
module.exports = require(dbModule);
