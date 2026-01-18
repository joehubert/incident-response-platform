import sql from 'mssql';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../src/config';
import logger from '../src/lib/utils/logger';

async function migrate() {
  try {
    logger.info('Starting database migration');

    const dbConfig: sql.config = {
      server: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
    };

    const pool = await sql.connect(dbConfig);
    logger.info('Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/001_initial_schema.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    // Split by GO statements
    const statements = migrationSQL
      .split(/^\s*GO\s*$/gim)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    logger.info(`Executing ${statements.length} migration statements`);

    for (const [index, statement] of statements.entries()) {
      try {
        await pool.request().query(statement);
        logger.info(`Executed statement ${index + 1}/${statements.length}`);
      } catch (error) {
        logger.error(`Failed to execute statement ${index + 1}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    await pool.close();
    logger.info('Database migration completed successfully');
  } catch (error) {
    logger.error('Database migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

migrate();
