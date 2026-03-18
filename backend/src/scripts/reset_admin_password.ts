import bcrypt from 'bcrypt';
import pool from '../config/database';

async function resetAdminPassword() {
  const newHash = await bcrypt.hash('Admin1234!', 10);
  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2',
    [newHash, 'admin@property.com']
  );
  console.log('✅ Password reset for admin@property.com → Admin1234!');
  await pool.end();
}

resetAdminPassword().catch(console.error);
