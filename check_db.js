
import oracledb from 'oracledb';
import 'dotenv/config.js';
async function run() {
  try {
    const connection = await oracledb.getConnection({
      user: process.env.ORACLE_DB_USER,
      password: process.env.ORACLE_DB_PASSWORD,
      connectString: process.env.ORACLE_DB_CONNECTION_STRING
    });
    const result = await connection.execute('SELECT table_name FROM user_tables ORDER BY table_name');
    console.log('Tables:', result.rows.map(r => r[0]).join(', '));
    await connection.close();
  } catch (err) {
    console.error(err);
  }
}
run();

