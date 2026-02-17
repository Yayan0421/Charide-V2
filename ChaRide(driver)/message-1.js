const API_BASE_URL = window.API_BASE_URL || window.location.origin;
const AUTH_TOKEN_KEY = 'charide_token';
const REFRESH_TOKEN_KEY = 'charide_refresh_token';
const USER_KEY = 'charide_user';

const { createClient } = supabase;
const supabaseUrl = 'https://cvfjpigbkbzjvvfzvjzr.supabase.co';
const supabaseKey = 'sb_publishable_Wt2fAK6-5mkAX4SNyobCYQ_YPROnFM4';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

let activeRide = null;
let activeSubscription = null;
let currentUser = null;
let allRides = [];

const appShell = document.getElementById('appShell');
const sidebarCollapse = document.getElementById('sidebarCollapse');
const conversationList = document.getElementById('conversationList');
const chatTitle = document.getElementById('chatTitle');
const chatSubtitle = document.getElementById('chatSubtitle');
const chatAvatar = document.getElementById('chatAvatar');
const messagesEl = document.getElementById('messages');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');

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
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = null;
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

function setChatHeader(title, subtitle) {
  if (chatTitle) chatTitle.textContent = title || '';
  if (chatSubtitle) chatSubtitle.textContent = subtitle || '';
}

function setChatAvatar(name) {
  if (!chatAvatar) return;
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '💭';
  chatAvatar.textContent = initials || '💭';
}

function renderEmptyChat(message) {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-chat';
  empty.textContent = message || 'No messages yet.';
  messagesEl.appendChild(empty);
}

function appendMessage(msg) {
  if (!messagesEl || !currentUser) return;

  const wrapper = document.createElement('div');
  const isSent = msg.sender_id === currentUser.id;
  wrapper.className = 'message ' + (isSent ? 'sent' : 'received');

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = msg.message || '';

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : '';

  wrapper.appendChild(bubble);
  wrapper.appendChild(time);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderConversations(rides) {
  if (!conversationList) return;
  conversationList.innerHTML = '';

  if (!rides || rides.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="icon">💬</div><div>No conversations yet</div>';
    conversationList.appendChild(empty);
    return;
  }

  rides.forEach(ride => {
    const item = document.createElement('div');
    item.className = 'conversation-item' + (activeRide && activeRide.id === ride.id ? ' active' : '');
    const title = ride.passenger_name || 'Passenger';
    const preview = `${ride.pickup_location} to ${ride.dropoff_location}`;
    const time = ride.created_at ? new Date(ride.created_at).toLocaleString() : '';

    item.innerHTML = `
      <div class="conversation-title">${title}</div>
      <div class="conversation-preview">${preview}</div>
      <div class="conversation-time">${time}</div>
    `;

    item.addEventListener('click', () => selectRide(ride));
    conversationList.appendChild(item);
  });
}

async function loadMessagesForRide(rideId) {
  const { data, error } = await supabaseClient
    .from('messages')
    .select('id,ride_id,sender_id,recipient_id,message,created_at')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading messages:', error.message || error);
    renderEmptyChat('Unable to load messages.');
    return;
  }

  if (messagesEl) messagesEl.innerHTML = '';

  const rows = data || [];
  if (rows.length === 0) {
    renderEmptyChat('No messages yet.');
    return;
  }

  rows.forEach(row => appendMessage(row));
}

function subscribeToMessages(rideId) {
  if (activeSubscription) {
    supabaseClient.removeChannel(activeSubscription);
  }

  activeSubscription = supabaseClient
    .channel('ride_messages_' + rideId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `ride_id=eq.${rideId}`
    }, (payload) => {
      appendMessage(payload.new);
    })
    .subscribe();
}

async function selectRide(ride) {
  activeRide = ride;
  renderConversations(allRides);
  const passengerName = ride.passenger_name || 'Passenger';
  setChatHeader(passengerName, 'Ride: ' + ride.pickup_location + ' to ' + ride.dropoff_location);
  setChatAvatar(passengerName);

  await loadMessagesForRide(ride.id);
  subscribeToMessages(ride.id);

  if (sendBtn && messageInput) {
    sendBtn.disabled = false;
    messageInput.disabled = false;
  }
}

async function initChat() {
  await bootstrapSupabaseSession();

  let user = null;
  try {
    const data = await apiRequest('/auth/me');
    user = data && data.user ? data.user : null;
  } catch (err) {
    user = null;
  }

  if (!user || user.user_type !== 'driver') {
    alert('Please log in first');
    clearAuth();
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  const userEmail = user.email || 'User';
  const userName = user.full_name || userEmail.split('@')[0];
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sidebarName = document.getElementById('sidebarName');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarName) sidebarName.textContent = userName;
  if (sidebarAvatar) sidebarAvatar.textContent = userInitials || 'U';

  try {
    const data = await apiRequest('/driver/rides');
    const rides = data.rides || [];
    allRides = rides;

    activeRide = rides.find(r => r.driver_id && !['completed', 'cancelled'].includes((r.status || '').toLowerCase()))
      || rides[0]
      || null;

    renderConversations(allRides);

    if (!activeRide) {
      setChatHeader('No active ride', 'Accept a ride to start chatting');
      setChatAvatar('');
      renderEmptyChat('No active ride to chat with yet.');
      if (sendBtn) sendBtn.disabled = true;
      if (messageInput) messageInput.disabled = true;
      return;
    }

    const passengerName = activeRide.passenger_name || 'Passenger';
    setChatHeader(passengerName, 'Ride: ' + activeRide.pickup_location + ' to ' + activeRide.dropoff_location);
    setChatAvatar(passengerName);

    await loadMessagesForRide(activeRide.id);
    subscribeToMessages(activeRide.id);

    if (sendBtn && messageInput) {
      sendBtn.disabled = false;
      messageInput.disabled = false;
    }
  } catch (err) {
    console.error('Error initializing chat:', err.message || err);
    setChatHeader('Chat unavailable', 'Unable to load ride data');
    renderEmptyChat('Unable to load chat right now.');
    if (sendBtn) sendBtn.disabled = true;
    if (messageInput) messageInput.disabled = true;
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (!activeRide || !messageInput) return;
      const text = messageInput.value.trim();
      if (!text) return;

      sendBtn.disabled = true;
      try {
        const { error } = await supabaseClient
          .from('messages')
          .insert([{
            ride_id: activeRide.id,
            sender_id: currentUser.id,
            recipient_id: activeRide.passenger_id,
            message: text
          }]);

        if (error) throw error;
        messageInput.value = '';
      } catch (err) {
        console.error('Send failed:', err.message || err);
        alert('Could not send message. Please try again.');
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (sendBtn && !sendBtn.disabled) sendBtn.click();
      }
    });
  }
}

async function logout() {
  clearAuth();
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

window.logout = logout;
window.addEventListener('DOMContentLoaded', initChat);
