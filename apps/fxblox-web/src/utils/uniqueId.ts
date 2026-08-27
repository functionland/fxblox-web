// Split out of helper.ts so the settings store does not pull fula-sec-web (the crypto vendor chunk) at boot.
export const generateUniqueId = () => {
  const timestamp = Date.now();
  const randomNum = Math.random() * Math.pow(10, 18);
  return `${timestamp}-${randomNum}`;
};
