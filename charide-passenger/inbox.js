let activeRide = null;
let activeSubscription = null;

function setChatHeader(title, subtitle) {
  const titleEl = document.getElementById('chatTitle');
  const subtitleEl = document.getElementById('chatSubtitle');
  if (titleEl) titleEl.textContent = title || '';
  if (subtitleEl) subtitleEl.textContent = subtitle || '';
}

function renderEmptyChat(message) {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-chat';
  empty.textContent = message || 'No messages yet.';
  messagesEl.appendChild(empty);
}

function appendMessage(msg, currentUserId) {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;

  const wrapper = document.createElement('div');
  const isSent = msg.sender_id === currentUserId;
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

function renderConversation(ride) {
  const list = document.getElementById('conversationsBody');
  if (!list) return;
  list.innerHTML = '';

  const item = document.createElement('div');
  item.className = 'conversation-item active';
  const driverLabel = ride.driver_name || 'Driver';
  const preview = `${ride.pickup_location} to ${ride.dropoff_location}`;

  item.innerHTML = `
    <div class="conversation-driver">${driverLabel}</div>
    <div class="conversation-preview">${preview}</div>
    <div class="conversation-time">${ride.created_at ? new Date(ride.created_at).toLocaleString() : ''}</div>
  `;

  list.appendChild(item);
}

async function loadMessagesForRide(rideId, currentUserId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id,ride_id,sender_id,recipient_id,message,created_at')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading messages:', error.message || error);
    renderEmptyChat('Unable to load messages.');
    return;
  }

  const messagesEl = document.getElementById('messages');
  if (messagesEl) messagesEl.innerHTML = '';

  const rows = data || [];
  if (rows.length === 0) {
    renderEmptyChat('No messages yet.');
    return;
  }

  rows.forEach(row => appendMessage(row, currentUserId));
}

function subscribeToMessages(rideId, currentUserId) {
  if (activeSubscription) {
    supabase.removeChannel(activeSubscription);
  }

  activeSubscription = supabase
    .channel('ride_messages_' + rideId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `ride_id=eq.${rideId}`
    }, (payload) => {
      appendMessage(payload.new, currentUserId);
    })
    .subscribe();
}

async function initChat() {
  if (window.ensureSupabaseSession) {
    await window.ensureSupabaseSession();
  }

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const sendBtn = document.getElementById('sendBtn');
  const input = document.getElementById('messageInput');

  try {
    const data = await apiRequest('/rides/recent');
    const rides = data.rides || [];

    activeRide = rides.find(r => r.driver_id && !['completed', 'cancelled'].includes((r.status || '').toLowerCase()))
      || rides.find(r => r.driver_id)
      || null;

    if (!activeRide) {
      setChatHeader('No active ride', 'Book a ride to start chatting');
      renderEmptyChat('No active ride to chat with yet.');
      if (sendBtn) sendBtn.disabled = true;
      if (input) input.disabled = true;
      return;
    }

    setChatHeader(activeRide.driver_name || 'Driver', 'Ride: ' + activeRide.pickup_location + ' to ' + activeRide.dropoff_location);
    renderConversation(activeRide);

    await loadMessagesForRide(activeRide.id, user.id);
    subscribeToMessages(activeRide.id, user.id);

    if (sendBtn && input) {
      sendBtn.disabled = false;
      input.disabled = false;
    }
  } catch (err) {
    console.error('Error initializing chat:', err.message || err);
    setChatHeader('Chat unavailable', 'Unable to load ride data');
    renderEmptyChat('Unable to load chat right now.');
    if (sendBtn) sendBtn.disabled = true;
    if (input) input.disabled = true;
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (!activeRide || !input) return;
      const text = input.value.trim();
      if (!text) return;

      sendBtn.disabled = true;
      try {
        const { error } = await supabase
          .from('messages')
          .insert([{
            ride_id: activeRide.id,
            sender_id: user.id,
            recipient_id: activeRide.driver_id,
            message: text
          }]);

        if (error) throw error;
        input.value = '';
      } catch (err) {
        console.error('Send failed:', err.message || err);
        alert('Could not send message. Please try again.');
      } finally {
        sendBtn.disabled = false;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initChat);
