import bcrypt from 'bcrypt';
import pool from '../config/database';

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    // Créer un utilisateur admin
    const password = 'Admin123!';
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      ['admin@property.com', hashedPassword, 'Admin', 'User', 'admin', true]
    );

    console.log('✅ Admin user created');
    console.log('   Email: admin@property.com');
    console.log('   Password: Admin123!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seed();
