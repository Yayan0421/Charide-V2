const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(express.json());

const publicDir = path.join(__dirname, '..');
app.use(express.static(publicDir));

const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigin === '*' || origin === allowedOrigin) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  }
}));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 4100;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration. Check admin/server/.env');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

function nowIso() {
  return new Date().toISOString();
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data || !data.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = data.user.id;
  return next();
}

async function adminRequired(req, res, next) {
  const profile = await getProfile(req.userId);
  if (!profile || profile.user_type !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  req.userProfile = profile;
  return next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body || {};
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    });

    if (createError || !created || !created.user) {
      return res.status(400).json({ error: createError ? createError.message : 'Signup failed' });
    }

    const createdAt = nowIso();
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert([{
        id: created.user.id,
        email,
        full_name,
        user_type: 'admin',
        is_active: true,
        status: 'approved',
        created_at: createdAt,
        updated_at: null
      }]);

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    const user = await getProfile(created.user.id);
    return res.status(201).json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data || !data.session || !data.user) {
      return res.status(401).json({ error: error ? error.message : 'Invalid credentials' });
    }

    const profile = await getProfile(data.user.id);
    if (!profile || profile.user_type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    return res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: profile
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/auth/me', authRequired, adminRequired, async (req, res) => {
  return res.json({ user: req.userProfile });
});

app.get('/admin/users', authRequired, adminRequired, async (req, res) => {
  try {
    const { status, user_type } = req.query || {};
    let query = supabaseAdmin.from('users').select('*');
    if (status) query = query.eq('status', status);
    if (user_type) query = query.eq('user_type', user_type);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    return res.json({ users: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

app.put('/admin/users/:id/status', authRequired, adminRequired, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const { error } = await supabaseAdmin
      .from('users')
      .update({ status, updated_at: nowIso() })
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });

    const user = await getProfile(req.params.id);
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user status' });
  }
});

app.get('/admin/drivers', authRequired, adminRequired, async (req, res) => {
  try {
    const { data: drivers, error } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .order('id', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    const userIds = Array.from(new Set((drivers || []).map(d => d.user_id).filter(Boolean)));
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .in('id', userIds.length > 0 ? userIds : ['']);

    if (usersError) return res.status(400).json({ error: usersError.message });

    const userMap = new Map((users || []).map(u => [u.id, u]));
    const enriched = (drivers || []).map(d => ({
      ...d,
      user: userMap.get(d.user_id) || null
    }));

    return res.json({ drivers: enriched });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load drivers' });
  }
});

app.put('/admin/drivers/:id/status', authRequired, adminRequired, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('user_id')
      .eq('id', req.params.id)
      .single();

    if (error || !driver) return res.status(404).json({ error: 'Driver not found' });

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ status, updated_at: nowIso() })
      .eq('id', driver.user_id);

    if (updateError) return res.status(400).json({ error: updateError.message });

    const user = await getProfile(driver.user_id);
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update driver status' });
  }
});

app.get('/admin/rides', authRequired, adminRequired, async (req, res) => {
  try {
    const { status } = req.query || {};
    let query = supabaseAdmin.from('rides').select('*');
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    return res.json({ rides: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load rides' });
  }
});

app.get('/admin/stats', authRequired, adminRequired, async (req, res) => {
  try {
    const { count: usersCount, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true });

    const { count: driversCount, error: driversError } = await supabaseAdmin
      .from('drivers')
      .select('id', { count: 'exact', head: true });

    const { data: rides, error: ridesError } = await supabaseAdmin
      .from('rides')
      .select('fare');

    if (usersError || driversError || ridesError) {
      return res.status(400).json({
        error: usersError?.message || driversError?.message || ridesError?.message
      });
    }

    const totalRevenue = (rides || []).reduce((sum, r) => sum + (parseFloat(r.fare) || 0), 0);

    return res.json({
      totalUsers: usersCount || 0,
      totalDrivers: driversCount || 0,
      totalRides: (rides || []).length,
      totalRevenue
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load stats' });
  }
});

app.get('/admin/messages', authRequired, adminRequired, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ messages: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Dev-only seeding endpoint (guarded by ALLOW_DEV_SEED env var)
if (process.env.ALLOW_DEV_SEED === 'true') {
  try {
    const { seed } = require('./seed_demo');
    app.post('/dev/seed', async (req, res) => {
      try {
        await seed();
        return res.json({ seeded: true });
      } catch (err) {
        return res.status(500).json({ error: String(err) });
      }
    });
  } catch (err) {
    console.warn('Dev seed unavailable:', err.message || err);
  }
}

app.listen(PORT, () => {
  console.log('Admin backend running on port ' + PORT);
});
