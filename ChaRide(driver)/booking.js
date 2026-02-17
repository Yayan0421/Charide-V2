const API_BASE_URL = window.API_BASE_URL || window.location.origin;
const AUTH_TOKEN_KEY = 'charide_token';
const REFRESH_TOKEN_KEY = 'charide_refresh_token';
const USER_KEY = 'charide_user';
const { createClient } = supabase;
const supabaseUrl = 'https://cvfjpigbkbzjvvfzvjzr.supabase.co';
const supabaseKey = 'sb_publishable_Wt2fAK6-5mkAX4SNyobCYQ_YPROnFM4';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

let realtimeChannels = [];
let currentDriverId = null;

const appShell = document.getElementById('appShell');
const sidebarCollapse = document.getElementById('sidebarCollapse');
const pendingList = document.getElementById('pendingList');
const activeList = document.getElementById('activeList');
const pendingEmpty = document.getElementById('pendingEmpty');
const activeEmpty = document.getElementById('activeEmpty');
const pendingCount = document.getElementById('pendingCount');
const activeCount = document.getElementById('activeCount');
const pendingPanel = document.getElementById('pendingPanel');
const activePanel = document.getElementById('activePanel');

if (sidebarCollapse) {
  sidebarCollapse.addEventListener('click', () => {
    appShell.classList.toggle('is-collapsed');
  });
}

async function apiRequest(path, options = {}) {
  const url = API_BASE_URL.replace(/\/+$/, '') + path;
  const headers = Object.assign({
    'Content-Type': 'application/json'
  }, options.headers || {});

  const token = await getAccessToken();
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (text) {
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error('apiRequest: failed to parse JSON from', url, 'content-type:', contentType, 'raw:', text);
        throw new Error('Invalid JSON response from server (see console)');
      }
    } else {
      // non-JSON response: log it for debugging and keep raw text
      console.warn('apiRequest: non-JSON response from', url, 'content-type:', contentType, 'raw:', text);
      data = text;
    }
  }

  // Some endpoints (due to misconfiguration) might return a raw array instead of { rides: [...] }
  // Normalize common cases so callers expecting an object don't crash.
  if (Array.isArray(data)) {
    // If this was a driver requests call, wrap as { rides: [...] }
    if (path && path.toLowerCase().includes('/driver/requests')) {
      data = { rides: data };
    } else if (path && path.toLowerCase().includes('/driver/rides')) {
      data = { rides: data };
    }
  }

  if (!response.ok) {
    const message = (data && (data.error || data.message)) || 'Request failed (' + response.status + ')';
    throw new Error(message);
  }

  return data;
}

async function getAccessToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function bootstrapSupabaseSession() {
  const accessToken = await getAccessToken();
  const refreshToken = getRefreshToken();
  if (!accessToken || !refreshToken) return false;

  const { error } = await supabaseClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (error) {
    console.warn('Supabase session bootstrap failed:', error.message || error);
    return false;
  }

  return true;
}

