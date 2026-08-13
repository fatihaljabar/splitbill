export function formatCurrency(amount: number, currency = 'Rp'): string {
  const rounded = Math.round(amount);
  const formatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${currency}${formatted}`;
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

export function formatDate(ts: number, lang: 'id' | 'en' = 'id'): string {
  return new Date(ts).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCountdown(
  ms: number,
  labels: { days: string; hours: string; minutes: string; seconds: string }
): string {
  if (ms <= 0) return '0';
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}${labels.days.charAt(0)} ${hours}${labels.hours.charAt(0)}`;
  if (hours > 0) return `${hours}${labels.hours.charAt(0)} ${minutes}${labels.minutes.charAt(0)}`;
  return `${minutes}${labels.minutes.charAt(0)} ${seconds}${labels.seconds.charAt(0)}`;
}

export function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function shortCode(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
