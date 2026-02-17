let activeRideId = null;
let assignedDriverId = null;
let rideSubscription = null;
let currentPassengerId = null;

function getStoredRideId() {
  return localStorage.getItem('active_ride_id');
}

function setStoredRideId(id) {
  if (id) localStorage.setItem('active_ride_id', id);
}

function setSelectedDriver(driver) {
  localStorage.setItem('selected_driver_id', driver.driverId || '');
  localStorage.setItem('selected_driver_name', driver.name || '');
  localStorage.setItem('selected_driver_vehicle', driver.vehicle || '');
  localStorage.setItem('selected_driver_phone', driver.phone || '');
  localStorage.setItem('selected_driver_avatar', driver.avatar || '');
}

function buildDriverCard(driver, onSelect, isAssigned) {
  const card = document.createElement('div');
  card.className = 'driver-card';
  card.innerHTML = `
    <h4>${driver.name}</h4>
    <div class="driver-meta">${driver.vehicle}</div>
    <div class="driver-meta">${driver.distance} • ETA ${driver.eta}</div>
    <div class="driver-actions">
      <button class="select-btn">${isAssigned ? 'Assigned' : 'Select'}</button>
      <button class="call-btn">Call</button>
    </div>
  `;

  const selectBtn = card.querySelector('.select-btn');
  const callBtn = card.querySelector('.call-btn');

  if (isAssigned) {
    selectBtn.disabled = true;
    selectBtn.style.opacity = '0.7';
    selectBtn.style.cursor = 'not-allowed';
  } else {
    selectBtn.addEventListener('click', () => onSelect(driver));
  }
  callBtn.addEventListener('click', () => callDriver(driver.phone));

  return card;
}

function callDriver(phone) {
  if (!phone) {
    Swal.fire({ icon: 'info', title: 'No phone number', text: 'This driver has no phone number available.' });
    return;
  }

  if (navigator.userAgent.match(/mobile|android|iphone/i)) {
    window.location.href = `tel:${phone}`;
  } else {
    Swal.fire({ icon: 'info', title: 'Call driver', text: `Would call driver at ${phone}` });
  }
}

function mapDrivers(drivers) {
  return (drivers || []).map(d => ({
    id: d.id,
    driverId: d.driver_id,
    name: d.full_name || 'Driver',
    avatar: d.profile_picture_url || 'https://via.placeholder.com/60',
    vehicleType: d.vehicle_type,
    vehicle: `${d.vehicle_type || 'Vehicle'} – ${d.vehicle_plate || 'N/A'}`,
    distance: calculateDistance(d.current_latitude, d.current_longitude),
    rating: d.rating || 5.0,
    reviews: d.total_reviews || 0,
    eta: Math.floor(Math.random() * 10 + 3) + ' min',
    phone: d.phone || ''
  }));
}

async function ensureActiveRide() {
  const stored = getStoredRideId();
  if (stored) {
    activeRideId = stored;
    return true;
  }

  try {
    const data = await apiRequest('/rides/recent');
    const rides = data.rides || [];
    const ride = rides.find(r => !['completed', 'cancelled'].includes((r.status || '').toLowerCase())) || rides[0];
    if (ride && ride.id) {
      activeRideId = ride.id;
      setStoredRideId(ride.id);
      if (ride.driver_id) {
        assignedDriverId = ride.driver_id;
      }
      localStorage.setItem('ride_pickup', ride.pickup_location || '');
      localStorage.setItem('ride_dropoff', ride.dropoff_location || '');
      localStorage.setItem('ride_fare', String(ride.fare || ''));
      return true;
    }
  } catch (err) {
    console.error('Failed to load recent rides', err.message || err);
  }

  return false;
}

