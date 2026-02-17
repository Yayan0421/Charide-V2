const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { rideStatus } = require('./constants/rideStatus');

dotenv.config();

const app = express();
app.use(express.json());

const allowedOrigin = process.env.CORS_ORIGIN || '*';
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigin === '*' || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    if (allowedOrigins.length > 0) {
      return allowedOrigins.includes(origin)
        ? callback(null, true)
        : callback(new Error('Not allowed by CORS'));
    }

    if (allowedOrigin === origin) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
}));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 7000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration. Check server/.env');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const passengerDir = path.join(__dirname, '..', 'charide-passenger');
const driverDir = path.join(__dirname, '..', 'charide-driver');
const adminDir = path.join(__dirname, '..', 'admin');

app.use('/passenger', express.static(passengerDir));
app.use('/driver', express.static(driverDir));
app.use('/admin', express.static(adminDir));

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

function roleRequired(role) {
  return async (req, res, next) => {
    const profile = await getProfile(req.userId);
    if (!profile || profile.user_type !== role) {
      return res.status(403).json({ error: role.charAt(0).toUpperCase() + role.slice(1) + ' access required' });
    }
    req.userProfile = profile;
    return next();
  };
}

const passengerRequired = roleRequired('passenger');
const driverRequired = roleRequired('driver');
const adminRequired = roleRequired('admin');

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    apps: {
      passenger: '/passenger/index.html',
      driver: '/driver/index.html',
      admin: '/admin/login.html'
    }
  });
});

function normalizeRole(role) {
  const value = (role || '').toString().trim().toLowerCase();
  if (value === 'driver' || value === 'admin') return value;
  return 'passenger';
}

async function handleSignup(req, res, roleOverride) {
  try {
    const body = req.body || {};
    const role = normalizeRole(roleOverride || body.role);
    const { email, password, full_name, phone, payment_method, notifications_enabled, vehicle_type, vehicle_plate } = body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (role === 'driver' && (!vehicle_type || !vehicle_plate)) {
      return res.status(400).json({ error: 'Vehicle type and plate are required' });
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
    const userPayload = {
      id: created.user.id,
      email,
      full_name,
      phone: phone || '',
      user_type: role,
      rating: 5.0,
      total_reviews: 0,
      profile_picture_url: null,
      payment_method: payment_method || null,
      notifications_enabled: typeof notifications_enabled === 'boolean' ? notifications_enabled : true,
      is_active: true,
      created_at: createdAt,
      updated_at: null
    };

    if (role === 'admin') {
      userPayload.status = 'approved';
    }

    if (role === 'driver') {
      userPayload.status = 'pending';
    }

    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert([userPayload]);

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    if (role === 'driver') {
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
    }

    const user = await getProfile(created.user.id);
    return res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed' });
  }
}

async function handleLogin(req, res, roleOverride) {
  try {
    const body = req.body || {};
    const { email, password } = body;
    const role = normalizeRole(roleOverride || body.role);

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
    if (!profile && role === 'passenger') {
      await supabaseAdmin.from('users').insert([{
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name || 'Passenger',
        user_type: 'passenger',
        created_at: nowIso()
      }]);
      profile = await getProfile(data.user.id);
    }

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    if (role && profile.user_type !== role) {
      return res.status(403).json({ error: role.charAt(0).toUpperCase() + role.slice(1) + ' access required' });
    }

    return res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: toPublicUser(profile)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed' });
  }
}

app.post('/auth/signup', async (req, res) => {
  return handleSignup(req, res);
});

app.post('/auth/login', async (req, res) => {
  return handleLogin(req, res);
});

app.get('/auth/me', authRequired, async (req, res) => {
  const user = await getProfile(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: toPublicUser(user) });
});

// ---- Passenger profile ----
app.get('/profile', authRequired, passengerRequired, async (req, res) => {
  return res.json({ user: toPublicUser(req.userProfile) });
});

app.put('/profile', authRequired, passengerRequired, async (req, res) => {
  try {
    const { full_name, phone, payment_method, notifications_enabled, profile_picture_url } = req.body || {};

    const updates = {
      updated_at: nowIso()
    };
    if (full_name) updates.full_name = full_name;
    if (phone) updates.phone = phone;
    if (payment_method) updates.payment_method = payment_method;
    if (profile_picture_url) updates.profile_picture_url = profile_picture_url;
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

app.delete('/profile', authRequired, passengerRequired, async (req, res) => {
  try {
    await supabaseAdmin.from('rides').delete().eq('passenger_id', req.userId);
    await supabaseAdmin.from('users').delete().eq('id', req.userId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// ---- Passenger rides ----
app.get('/drivers/nearby', authRequired, passengerRequired, async (req, res) => {
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

app.post('/rides', authRequired, passengerRequired, async (req, res) => {
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
      status: status || rideStatus.REQUESTED,
      fare: fare || 0,
      distance: distance || null,
      vehicle_type: vehicle_type || null,
      created_at: nowIso()
    };

    console.log('[SERVER] Creating ride for passenger', req.userId, 'payload=', payload);

    const { data, error } = await supabaseAdmin
      .from('rides')
      .insert([payload])
      .select()
      .single();

    console.log('[SERVER] Ride insert result for passenger', req.userId, 'data=', data, 'error=', error && error.message);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ ride: data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create ride' });
  }
});

app.put('/rides/:id/assign', authRequired, passengerRequired, async (req, res) => {
  try {
    const { driver_id } = req.body || {};
    if (!driver_id) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('rides')
      .update({ driver_id, status: rideStatus.ASSIGNED })
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

app.put('/rides/:id/status', authRequired, passengerRequired, async (req, res) => {
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

app.get('/rides/history', authRequired, passengerRequired, async (req, res) => {
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

app.get('/rides/recent', authRequired, passengerRequired, async (req, res) => {
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

app.get('/rides/stats', authRequired, passengerRequired, async (req, res) => {
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

// ---- Driver auth ----
app.post('/driver/auth/signup', async (req, res) => {
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

app.post('/driver/auth/login', async (req, res) => {
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

app.get('/driver/auth/me', authRequired, driverRequired, async (req, res) => {
  return res.json({ user: req.userProfile });
});

app.get('/driver/profile', authRequired, driverRequired, async (req, res) => {
  return res.json({ user: req.userProfile });
});

app.put('/driver/profile', authRequired, driverRequired, async (req, res) => {
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
      .in('status', [rideStatus.REQUESTED, rideStatus.PENDING])
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    console.log('[SERVER] /driver/requests fetched', (rides || []).length, 'rides for driver request by user', req.userId);

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
      .update({ driver_id: req.userId, status: rideStatus.ACCEPTED })
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

app.post('/driver/messages', authRequired, driverRequired, async (req, res) => {
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

// ---- Admin auth ----
app.post('/admin/auth/signup', async (req, res) => {
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

app.post('/admin/auth/login', async (req, res) => {
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

app.get('/admin/auth/me', authRequired, adminRequired, async (req, res) => {
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

app.listen(PORT, () => {
  console.log('Unified Charide backend running on port ' + PORT);
});
