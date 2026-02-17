// Section Navigation
function showSection(sectionId, event) {
  // Hide all sections
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => {
    section.classList.remove('active');
  });

  // Show selected section
  const selectedSection = document.getElementById(sectionId);
  if (selectedSection) {
    selectedSection.classList.add('active');
  }

  // Update active nav item
  const navItems = document.querySelectorAll('.sidebar-item');
  navItems.forEach(item => {
    item.classList.remove('active');
  });

  // Find and mark the clicked item as active
  if (event && event.target) {
    event.target.closest('.sidebar-item')?.classList.add('active');
  }

  // Reset filter when navigating to users section
  if (sectionId === 'users') {
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
      statusFilter.value = 'pending';
      filterPendingUsers();
    }
  }
}

// View user activity function (shows last 30 days + chart)
function viewUserActivity(userName, userId) {
  const modal = document.getElementById('activityModal');
  const userNameSpan = document.getElementById('activityUserName');
  const totalRidesEl = document.getElementById('activityTotalRides');
  const totalSpentEl = document.getElementById('activityTotalSpent');
  const lastRideEl = document.getElementById('activityLastRide');
  const ratingEl = document.getElementById('activityRating');
  const monthlyChart = document.getElementById('monthlyChart');
  const activityLog = document.getElementById('activityLog');

  // Generate synthetic last-30-days data (replace with real API call in production)
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    // simulate: 60% chance of activity, up to 5 rides a day
    const rides = Math.random() < 0.6 ? Math.floor(Math.random() * 5) + 1 : 0;
    const amount = rides > 0 ? rides * (50 + Math.floor(Math.random() * 300)) : 0;
    days.push({ date: iso, rides, amount });
  }

  // Aggregate totals
  const totalRides = days.reduce((s, d) => s + d.rides, 0);
  const totalSpent = days.reduce((s, d) => s + d.amount, 0);
  const lastRideObj = [...days].reverse().find(d => d.rides > 0) || null;

  // Populate header stats
  userNameSpan.textContent = userName;
  totalRidesEl.textContent = totalRides;
  totalSpentEl.textContent = '₱' + totalSpent.toLocaleString();
  lastRideEl.textContent = lastRideObj ? lastRideObj.date : '—';
  ratingEl.textContent = (Math.random() * 1 + 4).toFixed(1) + '/5.0';

  // Build monthly chart
  monthlyChart.innerHTML = '';
  const maxRides = Math.max(1, ...days.map(d => d.rides));
  days.forEach(d => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const heightPercent = d.rides === 0 ? 6 : Math.round((d.rides / maxRides) * 100);
    bar.style.height = heightPercent + '%';
    bar.setAttribute('data-count', d.rides);
    bar.title = `${d.date}: ${d.rides} ride(s)`;

    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = `${d.rides} • ${d.date}`;
    bar.appendChild(label);

    monthlyChart.appendChild(bar);
  });

  // Populate activity log (show days with activity first)
  activityLog.innerHTML = '';
  // show most recent first
  const reversed = [...days].reverse();
  reversed.forEach(d => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = d.date;
    const tdAction = document.createElement('td');
    tdAction.textContent = d.rides > 0 ? `Booked ${d.rides} ride(s)` : 'No activity';
    const tdDetails = document.createElement('td');
    tdDetails.textContent = d.rides > 0 ? `Total ₱${d.amount.toLocaleString()}` : '—';
    const tdStatus = document.createElement('td');
    const span = document.createElement('span');
    if (d.rides > 0) {
      span.className = 'badge completed';
      span.textContent = 'Completed';
    } else {
      span.className = 'badge inactive';
      span.textContent = '—';
    }
    tdStatus.appendChild(span);

    tr.appendChild(tdDate);
    tr.appendChild(tdAction);
    tr.appendChild(tdDetails);
    tr.appendChild(tdStatus);
    activityLog.appendChild(tr);
  });

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close activity modal
function closeActivityModal() {
  const modal = document.getElementById('activityModal');
  modal.classList.remove('active');
  document.body.style.overflow = 'auto';
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
  const modal = document.getElementById('activityModal');
  if (event.target === modal) {
    closeActivityModal();
  }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    closeActivityModal();
  }
});

