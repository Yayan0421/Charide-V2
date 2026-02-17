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
  console.error('Missing Supabase configuration. Check server/.env');
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

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    user_type: user.user_type,
    rating: user.rating,
    total_reviews: user.total_reviews,
    profile_picture_url: user.profile_picture_url,
    payment_method: user.payment_method,
    notifications_enabled: Boolean(user.notifications_enabled),
    is_active: Boolean(user.is_active),
    created_at: user.created_at,
    updated_at: user.updated_at
  };
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, full_name, phone, user_type, payment_method, notifications_enabled } = req.body || {};
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
        phone: phone || '',
        user_type: user_type || 'passenger',
        rating: 5.0,
        total_reviews: 0,
        profile_picture_url: null,
        payment_method: payment_method || null,
        notifications_enabled: typeof notifications_enabled === 'boolean' ? notifications_enabled : true,
        is_active: true,
        created_at: createdAt,
        updated_at: null
      }]);

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    const user = await getProfile(created.user.id);
    return res.status(201).json({ user: toPublicUser(user) });
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

    let profile = await getProfile(data.user.id);
    if (!profile) {
      await supabaseAdmin.from('users').insert([{
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name || 'Passenger',
        user_type: 'passenger',
        created_at: nowIso()
      }]);
      profile = await getProfile(data.user.id);
    }

    return res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: toPublicUser(profile)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/auth/me', authRequired, async (req, res) => {
  try {
    const user = await getProfile(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load user' });
  }
});

