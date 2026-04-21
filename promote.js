const { pool } = require('./src/config/db');

async function promoteUser() {
  const email = process.argv[2];
  if (!email) {
    console.error('❌ Please provide an email address. Example: node promote.js admin@example.com');
    process.exit(1);
  }

  try {
    const res = await pool.query(
      `UPDATE users SET role = 'superadmin' WHERE email = $1 RETURNING *`,
      [email]
    );

    if (res.rowCount === 0) {
      console.log(`❌ No user found with email: ${email}`);
    } else {
      console.log(`✅ Success! User ${email} has been promoted to SUPERADMIN.`);
      console.log(`You can now refresh the browser to access all Admin portlets!`);
    }
  } catch (err) {
    console.error('Error promoting user:', err);
  } finally {
    pool.end();
  }
}

promoteUser();