// Approve user function
async function approveUser(button, userId) {
  const row = button.closest('tr');
  const nameCell = row.querySelector('td:nth-child(2)');
  const userName = nameCell.textContent;

  // Change row classes
  row.classList.remove('pending-user');
  row.classList.add('approved-user');
  row.setAttribute('data-status', 'approved');

  // Update status badge
  const statusBadge = row.querySelector('.badge');
  statusBadge.classList.remove('pending');
  statusBadge.classList.add('approved');
  statusBadge.textContent = 'Approved';

  // Update action buttons: leave Activity button
  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `<button class="action-btn" onclick="viewUserActivity('${userName}', '${userId}')">Activity</button>`;

  showNotification(`User ${userName} approved successfully!`, 'success');

  // Hide row if filter is set to pending
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter && statusFilter.value === 'pending') {
    row.style.display = 'none';
  }

  checkEmptyTable();

  try {
    await apiRequest(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: { status: 'approved' }
    });
    await loadStats();
  } catch (err) {
    console.error('approveUser error', err);
  }
}

// Reject user function
async function rejectUser(button, userId) {
  const row = button.closest('tr');
  const nameCell = row.querySelector('td:nth-child(2)');
  const userName = nameCell.textContent;

  // Change row classes
  row.classList.remove('pending-user');
  row.classList.add('rejected-user');
  row.setAttribute('data-status', 'rejected');

  // Update status badge
  const statusBadge = row.querySelector('.badge');
  statusBadge.classList.remove('pending');
  statusBadge.classList.add('rejected');
  statusBadge.textContent = 'Rejected';

  // Update action buttons: leave Activity button
  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `<button class="action-btn" onclick="viewUserActivity('${userName}', '${userId}')">Activity</button>`;

  showNotification(`User ${userName} rejected!`, 'success');

  // Hide row if filter is set to pending
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter && statusFilter.value === 'pending') {
    row.style.display = 'none';
  }

  checkEmptyTable();

  try {
    await apiRequest(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: { status: 'rejected' }
    });
    await loadStats();
  } catch (err) {
    console.error('rejectUser error', err);
  }
}

// Approve driver function
async function approveDriver(button, driverId) {
  const row = button.closest('tr');
  const nameCell = row.querySelector('td:nth-child(2)');
  const driverName = nameCell.textContent;

  row.classList.remove('pending-driver');
  row.classList.add('approved-driver');
  row.setAttribute('data-status', 'approved');

  const statusBadge = row.querySelector('.badge');
  statusBadge.classList.remove('pending');
  statusBadge.classList.add('approved');
  statusBadge.textContent = 'Approved';

  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = '';

  const verifyBtn = document.createElement('button');
  verifyBtn.className = 'action-btn';
  verifyBtn.textContent = 'Verify';
  verifyBtn.addEventListener('click', () => verifyDriver(verifyBtn, driverId));

  const activityBtn = document.createElement('button');
  activityBtn.className = 'action-btn';
  activityBtn.textContent = 'Activity';
  activityBtn.addEventListener('click', () => viewDriverActivity(driverName, driverId));

  actionsCell.appendChild(verifyBtn);
  actionsCell.appendChild(activityBtn);

  showNotification(`Driver ${driverName} approved.`, 'success');

  const filter = document.getElementById('driverStatusFilter');
  if (filter && filter.value === 'pending') row.style.display = 'none';

  try {
    await apiRequest(`/admin/drivers/${driverId}/status`, {
      method: 'PUT',
      body: { status: 'approved' }
    });
    await loadStats();
  } catch (err) {
    console.error('approveDriver error', err);
  }
}

