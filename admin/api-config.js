const API_BASE_URL = window.API_BASE_URL || window.location.origin;

function getAuthToken() {
  return localStorage.getItem('charide_token');
}

function getRefreshToken() {
  return localStorage.getItem('charide_refresh_token');
}

function setAuthToken(token) {
  localStorage.setItem('charide_token', token);
}

function setRefreshToken(token) {
  localStorage.setItem('charide_refresh_token', token);
}

function setAuthTokens(accessToken, refreshToken) {
  if (accessToken) setAuthToken(accessToken);
  if (refreshToken) setRefreshToken(refreshToken);
}

function setCurrentUser(user) {
  localStorage.setItem('charide_user', JSON.stringify(user));
}

function getCurrentUserCached() {
  try {
    const raw = localStorage.getItem('charide_user');
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem('charide_token');
  localStorage.removeItem('charide_refresh_token');
  localStorage.removeItem('charide_user');
}

function buildUrl(path, query) {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const url = base + path;
  if (!query) return url;
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return qs ? url + '?' + qs : url;
}

async function apiRequest(path, options = {}) {
  const url = buildUrl(path, options.query);
  const headers = Object.assign({
    'Content-Type': 'application/json'
  }, options.headers || {});

  const token = getAuthToken();
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

async function getCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const data = await apiRequest('/auth/me');
    if (data && data.user) {
      const user = data.user;
      if (user.user_type !== 'admin') {
        clearAuth();
        return null;
      }
      setCurrentUser(user);
      return user;
    }
    clearAuth();
    return null;
  } catch (err) {
    clearAuth();
    return null;
  }
}

async function signOut() {
  clearAuth();
}

async function authGuard(redirectTo) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo || './login.html';
  }
  return user;
}

window.apiRequest = apiRequest;
window.getCurrentUser = getCurrentUser;
window.getCurrentUserCached = getCurrentUserCached;
window.setAuthToken = setAuthToken;
window.setRefreshToken = setRefreshToken;
window.setAuthTokens = setAuthTokens;
window.getRefreshToken = getRefreshToken;
window.setCurrentUser = setCurrentUser;
window.signOut = signOut;
window.authGuard = authGuard;