app.get('/profile', authRequired, async (req, res) => {
  try {
    const user = await getProfile(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.put('/profile', authRequired, async (req, res) => {
  try {
    const { full_name, phone, payment_method, notifications_enabled } = req.body || {};

    const updates = {
      updated_at: nowIso()
    };
    if (full_name) updates.full_name = full_name;
    if (phone) updates.phone = phone;
    if (payment_method) updates.payment_method = payment_method;
    if (typeof notifications_enabled === 'boolean') {
      updates.notifications_enabled = notifications_enabled;
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const user = await getProfile(req.userId);
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.delete('/profile', authRequired, async (req, res) => {
  try {
    await supabaseAdmin.from('rides').delete().eq('passenger_id', req.userId);
    await supabaseAdmin.from('users').delete().eq('id', req.userId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete profile' });
  }
});

app.get('/drivers/nearby', authRequired, async (req, res) => {
  try {
    const { data: drivers, error } = await supabaseAdmin
      .from('drivers')
      .select('id,user_id,current_latitude,current_longitude,vehicle_plate,vehicle_type,is_online')
      .eq('is_online', true);

    if (error) {
      const message = error.message || '';
      const missingTable = error.code === '42P01' || /does not exist|schema cache/i.test(message);

      if (missingTable) {
        const { data: users, error: usersError } = await supabaseAdmin
          .from('users')
          .select('id,full_name,rating,total_reviews,phone,profile_picture_url')
          .eq('user_type', 'driver');

        if (usersError) {
          return res.status(500).json({ error: usersError.message });
        }

        return res.json({
          drivers: (users || []).map(u => ({
            id: u.id,
            driver_id: u.id,
            current_latitude: null,
            current_longitude: null,
            vehicle_plate: 'N/A',
            vehicle_type: 'Motorcycle',
            is_online: true,
            full_name: u.full_name,
            rating: u.rating,
            total_reviews: u.total_reviews,
            phone: u.phone,
            profile_picture_url: u.profile_picture_url
          }))
        });
      }

      return res.status(500).json({ error: error.message });
    }

    const userIds = Array.from(new Set((drivers || []).map(d => d.user_id).filter(Boolean)));
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id,full_name,rating,total_reviews,phone,profile_picture_url')
      .in('id', userIds.length > 0 ? userIds : ['']);

    if (usersError) {
      return res.status(500).json({ error: usersError.message });
    }

    const userMap = new Map((users || []).map(u => [u.id, u]));

    return res.json({
      drivers: (drivers || []).map(d => {
        const user = userMap.get(d.user_id) || {};
        return {
          id: d.id,
          driver_id: d.user_id,
          current_latitude: d.current_latitude,
          current_longitude: d.current_longitude,
          vehicle_plate: d.vehicle_plate,
          vehicle_type: d.vehicle_type,
          is_online: Boolean(d.is_online),
          full_name: user.full_name,
          rating: user.rating,
          total_reviews: user.total_reviews,
          phone: user.phone,
          profile_picture_url: user.profile_picture_url
        };
      })
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load drivers' });
  }
});

app.post('/rides', authRequired, async (req, res) => {
  try {
    const { driver_id, pickup_location, dropoff_location, status, fare, distance, vehicle_type } = req.body || {};
    if (!pickup_location || !dropoff_location) {
      return res.status(400).json({ error: 'Pickup and dropoff are required' });
    }

    const payload = {
      passenger_id: req.userId,
      driver_id: driver_id || null,
      pickup_location,
      dropoff_location,
      status: status || 'requested',
      fare: fare || 0,
      distance: distance || null,
      vehicle_type: vehicle_type || null,
      created_at: nowIso()
    };

    const { data, error } = await supabaseAdmin
      .from('rides')
      .insert([payload])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log('[PASSENGER] Created ride:', data && data.id, 'status:', data && data.status, 'driver_id:', data && data.driver_id);
    return res.status(201).json({ ride: data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create ride' });
  }
});

app.put('/rides/:id/assign', authRequired, async (req, res) => {
  try {
    const { driver_id } = req.body || {};
    if (!driver_id) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('rides')
      .update({ driver_id, status: 'assigned' })
      .eq('id', req.params.id)
      .eq('passenger_id', req.userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ ride: data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign driver' });
  }
});

app.put('/rides/:id/status', authRequired, async (req, res) => {
  try {
    const { status, fare } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const updates = { status };
    if (typeof fare === 'number') updates.fare = fare;

    const { data, error } = await supabaseAdmin
      .from('rides')
      .update(updates)
      .eq('id', req.params.id)
      .eq('passenger_id', req.userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ ride: data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update ride status' });
  }
});

app.get('/rides/history', authRequired, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('rides')
      .select('id,pickup_location,dropoff_location,status,fare,distance,vehicle_type,created_at')
      .eq('passenger_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ rides: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load rides' });
  }
});

app.get('/rides/recent', authRequired, async (req, res) => {
  try {
    const { data: rides, error } = await supabaseAdmin
      .from('rides')
      .select('id,pickup_location,dropoff_location,status,fare,created_at,driver_id')
      .eq('passenger_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const driverIds = Array.from(new Set((rides || []).map(r => r.driver_id).filter(Boolean)));
    let driverMap = new Map();

    if (driverIds.length > 0) {
      const { data: drivers, error: driversError } = await supabaseAdmin
        .from('users')
        .select('id,full_name,profile_picture_url')
        .in('id', driverIds);

      if (!driversError && drivers) {
        driverMap = new Map(drivers.map(d => [d.id, d]));
      }
    }

    const enriched = (rides || []).map(r => {
      const driver = r.driver_id ? driverMap.get(r.driver_id) : null;
      return {
        ...r,
        driver_name: driver ? driver.full_name : null,
        driver_avatar: driver ? driver.profile_picture_url : null
      };
    });

    return res.json({ rides: enriched });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load recent rides' });
  }
});

app.get('/rides/stats', authRequired, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('rides')
      .select('fare')
      .eq('passenger_id', req.userId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const rides = data || [];
    const totalRides = rides.length;
    const totalSpent = rides.reduce((sum, r) => sum + (parseFloat(r.fare) || 0), 0);
    const lastFare = rides.length > 0 ? rides[rides.length - 1].fare : 0;

    return res.json({ totalRides, totalSpent, lastFare });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load stats' });
  }
});

app.listen(PORT, () => {
  console.log('Charide backend running on port ' + PORT);
});
