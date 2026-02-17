// Fetch nearby drivers from backend
async function getNearbyDrivers() {
  try {
    const data = await apiRequest('/drivers/nearby');
    const drivers = data.drivers || [];

    // Transform data for display
    return drivers.map((d, index) => ({
      id: d.id,
      driverId: d.driver_id,
      name: d.full_name,
      avatar: d.profile_picture_url || "https://via.placeholder.com/60",
      vehicleType: d.vehicle_type,
      vehicle: `${d.vehicle_type} – ${d.vehicle_plate}`,
      distance: calculateDistance(d.current_latitude, d.current_longitude),
      rating: d.rating || 5.0,
      reviews: d.total_reviews || 0,
      eta: Math.floor(Math.random() * 10 + 3) + " min",
      phone: d.phone
    }));

  } catch (err) {
    console.error("Error fetching drivers:", err);
    return [];
  }
}

// Display drivers in the list
async function displayDrivers() {
  const driversList = document.getElementById('driversList');
  driversList.innerHTML = '<p>Loading drivers...</p>';

  const nearbyDrivers = await getNearbyDrivers();

  if (nearbyDrivers.length === 0) {
    driversList.innerHTML = '<p>No drivers available right now.</p>';
    return;
  }

  driversList.innerHTML = '';

  nearbyDrivers.forEach(driver => {
    const driverCard = document.createElement('div');
    driverCard.className = 'driver-card';
    driverCard.innerHTML = `
      <div class="driver-header">
        <img src="${driver.avatar}" alt="${driver.name}" class="driver-avatar">
        <div class="driver-name-info">
          <p class="driver-name">${driver.name}</p>
          <p class="vehicle-type">${driver.vehicle}</p>
        </div>
        <div class="driver-rating">
          ⭐ ${driver.rating} (${driver.reviews})
        </div>
      </div>
      
      <div class="driver-details">
        <div class="detail-item">
          <span class="detail-label">Distance</span>
          <span class="detail-value">${driver.distance}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">ETA</span>
          <span class="detail-value">${driver.eta}</span>
        </div>
      </div>
      
      <div class="driver-actions">
        <button class="book-btn" onclick="bookDriver('${driver.driverId}')">Book Now</button>
        <button class="call-btn" onclick="callDriver('${driver.phone}')">📞 Call</button>
      </div>
    `;
    driversList.appendChild(driverCard);
  });
}

async function bookDriver(driverId) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    await Swal.fire({ icon: 'warning', title: 'Not signed in', text: 'Please log in first.' });
    window.location.href = "login.html";
    return;
  }

  try {
    const pickup = localStorage.getItem('pickupLocation') || 'Current Location';
    const dropoff = localStorage.getItem('dropoffLocation') || 'Destination';

    const response = await apiRequest('/rides', {
      method: 'POST',
      body: {
        pickup_location: pickup,
        dropoff_location: dropoff,
        status: 'requested'
      }
    });

    const ride = response && response.ride ? response.ride : null;
    if (ride && ride.id) {
      localStorage.setItem('active_ride_id', ride.id);
    }
    localStorage.setItem('ride_pickup', pickup);
    localStorage.setItem('ride_dropoff', dropoff);
    localStorage.setItem('ride_status', 'requested');

    await Swal.fire({ icon: 'success', title: 'Request created', text: 'Choose a driver on the tracking page.' });
    window.location.href = "track-driver.html";

  } catch (err) {
    await Swal.fire({ icon: 'error', title: 'Booking failed', text: err.message || 'Could not book ride.' });
  }
}

function callDriver(phone) {
  if (navigator.userAgent.match(/mobile|android|iphone/i)) {
    window.location.href = `tel:${phone}`;
  } else {
    Swal.fire({ icon: 'info', title: 'Call driver', text: `Would call driver at ${phone}` });
  }
}

// Load drivers when page loads
document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  displayDrivers();
});
