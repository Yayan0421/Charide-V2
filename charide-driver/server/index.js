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
const PORT = process.env.PORT || 4000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration. Check ChaRide(driver)/server/.env');
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

async function driverRequired(req, res, next) {
  const profile = await getProfile(req.userId);
  if (!profile || profile.user_type !== 'driver') {
    return res.status(403).json({ error: 'Driver access required' });
  }
  req.userProfile = profile;
  return next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, full_name, phone, vehicle_type, vehicle_plate } = req.body || {};
    if (!email || !password || !full_name || !vehicle_type || !vehicle_plate) {
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
        phone: phone || '',
        user_type: 'driver',
        rating: 5.0,
        total_reviews: 0,
        profile_picture_url: null,
        is_active: true,
        status: 'pending',
        created_at: createdAt,
        updated_at: null
      }]);

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    const { error: driverError } = await supabaseAdmin
      .from('drivers')
      .insert([{
        user_id: created.user.id,
        vehicle_type,
        vehicle_plate,
        is_online: false
      }]);

    if (driverError) {
      return res.status(400).json({ error: driverError.message });
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
    if (!profile || profile.user_type !== 'driver') {
      return res.status(403).json({ error: 'Driver access required' });
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

app.get('/auth/me', authRequired, driverRequired, async (req, res) => {
  return res.json({ user: req.userProfile });
});

app.get('/profile', authRequired, driverRequired, async (req, res) => {
  return res.json({ user: req.userProfile });
});

app.put('/profile', authRequired, driverRequired, async (req, res) => {
  try {
    const { full_name, phone, profile_picture_url } = req.body || {};

    const updates = { updated_at: nowIso() };
    if (full_name) updates.full_name = full_name;
    if (phone) updates.phone = phone;
    if (profile_picture_url) updates.profile_picture_url = profile_picture_url;

    const { error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.userId);

    if (error) return res.status(400).json({ error: error.message });

    const user = await getProfile(req.userId);
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.put('/driver/status', authRequired, driverRequired, async (req, res) => {
  try {
    const { is_online, current_latitude, current_longitude } = req.body || {};

    const updates = {};
    if (typeof is_online === 'boolean') updates.is_online = is_online;
    if (typeof current_latitude === 'number') updates.current_latitude = current_latitude;
    if (typeof current_longitude === 'number') updates.current_longitude = current_longitude;

    const { error } = await supabaseAdmin
      .from('drivers')
      .update(updates)
      .eq('user_id', req.userId);

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

app.get('/driver/rides', authRequired, driverRequired, async (req, res) => {
  try {
    const { status } = req.query || {};
    let query = supabaseAdmin
      .from('rides')
      .select('*')
      .eq('driver_id', req.userId);

    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    const rides = data || [];
    const passengerIds = Array.from(new Set(rides.map(r => r.passenger_id).filter(Boolean)));
    let passengerMap = new Map();

    if (passengerIds.length > 0) {
      const { data: passengers, error: passengersError } = await supabaseAdmin
        .from('users')
        .select('id,full_name,profile_picture_url')
        .in('id', passengerIds);

      if (passengersError) {
        return res.status(400).json({ error: passengersError.message });
      }

      passengerMap = new Map((passengers || []).map(p => [p.id, p]));
    }

    const enriched = rides.map(r => {
      const passenger = passengerMap.get(r.passenger_id) || null;
      return {
        ...r,
        passenger_name: passenger ? passenger.full_name : null,
        passenger_avatar: passenger ? passenger.profile_picture_url : null
      };
    });

    return res.json({ rides: enriched });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load rides' });
  }
});

app.get('/driver/requests', authRequired, driverRequired, async (req, res) => {
  try {
    // fetch at most one driver row for this user to avoid .single() coercion errors
    const { data: driverRows, error: driverMetaError } = await supabaseAdmin
      .from('drivers')
      .select('is_online')
      .eq('user_id', req.userId)
      .limit(1);

    if (driverMetaError) {
      return res.status(400).json({ error: driverMetaError.message });
    }

    const driverMeta = (driverRows && driverRows.length > 0) ? driverRows[0] : null;

    if (!driverMeta || !driverMeta.is_online) {
      return res.json({ rides: [] });
    }

    const { data: rides, error } = await supabaseAdmin
      .from('rides')
      .select('*')
      .is('driver_id', null)
      .in('status', ['requested', 'pending', 'paid'])
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    console.log('[DRIVER] found', (rides || []).length, 'pending rides for driver', req.userId, 'sampleIds=', (rides || []).slice(0,5).map(r=>r.id));

    const passengerIds = Array.from(new Set((rides || []).map(r => r.passenger_id).filter(Boolean)));
    let passengerMap = new Map();

    if (passengerIds.length > 0) {
      const { data: passengers, error: passengersError } = await supabaseAdmin
        .from('users')
        .select('id,full_name,profile_picture_url,phone')
        .in('id', passengerIds);

      if (passengersError) {
        return res.status(400).json({ error: passengersError.message });
      }

      passengerMap = new Map((passengers || []).map(p => [p.id, p]));
    }

    const enriched = (rides || []).map(r => {
      const passenger = passengerMap.get(r.passenger_id) || null;
      return {
        ...r,
        passenger_name: passenger ? passenger.full_name : null,
        passenger_avatar: passenger ? passenger.profile_picture_url : null,
        passenger_phone: passenger ? passenger.phone : null
      };
    });

    return res.json({ rides: enriched });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load requests' });
  }
});

app.put('/driver/rides/:id/accept', authRequired, driverRequired, async (req, res) => {
  try {
    const { data: ride, error } = await supabaseAdmin
      .from('rides')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !ride) return res.status(404).json({ error: 'Ride not found' });

    if (ride.driver_id && ride.driver_id !== req.userId) {
      return res.status(409).json({ error: 'Ride already assigned' });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('rides')
      .update({ driver_id: req.userId, status: 'accepted' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) return res.status(400).json({ error: updateError.message });

    return res.json({ ride: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to accept ride' });
  }
});

app.put('/driver/rides/:id/status', authRequired, driverRequired, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const { data: updated, error } = await supabaseAdmin
      .from('rides')
      .update({ status })
      .eq('id', req.params.id)
      .eq('driver_id', req.userId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ride: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update ride status' });
  }
});

app.post('/messages', authRequired, driverRequired, async (req, res) => {
  try {
    const { subject, message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert([{
        user_id: req.userId,
        subject: subject || 'Driver message',
        message,
        created_at: nowIso()
      }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ message: data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

app.listen(PORT, () => {
  console.log('Driver backend running on port ' + PORT);
});