// Verify driver function
async function verifyDriver(button, driverId) {
  const row = button.closest('tr');
  const nameCell = row.querySelector('td:nth-child(2)');
  const driverName = nameCell.textContent;

  if (row.getAttribute('data-status') !== 'approved') {
    showNotification('Driver must be approved before verification.', 'error');
    return;
  }

  row.classList.remove('pending-driver');
  row.classList.add('verified-driver');
  row.setAttribute('data-status', 'verified');

  const statusBadge = row.querySelector('.badge');
  statusBadge.classList.remove('pending', 'approved', 'rejected');
  statusBadge.classList.add('verified');
  statusBadge.textContent = 'Verified';

  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `<button class="action-btn" onclick="viewDriverActivity('${driverName}', '${driverId}')">Activity</button>`;

  showNotification(`Driver ${driverName} verified.`, 'success');

  const filter = document.getElementById('driverStatusFilter');
  if (filter && filter.value === 'pending') row.style.display = 'none';

  try {
    await apiRequest(`/admin/drivers/${driverId}/status`, {
      method: 'PUT',
      body: { status: 'verified' }
    });
    await loadStats();
  } catch (err) {
    console.error('verifyDriver error', err);
  }
}

// Reject driver function
async function rejectDriver(button, driverId) {
  const row = button.closest('tr');
  const nameCell = row.querySelector('td:nth-child(2)');
  const driverName = nameCell.textContent;

  row.classList.remove('pending-driver');
  row.classList.add('rejected-driver');
  row.setAttribute('data-status', 'rejected');

  const statusBadge = row.querySelector('.badge');
  statusBadge.classList.remove('pending');
  statusBadge.classList.add('rejected');
  statusBadge.textContent = 'Rejected';

  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `<button class="action-btn" onclick="viewDriverActivity('${driverName}', '${driverId}')">Activity</button>`;

  showNotification(`Driver ${driverName} rejected.`, 'success');

  const filter = document.getElementById('driverStatusFilter');
  if (filter && filter.value === 'pending') row.style.display = 'none';

  try {
    await apiRequest(`/admin/drivers/${driverId}/status`, {
      method: 'PUT',
      body: { status: 'rejected' }
    });
    await loadStats();
  } catch (err) {
    console.error('rejectDriver error', err);
  }
}

