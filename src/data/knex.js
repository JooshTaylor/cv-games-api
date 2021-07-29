const knex = require('knex');
require('dotenv').config();
const { knexSnakeCaseMappers } = require('objection');

const devConfig = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT
};

const prodConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
  // host: 'postgresql-solid-09719',
  // user: 'postgres',
  // database: 'cv_games',
  // port: 5432,
  // password: '-V=7vzYn!vx{F~Pz'
}

const db = knex({
  client: 'pg',
  connection: process.env.NODE_ENV === 'production' ? prodConfig : devConfig,
  ...knexSnakeCaseMappers()
});

module.exports = db;