export const getTodayISO = () => {
  return new Date().toISOString().split("T")[0];
};