// Filter pending drivers
function filterPendingDrivers() {
  const statusFilter = document.getElementById('driverStatusFilter');
  const filterValue = statusFilter.value;
  const rows = document.querySelectorAll('#driversTable tbody tr');

  rows.forEach(row => {
    const status = row.getAttribute('data-status');
    if (filterValue === 'all') {
      row.style.display = '';
    } else if (filterValue === status) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// View driver activity — reuse user activity generator
function viewDriverActivity(name, id) {
  // For now reuse the same modal generator
  viewUserActivity(name, id);
}

// Filter pending users
function filterPendingUsers() {
  const statusFilter = document.getElementById('statusFilter');
  const filterValue = statusFilter.value;
  const rows = document.querySelectorAll('.data-table tbody tr');

  rows.forEach(row => {
    const status = row.getAttribute('data-status');
    if (filterValue === 'all') {
      row.style.display = '';
    } else if (filterValue === status) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });

  checkEmptyTable();
}

// Check if table is empty and show message
function checkEmptyTable() {
  const visibleRows = document.querySelectorAll('.data-table tbody tr[style="display: "]');
  const hiddenRows = document.querySelectorAll('.data-table tbody tr:not([style*="display: none"])');
  let hasVisibleRows = false;

  document.querySelectorAll('.data-table tbody tr').forEach(row => {
    if (row.style.display !== 'none') {
      hasVisibleRows = true;
    }
  });

  const noUsersMessage = document.getElementById('noUsersMessage');
  const usersTable = document.getElementById('usersTable');

  if (!hasVisibleRows) {
    noUsersMessage.style.display = 'block';
    usersTable.style.display = 'none';
  } else {
    noUsersMessage.style.display = 'none';
    usersTable.style.display = 'table';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
  // Set Overview as default active section
  const overviewSection = document.getElementById('overview');
  if (overviewSection) {
    overviewSection.classList.add('active');
  }

  // Set first nav item as active
  const firstNavItem = document.querySelector('.sidebar-item');
  if (firstNavItem) {
    firstNavItem.classList.add('active');
  }

  // Initialize users section - show only pending by default
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.value = 'pending';
    filterPendingUsers();
  }

  await initAdminData();
  setInterval(loadStats, 30000);
});

async function initAdminData() {
  await loadStats();
  await loadUsersFromApi();
  await loadDriversFromApi();
  await loadMessagesFromApi();
  await loadRecentRides();
}

async function loadRecentRides() {
  try {
    const res = await apiRequest('/admin/rides');
    const items = res.rides || [];
    const tbody = document.getElementById('recentRidesTbody');
    if (!tbody) return;
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No recent rides</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    const recent = items.slice(0, 5);
    recent.forEach(r => {
      const tr = document.createElement('tr');
      const passenger = r.passenger_name || r.passenger_id || '—';
      const driver = (r.driver_name || r.driver_id) || '—';
      const status = r.status || '—';
      const fare = r.fare ? `₱${r.fare}` : '₱0.00';
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${passenger}</td>
        <td>${driver}</td>
        <td><span class="badge">${status}</span></td>
        <td>${fare}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadRecentRides error', err);
  }
}

// Search functionality
const searchBox = document.querySelector('.search-box');
if (searchBox) {
  searchBox.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase();
    console.log('Searching for:', query);
    // Add search logic here
  });
}

/* Messages dropdown functionality */
const messagesToggle = document.getElementById('messagesToggle');
const messagesDropdown = document.getElementById('messagesDropdown');
const messagesListEl = document.getElementById('messagesList');
const messagesBadge = document.getElementById('messagesBadge');
const markAllReadBtn = document.getElementById('markAllReadBtn');

let messages = [
  { id: 1, from: 'Support', text: 'New support ticket created: #TK004', time: '2h ago', unread: true },
  { id: 2, from: 'Driver Ramon', text: 'Requesting payout withdrawal', time: '6h ago', unread: true },
  { id: 3, from: 'System', text: 'New app version deployed', time: '1d ago', unread: false }
];

function renderMessages() {
  if (!messagesListEl) return;
  messagesListEl.innerHTML = '';
  if (messages.length === 0) {
    messagesListEl.innerHTML = '<div class="messages-empty">No messages</div>';
    messagesBadge.textContent = '0';
    messagesBadge.style.display = 'none';
    return;
  }

  messages.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'message-item' + (msg.unread ? ' message-unread' : '');
    item.dataset.id = msg.id;

    item.innerHTML = `
      <div class="message-meta">
        <div class="message-from">${msg.from}</div>
        <div class="message-body">${msg.text}</div>
      </div>
      <div class="message-time">${msg.time}</div>
    `;

    item.addEventListener('click', () => {
      markMessageRead(msg.id);
    });

    messagesListEl.appendChild(item);
  });

  updateMessageBadge();
}

function updateMessageBadge() {
  const unread = messages.filter(m => m.unread).length;
  if (!messagesBadge) return;
  messagesBadge.textContent = unread;
  messagesBadge.style.display = unread > 0 ? 'inline-block' : 'none';
}

function toggleMessagesDropdown(e) {
  if (!messagesDropdown) return;
  const open = messagesDropdown.getAttribute('aria-hidden') === 'false';
  messagesDropdown.setAttribute('aria-hidden', String(open ? 'true' : 'false'));
  messagesToggle.setAttribute('aria-expanded', String(!open));
  if (!open) renderMessages();
}

function markMessageRead(id) {
  messages = messages.map(m => m.id === id ? { ...m, unread: false } : m);
  renderMessages();
}

function markAllRead() {
  messages = messages.map(m => ({ ...m, unread: false }));
  renderMessages();
}

// Close dropdown on outside click
window.addEventListener('click', function(event) {
  const target = event.target;
  if (messagesDropdown && messagesToggle) {
    if (messagesToggle.contains(target)) return; // toggle handled by its own listener
    if (!messagesDropdown.contains(target)) {
      messagesDropdown.setAttribute('aria-hidden', 'true');
      messagesToggle.setAttribute('aria-expanded', 'false');
    }
  }

});