async function renderDrivers() {
  const activeList = document.getElementById('activeDrivers');
  const nearbyList = document.getElementById('nearbyDrivers');
  if (!activeList || !nearbyList) return;

  activeList.innerHTML = '<div class="empty-state">Loading drivers...</div>';
  nearbyList.innerHTML = '';

  try {
    const rideData = await apiRequest('/rides/recent');
    const rides = rideData.rides || [];
    const activeRide = rides.find(r => !['completed', 'cancelled'].includes((r.status || '').toLowerCase())) || null;
    assignedDriverId = activeRide && activeRide.driver_id ? activeRide.driver_id : null;

    const data = await apiRequest('/drivers/nearby');
    const drivers = mapDrivers(data.drivers || []);

    if (assignedDriverId) {
      const assigned = drivers.find(d => d.driverId === assignedDriverId) || null;
      activeList.innerHTML = '';
      if (assigned) {
        activeList.appendChild(buildDriverCard(assigned, selectDriver, true));
      } else if (activeRide) {
        const fallback = {
          driverId: assignedDriverId,
          name: activeRide.driver_name || 'Assigned Driver',
          vehicle: 'Vehicle — N/A',
          distance: '—',
          eta: '—',
          phone: ''
        };
        activeList.appendChild(buildDriverCard(fallback, selectDriver, true));
      } else {
        activeList.innerHTML = '<div class="empty-state">Assigned driver not found.</div>';
      }

      nearbyList.innerHTML = '<div class="empty-state">Driver already assigned.</div>';
      return;
    }

    if (drivers.length === 0) {
      activeList.innerHTML = '<div class="empty-state">No active drivers right now.</div>';
      nearbyList.innerHTML = '<div class="empty-state">No nearby drivers found.</div>';
      return;
    }

    activeList.innerHTML = '';
    nearbyList.innerHTML = '';

    const activeDrivers = drivers.slice(0, 3);
    activeDrivers.forEach(driver => {
      activeList.appendChild(buildDriverCard(driver, selectDriver, false));
    });

    drivers.forEach(driver => {
      nearbyList.appendChild(buildDriverCard(driver, selectDriver, false));
    });
  } catch (err) {
    console.error('Error fetching drivers:', err.message || err);
    activeList.innerHTML = '<div class="empty-state">Unable to load drivers.</div>';
    nearbyList.innerHTML = '<div class="empty-state">Unable to load drivers.</div>';
  }
}

async function subscribeToRideUpdates(rideId) {
  const client = window.supabaseClient || window.supabase;
  if (!client || !currentPassengerId) return;

  if (window.ensureSupabaseSession) {
    await window.ensureSupabaseSession();
  }

  if (rideSubscription) {
    client.removeChannel(rideSubscription);
  }

  rideSubscription = client
    .channel('ride_updates_passenger_' + currentPassengerId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rides',
      filter: `passenger_id=eq.${currentPassengerId}`
    }, (payload) => {
      const ride = payload.new;
      if (!ride) return;
      if (!activeRideId || activeRideId === ride.id) {
        activeRideId = ride.id;
        setStoredRideId(ride.id);
      }
      assignedDriverId = ride.driver_id || null;
      if (ride.driver_id) {
        localStorage.setItem('selected_driver_id', ride.driver_id);
      }
      if (ride.status) {
        localStorage.setItem('ride_status', ride.status);
      }
      renderDrivers();
    })
    .subscribe();
}

async function selectDriver(driver) {
  if (assignedDriverId) {
    Swal.fire({ icon: 'info', title: 'Driver already assigned', text: 'You already have an active driver.' });
    return;
  }

  if (!activeRideId) {
    const ok = await ensureActiveRide();
    if (!ok) {
      Swal.fire({ icon: 'error', title: 'No active ride', text: 'Please book a ride first.' });
      return;
    }
  }

  try {
    // Do not set driver_id on the ride yet — create a pending request so driver can accept.
    // Store preferred driver locally and proceed to payment. The ride remains in 'requested' state
    // so drivers will see it in their pending list and can accept it.
    setSelectedDriver(driver);
    assignedDriverId = null; // not yet assigned
    localStorage.setItem('preferred_driver_id', driver.driverId);
    localStorage.setItem('ride_status', 'requested');

    await Swal.fire({ icon: 'success', title: 'Driver selected', text: 'Proceeding to payment. Driver will need to accept the request.' });
    window.location.href = 'payment.html';
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Unable to assign driver', text: err.message || 'Please try again.' });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await authGuard('login.html');
  currentPassengerId = user ? user.id : null;
  await ensureActiveRide();
  await renderDrivers();
  if (activeRideId) {
    await subscribeToRideUpdates(activeRideId);
  }
});
