// Ride history — load passenger rides from backend
let allRides = [];
let filteredRides = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  await loadRides(user.id);

  document.getElementById('searchInput')?.addEventListener('input', filterRides);
  document.getElementById('filterStatus')?.addEventListener('change', filterRides);
});

async function loadRides(userId) {
  try {
    const data = await apiRequest('/rides/history');
    const rides = data.rides || [];

    allRides = rides.map(r => ({
      route: `${r.pickup_location} → ${r.dropoff_location}`,
      status: r.status ? capitalize(r.status) : 'Unknown',
      date: r.created_at,
      time: r.created_at,
      fare: r.fare ? '₱' + r.fare : '₱0',
      distance: r.distance ? r.distance + ' km' : '—',
      vehicle: r.vehicle_type || '—'
    }));

    filteredRides = [...allRides];
    renderRides();
  } catch (err) {
    console.error('Error loading rides:', err.message || err);
    allRides = [];
    filteredRides = [];
    renderRides();
  }
}

function renderRides() {
  const ridesList = document.getElementById('ridesList');
  if (!ridesList) return;
  ridesList.innerHTML = '';

  if (filteredRides.length === 0) {
    ridesList.innerHTML = `
      <div class="empty-state">
        <h2>No rides found</h2>
        <p>Try adjusting your search or filter criteria</p>
      </div>
    `;
    return;
  }

  filteredRides.forEach(ride => {
    const badgeClass = ride.status.toLowerCase() === 'completed' ? 'badge-success' : (ride.status.toLowerCase() === 'cancelled' ? 'badge-cancelled' : 'badge-muted');
    const rideCard = document.createElement('div');
    rideCard.className = 'ride-card';
    rideCard.innerHTML = `
      <div class="ride-header">
        <div class="ride-route">${ride.route}</div>
        <span class="ride-badge ${badgeClass}">${ride.status}</span>
      </div>
      <div class="ride-details">
        <div class="detail-item">
          <span class="detail-label">Date</span>
          <span class="detail-value">${formatDate(ride.date)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Time</span>
          <span class="detail-value">${new Date(ride.time).toLocaleTimeString()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Vehicle</span>
          <span class="detail-value">${ride.vehicle}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Distance</span>
          <span class="detail-value">${ride.distance}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Fare</span>
          <span class="detail-value">${ride.fare}</span>
        </div>
      </div>
    `;
    ridesList.appendChild(rideCard);
  });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function filterRides() {
  const searchQuery = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('filterStatus')?.value || '';

  filteredRides = allRides.filter(ride => {
    const matchesSearch = ride.route.toLowerCase().includes(searchQuery);
    const matchesStatus = statusFilter === '' || ride.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  renderRides();
}

function capitalize(s) { return s && s[0].toUpperCase() + s.slice(1); }
