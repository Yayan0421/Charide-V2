// Profile page — load and update passenger profile from Supabase
document.addEventListener('DOMContentLoaded', async () => {
  const user = await getSupabaseUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  await loadProfileData(user.id);
});

async function getSupabaseUser() {
  const token = getAuthToken();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

async function loadProfileData(userId) {
  try {
    if (window.ensureSupabaseSession) {
      await window.ensureSupabaseSession();
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    let resolvedProfile = profile;
    if (!resolvedProfile) {
      const authUser = await getSupabaseUser();
      if (!authUser) throw new Error('No authenticated user');

      const { data: created, error: createError } = await supabase
        .from('users')
        .insert([{
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || 'Passenger',
          user_type: 'passenger',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (createError) throw createError;
      resolvedProfile = created;
    }

    document.getElementById('passengerName').textContent = resolvedProfile.full_name || '';
    document.getElementById('passengerEmail').textContent = resolvedProfile.email || '';
    document.getElementById('fullName').textContent = resolvedProfile.full_name || '';
    document.getElementById('email').textContent = resolvedProfile.email || '';
    document.getElementById('phone').textContent = resolvedProfile.phone || '';

    document.getElementById('memberSince').textContent = resolvedProfile.created_at ? new Date(resolvedProfile.created_at).toLocaleDateString() : '';
    document.getElementById('accountStatus').textContent = resolvedProfile.is_active ? 'Active' : 'Inactive';
    document.getElementById('verificationStatus').textContent = resolvedProfile.email ? 'Verified' : 'Unverified';

    document.getElementById('paymentMethod').textContent = resolvedProfile.payment_method || '—';
    document.getElementById('notifications').textContent = resolvedProfile.notifications_enabled ? 'Enabled' : 'Disabled';
  } catch (err) {
    console.error('Error loading profile:', err.message || err);
  }
}

async function editProfile() {
  try {
    const user = await getSupabaseUser();
    if (!user) return;

    const newName = prompt('Enter full name', document.getElementById('fullName').textContent) || '';
    const newPhone = prompt('Enter phone number', document.getElementById('phone').textContent) || '';

    const updates = {
      full_name: newName,
      phone: newPhone,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id);

    if (error) throw error;

    await Swal.fire({ icon: 'success', title: 'Profile updated' });
    await loadProfileData(user.id);
  } catch (err) {
    await Swal.fire({ icon: 'error', title: 'Error updating profile', text: (err.message || err) });
  }
}

async function deleteAccount() {
  if (!confirm('Are you sure you want to delete your profile information? This will remove your profile but not your auth account.')) return;

  try {
    const user = await getSupabaseUser();
    if (!user) return;

    await supabase.from('rides').delete().eq('passenger_id', user.id);
    await supabase.from('users').delete().eq('id', user.id);
    await signOut();
    await Swal.fire({ icon: 'success', title: 'Profile removed', text: 'You have been signed out.' });
    window.location.href = 'login.html';
  } catch (err) {
    await Swal.fire({ icon: 'error', title: 'Error deleting profile', text: (err.message || err) });
  }
}
