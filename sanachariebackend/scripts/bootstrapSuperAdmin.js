require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function main() {
  const { MONGODB_URI, ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD, ADMIN_BOOTSTRAP_NAME = 'Sancharie Super Admin' } = process.env;
  if (!MONGODB_URI || !ADMIN_BOOTSTRAP_EMAIL || !ADMIN_BOOTSTRAP_PASSWORD) {
    throw new Error('Set MONGODB_URI, ADMIN_BOOTSTRAP_EMAIL, and ADMIN_BOOTSTRAP_PASSWORD before running this script.');
  }
  if (ADMIN_BOOTSTRAP_PASSWORD.length < 14) throw new Error('Bootstrap password must be at least 14 characters.');
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase();
  const exists = await Admin.findOne({ email });
  if (exists) throw new Error('An admin with that email already exists; bootstrap will not overwrite accounts.');
  const passwordHash = await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, 12);
  await Admin.create({ email, name: ADMIN_BOOTSTRAP_NAME, passwordHash, role: 'super_admin' });
  console.log(`Super Admin created for ${email}. Remove the bootstrap credentials from the environment.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
