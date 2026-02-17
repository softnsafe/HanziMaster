
export const parseLocalDate = (dateStr: string | undefined | null): Date => {
  if (!dateStr) return new Date();
  const s = String(dateStr);
  // Match YYYY-MM-DD, ignore time component to force Local Date
  // This prevents 2025-02-14 becoming 2025-02-13 due to UTC offsets
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  // Fallback for other formats
  return new Date(s);
};

export const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};
