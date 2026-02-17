// Run this script locally to create an admin account and demo data.
// Usage (PowerShell):
// $env:SUPABASE_URL='https://...'; $env:SUPABASE_SERVICE_ROLE_KEY='...' ; node admin/server/seed_demo.js

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function ensureUser(email, password, full_name, user_type = 'admin') {
  // try to find user by email in users table
  const { data: existingUsers } = await supabase.from('users').select('id').eq('email', email).limit(1);
  if (existingUsers && existingUsers.length > 0) {
    console.log('User already exists in users table:', email);
    return existingUsers[0].id;
  }

  // create auth user
  console.log('Creating auth user:', email);
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name }
  });

  if (createError) {
    console.error('Failed to create auth user:', createError.message || createError);
    throw createError;
  }

  const userId = created.user.id;
  const now = new Date().toISOString();

  const { error: profileError } = await supabase.from('users').insert([{
    id: userId,
    email,
    full_name,
    user_type,
    is_active: true,
    status: user_type === 'admin' ? 'approved' : 'pending',
    created_at: now,
    updated_at: null
  }]);

  if (profileError) {
    console.error('Failed to insert profile row:', profileError.message || profileError);
    throw profileError;
  }

  console.log('Created user', email, 'id=', userId);
  return userId;
}

async function seed() {
  try {
    // admin account
    const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@local.test';
    const adminPass = process.env.DEMO_ADMIN_PASSWORD || 'Password123!';
    const adminId = await ensureUser(adminEmail, adminPass, 'Local Admin', 'admin');

    // create sample passengers
    const passenger1 = await ensureUser('alice@local.test', 'Password123!', 'Alice Rider', 'passenger');
    const passenger2 = await ensureUser('bob@local.test', 'Password123!', 'Bob Rider', 'passenger');

    // create sample driver
    const driverAuth = await ensureUser('driver1@local.test', 'Password123!', 'Driver One', 'driver');

    // insert driver row if not exists
    const { data: existingDrivers } = await supabase.from('drivers').select('id').eq('user_id', driverAuth).limit(1);
    if (!existingDrivers || existingDrivers.length === 0) {
      const { error: drvErr } = await supabase.from('drivers').insert([{ user_id: driverAuth, vehicle_type: 'Car', vehicle_plate: 'ABC-123', is_online: true }]);
      if (drvErr) console.error('Failed to insert driver row:', drvErr.message || drvErr);
      else console.log('Inserted demo driver row for', driverAuth);
    } else {
      console.log('Driver row already exists for', driverAuth);
    }

    // create sample rides
    const now = new Date();
    const { data: ridesExisting } = await supabase.from('rides').select('id').limit(1);
    if (!ridesExisting || ridesExisting.length === 0) {
      const demoRides = [
        {
          passenger_id: passenger1,
          pickup_location: 'Mall A',
          dropoff_location: 'Office B',
          pickup_lat: 11.6084,
          pickup_lng: 125.4317,
          status: 'requested',
          fare: '120.00',
          created_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString()
        },
        {
          passenger_id: passenger2,
          pickup_location: 'Home X',
          dropoff_location: 'Airport Y',
          pickup_lat: 11.5600,
          pickup_lng: 125.4200,
          status: 'requested',
          fare: '450.00',
          created_at: now.toISOString()
        }
      ];

      const { error: ridesErr } = await supabase.from('rides').insert(demoRides);
      if (ridesErr) console.error('Failed to insert demo rides:', ridesErr.message || ridesErr);
      else console.log('Inserted demo rides');
    } else {
      console.log('Rides table already has entries, skipping ride seeding');
    }

    console.log('Seeding complete. Admin credentials: ', adminEmail, adminPass);
    console.log('Open the admin login and sign in with those credentials.');
  } catch (err) {
    console.error('Seeding failed:', err);
  }
}

async function runIfMain() {
  if (require.main === module) {
    await seed();
    process.exit(0);
  }
}

runIfMain();

module.exports = { seed };