async function loadStats() {
  try {
    const data = await apiRequest('/admin/stats');

    const totalUsersEl = document.getElementById('totalUsers');
    const activeDriversEl = document.getElementById('activeDrivers');
    const todayRidesEl = document.getElementById('todayRides');
    const revenueTodayEl = document.getElementById('revenueToday');

    if (totalUsersEl) totalUsersEl.textContent = (data.totalUsers || 0).toLocaleString();
    if (activeDriversEl) activeDriversEl.textContent = data.totalDrivers || 0;
    if (todayRidesEl) todayRidesEl.textContent = data.totalRides || 0;
    if (revenueTodayEl) revenueTodayEl.textContent = '₱' + (data.totalRevenue || 0).toLocaleString();
  } catch (err) {
    console.error('loadStats error', err);
  }
}

async function loadUsersFromApi() {
  try {
    const result = await apiRequest('/admin/users');
    const data = result.users || [];
    const tbody = document.querySelector('#usersTable tbody');
    const noUsersMessage = document.getElementById('noUsersMessage');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
      if (noUsersMessage) noUsersMessage.style.display = 'block';
      return;
    }

    if (noUsersMessage) noUsersMessage.style.display = 'none';

    data.forEach(u => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-status', u.status || 'pending');

      const createdAt = u.created_at ? new Date(u.created_at).toLocaleDateString() : '';
      const statusValue = u.status || 'pending';
      const statusClass = statusValue === 'approved' ? 'approved'
        : statusValue === 'rejected' ? 'rejected'
        : 'pending';

      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${u.full_name || ''}</td>
        <td>${u.email || ''}</td>
        <td>${u.phone || ''}</td>
        <td>${createdAt}</td>
        <td><span class="badge ${statusClass}">${statusValue}</span></td>
        <td></td>
      `;

      const actionsCell = tr.querySelector('td:last-child');
      if (actionsCell) {
        if (u.status === 'pending') {
          const approveBtn = document.createElement('button');
          approveBtn.className = 'action-btn approve-btn';
          approveBtn.textContent = 'Approve';
          approveBtn.addEventListener('click', () => approveUser(approveBtn, u.id));

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'action-btn reject-btn';
          rejectBtn.textContent = 'Reject';
          rejectBtn.addEventListener('click', () => rejectUser(rejectBtn, u.id));

          const activityBtn = document.createElement('button');
          activityBtn.className = 'action-btn';
          activityBtn.textContent = 'Activity';
          activityBtn.addEventListener('click', () => viewUserActivity(u.full_name || '', u.id));

          actionsCell.appendChild(approveBtn);
          actionsCell.appendChild(rejectBtn);
          actionsCell.appendChild(activityBtn);
        } else {
          const activityBtn = document.createElement('button');
          activityBtn.className = 'action-btn';
          activityBtn.textContent = 'Activity';
          activityBtn.addEventListener('click', () => viewUserActivity(u.full_name || '', u.id));
          actionsCell.appendChild(activityBtn);
        }
      }

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadUsersFromApi error', err);
  }
}

async function loadDriversFromApi() {
  try {
    const result = await apiRequest('/admin/drivers');
    const data = result.drivers || [];
    const tbody = document.querySelector('#driversTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No drivers found</td></tr>';
      return;
    }

    data.forEach(d => {
      const tr = document.createElement('tr');
      const statusValue = (d.user && d.user.status) ? d.user.status : 'pending';
      tr.setAttribute('data-status', statusValue);

      const displayName = (d.user && d.user.full_name) ? d.user.full_name : '—';
      const vehicleParts = [];
      if (d.vehicle_type) vehicleParts.push(d.vehicle_type);
      let vehicleText = vehicleParts.join(' ');
      if (d.vehicle_plate) {
        vehicleText = vehicleText ? `${vehicleText} (${d.vehicle_plate})` : d.vehicle_plate;
      }
      if (!vehicleText) vehicleText = '—';

      const statusClass = statusValue === 'approved' ? 'approved'
        : statusValue === 'rejected' ? 'rejected'
        : statusValue === 'verified' ? 'verified'
        : 'pending';

      tr.innerHTML = `
        <td>${d.id}</td>
        <td>${displayName}</td>
        <td>${vehicleText}</td>
        <td>${d.rides_completed || 0}</td>
        <td>${(d.user && d.user.rating) ? d.user.rating : '—'}</td>
        <td><span class="badge ${statusClass}">${statusValue}</span></td>
        <td></td>
      `;

      const actionsCell = tr.querySelector('td:last-child');
      if (actionsCell) {
        if (statusValue === 'pending') {
          const approveBtn = document.createElement('button');
          approveBtn.className = 'action-btn approve-btn';
          approveBtn.textContent = 'Approve';
          approveBtn.addEventListener('click', () => approveDriver(approveBtn, d.id));

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'action-btn reject-btn';
          rejectBtn.textContent = 'Reject';
          rejectBtn.addEventListener('click', () => rejectDriver(rejectBtn, d.id));

          const activityBtn = document.createElement('button');
          activityBtn.className = 'action-btn';
          activityBtn.textContent = 'Activity';
          activityBtn.addEventListener('click', () => viewDriverActivity(displayName, d.id));

          actionsCell.appendChild(approveBtn);
          actionsCell.appendChild(rejectBtn);
          actionsCell.appendChild(activityBtn);
        } else if (statusValue === 'approved') {
          const verifyBtn = document.createElement('button');
          verifyBtn.className = 'action-btn';
          verifyBtn.textContent = 'Verify';
          verifyBtn.addEventListener('click', () => verifyDriver(verifyBtn, d.id));

          const activityBtn = document.createElement('button');
          activityBtn.className = 'action-btn';
          activityBtn.textContent = 'Activity';
          activityBtn.addEventListener('click', () => viewDriverActivity(displayName, d.id));

          actionsCell.appendChild(verifyBtn);
          actionsCell.appendChild(activityBtn);
        } else {
          const activityBtn = document.createElement('button');
          activityBtn.className = 'action-btn';
          activityBtn.textContent = 'Activity';
          activityBtn.addEventListener('click', () => viewDriverActivity(displayName, d.id));
          actionsCell.appendChild(activityBtn);
        }
      }

      tbody.appendChild(tr);
    });

    // Update counts after loading drivers
    await loadStats();
  } catch (err) {
    console.error('loadDriversFromApi error', err);
  }
}

async function loadMessagesFromApi() {
  try {
    const data = await apiRequest('/admin/messages');
    const list = data.messages || [];
    messages = list.map(item => ({
      id: item.id,
      from: item.subject || 'Message',
      text: item.message || '',
      time: item.created_at ? new Date(item.created_at).toLocaleString() : '',
      unread: true
    }));
    updateMessageBadge();
  } catch (err) {
    console.error('loadMessagesFromApi error', err);
  }
}

if (messagesToggle) messagesToggle.addEventListener('click', function(e) { e.stopPropagation(); toggleMessagesDropdown(); });
if (markAllReadBtn) markAllReadBtn.addEventListener('click', function(e) { e.stopPropagation(); markAllRead(); });

// Initialize messages on load
document.addEventListener('DOMContentLoaded', function() {
  updateMessageBadge();
});

// Button actions
document.querySelectorAll('.btn-primary').forEach(button => {
  button.addEventListener('click', function() {
    const text = this.textContent;
    if (text.includes('Add')) {
      showNotification('Add feature coming soon!');
    } else if (text.includes('Save')) {
      showNotification('Changes saved successfully!');
    }
  });
});

// Notification system
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#4ade80' : '#ef4444'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    font-weight: 600;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Responsive sidebar handling
function handleResponsiveSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const adminMain = document.querySelector('.admin-main');

  if (window.innerWidth <= 768) {
    // Mobile/Tablet view
    sidebar.style.position = 'static';
    sidebar.style.width = '100%';
    sidebar.style.height = 'auto';
  } else {
    // Desktop view
    sidebar.style.position = 'fixed';
    sidebar.style.width = '280px';
    sidebar.style.height = '100vh';
  }
}

window.addEventListener('resize', handleResponsiveSidebar);
handleResponsiveSidebar();

// Table row click handler (example)
document.querySelectorAll('.data-table tbody tr').forEach(row => {
  row.style.cursor = 'pointer';
  row.addEventListener('click', function() {
    const firstCell = this.querySelector('td');
    if (firstCell) {
      showNotification(`Selected: ${firstCell.textContent}`);
    }
  });
});
