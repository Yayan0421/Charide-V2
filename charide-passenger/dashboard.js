// Dashboard — load passenger info and recent rides from backend
document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  await loadProfileSummary(user.id);
  await loadRideStats(user.id);
  await loadRecentRides(user.id);
});

async function loadProfileSummary(userId) {
  try {
    const data = await apiRequest('/profile');
    const profile = data.user;

    document.getElementById('username').textContent = profile.full_name || 'Passenger';
    const emailShortEl = document.getElementById('passengerEmailShort');
    if (emailShortEl) emailShortEl.textContent = profile.email || '';
    const memberEl = document.getElementById('memberSince');
    if (memberEl) memberEl.textContent = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '';
  } catch (err) {
    console.error('Error loading profile summary:', err.message || err);
  }
}

async function loadRideStats(userId) {
  try {
    const stats = await apiRequest('/rides/stats');
    const totalRides = stats.totalRides || 0;
    const totalSpent = stats.totalSpent || 0;
    const lastFare = stats.lastFare || 0;

    document.getElementById('totalRides').textContent = totalRides;
    document.getElementById('totalSpent').textContent = '₱' + totalSpent.toFixed(2);
    document.getElementById('lastPayment').textContent = lastFare ? '₱' + lastFare : '—';
  } catch (err) {
    console.error('Error loading ride stats:', err.message || err);
  }
}

async function loadRecentRides(userId) {
  try {
    const data = await apiRequest('/rides/recent');
    const recent = data.rides || [];

    const rideHistory = document.getElementById('rideHistory');
    if (!rideHistory) return;
    rideHistory.innerHTML = '';

    if (!recent || recent.length === 0) {
      rideHistory.innerHTML = '<li>No recent rides</li>';
      return;
    }

    recent.forEach(r => {
      const li = document.createElement('li');
      const route = `${r.pickup_location} → ${r.dropoff_location}`;
      const cls = r.status === 'completed' ? 'success' : (r.status === 'cancelled' ? 'danger' : 'muted');
      li.innerHTML = `${route} <span class="badge ${cls}">${r.status}</span> <div class="small">${r.fare ? '₱' + r.fare : ''} • ${new Date(r.created_at).toLocaleString()}</div>`;
      rideHistory.appendChild(li);
    });

  } catch (err) {
    console.error('Error loading recent rides:', err.message || err);
  }
}

// ----- booking card interactivity (local UI only) -----
document.addEventListener('DOMContentLoaded', () => {
  const vehicleBtns = document.querySelectorAll('.vehicle');
  const fareEl = document.getElementById('fareAmount');
  const bookBtn = document.getElementById('bookNowBtn');

  function setActive(btn) {
    vehicleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (fareEl) fareEl.textContent = '₱13';
  }

  vehicleBtns.forEach(b => {
    b.addEventListener('click', () => setActive(b));
  });

  // init from markup
  const init = document.querySelector('.vehicle.active');
  if (init) setActive(init);

  // ---- Book now -> create ride via backend ----
  if (bookBtn) {
    bookBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const pickup = document.getElementById('pickup').value;
      const dropoff = document.getElementById('dropoff').value;
      const active = document.querySelector('.vehicle.active');
      const vehicleType = active ? active.querySelector('strong').textContent.trim() : 'Motorcycle';
      const fare = 13;

      if (!pickup || pickup === 'Pickup location' || !dropoff || dropoff === 'Where to?') {
        await Swal.fire({ icon: 'warning', title: 'Missing locations', text: 'Please select pickup and dropoff locations.' });
        return;
      }

      bookBtn.disabled = true;
      const origText = bookBtn.textContent;
      bookBtn.textContent = 'Requesting...';

      try {
        const user = await getCurrentUser();
        if (!user) { window.location.href = 'login.html'; return; }

        const response = await apiRequest('/rides', {
          method: 'POST',
          body: {
            pickup_location: pickup,
            dropoff_location: dropoff,
            vehicle_type: vehicleType,
            fare: fare,
            status: 'requested'
          }
        });

        const ride = response && response.ride ? response.ride : null;
        if (ride && ride.id) {
          localStorage.setItem('active_ride_id', ride.id);
        }
        localStorage.setItem('ride_pickup', pickup);
        localStorage.setItem('ride_dropoff', dropoff);
        localStorage.setItem('ride_vehicle_type', vehicleType);
        localStorage.setItem('ride_fare', String(fare));
        localStorage.setItem('ride_status', 'requested');

        await Swal.fire({ icon: 'success', title: 'Ride requested', text: 'Your ride request was sent — you will be redirected to tracking.' });
        window.location.href = 'track-driver.html';
      } catch (err) {
        console.error('Booking error', err.message || err);
        await Swal.fire({ icon: 'error', title: 'Request failed', text: 'Could not request ride — please try again.' });
      } finally {
        bookBtn.disabled = false;
        bookBtn.textContent = origText;
      }
    });
  }
});
