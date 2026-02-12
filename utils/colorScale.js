export function painColor(value) {
  const red = Math.min(255, value * 25);
  const green = Math.min(255, (10 - value) * 25);
  return `rgb(${red}, ${green}, 0)`;
}
