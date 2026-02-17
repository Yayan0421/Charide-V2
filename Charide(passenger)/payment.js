function getSelectedPayment() {
  const selected = document.querySelector('input[name="payment"]:checked');
  return selected ? selected.value : 'Cash';
}

function loadSummary() {
  const pickup = localStorage.getItem('ride_pickup') || '—';
  const dropoff = localStorage.getItem('ride_dropoff') || '—';
  const driverName = localStorage.getItem('selected_driver_name') || '—';
  const vehicle = localStorage.getItem('selected_driver_vehicle') || '—';
  const fareRaw = localStorage.getItem('ride_fare');
  const fare = fareRaw ? Number(fareRaw) : 0;

  document.getElementById('pickupText').textContent = pickup;
  document.getElementById('dropoffText').textContent = dropoff;
  document.getElementById('driverText').textContent = driverName;
  document.getElementById('vehicleText').textContent = vehicle;
  document.getElementById('fareText').textContent = '₱' + fare.toFixed(2);

  return fare;
}

async function handlePayment() {
  const rideId = localStorage.getItem('active_ride_id');
  if (!rideId) {
    Swal.fire({ icon: 'error', title: 'No ride found', text: 'Please book a ride first.' });
    return;
  }

  const fareRaw = localStorage.getItem('ride_fare');
  const fare = fareRaw ? Number(fareRaw) : 0;
  const paymentMethod = getSelectedPayment();

  try {
    // For QR-based payments show the QR and wait for user confirmation
    if (paymentMethod === 'GCash' || paymentMethod === 'PayMaya') {
      const { isConfirmed } = await Swal.fire({
        title: `Pay with ${paymentMethod}`,
        html: `<div style="text-align:center"><p>Scan the QR code below with your ${paymentMethod} app and complete the payment.</p>
               <img src="qrcode.png" alt="QR code" style="max-width:220px;height:auto;margin:12px 0;display:block;margin-left:auto;margin-right:auto;"/>
               <p style=\"font-size:12px;color:#666;margin-top:8px;\">After completing payment in your app, click <strong>I've paid — OK</strong>.</p></div>`,
        showCancelButton: true,
        confirmButtonText: `I've paid — OK`,
        cancelButtonText: 'Cancel',
        allowOutsideClick: false,
        customClass: { popup: 'qr-payment-popup' }
      });

      if (!isConfirmed) {
        // user cancelled
        return;
      }
    }

    // Update ride status to 'paid' and record fare/payment method.
    // Do NOT mark as 'completed' here — the driver must accept and complete the ride.
    await apiRequest(`/rides/${rideId}/status`, {
      method: 'PUT',
      body: {
        status: 'paid',
        fare: fare,
        payment_method: paymentMethod
      }
    });

    localStorage.setItem('ride_status', 'paid');
    await Swal.fire({
      icon: 'success',
      title: 'Payment successful',
      text: `Paid via ${paymentMethod}`
    });
    window.location.href = 'dashboard.html';
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Payment failed', text: err.message || 'Please try again.' });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await authGuard('login.html');
  loadSummary();

  const payBtn = document.getElementById('payBtn');
  if (payBtn) {
    payBtn.addEventListener('click', handlePayment);
  }
});
