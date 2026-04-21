export function getActiveSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  // Noël : 1er décembre - 5 janvier
  if ((m === 12) || (m === 1 && d <= 5)) return 'christmas';
  // Printemps : 20 mars - 20 juin
  if ((m === 3 && d >= 20) || m === 4 || m === 5 || (m === 6 && d <= 20)) return 'spring';
  return null;
}

export function getSeasonalPreference() {
  if (typeof window === 'undefined') return 'auto';
  return localStorage.getItem('seasonal-preference') || 'auto';
}

export function setSeasonalPreference(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('seasonal-preference', value);
}

export function resolveSeason(preference, date = new Date()) {
  if (preference === 'off') return null;
  if (preference === 'christmas' || preference === 'spring') return preference;
  return getActiveSeason(date); // 'auto'
}