function renderRideCard(ride, type) {
  const card = document.createElement('div');
  card.className = 'ride-card';
  card.style.marginBottom = '14px';
  card.style.padding = '14px';
  card.style.border = '1px solid #e5e7eb';
  card.style.borderRadius = '10px';
  card.style.background = '#ffffff';

  const passenger = ride.passenger_name || 'Passenger';
  const route = `${ride.pickup_location} → ${ride.dropoff_location}`;
  const status = (ride.status || '').toUpperCase();

  card.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">${passenger}</div>
    <div style="font-size:13px; color:#6b7280; margin-bottom:6px;">${route}</div>
    <div style="font-size:12px; color:#9ca3af;">Status: ${status}</div>
    <div style="margin-top:10px; display:flex; gap:8px;"></div>
  `;

  const actions = card.querySelector('div[style*="display:flex"]');

  if (type === 'pending') {
    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Accept';
    acceptBtn.style.padding = '8px 12px';
    acceptBtn.style.border = 'none';
    acceptBtn.style.borderRadius = '8px';
    acceptBtn.style.background = '#0aa812';
    acceptBtn.style.color = '#fff';
    acceptBtn.style.cursor = 'pointer';
    acceptBtn.addEventListener('click', () => acceptRide(ride.id));
    actions.appendChild(acceptBtn);
  } else {
    const completeBtn = document.createElement('button');
    completeBtn.textContent = 'Complete';
    completeBtn.style.padding = '8px 12px';
    completeBtn.style.border = 'none';
    completeBtn.style.borderRadius = '8px';
    completeBtn.style.background = '#0b74ff';
    completeBtn.style.color = '#fff';
    completeBtn.style.cursor = 'pointer';
    completeBtn.addEventListener('click', () => completeRide(ride.id));
    actions.appendChild(completeBtn);

    const viewBtn = document.createElement('button');
    viewBtn.textContent = 'View';
    viewBtn.style.padding = '8px 12px';
    viewBtn.style.border = '1px solid #e5e7eb';
    viewBtn.style.borderRadius = '8px';
    viewBtn.style.background = '#f9fafb';
    viewBtn.style.cursor = 'pointer';
    viewBtn.addEventListener('click', () => {
      window.location.href = 'message-1.html';
    });
    actions.appendChild(viewBtn);
  }

  return card;


async function completeRide(rideId) {
  try {
    await apiRequest(`/driver/rides/${rideId}/status`, { method: 'PUT', body: { status: 'completed' } });
    await Swal.fire({ icon: 'success', title: 'Ride completed', text: 'Ride moved to history.' });
    await loadActive();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Complete failed', text: err.message || 'Unable to complete ride.' });
  }
}
  return card;
}

async function loadRequests() {
  const data = await apiRequest('/driver/requests');
  console.log('[DRIVER UI] /driver/requests returned:', data);
  const rides = data.rides || [];
  pendingCount.textContent = String(rides.length);
  pendingList.innerHTML = '';

  if (rides.length === 0) {
    pendingEmpty.style.display = 'flex';
    return;
  }

  pendingEmpty.style.display = 'none';
  rides.forEach(ride => pendingList.appendChild(renderRideCard(ride, 'pending')));
}

async function loadActive() {
  const data = await apiRequest('/driver/rides');
  const rides = (data.rides || []).filter(r => !['completed', 'cancelled'].includes((r.status || '').toLowerCase()));
  activeCount.textContent = String(rides.length);
  activeList.innerHTML = '';

  if (rides.length === 0) {
    activeEmpty.style.display = 'flex';
    return;
  }

  activeEmpty.style.display = 'none';
  rides.forEach(ride => activeList.appendChild(renderRideCard(ride, 'active')));
}

async function acceptRide(rideId) {
  try {
    await apiRequest(`/driver/rides/${rideId}/accept`, { method: 'PUT' });
    await Swal.fire({ icon: 'success', title: 'Ride accepted', text: 'You are now assigned to this ride.' });
    await loadRequests();
    await loadActive();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Accept failed', text: err.message || 'Unable to accept ride.' });
  }
}

function wireTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      if (target === 'pending') {
        pendingPanel.style.display = 'block';
        activePanel.style.display = 'none';
      } else {
        pendingPanel.style.display = 'none';
        activePanel.style.display = 'block';
      }
    });
  });
}

async function checkAuth() {
  try {
    const data = await apiRequest('/auth/me');
    const user = data && data.user ? data.user : null;
    if (!user || user.user_type !== 'driver') {
      alert('Please log in first');
      clearAuth();
      window.location.href = 'login.html';
      return false;
    }

    currentDriverId = user.id;

    localStorage.setItem(USER_KEY, JSON.stringify(user));

    const userEmail = user.email || 'User';
    const userName = user.full_name || userEmail.split('@')[0];
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('sidebarName').textContent = userName;
  document.getElementById('sidebarAvatar').textContent = userInitials || 'U';
    return true;
  } catch (err) {
    clearAuth();
    alert('Please log in first');
    window.location.href = 'login.html';
    return false;
  }
}

async function startRealtime() {
  await bootstrapSupabaseSession();
  if (!supabaseClient) return;

  realtimeChannels.forEach(channel => supabaseClient.removeChannel(channel));
  realtimeChannels = [];

  const assignedChannel = supabaseClient
    .channel('driver_rides_assigned_' + currentDriverId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rides',
      filter: `driver_id=eq.${currentDriverId}`
    }, () => {
      loadRequests();
      loadActive();
    })
    .subscribe();

  const requestsChannel = supabaseClient
    .channel('driver_rides_requests')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rides',
      filter: 'driver_id=is.null'
    }, (payload) => {
      const ride = payload.new;
      if (!ride) return;
      const status = (ride.status || '').toLowerCase();
      if (status === 'requested' || status === 'pending') {
        loadRequests();
      }
    })
    .subscribe();

  realtimeChannels.push(assignedChannel, requestsChannel);
}

async function logout() {
  clearAuth();
  window.location.href = 'login.html';
}

window.logout = logout;

window.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkAuth();
  if (!ok) return;
  // mark driver online while on bookings page (helps server return requests)
  try {
    let lat = null, lng = null;
    if (navigator.geolocation) {
      const pos = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(p => resolve(p), () => resolve(null), { enableHighAccuracy: true, maximumAge: 5000 });
      });
      if (pos) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    }
    await apiRequest('/driver/status', { method: 'PUT', body: { is_online: true, lat, lng } });
  } catch (err) {
    console.warn('Could not set driver online automatically:', err.message || err);
  }
  wireTabs();
  await loadRequests();
  await loadActive();
  await startRealtime();
  setInterval(async () => {
    await loadRequests();
    await loadActive();
  }, 15000);
});
